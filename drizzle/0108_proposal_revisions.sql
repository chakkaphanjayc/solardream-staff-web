DO $$ BEGIN
  CREATE TYPE proposal_revision_status AS ENUM ('DRAFT','SENT','VIEWED','ACCEPTED','SUPERSEDED','VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE signature_envelope_status AS ENUM ('PENDING','SIGNED','VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS proposal_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id text NOT NULL REFERENCES proposals(id) ON DELETE CASCADE ON UPDATE CASCADE,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  pricing_snapshot jsonb NOT NULL,
  configuration_snapshot jsonb NOT NULL,
  terms_snapshot jsonb NOT NULL,
  payment_snapshot jsonb NOT NULL,
  erp_quotation_reference text,
  pdf_document_reference text,
  document_hash text CHECK (document_hash IS NULL OR document_hash ~ '^[0-9a-f]{64}$'),
  status proposal_revision_status NOT NULL DEFAULT 'DRAFT',
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  created_by_user_id text REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE,
  creation_source text NOT NULL,
  creation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_revisions_proposal_revision_key UNIQUE (proposal_id, revision_number),
  CHECK (viewed_at IS NULL OR sent_at IS NOT NULL),
  CHECK (accepted_at IS NULL OR (sent_at IS NOT NULL AND accepted_at >= sent_at))
);
CREATE INDEX IF NOT EXISTS proposal_revisions_proposal_created_idx ON proposal_revisions(proposal_id, created_at);
CREATE INDEX IF NOT EXISTS proposal_revisions_status_idx ON proposal_revisions(status);

CREATE TABLE IF NOT EXISTS proposal_revision_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES proposal_revisions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  line_number integer NOT NULL CHECK (line_number > 0),
  item_code text NOT NULL,
  pricing_snapshot jsonb NOT NULL,
  configuration_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_revision_items_revision_line_key UNIQUE (revision_id, line_number)
);
CREATE INDEX IF NOT EXISTS proposal_revision_items_revision_idx ON proposal_revision_items(revision_id);

CREATE TABLE IF NOT EXISTS signature_envelopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES proposal_revisions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  status signature_envelope_status NOT NULL DEFAULT 'PENDING',
  signer_identity jsonb NOT NULL,
  verified_contact jsonb NOT NULL,
  signed_at timestamptz,
  consent_version text NOT NULL,
  signature_storage_reference text,
  document_hash text NOT NULL CHECK (document_hash ~ '^[0-9a-f]{64}$'),
  audit_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'SIGNED' OR (signed_at IS NOT NULL AND signature_storage_reference IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS signature_envelopes_revision_idx ON signature_envelopes(revision_id);
CREATE UNIQUE INDEX IF NOT EXISTS signature_envelopes_signed_revision_key ON signature_envelopes(revision_id) WHERE status = 'SIGNED';

INSERT INTO proposal_revisions (
  proposal_id, revision_number, pricing_snapshot, configuration_snapshot, terms_snapshot,
  payment_snapshot, erp_quotation_reference, pdf_document_reference, status, sent_at,
  accepted_at, creation_source, creation_metadata, created_at
)
SELECT p.id, GREATEST(p.revision_number, 1),
  jsonb_build_object('totalPrice', p.total_price, 'monthlySavings', p.monthly_savings, 'paybackPeriod', p.payback_period),
  p.configuration_data, '{}'::jsonb,
  jsonb_build_object('paymentStatus', p.payment_status, 'selectedFinancingId', p.selected_financing_id),
  p.erpnext_quotation_id, COALESCE(p.revised_pdf_url, p.pdf_url),
  CASE WHEN p.signed_at IS NOT NULL THEN 'ACCEPTED'::proposal_revision_status
       WHEN p.dispatch_status = 'DISPATCHED' THEN 'SENT'::proposal_revision_status
       ELSE 'DRAFT'::proposal_revision_status END,
  CASE WHEN p.dispatch_status IN ('DISPATCHED','SIGNED') THEN COALESCE(p.updated_at, p.created_at) END,
  p.signed_at, 'LEGACY_BACKFILL', jsonb_build_object('legacyProposalStatus', p.status), p.created_at
FROM proposals p
ON CONFLICT (proposal_id, revision_number) DO NOTHING;

CREATE OR REPLACE FUNCTION guard_proposal_revision_immutability() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.proposal_id <> NEW.proposal_id OR OLD.revision_number <> NEW.revision_number THEN
    RAISE EXCEPTION 'A proposal revision cannot be reassigned or renumbered' USING ERRCODE='23514';
  END IF;
  IF OLD.status IN ('SENT','VIEWED','ACCEPTED') AND (
    OLD.pricing_snapshot IS DISTINCT FROM NEW.pricing_snapshot OR
    OLD.configuration_snapshot IS DISTINCT FROM NEW.configuration_snapshot OR
    OLD.terms_snapshot IS DISTINCT FROM NEW.terms_snapshot OR
    OLD.payment_snapshot IS DISTINCT FROM NEW.payment_snapshot OR
    OLD.erp_quotation_reference IS DISTINCT FROM NEW.erp_quotation_reference OR
    OLD.pdf_document_reference IS DISTINCT FROM NEW.pdf_document_reference OR
    OLD.document_hash IS DISTINCT FROM NEW.document_hash
  ) THEN RAISE EXCEPTION 'Commercial mutation requires a new proposal revision' USING ERRCODE='55000'; END IF;
  IF OLD.status = 'ACCEPTED' AND NEW.status <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'An accepted proposal revision cannot be reopened' USING ERRCODE='55000';
  END IF;
  IF OLD.status <> NEW.status AND NOT (
    (OLD.status='DRAFT' AND NEW.status IN ('SENT','VOID')) OR
    (OLD.status='SENT' AND NEW.status IN ('VIEWED','ACCEPTED','SUPERSEDED','VOID')) OR
    (OLD.status='VIEWED' AND NEW.status IN ('ACCEPTED','SUPERSEDED','VOID'))
  ) THEN RAISE EXCEPTION 'Invalid proposal revision lifecycle transition' USING ERRCODE='23514'; END IF;
  IF NEW.status IN ('SENT','VIEWED','ACCEPTED') AND (NEW.sent_at IS NULL OR NEW.document_hash IS NULL) THEN
    RAISE EXCEPTION 'Sent proposal revisions require a timestamp and document hash' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS proposal_revision_immutability ON proposal_revisions;
CREATE TRIGGER proposal_revision_immutability BEFORE UPDATE ON proposal_revisions
FOR EACH ROW EXECUTE FUNCTION guard_proposal_revision_immutability();

CREATE OR REPLACE FUNCTION guard_proposal_revision_item_immutability() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status proposal_revision_status;
BEGIN
  SELECT status INTO parent_status FROM proposal_revisions WHERE id = COALESCE(OLD.revision_id, NEW.revision_id);
  IF parent_status IN ('SENT','VIEWED','ACCEPTED') THEN
    RAISE EXCEPTION 'Commercial mutation requires a new proposal revision' USING ERRCODE='55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS proposal_revision_item_immutability ON proposal_revision_items;
CREATE TRIGGER proposal_revision_item_immutability BEFORE INSERT OR UPDATE OR DELETE ON proposal_revision_items
FOR EACH ROW EXECUTE FUNCTION guard_proposal_revision_item_immutability();

CREATE OR REPLACE FUNCTION guard_legacy_proposal_commercial_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status proposal_revision_status;
BEGIN
  SELECT status INTO current_status FROM proposal_revisions WHERE proposal_id=OLD.id ORDER BY revision_number DESC LIMIT 1;
  IF current_status IN ('SENT','VIEWED','ACCEPTED') AND (
    OLD.system_size_kwp IS DISTINCT FROM NEW.system_size_kwp OR OLD.panel_count IS DISTINCT FROM NEW.panel_count OR
    OLD.total_price IS DISTINCT FROM NEW.total_price OR OLD.monthly_savings IS DISTINCT FROM NEW.monthly_savings OR
    OLD.payback_period IS DISTINCT FROM NEW.payback_period OR OLD.service_items IS DISTINCT FROM NEW.service_items OR
    OLD.service_fees IS DISTINCT FROM NEW.service_fees OR OLD.selected_financing_id IS DISTINCT FROM NEW.selected_financing_id OR
    OLD.erpnext_quotation_id IS DISTINCT FROM NEW.erpnext_quotation_id OR OLD.pdf_url IS DISTINCT FROM NEW.pdf_url OR
    OLD.revised_pdf_url IS DISTINCT FROM NEW.revised_pdf_url
  ) THEN RAISE EXCEPTION 'Commercial mutation requires a new proposal revision' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS legacy_proposal_commercial_immutability ON proposals;
CREATE TRIGGER legacy_proposal_commercial_immutability BEFORE UPDATE ON proposals
FOR EACH ROW EXECUTE FUNCTION guard_legacy_proposal_commercial_mutation();

CREATE OR REPLACE FUNCTION validate_signature_envelope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_hash text; revision_status proposal_revision_status;
BEGIN
  SELECT document_hash, status INTO revision_hash, revision_status FROM proposal_revisions WHERE id=NEW.revision_id FOR UPDATE;
  IF revision_hash IS NULL OR revision_hash <> NEW.document_hash THEN
    RAISE EXCEPTION 'Signature document hash does not match the proposal revision' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS signature_envelope_validation ON signature_envelopes;
CREATE TRIGGER signature_envelope_validation BEFORE INSERT OR UPDATE ON signature_envelopes
FOR EACH ROW EXECUTE FUNCTION validate_signature_envelope();

CREATE OR REPLACE FUNCTION guard_signature_evidence_immutability() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='SIGNED' THEN
    RAISE EXCEPTION 'Signed signature evidence is immutable' USING ERRCODE='55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS signature_evidence_immutability ON signature_envelopes;
CREATE TRIGGER signature_evidence_immutability BEFORE UPDATE OR DELETE ON signature_envelopes
FOR EACH ROW EXECUTE FUNCTION guard_signature_evidence_immutability();
