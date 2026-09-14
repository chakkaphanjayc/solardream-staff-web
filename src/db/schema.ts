import { desc, relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { UserConsentPreferences } from "@/lib/consentPreferences";
import type { LineContentDocument } from "@/lib/lineContentSchema";
import type {
  LineAutomationAction,
  LineAutomationCondition,
  LineAutomationTrigger,
} from "@/lib/lineAutomationEngine";
import type { Locale } from "@/i18n/locales";
import type { AuditMetadata } from "@/types/audit";

const idDefault = sql`gen_random_uuid()::text`;
const emptyJson = sql`'{}'::jsonb`;
const emptyTextArray = sql`ARRAY[]::text[]`;

const createdAt = (name = "createdAt") =>
  timestamp(name, { mode: "date", precision: 3 }).defaultNow().notNull();

const updatedAt = (name = "updatedAt") =>
  timestamp(name, { mode: "date", precision: 3 })
    .notNull()
    .$onUpdate(() => new Date());

export const roleEnum = pgEnum("Role", [
  "USER",
  "STAFF",
  "ADMIN",
  "SUPER_ADMIN",
  "MANAGER",
  "INSTALLER",
  "CUSTOMER",
]);
export const departmentEnum = pgEnum("department", [
  "SALES",
  "ACCOUNTING",
  "ENGINEERING",
  "WAREHOUSE",
  "PROJECT_TEAM",
  "NONE",
]);
export const jobTypeEnum = pgEnum("job_type", [
  "INSTALLATION",
  "MAINTENANCE",
  "SURVEY",
  "REPAIR",
]);
export const financeTypeEnum = pgEnum("finance_type", [
  "CASH",
  "BANK_LOAN",
  "PPA",
  "LEASING",
]);
export const milestoneStatusEnum = pgEnum("milestone_status", [
  "PENDING",
  "ACTIVE",
  "PAID",
  "OVERDUE",
]);
export const paymentTransactionStatusEnum = pgEnum(
  "payment_transaction_status",
  ["PENDING", "PAID", "EXPIRED", "FAILED"],
);
export const proposalPaymentStatusEnum = pgEnum("proposal_payment_status", [
  "UNPAID",
  "DEPOSIT_PENDING",
  "DEPOSIT_PAID",
  "FULLY_PAID",
]);
export const proposalDispatchStatusEnum = pgEnum("proposal_dispatch_status", [
  "PENDING_DISPATCH",
  "DISPATCHED",
  "SIGNED",
  "EXPIRED",
]);
export const proposalRevisionStatusEnum = pgEnum("proposal_revision_status", [
  "DRAFT",
  "SENT",
  "VIEWED",
  "ACCEPTED",
  "SUPERSEDED",
  "VOID",
]);
export const signatureEnvelopeStatusEnum = pgEnum("signature_envelope_status", [
  "PENDING",
  "SIGNED",
  "VOID",
]);
export const quotationDocumentRequestStatusEnum = pgEnum("quotation_document_request_status", [
  "PENDING",
  "UPLOADED",
  "APPROVED",
]);
export const paymentRequestStatusEnum = pgEnum("payment_request_status", [
  "PENDING",
  "AWAITING_VERIFICATION",
  "PAID",
  "FAILED",
]);
export const serviceRequestTypeEnum = pgEnum("service_request_type", [
  "REPAIR",
  "CLAIM",
  "MAINTENANCE",
]);
export const serviceRequestStatusEnum = pgEnum("service_request_status", [
  "Open",
  "Replied",
  "On Hold",
  "Resolved",
  "Closed",
]);
export const returnRefundStatusEnum = pgEnum("return_refund_status", [
  "REQUESTED",
  "PICKUP",
  "INSPECTION",
  "REFUNDED",
]);
export const notificationChannelEnum = pgEnum("notification_channel", [
  "EMAIL",
  "SMS",
  "LINE",
]);
export const fulfillmentTypeEnum = pgEnum("fulfillment_type", [
  "SUPPLY_ONLY",
  "INSTALLATION",
]);
export const richMenuProfileTypeEnum = pgEnum("rich_menu_profile_type", [
  "GUEST",
  "MEMBER",
  "CLIENT",
  "MEMBER_RESIDENTIAL",
  "MEMBER_COMMERCIAL",
  "SUB_CONTRACTOR",
]);
export const productCtaTypeEnum = pgEnum("product_cta_type", [
  "REQUEST_QUOTE",
  "CHECK_STOCK",
  "CONTACT_SALES",
]);
export const consultationLeadStatusEnum = pgEnum("consultation_lead_status", [
  "NEW_LEAD",
  "PENDING_STAFF_REVIEW",
  "ENGINEER_REVIEW",
  "PROPOSAL_SENT",
  "CUSTOMER_APPROVED",
  "REJECTED",
  "ARCHIVED",
]);
export const consultationSystemTypeEnum = pgEnum("consultation_system_type", [
  "ON_GRID",
  "HYBRID",
]);
export const recommendationComponentTypeEnum = pgEnum("recommendation_component_type", [
  "PANEL",
  "INVERTER",
  "ADD_ON",
  "STRUCTURE",
]);

export const blueprints = pgTable("Blueprint", {
  id: text("id").default(idDefault).primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique("Blueprint_slug_key"),
  description: text("description"),
  translations: jsonb("translations").$type<Record<string, unknown>>().default(emptyJson).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  erpnextId: text("erpnext_id").notNull().unique("brands_erpnext_id_key"),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  createdAt: createdAt("created_at"),
});

export const categories = pgTable(
  "Category",
  {
    id: text("id").default(idDefault).primaryKey(),
    erpnextId: text("erpnext_id").unique("Category_erpnext_id_key"),
    name: text("name").notNull().unique("Category_name_key"),
    description: text("description"),
    translations: jsonb("translations").$type<Record<string, unknown>>().default(emptyJson).notNull(),
    slug: text("slug").default(idDefault).notNull().unique("Category_slug_key"),
    displayOrder: integer("displayOrder").default(0).notNull(),
    isRequired: boolean("isRequired").default(true).notNull(),
    allowMultiple: boolean("allowMultiple").default(false).notNull(),
    dependsOnCategoryId: text("dependsOnCategoryId").references(
      (): AnyPgColumn => categories.id,
      { onDelete: "set null", onUpdate: "cascade" },
    ),
    dependsOnProductId: text("dependsOnProductId"),
    blueprintId: text("blueprintId").references(() => blueprints.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    parentId: text("parentId").references((): AnyPgColumn => categories.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    isGroup: boolean("is_group").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    seoTitle: text("seoTitle"),
    seoDescription: text("seoDescription"),
    seoKeywords: text("seoKeywords"),
    seoImage: text("seoImage"),
    createdAt: createdAt(),
    updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("Category_parentId_idx").on(table.parentId)],
);

export const products = pgTable("products", {
  id: text("id").default(idDefault).primaryKey(),
  erpnextItemCode: text("erpnext_item_code").default(idDefault).notNull().unique("products_erpnext_item_code_key"),
  name: text("name").default("").notNull(),
  brand: text("brand").notNull(),
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null", onUpdate: "cascade" }),
  model: text("model").notNull(),
  price: doublePrecision("price").notNull(),
  imageUrl: text("image_url").notNull(),
  description: text("description"),
  stock: integer("stock").default(10).notNull(),
  stockStatus: text("stock_status").default("IN_STOCK").notNull(),
  ctaType: productCtaTypeEnum("cta_type").default("REQUEST_QUOTE").notNull(),
  isAvailable: boolean("isAvailable").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade", onUpdate: "cascade" }),
  metadata: jsonb("metadata").default(emptyJson).notNull(),
  specifications: jsonb("specifications").default(emptyJson).notNull(),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
  seoTitle: text("seoTitle"),
  seoDescription: text("seoDescription"),
  seoKeywords: text("seoKeywords"),
  seoImage: text("seoImage"),
  physicalWidth: doublePrecision("physicalWidth"),
  physicalLength: doublePrecision("physicalLength"),
  wattageCapacity: integer("wattageCapacity"),
  useInRecommendation: boolean("useInRecommendation").default(true).notNull(),
  recommendTier: text("recommendTier"),
  recommendPriority: integer("recommendPriority").default(0).notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "date" }),
});

export const productInventory = pgTable(
  "product_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: text("product_id")
      .notNull()
      .unique("product_inventory_product_id_key")
      .references(() => products.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    quantityOnHand: integer("quantity_on_hand").default(0).notNull(),
    reservedQuantity: integer("reserved_quantity").default(0).notNull(),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    check(
      "product_inventory_quantity_on_hand_check",
      sql`${table.quantityOnHand} >= 0`,
    ),
    check(
      "product_inventory_reserved_quantity_check",
      sql`${table.reservedQuantity} >= 0 AND ${table.reservedQuantity} <= ${table.quantityOnHand}`,
    ),
  ],
);

export const users = pgTable("User", {
  id: text("id").default(idDefault).primaryKey(),
  email: text("email").notNull().unique("User_email_key"),
  name: text("name"),
  fullName: text("full_name").default("").notNull(),
  phoneNumber: text("phoneNumber"),
  avatarUrl: text("avatarUrl"),
  passwordHash: text("password_hash"),
  utm_source: text("utm_source"),
  utm_medium: text("utm_medium"),
  utm_campaign: text("utm_campaign"),
  role: roleEnum("role").default("USER").notNull(),
  department: departmentEnum("department").default("NONE").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  erpnextCustomerId: text("erpnext_customer_id"),
  lastEstimateDraft: jsonb("lastEstimateDraft"),
  lineUserId: text("line_user_id").unique("User_line_user_id_key"),
  lineLinkNonce: text("line_link_nonce"),
  isLineBlocked: boolean("is_line_blocked").default(false).notNull(),
  preferredLanguage: text("preferred_language").default("th").notNull(),
  consentPreferences: jsonb("consent_preferences")
    .$type<UserConsentPreferences>()
    .default(sql`'{"news":false,"promotions":false,"systemUpdates":true,"revision":1}'::jsonb`)
    .notNull(),
  listmonkSubscriberId: text("listmonk_subscriber_id"),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  privacyPolicyVersionAccepted: text("privacy_policy_version_accepted"),
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true, mode: "date" }),
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true, mode: "date" }),
  retentionReviewAt: timestamp("retention_review_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("User_listmonk_subscriber_id_key").on(table.listmonkSubscriberId),
]);

/** Canonical commercial party. User remains an authentication identity only. */
export const salesCustomers = pgTable("sales_customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerType: text("customer_type").default("PERSON").notNull(),
  displayName: text("display_name").notNull(),
  legalName: text("legal_name"),
  lifecycleStatus: text("lifecycle_status").default("ACTIVE").notNull(),
  legacyUserId: text("legacy_user_id").references(() => users.id, { onDelete: "set null" }),
  legacyKey: text("legacy_key").notNull(),
  erpnextCustomerId: text("erpnext_customer_id"),
  sourceReferences: jsonb("source_references").$type<Record<string, unknown>>().default(emptyJson).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("sales_customers_legacy_key_key").on(table.legacyKey),
  index("sales_customers_erpnext_customer_id_idx").on(table.erpnextCustomerId),
]);

/** A person/contact point. Email and phone deliberately are not globally unique. */
export const salesContacts = pgTable("sales_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => salesCustomers.id, { onDelete: "cascade", onUpdate: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  legacyKey: text("legacy_key"),
  displayName: text("display_name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  preferredChannel: text("preferred_channel"),
  channelPreferences: jsonb("channel_preferences").$type<Record<string, boolean>>().default(emptyJson).notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: "date" }),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true, mode: "date" }),
  isPrimary: boolean("is_primary").default(false).notNull(),
  email: text("email"), normalizedEmail: text("normalized_email"),
  phone: text("phone"), normalizedPhone: text("normalized_phone"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("sales_contacts_legacy_key_key").on(table.legacyKey).where(sql`${table.legacyKey} IS NOT NULL`),
  uniqueIndex("sales_contacts_user_id_key").on(table.userId).where(sql`${table.userId} IS NOT NULL`),
  index("sales_contacts_customer_id_idx").on(table.customerId),
  uniqueIndex("sales_contacts_customer_primary_key").on(table.customerId).where(sql`${table.isPrimary} = true`),
  index("sales_contacts_normalized_email_idx").on(table.normalizedEmail).where(sql`${table.normalizedEmail} IS NOT NULL`),
  index("sales_contacts_normalized_phone_idx").on(table.normalizedPhone).where(sql`${table.normalizedPhone} IS NOT NULL`),
]);

/** Explicit bridge from legacy authentication identities to the sales domain. */
export const salesLegacyIdentityMappings = pgTable("sales_legacy_identity_mappings", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => salesCustomers.id, { onDelete: "restrict", onUpdate: "cascade" }),
  contactId: uuid("contact_id").references(() => salesContacts.id, { onDelete: "set null", onUpdate: "cascade" }),
  mappingRule: text("mapping_rule").notNull(), mappingVersion: integer("mapping_version").default(1).notNull(),
  inputChecksum: text("input_checksum").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("sales_legacy_identity_customer_id_idx").on(table.customerId),
  uniqueIndex("sales_legacy_identity_contact_id_key").on(table.contactId).where(sql`${table.contactId} IS NOT NULL`),
  check("sales_legacy_identity_mapping_version_check", sql`${table.mappingVersion} >= 1`),
]);

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: text("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
    salesCustomerId: uuid("sales_customer_id").references(() => salesCustomers.id, { onDelete: "restrict", onUpdate: "cascade" }),
    primarySalesDealId: uuid("primary_sales_deal_id"),
    label: text("label").notNull(),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    city: text("city"),
    province: text("province"),
    postalCode: text("postal_code"),
    country: text("country").default("Thailand").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    accessNotes: text("access_notes"),
    erpnextAddressId: text("erpnext_address_id"),
    sourceKey: text("source_key"),
    sourceReferences: jsonb("source_references").default(emptyJson).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    index("sites_customer_active_idx").on(table.customerId, table.isActive),
    index("sites_sales_customer_id_idx").on(table.salesCustomerId),
    index("sites_erpnext_address_idx").on(table.erpnextAddressId),
    uniqueIndex("sites_source_key").on(table.sourceKey),
    check("sites_latitude_check", sql`${table.latitude} IS NULL OR ${table.latitude} BETWEEN -90 AND 90`),
    check("sites_longitude_check", sql`${table.longitude} IS NULL OR ${table.longitude} BETWEEN -180 AND 180`),
  ],
);

export const staffAccessRoles = pgTable(
  "staff_access_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    permissions: text("permissions").array().default(emptyTextArray).notNull(),
    scopeMode: text("scope_mode").default("OWN").notNull(),
    isSystem: boolean("is_system").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("staff_access_roles_code_key").on(table.code),
    index("staff_access_roles_active_idx").on(table.isActive),
    check("staff_access_roles_scope_mode_check", sql`${table.scopeMode} IN ('ALL', 'OWN')`),
  ],
);

export const staffAccessAssignments = pgTable(
  "staff_access_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    roleId: uuid("role_id").notNull().references(() => staffAccessRoles.id, { onDelete: "restrict", onUpdate: "cascade" }),
    scopeMode: text("scope_mode").default("OWN").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    isActive: boolean("is_active").default(true).notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("staff_access_assignments_user_role_key").on(table.userId, table.roleId),
    index("staff_access_assignments_user_active_idx").on(table.userId, table.isActive),
    index("staff_access_assignments_expiry_idx").on(table.expiresAt),
    check("staff_access_assignments_scope_mode_check", sql`${table.scopeMode} IN ('ALL', 'OWN')`),
  ],
);

export const externalAccessAccounts = pgTable(
  "external_access_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    companyName: text("company_name"),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    permissions: text("permissions").array().default(sql`ARRAY['external:work:read']::text[]`).notNull(),
    tokenDigest: text("token_digest").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("external_access_accounts_token_digest_key").on(table.tokenDigest),
    index("external_access_accounts_scope_idx").on(table.scopeType, table.scopeId),
    index("external_access_accounts_expiry_idx").on(table.expiresAt),
    index("external_access_accounts_revoked_idx").on(table.revokedAt),
    check("external_access_accounts_scope_type_check", sql`${table.scopeType} IN ('PROJECT', 'TASK', 'PROPOSAL')`),
  ],
);

export const userConsentLogs = pgTable("user_consent_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  sessionHash: text("session_hash"),
  consentType: text("consent_type").notNull(),
  policyVersion: text("policy_version").notNull(),
  granted: boolean("granted").notNull(),
  preferences: jsonb("preferences").default(emptyJson).notNull(),
  ipHash: text("ip_hash").notNull(),
  userAgentHash: text("user_agent_hash"),
  source: text("source").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("user_consent_logs_dedupe_key_key").on(table.dedupeKey),
  index("user_consent_logs_user_created_idx").on(table.userId, table.createdAt),
  index("user_consent_logs_session_created_idx").on(table.sessionHash, table.createdAt),
  index("user_consent_logs_policy_type_idx").on(table.policyVersion, table.consentType),
]);

export const savedConfigurations = pgTable("SavedConfiguration", {
  id: text("id").default(idDefault).primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  totalPrice: doublePrecision("totalPrice").notNull(),
  erpnextItemCodes: jsonb("erpnext_item_codes").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
  utm_source: text("utm_source"),
  utm_medium: text("utm_medium"),
  utm_campaign: text("utm_campaign"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const productToSavedConfig = pgTable(
  "_ProductToSavedConfig",
  {
    productId: text("A")
      .notNull()
      .references(() => products.id, { onDelete: "cascade", onUpdate: "cascade" }),
    savedConfigurationId: text("B")
      .notNull()
      .references(() => savedConfigurations.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.productId, table.savedConfigurationId],
      name: "_ProductToSavedConfig_AB_pkey",
    }),
    index("_ProductToSavedConfig_B_index").on(table.savedConfigurationId),
  ],
);

export const purchasedProducts = pgTable("purchased_products", {
  id: text("id").default(idDefault).primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  // Nullable for new ERPNext-backed asset records; retained for legacy rows.
  productId: text("product_id").references(() => products.id, { onUpdate: "cascade" }),
  erpnextItemCode: text("erpnext_item_code"),
  purchaseDate: createdAt("purchase_date"),
  serialNumber: text("serial_number").notNull().unique("purchased_products_serial_number_key"),
  warrantyDays: integer("warranty_days").notNull(),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
});

export const assetRegistrations = pgTable(
  "asset_registrations",
  {
    id: text("id").default(idDefault).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    productName: text("product_name").notNull(),
    serialNumber: text("serial_number").notNull().unique("asset_registrations_serial_number_key"),
    purchaseDate: createdAt("purchase_date"),
    warrantyMonths: integer("warranty_months").notNull(),
    status: text("status").default("ACTIVE").notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [index("asset_registrations_user_id_idx").on(table.userId)],
);

export const serviceFeeConfigs = pgTable("service_fee_configs", {
  id: text("id").default(idDefault).primaryKey(),
  name: text("name").notNull(),
  erpItemCode: text("erp_item_code").notNull(),
  basePrice: doublePrecision("base_price").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: createdAt("created_at"),
});

export const leads = pgTable(
  "Lead",
  {
    id: text("id").default(idDefault).primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    location: text("location"),
    status: text("status").default("NEW").notNull(),
    notes: text("notes"),
    configurationSnapshot: jsonb("configurationSnapshot").notNull(),
    savedConfigurationId: text("savedConfigurationId").references(() => savedConfigurations.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("leads_status_created_at_idx").on(table.status, desc(table.createdAt))],
);

export const consultationLeads = pgTable(
  "ConsultationLead",
  {
    id: text("id").default(idDefault).primaryKey(),
    userId: text("userId").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    customerName: text("customerName").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    postalCode: text("postalCode"),
    targetSystemSize: text("targetSystemSize").notNull(),
    systemType: consultationSystemTypeEnum("systemType").notNull(),
    addOns: text("addOns").array().default(emptyTextArray).notNull(),
    customerNotes: text("customerNotes"),
    status: consultationLeadStatusEnum("status").default("NEW_LEAD").notNull(),
    dynamicCalculations: jsonb("dynamicCalculations").default(emptyJson).notNull(),
    rawPayload: jsonb("rawPayload").default(emptyJson).notNull(),
    crmPayload: jsonb("crmPayload").default(emptyJson).notNull(),
    erpLeadId: text("erp_lead_id"),
    legacyLeadId: text("legacyLeadId").references(() => leads.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: createdAt(),
    updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("ConsultationLead_userId_idx").on(table.userId),
    index("ConsultationLead_status_idx").on(table.status),
    index("ConsultationLead_createdAt_idx").on(table.createdAt),
    index("ConsultationLead_systemType_idx").on(table.systemType),
    index("ConsultationLead_erpLeadId_idx").on(table.erpLeadId),
  ],
);

export const recommendationCategories = pgTable(
  "RecommendationCategory",
  {
    id: text("id").default(idDefault).primaryKey(),
    nameTh: text("nameTh").notNull(),
    nameEn: text("nameEn").notNull(),
    componentType: recommendationComponentTypeEnum("componentType").notNull(),
    applicableSizes: text("applicableSizes").array().default(emptyTextArray).notNull(),
    descriptionTh: text("descriptionTh").notNull(),
    descriptionEn: text("descriptionEn").notNull(),
    isDefault: boolean("isDefault").default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("RecommendationCategory_componentType_idx").on(table.componentType),
    index("RecommendationCategory_isDefault_idx").on(table.isDefault),
    index("RecommendationCategory_createdAt_idx").on(table.createdAt),
  ],
);

export const proposalDocuments = pgTable("ProposalDocument", {
  id: text("id").default(idDefault).primaryKey(),
  leadId: text("leadId")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade", onUpdate: "cascade" }),
  fileUrl: text("fileUrl").notNull(),
  status: text("status").default("DRAFT").notNull(),
  totalValue: doublePrecision("totalValue").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const installationProjects = pgTable("InstallationProject", {
  id: text("id").default(idDefault).primaryKey(),
  leadId: text("leadId")
    .notNull()
    .unique("InstallationProject_leadId_key")
    .references(() => leads.id, { onDelete: "cascade", onUpdate: "cascade" }),
  status: text("status").default("PREP").notNull(),
  scheduledDate: timestamp("scheduledDate", { mode: "date", precision: 3 }),
  assignedTeam: text("assignedTeam"),
  notes: text("notes"),
  checklist: jsonb("checklist"),
  photos: text("photos").array().notNull(),
  createdAt: createdAt(),
});

export const systemSettings = pgTable("SystemSetting", {
  id: text("id").default("default").primaryKey(),
  toolSettings: jsonb("toolSettings"),
  updatedAt: updatedAt(),
});

export const systemSettingsKeyValue = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const emailTemplates = pgTable("email_templates", {
  templateKey: text("template_key").primaryKey(),
  listmonkTemplateId: integer("listmonk_template_id"),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const richMenuProfiles = pgTable(
  "rich_menu_profiles",
  {
    id: text("id").default(idDefault).primaryKey(),
    profileType: richMenuProfileTypeEnum("profile_type").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    richMenuId: text("rich_menu_id"),
    lineRichMenuId: text("line_rich_menu_id"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    uniqueIndex("rich_menu_profiles_profile_type_key").on(table.profileType),
    index("rich_menu_profiles_is_active_idx").on(table.isActive),
  ],
);

export const richMenuSchedules = pgTable(
  "rich_menu_schedules",
  {
    id: text("id").default(idDefault).primaryKey(),
    profileType: richMenuProfileTypeEnum("profile_type").notNull(),
    richMenuId: text("rich_menu_id").notNull(),
    lineRichMenuId: text("line_rich_menu_id").notNull(),
    startTime: timestamp("start_time", { mode: "date", precision: 3 }).notNull(),
    endTime: timestamp("end_time", { mode: "date", precision: 3 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    lastAppliedWindowKey: text("last_applied_window_key"),
    lastAppliedAt: timestamp("last_applied_at", { mode: "date", precision: 3 }),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    index("rich_menu_schedules_profile_type_idx").on(table.profileType),
    index("rich_menu_schedules_window_idx").on(table.profileType, table.startTime, table.endTime),
    index("rich_menu_schedules_active_idx").on(table.isActive),
    check(
      "rich_menu_schedules_window_check",
      sql`${table.endTime} > ${table.startTime}`,
    ),
  ],
);

export const lineUserGroupRules = pgTable(
  "line_user_group_rules",
  {
    id: text("id").default(idDefault).primaryKey(),
    name: text("name").notNull(),
    targetGroup: richMenuProfileTypeEnum("target_group").notNull(),
    priority: integer("priority").default(100).notNull(),
    condition: jsonb("condition").$type<Record<string, unknown>>().default(emptyJson).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    uniqueIndex("line_user_group_rules_name_key").on(table.name),
    index("line_user_group_rules_target_group_idx").on(table.targetGroup),
    index("line_user_group_rules_priority_idx").on(table.priority),
    index("line_user_group_rules_is_active_idx").on(table.isActive),
  ],
);

export const lineUserGroupOverrides = pgTable(
  "line_user_group_overrides",
  {
    id: text("id").default(idDefault).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    targetGroup: richMenuProfileTypeEnum("target_group").notNull(),
    reason: text("reason"),
    assignedBy: text("assigned_by").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    uniqueIndex("line_user_group_overrides_user_id_key").on(table.userId),
    index("line_user_group_overrides_target_group_idx").on(table.targetGroup),
  ],
);

/** Customer-facing tags used by the LINE automation condition/action engine. */
export const lineCustomerTags = pgTable(
  "line_customer_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: text("customer_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    tag: text("tag").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: createdAt("created_at"),
  },
  (table) => [
    uniqueIndex("line_customer_tags_customer_tag_key").on(table.customerId, table.tag),
    index("line_customer_tags_tag_idx").on(table.tag),
  ],
);

/** Structured LINE content. Published data is kept beside the draft so an edit
 * can never change what is already live until an explicit publish action. */
export const lineContentItems = pgTable(
  "line_content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    internalName: text("internal_name").notNull(),
    contentType: text("content_type").notNull(),
    category: text("category").notNull().default("General"),
    tags: text("tags").array().default(emptyTextArray).notNull(),
    locale: text("locale").notNull().default("th"),
    status: text("status").notNull().default("DRAFT"),
    thumbnailUrl: text("thumbnail_url"),
    draftDocument: jsonb("draft_document").$type<LineContentDocument>().default(emptyJson).notNull(),
    publishedDocument: jsonb("published_document").$type<LineContentDocument | null>(),
    schemaVersion: integer("schema_version").default(1).notNull(),
    draftVersion: integer("draft_version").default(1).notNull(),
    publishedVersion: integer("published_version"),
    rowVersion: integer("row_version").default(1).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    uniqueIndex("line_content_items_internal_name_locale_key").on(table.internalName, table.locale),
    index("line_content_items_status_locale_idx").on(table.status, table.locale),
    index("line_content_items_category_idx").on(table.category),
    check("line_content_items_type_check", sql`${table.contentType} IN ('TEXT', 'IMAGE', 'RICH_FLEX', 'CAROUSEL', 'QUICK_REPLY')`),
    check("line_content_items_status_check", sql`${table.status} IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')`),
    check("line_content_items_version_check", sql`${table.draftVersion} >= 1 AND ${table.rowVersion} >= 1`),
  ],
);

export const lineContentVersions = pgTable(
  "line_content_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => lineContentItems.id, { onDelete: "cascade", onUpdate: "cascade" }),
    version: integer("version").notNull(),
    state: text("state").notNull().default("DRAFT"),
    schemaVersion: integer("schema_version").notNull().default(1),
    document: jsonb("document").$type<LineContentDocument>().notNull(),
    compiledPayload: jsonb("compiled_payload").$type<Record<string, unknown>[]>().default(sql`'[]'::jsonb`).notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: createdAt("created_at"),
  },
  (table) => [
    uniqueIndex("line_content_versions_item_version_key").on(table.itemId, table.version),
    index("line_content_versions_item_created_idx").on(table.itemId, desc(table.createdAt)),
    check("line_content_versions_state_check", sql`${table.state} IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')`),
    check("line_content_versions_version_check", sql`${table.version} >= 1`),
  ],
);

/** No-code rule documents for LINE events. The evaluator only understands the
 * discriminated structures declared in lineAutomationEngine.ts. */
export const lineAutomationRules = pgTable(
  "line_automation_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    draftConfig: jsonb("draft_config").$type<{ schemaVersion: 1; trigger: LineAutomationTrigger; conditionMode: "all" | "any"; conditions: LineAutomationCondition[]; actions: LineAutomationAction[] }>().notNull(),
    publishedConfig: jsonb("published_config").$type<{ schemaVersion: 1; trigger: LineAutomationTrigger; conditionMode: "all" | "any"; conditions: LineAutomationCondition[]; actions: LineAutomationAction[] }>(),
    status: text("status").notNull().default("DRAFT"),
    priority: integer("priority").notNull().default(100),
    stopProcessing: boolean("stop_processing").notNull().default(false),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(0),
    enabled: boolean("enabled").notNull().default(false),
    executionCount: integer("execution_count").notNull().default(0),
    lastExecutedAt: timestamp("last_executed_at", { withTimezone: true, mode: "date" }),
    lastError: text("last_error"),
    draftVersion: integer("draft_version").notNull().default(1),
    publishedVersion: integer("published_version"),
    rowVersion: integer("row_version").notNull().default(1),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    uniqueIndex("line_automation_rules_name_key").on(table.name),
    index("line_automation_rules_enabled_priority_idx").on(table.enabled, table.priority),
    index("line_automation_rules_status_idx").on(table.status),
    check("line_automation_rules_status_check", sql`${table.status} IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')`),
    check("line_automation_rules_priority_check", sql`${table.priority} >= 0 AND ${table.cooldownSeconds} >= 0`),
  ],
);

export const lineAutomationRuns = pgTable(
  "line_automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id").references(() => lineAutomationRules.id, { onDelete: "set null", onUpdate: "cascade" }),
    runType: text("run_type").notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: createdAt("created_at"),
  },
  (table) => [
    index("line_automation_runs_created_idx").on(desc(table.createdAt)),
    index("line_automation_runs_rule_idx").on(table.ruleId, desc(table.createdAt)),
    check("line_automation_runs_type_check", sql`${table.runType} IN ('SIMULATION', 'WEBHOOK', 'REPLAY')`),
  ],
);

/** New builder state. Existing rich_menu_profiles/schedules remain the
 * assignment and scheduler compatibility layer. */
export const lineRichMenuDefinitions = pgTable(
  "line_rich_menu_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    internalName: text("internal_name").notNull(),
    audience: text("audience").notNull().default("DEFAULT"),
    isDefault: boolean("is_default").notNull().default(false),
    status: text("status").notNull().default("DRAFT"),
    artworkUrl: text("artwork_url"),
    draftDocument: jsonb("draft_document").$type<Record<string, unknown>>().notNull(),
    publishedDocument: jsonb("published_document").$type<Record<string, unknown>>(),
    lineRichMenuId: text("line_rich_menu_id"),
    previousLineRichMenuId: text("previous_line_rich_menu_id"),
    draftVersion: integer("draft_version").notNull().default(1),
    publishedVersion: integer("published_version"),
    rowVersion: integer("row_version").notNull().default(1),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    uniqueIndex("line_rich_menu_definitions_internal_name_key").on(table.internalName),
    index("line_rich_menu_definitions_status_audience_idx").on(table.status, table.audience),
    check("line_rich_menu_definitions_status_check", sql`${table.status} IN ('DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED')`),
    check("line_rich_menu_definitions_version_check", sql`${table.draftVersion} >= 1 AND ${table.rowVersion} >= 1`),
  ],
);

export const lineRichMenuVersions = pgTable(
  "line_rich_menu_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    definitionId: uuid("definition_id").notNull().references(() => lineRichMenuDefinitions.id, { onDelete: "cascade", onUpdate: "cascade" }),
    version: integer("version").notNull(),
    state: text("state").notNull().default("DRAFT"),
    document: jsonb("document").$type<Record<string, unknown>>().notNull(),
    artworkUrl: text("artwork_url"),
    lineRichMenuId: text("line_rich_menu_id"),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: createdAt("created_at"),
  },
  (table) => [
    uniqueIndex("line_rich_menu_versions_definition_version_key").on(table.definitionId, table.version),
    index("line_rich_menu_versions_definition_created_idx").on(table.definitionId, desc(table.createdAt)),
    check("line_rich_menu_versions_state_check", sql`${table.state} IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')`),
  ],
);

export const lineWebhookEvents = pgTable(
  "line_webhook_events",
  {
    eventId: text("event_id").primaryKey(),
    webhookRequestId: text("webhook_request_id"),
    eventIndex: integer("event_index").notNull().default(0),
    providerTimestamp: text("provider_timestamp"),
    attemptCount: integer("attempt_count").notNull().default(0),
    replyTokenHash: text("reply_token_hash"),
    replyAttemptedAt: timestamp("reply_attempted_at", { withTimezone: true, mode: "date" }),
    replyStatus: text("reply_status").notNull().default("NOT_ATTEMPTED"),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    status: text("status").notNull().default("RECEIVED"),
    conversationKey: text("conversation_key"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    errorMessage: text("error_message"),
    receivedAt: createdAt("received_at"),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    index("line_webhook_events_status_received_idx").on(table.status, desc(table.receivedAt)),
    index("line_webhook_events_conversation_received_idx").on(table.conversationKey, desc(table.receivedAt)),
    check("line_webhook_events_status_check", sql`${table.status} IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'RETRY', 'DEAD_LETTER')`),
    check("line_webhook_events_attempt_check", sql`${table.attemptCount} >= 0`),
    check("line_webhook_events_reply_status_check", sql`${table.replyStatus} IN ('NOT_ATTEMPTED', 'ATTEMPTED', 'SENT', 'FAILED')`),
  ],
);

export const difyIntegrations = pgTable(
  "dify_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    appType: text("app_type").notNull().default("chat"),
    apiKeyCiphertext: text("api_key_ciphertext").notNull(),
    apiKeyLast4: text("api_key_last4").notNull(),
    inputMapping: jsonb("input_mapping").$type<Record<string, string>>().default(emptyJson).notNull(),
    configVersion: integer("config_version").notNull().default(1),
    timeoutMs: integer("timeout_ms").notNull().default(12000),
    fallbackContentId: uuid("fallback_content_id").references(() => lineContentItems.id, { onDelete: "set null", onUpdate: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true, mode: "date" }),
    lastTestStatus: text("last_test_status"),
    lastTestError: text("last_test_error"),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    uniqueIndex("dify_integrations_name_key").on(table.name),
    index("dify_integrations_enabled_idx").on(table.enabled),
    check("dify_integrations_app_type_check", sql`${table.appType} IN ('chat', 'completion')`),
    check("dify_integrations_timeout_check", sql`${table.timeoutMs} BETWEEN 1000 AND 60000`),
  ],
);

/** One Dify conversation session per customer, LINE conversation, and adapter
 * configuration version. This prevents context leakage when an adapter is
 * changed or a rule is switched to a different app. */
export const difyConversations = pgTable(
  "dify_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: text("customer_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    conversationKey: text("conversation_key").notNull(),
    integrationId: uuid("integration_id").notNull().references(() => difyIntegrations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    integrationVersion: integer("integration_version").notNull().default(1),
    difyConversationId: text("dify_conversation_id").notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    uniqueIndex("dify_conversations_customer_key_integration_key").on(table.customerId, table.conversationKey, table.integrationId),
    index("dify_conversations_updated_idx").on(table.updatedAt),
  ],
);

export const quotationSettings = pgTable("quotation_settings", {
  id: text("id").default(idDefault).primaryKey(),
  companyName: text("company_name").notNull().default("Solar Dream Co., Ltd."),
  companyAddress: text("company_address").notNull(),
  taxId: text("tax_id").notNull(),
  phone: text("phone"),
  email: text("email"),
  website: text("website").default("solardream.co.th"),
  taxMode: text("tax_mode").notNull().default("EXCLUSIVE"),
  termsAndConditions: text("terms_and_conditions").notNull(),
  paymentDetails: text("payment_details").notNull(),
  validityDays: integer("validity_days").default(30).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", precision: 3 })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const paymentSettings = pgTable("payment_settings", {
  id: text("id").default(idDefault).primaryKey(),
  promptpayId: text("promptpay_id").notNull().default("0812345678"),
  promptpayLimit: integer("promptpay_limit").notNull().default(200000),
  bankName: text("bank_name").notNull().default("Kasikorn Bank (KBank)"),
  bankAccountName: text("bank_account_name").notNull().default("SolarDream Co., Ltd."),
  bankAccountNumber: text("bank_account_number").notNull().default("012-3-45678-9"),
  updatedAt: timestamp("updated_at", { mode: "date", precision: 3 })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const globalBanners = pgTable("GlobalBanner", {
  id: text("id").default(idDefault).primaryKey(),
  message: text("message").notNull(),
  type: text("type").default("INFO").notNull(),
  isActive: boolean("isActive").default(false).notNull(),
  linkUrl: text("linkUrl"),
  translations: jsonb("translations")
    .$type<import("@/types/globalBanner").GlobalBannerTranslations>()
    .default(emptyJson)
    .notNull(),
  startsAt: timestamp("startsAt", { withTimezone: true, mode: "date" }),
  endsAt: timestamp("endsAt", { withTimezone: true, mode: "date" }),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: createdAt(),
}, (table) => [
  index("GlobalBanner_active_schedule_idx").on(
    table.isActive,
    table.startsAt,
    table.endsAt,
    table.sortOrder,
  ),
]);

export const articles = pgTable("Article", {
  id: text("id").default(idDefault).primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  coverImage: text("coverImage"),
  writer: text("writer"),
  publishedAt: timestamp("publishedAt", { withTimezone: true }),
  metaTitle: text("metaTitle"),
  metaDescription: text("metaDescription"),
  ogImage: text("ogImage"),
  authorId: text("authorId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  isPublished: boolean("isPublished").default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const contactLinks = pgTable("ContactLink", {
  id: text("id").default(idDefault).primaryKey(),
  platform: text("platform").notNull(),
  value: text("value").notNull(),
  label: text("label"),
  icon: text("icon"),
  displayOrder: integer("displayOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const globalSeo = pgTable("GlobalSeo", {
  id: text("id").default("default").primaryKey(),
  defaultSeoTitle: text("defaultSeoTitle").notNull(),
  defaultSeoDescription: text("defaultSeoDescription").notNull(),
  defaultOgImage: text("defaultOgImage"),
  defaultKeywords: text("defaultKeywords"),
  updatedAt: updatedAt(),
});

export const pageSeo = pgTable("PageSeo", {
  id: text("id").primaryKey(),
  pageName: text("pageName").notNull(),
  seoTitle: text("seoTitle").notNull(),
  seoDescription: text("seoDescription").notNull(),
  seoKeywords: text("seoKeywords"),
  seoImage: text("seoImage"),
  updatedAt: updatedAt(),
});

export const siteSettings = pgTable("site_settings", {
  id: text("id").default("default").primaryKey(),
  cookieBannerText: text("cookie_banner_text")
    .default("เราใช้คุกกี้เพื่อพัฒนาประสิทธิภาพ และประสบการณ์ที่ดีในการใช้เว็บไซต์ของคุณ ทั้งนี้ ท่านสามารถศึกษารายละเอียดการใช้คุกกี้ได้ที่ นโยบายความเป็นส่วนตัว")
    .notNull(),
  cookieBannerEnabled: boolean("cookie_banner_enabled").default(true).notNull(),
  termsAndConditions: text("terms_and_conditions").default("").notNull(),
  privacyPolicy: text("privacy_policy").default("").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", precision: 3 })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const cookieConsentLogs = pgTable("cookie_consent_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  sessionId: text("session_id"),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent").notNull(),
  consentPreferences: jsonb("consent_preferences").default(emptyJson).notNull(),
  createdAt: timestamp("created_at", { mode: "date", precision: 3 }).defaultNow().notNull(),
});

export const signatureAuditTrails = pgTable(
  "signature_audit_trails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
    signatureUrl: text("signature_url").notNull(),
    signerIpAddress: text("signer_ip_address").notNull(),
    signerUserAgent: text("signer_user_agent").notNull(),
    documentHash: text("document_hash").notNull(),
    createdAt: timestamp("created_at", { mode: "date", precision: 3 }).defaultNow().notNull(),
  },
  (table) => [
    index("signature_audit_trails_proposal_idx").on(table.proposalId),
  ]
);

export const apiLogs = pgTable("api_logs", {
  id: text("id").default(idDefault).primaryKey(),
  direction: text("direction").notNull(),
  sourceSystem: text("source_system").notNull(),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  statusCode: integer("status_code").notNull(),
  requestHeaders: jsonb("request_headers").default(emptyJson).notNull(),
  requestBody: jsonb("request_body").default(emptyJson).notNull(),
  responseBody: jsonb("response_body").default(emptyJson).notNull(),
  errorMessage: text("error_message"),
  createdAt: createdAt("created_at"),
}, (table) => [
  index("api_logs_created_at_idx").on(table.createdAt),
  index("api_logs_source_system_idx").on(table.sourceSystem),
  index("api_logs_direction_idx").on(table.direction),
  index("api_logs_status_code_idx").on(table.statusCode),
]);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id"),
    actorType: text("actor_type").default("SYSTEM").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    outcome: text("outcome").default("SUCCESS").notNull(),
    route: text("route"),
    method: text("method"),
    requestId: text("request_id"),
    ipHash: text("ip_hash"),
    userAgentHash: text("user_agent_hash"),
    metadata: jsonb("metadata").$type<AuditMetadata>().default(emptyJson).notNull(),
    legacyActivityLogId: uuid("legacy_activity_log_id").unique("audit_events_legacy_activity_log_key"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_events_occurred_at_idx").on(table.occurredAt),
    index("audit_events_actor_idx").on(table.actorUserId, table.occurredAt),
    index("audit_events_resource_idx").on(table.resourceType, table.resourceId, table.occurredAt),
    index("audit_events_action_idx").on(table.action, table.occurredAt),
    index("audit_events_outcome_idx").on(table.outcome, table.occurredAt),
  ],
);

export const navigationItems = pgTable("NavigationItem", {
  id: text("id").default(idDefault).primaryKey(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  parentId: text("parentId").references((): AnyPgColumn => navigationItems.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  order: integer("order").default(0).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const wizards = pgTable("Wizard", {
  id: text("id").default(idDefault).primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  translations: jsonb("translations").$type<Record<string, unknown>>().default(emptyJson).notNull(),
  slug: text("slug").notNull().unique("Wizard_slug_key"),
  isActive: boolean("isActive").default(false).notNull(),
  recommendationConfig: jsonb("recommendationConfig"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const wizardSteps = pgTable("WizardStep", {
  id: text("id").default(idDefault).primaryKey(),
  wizardId: text("wizardId")
    .notNull()
    .references(() => wizards.id, { onDelete: "cascade", onUpdate: "cascade" }),
  order: integer("order").default(0).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  translations: jsonb("translations").$type<Record<string, unknown>>().default(emptyJson).notNull(),
});

export const wizardQuestions = pgTable("WizardQuestion", {
  id: text("id").default(idDefault).primaryKey(),
  stepId: text("stepId")
    .notNull()
    .references(() => wizardSteps.id, { onDelete: "cascade", onUpdate: "cascade" }),
  order: integer("order").default(0).notNull(),
  type: text("type").default("RADIO_CARD").notNull(),
  questionText: text("questionText").notNull(),
  helperText: text("helperText"),
  stateKey: text("stateKey").notNull(),
  tooltipText: text("tooltipText"),
  tooltipImageUrl: text("tooltipImageUrl"),
  translations: jsonb("translations").$type<Record<string, unknown>>().default(emptyJson).notNull(),
});

export const wizardOptions = pgTable("WizardOption", {
  id: text("id").default(idDefault).primaryKey(),
  questionId: text("questionId")
    .notNull()
    .references(() => wizardQuestions.id, { onDelete: "cascade", onUpdate: "cascade" }),
  order: integer("order").default(0).notNull(),
  label: text("label").notNull(),
  description: text("description"),
  icon: text("icon"),
  value: text("value").notNull(),
  isRecommended: boolean("isRecommended").default(false).notNull(),
  tooltipText: text("tooltipText"),
  tooltipImageUrl: text("tooltipImageUrl"),
  scoringImpacts: jsonb("scoringImpacts").default(sql`'[]'::jsonb`).notNull(),
  translations: jsonb("translations").$type<Record<string, unknown>>().default(emptyJson).notNull(),
});

export const wizardRules = pgTable(
  "wizard_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wizardId: text("wizard_id")
      .notNull()
      .references(() => wizards.id, { onDelete: "cascade", onUpdate: "cascade" }),
    ruleName: text("rule_name").notNull(),
    conditions: jsonb("conditions").default(sql`'[]'::jsonb`).notNull(),
    actions: jsonb("actions").default(sql`'[]'::jsonb`).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
    translations: jsonb("translations").$type<Record<string, unknown>>().default(emptyJson).notNull(),
  },
  (table) => [
    index("wizard_rules_wizard_id_idx").on(table.wizardId),
    index("wizard_rules_active_idx").on(table.isActive),
  ],
);

export const financingOptions = pgTable(
  "financing_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerName: text("provider_name").notNull(),
    financeType: financeTypeEnum("finance_type").notNull(),
    interestRate: numeric("interest_rate", { precision: 5, scale: 2 }),
    maxTermMonths: integer("max_term_months"),
    minSystemCost: numeric("min_system_cost", { precision: 12, scale: 2 }),
    eligibilityRules: jsonb("eligibility_rules").default(sql`'{}'::jsonb`).notNull(),
    marketingTag: text("marketing_tag"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("financing_options_active_type_idx").on(table.isActive, table.financeType),
    index("financing_options_min_system_cost_idx").on(table.minSystemCost),
  ],
);

export const proposals = pgTable("proposals", {
  salesProposalId: uuid("sales_proposal_id"),
  id: text("id").default(idDefault).primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null", onUpdate: "cascade" }),
  salesOwnerId: text("sales_owner_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  requestType: text("request_type").default("Installation").notNull(),
  serviceItems: jsonb("service_items").default(sql`'[]'::jsonb`).notNull(),
  preferredDate: timestamp("preferred_date", { withTimezone: true, mode: "date" }),
  serviceOrderId: uuid("service_order_id").references((): AnyPgColumn => serviceOrders.id, { onDelete: "set null", onUpdate: "cascade" }),
  systemSizeKwp: doublePrecision("system_size_kwp").notNull(),
  panelCount: integer("panel_count").notNull(),
  totalPrice: doublePrecision("total_price").notNull(),
  monthlySavings: doublePrecision("monthly_savings").notNull(),
  paybackPeriod: text("payback_period").notNull(),
  pdfUrl: text("pdf_url"),
  isArchived: boolean("is_archived").default(false).notNull(),
  status: text("status").default("DRAFT").notNull(),
  projectStatus: text("project_status"),
  configurationData: jsonb("configuration_data").notNull(),
  signedDocumentDriveUrl: text("signed_document_drive_url"),
  verifiedAt: timestamp("verified_at", { mode: "date", precision: 3 }),
  verifiedByAdminId: text("verified_by_admin_id"),
  surveyDate: timestamp("survey_date", { mode: "date", precision: 3 }),
  surveyNotes: text("survey_notes"),
  surveyPhotos: jsonb("survey_photos"),
  revisedPdfUrl: text("revised_pdf_url"),
  fulfillmentType: fulfillmentTypeEnum("fulfillment_type")
    .default("SUPPLY_ONLY")
    .notNull(),
  paymentStatus: proposalPaymentStatusEnum("payment_status")
    .default("UNPAID")
    .notNull(),
  shippingTrackingNumber: text("shipping_tracking_number"),
  currentMilestoneStep: integer("current_milestone_step").default(1).notNull(),
  fieldChecklistData: jsonb("field_checklist_data"),
  revisionNumber: integer("revision_number").default(1).notNull(),
  isInstallationRequired: boolean("is_installation_required").default(false).notNull(),
  installationLatitude: numeric("installation_latitude", { precision: 10, scale: 8 }),
  installationLongitude: numeric("installation_longitude", { precision: 11, scale: 8 }),
  installationMapAddress: text("installation_map_address"),
  installationNotes: text("installation_notes"),
  signatureUrl: text("signature_url"),
  signedAt: timestamp("signed_at", { mode: "date", precision: 3 }),
  clientIp: text("client_ip"),
  serviceFees: jsonb("service_fees"),
  selectedFinancingId: uuid("selected_financing_id").references(() => financingOptions.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  wizardLeadId: text("wizard_lead_id").references(() => consultationLeads.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  dispatchStatus: proposalDispatchStatusEnum("dispatch_status")
    .default("PENDING_DISPATCH")
    .notNull(),
  magicTokenSlug: text("magic_token_slug").default(idDefault).notNull(),
  erpnextCustomerId: text("erpnext_customer_id"),
  erpnextCustomerBoundAt: timestamp("erpnext_customer_bound_at", { mode: "date", precision: 3 }),
  erpnextCustomerBoundByUserId: text("erpnext_customer_bound_by_user_id")
    .references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  erpnextCustomerBindingSource: text("erpnext_customer_binding_source"),
  erpnextQuotationId: text("erpnext_quotation_id"),
  paidAt: timestamp("paid_at", { mode: "date", precision: 3 }),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
}, (table) => [
  index("proposals_user_id_idx").on(table.userId),
  index("proposals_status_idx").on(table.status),
  index("proposals_user_id_status_idx").on(table.userId, table.status),
  index("proposals_created_at_idx").on(table.createdAt),
  index("proposals_wizard_lead_id_idx").on(table.wizardLeadId),
  index("proposals_dispatch_status_idx").on(table.dispatchStatus),
  index("proposals_erpnext_customer_id_idx").on(table.erpnextCustomerId),
  uniqueIndex("proposals_magic_token_slug_key").on(table.magicTokenSlug),
  uniqueIndex("proposals_erpnext_quotation_id_key").on(table.erpnextQuotationId),
  uniqueIndex("proposals_service_order_id_key").on(table.serviceOrderId),
]);

/** Immutable, versioned commercial documents. `proposals` remains the legacy aggregate. */
export const proposalRevisions = pgTable("proposal_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposalId: text("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  pricingSnapshot: jsonb("pricing_snapshot").$type<Record<string, unknown>>().notNull(),
  configurationSnapshot: jsonb("configuration_snapshot").$type<Record<string, unknown>>().notNull(),
  termsSnapshot: jsonb("terms_snapshot").$type<Record<string, unknown>>().notNull(),
  paymentSnapshot: jsonb("payment_snapshot").$type<Record<string, unknown>>().notNull(),
  erpQuotationReference: text("erp_quotation_reference"),
  pdfDocumentReference: text("pdf_document_reference"),
  documentHash: text("document_hash"),
  status: proposalRevisionStatusEnum("status").default("DRAFT").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
  viewedAt: timestamp("viewed_at", { withTimezone: true, mode: "date" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  creationSource: text("creation_source").notNull(),
  creationMetadata: jsonb("creation_metadata").$type<Record<string, unknown>>().default(emptyJson).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("proposal_revisions_proposal_revision_key").on(table.proposalId, table.revisionNumber),
  index("proposal_revisions_proposal_created_idx").on(table.proposalId, table.createdAt),
  index("proposal_revisions_status_idx").on(table.status),
  check("proposal_revisions_revision_positive", sql`${table.revisionNumber} > 0`),
  check("proposal_revisions_hash_format", sql`${table.documentHash} IS NULL OR ${table.documentHash} ~ '^[0-9a-f]{64}$'`),
]);

export const proposalRevisionItems = pgTable("proposal_revision_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  revisionId: uuid("revision_id").notNull().references(() => proposalRevisions.id, { onDelete: "cascade", onUpdate: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  itemCode: text("item_code").notNull(),
  pricingSnapshot: jsonb("pricing_snapshot").$type<Record<string, unknown>>().notNull(),
  configurationSnapshot: jsonb("configuration_snapshot").$type<Record<string, unknown>>().default(emptyJson).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(emptyJson).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("proposal_revision_items_revision_line_key").on(table.revisionId, table.lineNumber),
  index("proposal_revision_items_revision_idx").on(table.revisionId),
  check("proposal_revision_items_line_positive", sql`${table.lineNumber} > 0`),
]);

export const signatureEnvelopes = pgTable("signature_envelopes", {
  id: uuid("id").primaryKey().defaultRandom(),
  revisionId: uuid("revision_id").notNull().references(() => proposalRevisions.id, { onDelete: "restrict", onUpdate: "cascade" }),
  status: signatureEnvelopeStatusEnum("status").default("PENDING").notNull(),
  signerIdentity: jsonb("signer_identity").$type<Record<string, unknown>>().notNull(),
  verifiedContact: jsonb("verified_contact").$type<Record<string, unknown>>().notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true, mode: "date" }),
  consentVersion: text("consent_version").notNull(),
  signatureStorageReference: text("signature_storage_reference"),
  documentHash: text("document_hash").notNull(),
  auditMetadata: jsonb("audit_metadata").$type<Record<string, unknown>>().default(emptyJson).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("signature_envelopes_revision_idx").on(table.revisionId),
  uniqueIndex("signature_envelopes_signed_revision_key").on(table.revisionId).where(sql`${table.status} = 'SIGNED'`),
  check("signature_envelopes_hash_format", sql`${table.documentHash} ~ '^[0-9a-f]{64}$'`),
]);

/** Authoritative, server-enforced state for the quotation-to-warranty lifecycle. */
export const quotationWorkflows = pgTable("quotation_workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposalId: text("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
  currentStep: integer("current_step").default(1).notNull(),
  technicalReviewedAt: timestamp("technical_reviewed_at", { withTimezone: true, mode: "date" }),
  erpQuotationVerifiedAt: timestamp("erp_quotation_verified_at", { withTimezone: true, mode: "date" }),
  quotationAttachedAt: timestamp("quotation_attached_at", { withTimezone: true, mode: "date" }),
  quotationDispatchedAt: timestamp("quotation_dispatched_at", { withTimezone: true, mode: "date" }),
  clientApprovedAt: timestamp("client_approved_at", { withTimezone: true, mode: "date" }),
  paymentConfirmedAt: timestamp("payment_confirmed_at", { withTimezone: true, mode: "date" }),
  projectDocumentationCompletedAt: timestamp("project_documentation_completed_at", { withTimezone: true, mode: "date" }),
  warrantyRegisteredAt: timestamp("warranty_registered_at", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("quotation_workflows_proposal_key").on(table.proposalId),
  index("quotation_workflows_current_step_idx").on(table.currentStep),
]);

export const portalAccessTokens = pgTable("portal_access_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposalId: text("proposal_id")
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
  tokenDigest: text("token_digest").notNull(),
  scopes: text("scopes").array().default(emptyTextArray).notNull(),
  issuedByUserId: text("issued_by_user_id")
    .references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  rotatedFromId: uuid("rotated_from_id").references((): AnyPgColumn => portalAccessTokens.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("portal_access_tokens_digest_key").on(table.tokenDigest),
  index("portal_access_tokens_proposal_id_idx").on(table.proposalId),
  index("portal_access_tokens_expires_at_idx").on(table.expiresAt),
]);

export const portalRateLimits = pgTable("portal_rate_limits", {
  key: text("key").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true, mode: "date" }).notNull(),
  requestCount: integer("request_count").default(0).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("portal_rate_limits_expires_at_idx").on(table.expiresAt),
]);

export const guestWarrantyOtpChallenges = pgTable(
  "guest_warranty_otp_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactDigest: text("contact_digest").notNull(),
    customerUserId: text("customer_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    codeDigest: text("code_digest").notNull(),
    deliveryChannel: text("delivery_channel").default("EMAIL").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("guest_warranty_otp_contact_idx").on(table.contactDigest, table.createdAt),
    index("guest_warranty_otp_expiry_idx").on(table.expiresAt),
    check("guest_warranty_otp_attempt_count_check", sql`${table.attemptCount} BETWEEN 0 AND 5`),
  ],
);

export const guestWarrantyAccessTokens = pgTable(
  "guest_warranty_access_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenDigest: text("token_digest").notNull(),
    customerUserId: text("customer_user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("guest_warranty_access_token_digest_key").on(table.tokenDigest),
    index("guest_warranty_access_customer_idx").on(table.customerUserId, table.expiresAt),
    index("guest_warranty_access_expiry_idx").on(table.expiresAt),
    index("guest_warranty_access_revoked_idx").on(table.revokedAt),
  ],
);

export const wizardEstimateDrafts = pgTable("wizard_estimate_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenDigest: text("token_digest").notNull(),
  requestKeyDigest: text("request_key_digest").notNull(),
  payloadSha256: text("payload_sha256").notNull(),
  intent: text("intent").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").default("ACTIVE").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  claimedByUserId: text("claimed_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("wizard_estimate_drafts_token_digest_key").on(table.tokenDigest),
  uniqueIndex("wizard_estimate_drafts_request_key_digest_key").on(table.requestKeyDigest),
  index("wizard_estimate_drafts_expiry_idx").on(table.status, table.expiresAt),
  index("wizard_estimate_drafts_claimed_user_idx").on(table.claimedByUserId),
]);

export const integrationOutbox = pgTable("integration_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  topic: text("topic").notNull(),
  eventVersion: integer("event_version").default(1).notNull(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  correlationId: text("correlation_id"),
  payload: jsonb("payload").default(emptyJson).notNull(),
  dedupeKey: text("dedupe_key"),
  status: text("status").default("PENDING").notNull(),
  availableAt: timestamp("available_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  attempts: integer("attempts").default(0).notNull(),
  lastError: text("last_error"),
  providerReference: text("provider_reference"),
  processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  deadAt: timestamp("dead_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("integration_outbox_dedupe_key").on(table.dedupeKey),
  index("integration_outbox_pending_idx").on(table.status, table.availableAt),
  index("integration_outbox_aggregate_idx").on(table.aggregateType, table.aggregateId),
  index("integration_outbox_aggregate_order_idx").on(table.aggregateId, table.createdAt, table.id),
  index("integration_outbox_correlation_idx").on(table.correlationId),
]);

export const installationWorkflowProjects = pgTable("installation_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposalId: text("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
  customerId: text("customer_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null", onUpdate: "cascade" }),
  // ERPNext is an asynchronous projection. A local field project can exist
  // before the ERPNext connection is configured or available.
  erpnextProjectId: text("erpnext_project_id"),
  projectCode: text("project_code").notNull(),
  status: text("status").default("OPEN").notNull(),
  lifecycleState: text("lifecycle_state").default("NEW").notNull(),
  lifecycleVersion: integer("lifecycle_version").default(1).notNull(),
  sourceEventKey: text("source_event_key"),
  configurationSnapshot: jsonb("configuration_snapshot").default(emptyJson).notNull(),
  lastTransitionAt: timestamp("last_transition_at", { withTimezone: true, mode: "date" }),
  sourceVersion: integer("source_version").default(1).notNull(),
  erpnextSyncStatus: text("erpnext_sync_status").default("PENDING").notNull(),
  erpnextSyncError: text("erpnext_sync_error"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "date" }),
  permitStatus: text("permit_status").default("NOT_STARTED").notNull(),
  permitAuthority: text("permit_authority"),
  permitApplicationNumber: text("permit_application_number"),
  permitSubmittedAt: timestamp("permit_submitted_at", { withTimezone: true, mode: "date" }),
  permitApprovedAt: timestamp("permit_approved_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("installation_projects_proposal_key").on(table.proposalId),
  uniqueIndex("installation_projects_erpnext_key").on(table.erpnextProjectId),
  uniqueIndex("installation_projects_code_key").on(table.projectCode),
  uniqueIndex("installation_projects_source_event_key").on(table.sourceEventKey),
  index("installation_projects_lifecycle_state_idx").on(table.lifecycleState),
  index("installation_projects_customer_site_idx").on(table.customerId, table.siteId),
]);

export const projectWarrantyRegistrations = pgTable("project_warranty_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => installationWorkflowProjects.id, { onDelete: "cascade", onUpdate: "cascade" }),
  registeredByUserId: text("registered_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  customerName: text("customer_name").notNull(),
  phone: text("phone"),
  installationAddress: text("installation_address"),
  details: jsonb("details").default(emptyJson).notNull(),
  registeredAt: timestamp("registered_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("project_warranty_registrations_project_key").on(table.projectId),
]);

export const installationTasks = pgTable("installation_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => installationWorkflowProjects.id, { onDelete: "cascade", onUpdate: "cascade" }),
  // A task is actionable locally even when its ERPNext projection has not
  // been created yet.
  erpnextTaskId: text("erpnext_task_id"),
  erpnextTimesheetId: text("erpnext_timesheet_id"),
  taskCode: text("task_code").notNull(),
  title: text("title").notNull(),
  sequence: integer("sequence").notNull(),
  dependsOnTaskCode: text("depends_on_task_code"),
  assignedUserId: text("assigned_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  status: text("status").default("OPEN").notNull(),
  erpnextSyncStatus: text("erpnext_sync_status").default("PENDING").notNull(),
  erpnextSyncError: text("erpnext_sync_error"),
  erpnextLastSyncedAt: timestamp("erpnext_last_synced_at", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  completedByUserId: text("completed_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("installation_tasks_erpnext_key").on(table.erpnextTaskId),
  uniqueIndex("installation_tasks_project_code_key").on(table.projectId, table.taskCode),
  index("installation_tasks_assignee_idx").on(table.assignedUserId, table.status),
]);

export const installationChecklistItems = pgTable("installation_checklist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => installationTasks.id, { onDelete: "cascade", onUpdate: "cascade" }),
  erpnextRowId: text("erpnext_row_id"),
  itemCode: text("item_code").notNull(),
  label: text("label").notNull(),
  sequence: integer("sequence").notNull(),
  required: boolean("required").default(true).notNull(),
  evidenceRequired: boolean("evidence_required").default(false).notNull(),
  allowsNa: boolean("allows_na").default(false).notNull(),
  status: text("status").default("OPEN").notNull(),
  outcome: text("outcome"),
  remarks: text("remarks"),
  erpnextQualityInspectionId: text("erpnext_quality_inspection_id"),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  verifiedByUserId: text("verified_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  verificationHash: text("verification_hash"),
  supersededById: uuid("superseded_by_id").references((): AnyPgColumn => installationChecklistItems.id, { onDelete: "set null", onUpdate: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("installation_checklist_task_code_key").on(table.taskId, table.itemCode),
  index("installation_checklist_task_idx").on(table.taskId, table.sequence),
]);

export const installationEvidence = pgTable("installation_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  checklistItemId: uuid("checklist_item_id").notNull().references(() => installationChecklistItems.id, { onDelete: "restrict", onUpdate: "cascade" }),
  storageProvider: text("storage_provider").notNull(),
  storageFileId: text("storage_file_id").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  status: text("status").default("QUARANTINED").notNull(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" }),
  uploadedByUserId: text("uploaded_by_user_id").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("installation_evidence_item_hash_key").on(table.checklistItemId, table.sha256),
  index("installation_evidence_item_idx").on(table.checklistItemId, table.status),
]);

export const fieldVisits = pgTable(
  "field_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => installationWorkflowProjects.id, { onDelete: "cascade", onUpdate: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null", onUpdate: "cascade" }),
    visitType: text("visit_type").default("INSTALLATION").notNull(),
    status: text("status").default("PLANNED").notNull(),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true, mode: "date" }),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true, mode: "date" }),
    timezone: text("timezone").default("Asia/Bangkok").notNull(),
    crewName: text("crew_name"),
    customerConfirmedAt: timestamp("customer_confirmed_at", { withTimezone: true, mode: "date" }),
    sourceJobTicketId: text("source_job_ticket_id"),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    index("field_visits_project_status_idx").on(table.projectId, table.status),
    index("field_visits_schedule_idx").on(table.scheduledStart, table.status),
    uniqueIndex("field_visits_source_job_ticket_key").on(table.sourceJobTicketId),
    index("field_visits_source_job_ticket_idx").on(table.sourceJobTicketId),
    check("field_visits_schedule_order_check", sql`${table.scheduledStart} IS NULL OR ${table.scheduledEnd} IS NULL OR ${table.scheduledEnd} > ${table.scheduledStart}`),
    check("field_visits_status_check", sql`${table.status} IN ('PLANNED','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED')`),
  ],
);

export const jobAssignments = pgTable(
  "job_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitId: uuid("visit_id")
      .notNull()
      .references(() => fieldVisits.id, { onDelete: "cascade", onUpdate: "cascade" }),
    taskId: uuid("task_id").references(() => installationTasks.id, { onDelete: "set null", onUpdate: "cascade" }),
    assigneeUserId: text("assignee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
    role: text("role").default("TECHNICIAN").notNull(),
    status: text("status").default("ASSIGNED").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    source: text("source").default("OPS_V2").notNull(),
    supersededById: uuid("superseded_by_id").references((): AnyPgColumn => jobAssignments.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    index("job_assignments_visit_status_idx").on(table.visitId, table.status),
    index("job_assignments_assignee_status_idx").on(table.assigneeUserId, table.status),
    index("job_assignments_task_idx").on(table.taskId),
    check("job_assignments_status_check", sql`${table.status} IN ('ASSIGNED','ACCEPTED','IN_PROGRESS','COMPLETED','CANCELLED','SUPERSEDED')`),
  ],
);

export const materialRequirements = pgTable(
  "material_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => installationWorkflowProjects.id, { onDelete: "cascade", onUpdate: "cascade" }),
    taskId: uuid("task_id").references(() => installationTasks.id, { onDelete: "set null", onUpdate: "cascade" }),
    catalogProductId: text("catalog_product_id"),
    productName: text("product_name").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unit: text("unit").default("unit").notNull(),
    status: text("status").default("ESTIMATED").notNull(),
    serialRequired: boolean("serial_required").default(false).notNull(),
    source: text("source").default("CONFIGURATION").notNull(),
    notes: text("notes"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    index("material_requirements_project_status_idx").on(table.projectId, table.status),
    index("material_requirements_catalog_product_idx").on(table.catalogProductId),
    check("material_requirements_quantity_check", sql`${table.quantity} > 0`),
    check("material_requirements_status_check", sql`${table.status} IN ('ESTIMATED','REQUIRED','RESERVED','PICKED','ISSUED','SHORT','CANCELLED')`),
  ],
);

export const installationAuditEvents = pgTable("installation_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposalId: text("proposal_id").notNull().references(() => proposals.id, { onDelete: "restrict", onUpdate: "cascade" }),
  taskId: uuid("task_id").references(() => installationTasks.id, { onDelete: "set null", onUpdate: "cascade" }),
  checklistItemId: uuid("checklist_item_id").references(() => installationChecklistItems.id, { onDelete: "set null", onUpdate: "cascade" }),
  eventType: text("event_type").notNull(),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(),
  payload: jsonb("payload").default(emptyJson).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("installation_audit_idempotency_key").on(table.idempotencyKey),
  index("installation_audit_proposal_idx").on(table.proposalId, table.occurredAt),
]);

export const installedAssets = pgTable(
  "installed_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    productName: text("product_name").notNull(),
    serialNumber: text("serial_number").notNull(),
    serialNumberNormalized: text("serial_number_normalized"),
    projectId: uuid("project_id").references(() => installationWorkflowProjects.id, { onDelete: "set null", onUpdate: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null", onUpdate: "cascade" }),
    catalogProductId: text("catalog_product_id"),
    status: text("status").default("REGISTERED").notNull(),
    source: text("source").default("LEGACY").notNull(),
    erpnextSerialId: text("erpnext_serial_id"),
    installedDate: timestamp("installed_date", { mode: "date", precision: 3 }).notNull(),
    warrantyExpiryDate: timestamp("warranty_expiry_date", { mode: "date", precision: 3 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", precision: 3 }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("installed_assets_serial_number_key").on(table.serialNumber),
    index("installed_assets_proposal_id_idx").on(table.proposalId),
    index("installed_assets_customer_id_idx").on(table.customerId),
    index("installed_assets_project_id_idx").on(table.projectId),
    index("installed_assets_site_id_idx").on(table.siteId),
    index("installed_assets_serial_normalized_idx").on(table.serialNumberNormalized),
    index("installed_assets_erpnext_serial_idx").on(table.erpnextSerialId),
    index("installed_assets_warranty_expiry_date_idx").on(table.warrantyExpiryDate),
    check("installed_assets_status_check", sql`${table.status} IN ('REGISTERED','ACTIVE','REPLACED','REMOVED','UNKNOWN')`),
  ],
);

export const productWarranties = pgTable(
  "product_warranties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => installedAssets.id, { onDelete: "cascade", onUpdate: "cascade" }),
    provider: text("provider").notNull(),
    productName: text("product_name").notNull(),
    serialNumber: text("serial_number"),
    status: text("status").default("PENDING").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    terms: jsonb("terms").default(emptyJson).notNull(),
    erpnextReference: text("erpnext_reference"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("product_warranties_asset_provider_key").on(table.assetId, table.provider),
    index("product_warranties_status_idx").on(table.status),
    index("product_warranties_erpnext_reference_idx").on(table.erpnextReference),
    check("product_warranties_status_check", sql`${table.status} IN ('PENDING','ACTIVE','EXPIRED','VOID','CLAIMED')`),
    check("product_warranties_date_order_check", sql`${table.startsAt} IS NULL OR ${table.endsAt} IS NULL OR ${table.endsAt} >= ${table.startsAt}`),
  ],
);

export const installationWarranties = pgTable(
  "installation_warranties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => installationWorkflowProjects.id, { onDelete: "cascade", onUpdate: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null", onUpdate: "cascade" }),
    status: text("status").default("PENDING_ACTIVATION").notNull(),
    policyVersion: text("policy_version").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    durationMonths: integer("duration_months"),
    activatedByUserId: text("activated_by_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    sourceHandoverId: text("source_handover_id"),
    details: jsonb("details").default(emptyJson).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("installation_warranties_project_key").on(table.projectId),
    index("installation_warranties_customer_status_idx").on(table.customerId, table.status),
    check("installation_warranties_status_check", sql`${table.status} IN ('PENDING_ACTIVATION','ACTIVE','SUSPENDED','EXPIRED','VOID')`),
    check("installation_warranties_duration_check", sql`${table.durationMonths} IS NULL OR ${table.durationMonths} > 0`),
    check("installation_warranties_date_order_check", sql`${table.startsAt} IS NULL OR ${table.endsAt} IS NULL OR ${table.endsAt} >= ${table.startsAt}`),
  ],
);

export const quotationDocumentRequests = pgTable("quotation_document_requests", {
  id: text("id").default(idDefault).primaryKey(),
  quotationId: text("quotation_id")
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
  documentName: text("document_name").notNull(),
  descriptionHint: text("description_hint"),
  requestType: text("request_type").default("FILE").notNull(),
  isRequired: boolean("is_required").default(true).notNull(),
  status: quotationDocumentRequestStatusEnum("status").default("PENDING").notNull(),
  fileUrl: text("file_url"),
  storageProvider: text("storage_provider"),
  storageFileId: text("storage_file_id"),
  fallbackUrl: text("fallback_url"),
  metadata: jsonb("metadata").default(emptyJson).notNull(),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
}, (table) => [
  index("quotation_document_requests_quotation_id_idx").on(table.quotationId),
  index("quotation_document_requests_status_idx").on(table.status),
]);

export const quotationDocumentRequestAttachments = pgTable("quotation_document_request_attachments", {
  id: text("id").default(idDefault).primaryKey(),
  documentRequestId: text("document_request_id")
    .notNull()
    .references(() => quotationDocumentRequests.id, { onDelete: "cascade", onUpdate: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  storageProvider: text("storage_provider").notNull(),
  storageFileId: text("storage_file_id"),
  fallbackUrl: text("fallback_url"),
  metadata: jsonb("metadata").default(emptyJson).notNull(),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
}, (table) => [
  index("quotation_document_request_attachments_request_id_idx").on(table.documentRequestId),
]);

export const quotationDeliveryDocuments = pgTable("quotation_delivery_documents", {
  id: text("id").default(idDefault).primaryKey(),
  quotationId: text("quotation_id")
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
  deliveryType: text("delivery_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  fileUrl: text("file_url"),
  storageProvider: text("storage_provider"),
  storageFileId: text("storage_file_id"),
  fallbackUrl: text("fallback_url"),
  status: text("status").default("PENDING").notNull(),
  metadata: jsonb("metadata").default(emptyJson).notNull(),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
}, (table) => [
  index("quotation_delivery_documents_quotation_id_idx").on(table.quotationId),
  index("quotation_delivery_documents_delivery_type_idx").on(table.deliveryType),
  uniqueIndex("quotation_delivery_documents_quotation_type_key").on(table.quotationId, table.deliveryType),
]);

export const quotationDeliveryDocumentAttachments = pgTable("quotation_delivery_document_attachments", {
  id: text("id").default(idDefault).primaryKey(),
  deliveryDocumentId: text("delivery_document_id")
    .notNull()
    .references(() => quotationDeliveryDocuments.id, { onDelete: "cascade", onUpdate: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  storageProvider: text("storage_provider").notNull(),
  storageFileId: text("storage_file_id"),
  fallbackUrl: text("fallback_url"),
  metadata: jsonb("metadata").default(emptyJson).notNull(),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
}, (table) => [
  index("quotation_delivery_document_attachments_document_id_idx").on(table.deliveryDocumentId),
]);

export type LocalizedServiceText = { en: string; th: string } & Partial<Record<Locale, string>>;

export const serviceOfferings = pgTable("service_offerings", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  code: text("code").notNull(),
  name: jsonb("name").$type<LocalizedServiceText>().notNull(),
  description: jsonb("description").$type<LocalizedServiceText>().notNull(),
  externalPrice: numeric("external_price", { precision: 12, scale: 2 }).notNull(),
  solarDreamCustomerPrice: numeric("solardream_customer_price", { precision: 12, scale: 2 }).notNull(),
  pricingModel: text("pricing_model").default("BASE_PLUS_KWP").notNull(),
  basePrice: numeric("base_price", { precision: 12, scale: 2 }).default("0").notNull(),
  ratePerKwp: numeric("rate_per_kwp", { precision: 12, scale: 2 }).default("0").notNull(),
  minimumPrice: numeric("minimum_price", { precision: 12, scale: 2 }).default("0").notNull(),
  loyaltyDiscount: numeric("loyalty_discount", { precision: 12, scale: 2 }).default("0").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  erpItemCode: text("erp_item_code"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("service_offerings_slug_key").on(table.slug),
  uniqueIndex("service_offerings_code_key").on(table.code),
  check("service_offerings_prices_check", sql`${table.externalPrice} >= 0 AND ${table.solarDreamCustomerPrice} >= 0`),
  check("service_offerings_duration_check", sql`${table.durationMinutes} > 0`),
]);

export const serviceSystemOptions = pgTable("service_system_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  code: text("code").notNull(),
  label: jsonb("label").$type<LocalizedServiceText>().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  metadata: jsonb("metadata").default(emptyJson).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [uniqueIndex("service_system_options_kind_code_key").on(table.kind, table.code), index("service_system_options_active_kind_idx").on(table.isActive, table.kind), check("service_system_options_kind_check", sql`${table.kind} IN ('INVERTER_BRAND','ROOF_TYPE')`)]);

export const serviceBundles = pgTable("service_bundles", {
  id: uuid("id").primaryKey().defaultRandom(), code: text("code").notNull(), name: jsonb("name").$type<LocalizedServiceText>().notNull(),
  discountBps: integer("discount_bps").notNull(), minimumDistinctItems: integer("minimum_distinct_items").default(2).notNull(),
  isActive: boolean("is_active").default(true).notNull(), startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }), endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [uniqueIndex("service_bundles_code_key").on(table.code), check("service_bundles_discount_check", sql`${table.discountBps} BETWEEN 0 AND 10000 AND ${table.minimumDistinctItems} >= 2`)]);

export const serviceBundleItems = pgTable("service_bundle_items", {
  bundleId: uuid("bundle_id").notNull().references(() => serviceBundles.id, { onDelete: "cascade" }), offeringId: uuid("offering_id").notNull().references(() => serviceOfferings.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.bundleId, table.offeringId] })]);

export const servicePromotions = pgTable("service_promotions", {
  id: uuid("id").primaryKey().defaultRandom(), codeDigest: text("code_digest").notNull(), name: jsonb("name").$type<LocalizedServiceText>().notNull(), discountType: text("discount_type").notNull(),
  value: integer("value").notNull(), minimumSubtotalSatang: integer("minimum_subtotal_satang").default(0).notNull(), maximumDiscountSatang: integer("maximum_discount_satang"),
  usageLimit: integer("usage_limit"), perActorLimit: integer("per_actor_limit").default(1).notNull(), redemptionCount: integer("redemption_count").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(), startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }), endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [uniqueIndex("service_promotions_code_digest_key").on(table.codeDigest), check("service_promotions_type_check", sql`${table.discountType} IN ('PERCENT_BPS','FIXED_SATANG')`), check("service_promotions_value_check", sql`${table.value} > 0 AND (${table.discountType} <> 'PERCENT_BPS' OR ${table.value} <= 10000) AND ${table.minimumSubtotalSatang} >= 0 AND (${table.maximumDiscountSatang} IS NULL OR ${table.maximumDiscountSatang} >= 0)`)]);

export const servicePromotionEligibility = pgTable("service_promotion_eligibility", {
  id: uuid("id").primaryKey().defaultRandom(), promotionId: uuid("promotion_id").notNull().references(() => servicePromotions.id, { onDelete: "cascade" }),
  offeringId: uuid("offering_id").references(() => serviceOfferings.id, { onDelete: "cascade" }), systemSource: text("system_source"), minimumSystemKw: numeric("minimum_system_kw", { precision: 10, scale: 3 }), maximumSystemKw: numeric("maximum_system_kw", { precision: 10, scale: 3 }),
}, (table) => [index("service_promotion_eligibility_promotion_idx").on(table.promotionId)]);

export const serviceQuoteSessions = pgTable("service_quote_sessions", {
  id: uuid("id").primaryKey().defaultRandom(), referenceDigest: text("reference_digest").notNull(), actorHash: text("actor_hash").notNull(), inputSnapshot: jsonb("input_snapshot").notNull(), pricingSnapshot: jsonb("pricing_snapshot").notNull(),
  subtotalSatang: integer("subtotal_satang").notNull(), discountSatang: integer("discount_satang").notNull(), totalSatang: integer("total_satang").notNull(),
  checkoutDisposition: text("checkout_disposition").notNull(), pricingStatus: text("pricing_status").notNull(), status: text("status").default("ACTIVE").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(), consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }), createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [uniqueIndex("service_quote_sessions_reference_key").on(table.referenceDigest), index("service_quote_sessions_actor_expiry_idx").on(table.actorHash, table.expiresAt), check("service_quote_sessions_amount_check", sql`${table.subtotalSatang} >= 0 AND ${table.discountSatang} >= 0 AND ${table.totalSatang} = ${table.subtotalSatang} - ${table.discountSatang}`), check("service_quote_sessions_disposition_check", sql`${table.checkoutDisposition} IN ('PAY_NOW','CUSTOM_QUOTE') AND ${table.pricingStatus} IN ('FINAL','CUSTOM_REQUIRED')`)]);

export const serviceOrders = pgTable("service_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: uuid("idempotency_key").notNull(),
  customerUserId: text("customer_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  actorHash: text("actor_hash").notNull(),
  guestSessionHash: text("guest_session_hash"),
  trackingId: uuid("tracking_id").defaultRandom().notNull(),
  trackingRef: text("tracking_ref"),
  trackingTokenHash: text("tracking_token_hash").notNull(),
  trackingExpiresAt: timestamp("tracking_expires_at", { withTimezone: true, mode: "date" }).notNull(),
  guestExpiresAt: timestamp("guest_expires_at", { withTimezone: true, mode: "date" }),
  erpPayload: jsonb("erp_payload").default(emptyJson).notNull(),
  paymentStatus: text("payment_status").default("UNPAID").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
  erpCustomerId: text("erp_customer_id"),
  erpSalesInvoiceId: text("erp_sales_invoice_id"),
  erpSlipFileId: text("erp_slip_file_id"),
  erpPaymentEntryId: text("erp_payment_entry_id"),
  erpPaymentSyncStatus: text("erp_payment_sync_status").default("PENDING").notNull(),
  erpPaymentSyncError: text("erp_payment_sync_error"),
  contactEmailDigest: text("contact_email_digest"),
  serviceAddress: text("service_address"),
  necessaryConsentAt: timestamp("necessary_consent_at", { withTimezone: true, mode: "date" }),
  necessaryConsentVersion: text("necessary_consent_version"),
  portalLocale: text("portal_locale").default("th").notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
  portalClosedAt: timestamp("portal_closed_at", { withTimezone: true, mode: "date" }),
  quoteSessionId: uuid("quote_session_id").references(() => serviceQuoteSessions.id, { onDelete: "restrict" }),
  checkoutDisposition: text("checkout_disposition").default("PAY_NOW").notNull(), paymentRequirement: text("payment_requirement").default("REQUIRED").notNull(),
  subtotalSatang: integer("subtotal_satang"), discountSatang: integer("discount_satang"), totalSatang: integer("total_satang"),
  latitude: numeric("latitude", { precision: 9, scale: 6 }), longitude: numeric("longitude", { precision: 9, scale: 6 }), locationSnapshot: jsonb("location_snapshot").default(emptyJson).notNull(),
  serviceOfferingId: uuid("service_offering_id").notNull().references(() => serviceOfferings.id, { onDelete: "restrict", onUpdate: "cascade" }),
  assetId: uuid("asset_id").references(() => installedAssets.id, { onDelete: "set null", onUpdate: "cascade" }),
  systemSource: text("system_source").notNull(),
  status: text("status").default("PENDING").notNull(),
  priceSnapshot: numeric("price_snapshot", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").default("THB").notNull(),
  offeringSnapshot: jsonb("offering_snapshot").notNull(),
  systemSnapshot: jsonb("system_snapshot").notNull(),
  contactSnapshot: jsonb("contact_snapshot").notNull(),
  appointmentDate: timestamp("appointment_date", { withTimezone: true, mode: "date" }).notNull(),
  customerNotes: text("customer_notes"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("service_orders_actor_idempotency_key").on(table.actorHash, table.idempotencyKey),
  uniqueIndex("service_orders_tracking_id_key").on(table.trackingId),
  uniqueIndex("service_orders_tracking_ref_key").on(table.trackingRef),
  index("service_orders_customer_created_idx").on(table.customerUserId, table.createdAt),
  index("service_orders_status_idx").on(table.status),
  index("service_orders_offering_idx").on(table.serviceOfferingId),
  check("service_orders_source_check", sql`${table.systemSource} IN ('SOLARDREAM', 'EXTERNAL')`),
  check("service_orders_actor_identity_check", sql`(${table.customerUserId} IS NOT NULL AND ${table.guestSessionHash} IS NULL) OR (${table.customerUserId} IS NULL AND ${table.guestSessionHash} IS NOT NULL)`),
  check("service_orders_price_check", sql`${table.priceSnapshot} >= 0`),
  check("service_orders_payment_status_check", sql`${table.paymentStatus} IN ('UNPAID','VERIFIED','PAID')`),
  check("service_orders_erp_payment_status_check", sql`${table.erpPaymentSyncStatus} IN ('PENDING','PROCESSING','RETRY','SYNCED','FAILED')`),
  check("service_orders_checkout_disposition_check", sql`${table.checkoutDisposition} IN ('PAY_NOW','CUSTOM_QUOTE') AND ${table.paymentRequirement} IN ('REQUIRED','NOT_REQUIRED')`),
  check("service_orders_satang_check", sql`(${table.totalSatang} IS NULL AND ${table.subtotalSatang} IS NULL AND ${table.discountSatang} IS NULL) OR (${table.subtotalSatang} >= 0 AND ${table.discountSatang} >= 0 AND ${table.totalSatang} = ${table.subtotalSatang} - ${table.discountSatang})`),
]);

export const serviceOrderItems = pgTable("service_order_items", {
  id: uuid("id").primaryKey().defaultRandom(), serviceOrderId: uuid("service_order_id").notNull().references(() => serviceOrders.id, { onDelete: "cascade" }), serviceOfferingId: uuid("service_offering_id").notNull().references(() => serviceOfferings.id, { onDelete: "restrict" }),
  quantity: integer("quantity").default(1).notNull(), unitPriceSatang: integer("unit_price_satang").notNull(), subtotalSatang: integer("subtotal_satang").notNull(), discountSatang: integer("discount_satang").default(0).notNull(), totalSatang: integer("total_satang").notNull(), offeringSnapshot: jsonb("offering_snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [uniqueIndex("service_order_items_order_offering_key").on(table.serviceOrderId, table.serviceOfferingId), check("service_order_items_amount_check", sql`${table.quantity} > 0 AND ${table.unitPriceSatang} >= 0 AND ${table.subtotalSatang} = ${table.quantity} * ${table.unitPriceSatang} AND ${table.totalSatang} = ${table.subtotalSatang} - ${table.discountSatang} AND ${table.discountSatang} >= 0`)]);

export const serviceOrderAdjustments = pgTable("service_order_adjustments", {
  id: uuid("id").primaryKey().defaultRandom(), serviceOrderId: uuid("service_order_id").notNull().references(() => serviceOrders.id, { onDelete: "cascade" }), kind: text("kind").notNull(), label: text("label").notNull(), amountSatang: integer("amount_satang").notNull(), bundleId: uuid("bundle_id").references(() => serviceBundles.id, { onDelete: "set null" }), promotionId: uuid("promotion_id").references(() => servicePromotions.id, { onDelete: "set null" }), createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [index("service_order_adjustments_order_idx").on(table.serviceOrderId), check("service_order_adjustments_kind_check", sql`${table.kind} IN ('BUNDLE','PROMOTION','MANUAL')`), check("service_order_adjustments_amount_check", sql`${table.amountSatang} <= 0`)]);

export const servicePromotionRedemptions = pgTable("service_promotion_redemptions", {
  id: uuid("id").primaryKey().defaultRandom(), promotionId: uuid("promotion_id").notNull().references(() => servicePromotions.id, { onDelete: "restrict" }), serviceOrderId: uuid("service_order_id").notNull().references(() => serviceOrders.id, { onDelete: "restrict" }), actorHash: text("actor_hash").notNull(), discountSatang: integer("discount_satang").notNull(), createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [uniqueIndex("service_promotion_redemptions_order_key").on(table.serviceOrderId, table.promotionId), index("service_promotion_redemptions_actor_idx").on(table.promotionId, table.actorHash)]);

export const servicePortalTokens = pgTable("service_portal_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  serviceOrderId: uuid("service_order_id").notNull().references(() => serviceOrders.id, { onDelete: "cascade", onUpdate: "cascade" }),
  secretDigest: text("secret_digest").notNull(),
  emailDigest: text("email_digest").notNull(),
  status: text("status").default("ACTIVE").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
  rotatedFromId: uuid("rotated_from_id").references((): AnyPgColumn => servicePortalTokens.id, { onDelete: "set null", onUpdate: "cascade" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("service_portal_tokens_order_status_idx").on(table.serviceOrderId, table.status),
  index("service_portal_tokens_expiry_idx").on(table.expiresAt),
  uniqueIndex("service_portal_tokens_secret_digest_key").on(table.secretDigest),
  uniqueIndex("service_portal_tokens_one_active_key").on(table.serviceOrderId).where(sql`${table.status} = 'ACTIVE'`),
  check("service_portal_tokens_status_check", sql`${table.status} IN ('ACTIVE','REVOKED','CLOSED','EXPIRED')`),
]);

export const servicePortalClaimIntents = pgTable("service_portal_claim_intents", {
  id: uuid("id").primaryKey().defaultRandom(),
  serviceOrderId: uuid("service_order_id").notNull().references(() => serviceOrders.id, { onDelete: "cascade", onUpdate: "cascade" }),
  tokenId: uuid("token_id").notNull().references(() => servicePortalTokens.id, { onDelete: "cascade", onUpdate: "cascade" }),
  claimDigest: text("claim_digest").notNull(),
  emailDigest: text("email_digest").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("service_portal_claim_intents_digest_key").on(table.claimDigest),
  uniqueIndex("service_portal_claim_intents_one_active_key").on(table.serviceOrderId).where(sql`${table.consumedAt} IS NULL`),
  index("service_portal_claim_intents_expiry_idx").on(table.expiresAt),
]);

export const servicePortalEmailDeliveries = pgTable("service_portal_email_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenId: uuid("token_id").notNull().references(() => servicePortalTokens.id, { onDelete: "cascade", onUpdate: "cascade" }),
  encryptedCapability: text("encrypted_capability"),
  purpose: text("purpose").default("INITIAL").notNull(),
  locale: text("locale").default("th").notNull(),
  status: text("status").default("PENDING").notNull(),
  listmonkDeliveryRef: text("listmonk_delivery_ref"),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("service_portal_email_deliveries_token_idx").on(table.tokenId),
  check("service_portal_email_status_check", sql`${table.status} IN ('PENDING','SENT')`),
  check("service_portal_email_purpose_check", sql`${table.purpose} IN ('INITIAL','RECOVERY')`),
  check("service_portal_email_locale_check", sql`${table.locale} IN ('en','th')`),
]);

export const servicePortalAuditEvents = pgTable("service_portal_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  serviceOrderId: uuid("service_order_id").notNull().references(() => serviceOrders.id, { onDelete: "cascade", onUpdate: "cascade" }),
  tokenId: uuid("token_id").references(() => servicePortalTokens.id, { onDelete: "set null", onUpdate: "cascade" }),
  eventType: text("event_type").notNull(),
  actorHash: text("actor_hash"),
  metadata: jsonb("metadata").default(emptyJson).notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [index("service_portal_audit_order_created_idx").on(table.serviceOrderId, table.createdAt), uniqueIndex("service_portal_audit_dedupe_key").on(table.dedupeKey)]);

export const paymentSlipRegistry = pgTable("payment_slip_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  transRef: text("trans_ref").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("payment_slip_registry_trans_ref_key").on(table.transRef),
  uniqueIndex("payment_slip_registry_source_key").on(table.sourceType, table.sourceId),
  check("payment_slip_registry_source_check", sql`${table.sourceType} IN ('PROPOSAL','SERVICE_ORDER')`),
]);

export const serviceOrderPayments = pgTable("service_order_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  serviceOrderId: uuid("service_order_id").notNull().references(() => serviceOrders.id, { onDelete: "restrict", onUpdate: "cascade" }),
  idempotencyKey: uuid("idempotency_key").notNull(),
  status: text("status").default("UPLOADED").notNull(),
  amountSnapshot: numeric("amount_snapshot", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").default("THB").notNull(),
  transRef: text("trans_ref"),
  receiverAccount: text("receiver_account"),
  receiverName: text("receiver_name"),
  storageProvider: text("storage_provider").notNull(),
  storageFileId: text("storage_file_id").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  easySlipData: jsonb("easyslip_data").default(emptyJson).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  erpSalesInvoiceId: text("erp_sales_invoice_id"),
  erpSlipFileId: text("erp_slip_file_id"),
  erpPaymentEntryId: text("erp_payment_entry_id"),
  erpSyncStatus: text("erp_sync_status").default("PENDING").notNull(),
  erpSyncError: text("erp_sync_error"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("service_order_payments_order_key").on(table.serviceOrderId),
  uniqueIndex("service_order_payments_trans_ref_key").on(table.transRef),
  uniqueIndex("service_order_payments_idempotency_key").on(table.serviceOrderId, table.idempotencyKey),
  index("service_order_payments_erp_status_idx").on(table.erpSyncStatus),
  check("service_order_payments_status_check", sql`${table.status} IN ('UPLOADED','VERIFYING','VERIFIED','REJECTED')`),
  check("service_order_payments_erp_status_check", sql`${table.erpSyncStatus} IN ('PENDING','PROCESSING','RETRY','SYNCED','BLOCKED')`),
  check("service_order_payments_currency_check", sql`${table.currency} = 'THB'`),
]);

export const serviceRequests = pgTable(
  "service_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id").references(() => installedAssets.id, { onDelete: "set null" }),
    customerUserId: text("customer_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    serviceOrderId: uuid("service_order_id").references(() => serviceOrders.id, { onDelete: "set null", onUpdate: "cascade" }),
    serviceOrderItemId: uuid("service_order_item_id").references(() => serviceOrderItems.id, { onDelete: "set null", onUpdate: "cascade" }),
    serviceOfferingId: uuid("service_offering_id").references(() => serviceOfferings.id, { onDelete: "set null", onUpdate: "cascade" }),
    systemSource: text("system_source").default("SOLARDREAM").notNull(),
    externalSystemDetails: jsonb("external_system_details").default(emptyJson).notNull(),
    type: serviceRequestTypeEnum("type").notNull(),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    status: serviceRequestStatusEnum("status").default("Open").notNull(),
    images: text("images").array().default(emptyTextArray).notNull(),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    appointmentDate: timestamp("appointment_date", { mode: "date", precision: 3 }),
    erpnextIssueId: text("erpnext_issue_id"),
    erpnextSyncStatus: text("erpnext_sync_status").default("PENDING").notNull(),
    erpnextSyncError: text("erpnext_sync_error"),
    erpnextLastSyncedAt: timestamp("erpnext_last_synced_at", {
      mode: "date",
      precision: 3,
    }),
    createdAt: timestamp("created_at", { mode: "date", precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", precision: 3 }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("service_requests_erpnext_issue_id_key").on(table.erpnextIssueId),
    index("service_requests_asset_id_idx").on(table.assetId),
    index("service_requests_customer_user_id_idx").on(table.customerUserId),
    index("service_requests_service_order_id_idx").on(table.serviceOrderId),
    uniqueIndex("service_requests_service_order_item_id_key").on(table.serviceOrderItemId),
    index("service_requests_status_idx").on(table.status),
    index("service_requests_erpnext_sync_status_idx").on(table.erpnextSyncStatus),
  ],
);

export const serviceCases = pgTable(
  "service_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseNumber: text("case_number").notNull(),
    customerUserId: text("customer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null", onUpdate: "cascade" }),
    projectId: uuid("project_id").references(() => installationWorkflowProjects.id, { onDelete: "set null", onUpdate: "cascade" }),
    assetId: uuid("asset_id").references(() => installedAssets.id, { onDelete: "set null", onUpdate: "cascade" }),
    productWarrantyId: uuid("product_warranty_id").references(() => productWarranties.id, { onDelete: "set null", onUpdate: "cascade" }),
    installationWarrantyId: uuid("installation_warranty_id").references(() => installationWarranties.id, { onDelete: "set null", onUpdate: "cascade" }),
    type: text("type").default("REPAIR").notNull(),
    priority: text("priority").default("NORMAL").notNull(),
    channel: text("channel").default("PORTAL").notNull(),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    status: text("status").default("NEW").notNull(),
    assignedUserId: text("assigned_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    warrantyDecision: text("warranty_decision"),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true, mode: "date" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
    externalReference: text("external_reference"),
    metadata: jsonb("metadata").default(emptyJson).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("service_cases_case_number_key").on(table.caseNumber),
    index("service_cases_customer_status_idx").on(table.customerUserId, table.status),
    index("service_cases_project_status_idx").on(table.projectId, table.status),
    index("service_cases_asset_idx").on(table.assetId),
    index("service_cases_assignee_status_idx").on(table.assignedUserId, table.status),
    check("service_cases_status_check", sql`${table.status} IN ('NEW','TRIAGED','SCHEDULED','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED','CANCELLED')`),
    check("service_cases_priority_check", sql`${table.priority} IN ('LOW','NORMAL','HIGH','URGENT')`),
  ],
);

export const serviceVisits = pgTable(
  "service_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => serviceCases.id, { onDelete: "cascade", onUpdate: "cascade" }),
    fieldVisitId: uuid("field_visit_id").references(() => fieldVisits.id, { onDelete: "set null", onUpdate: "cascade" }),
    assignedUserId: text("assigned_user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    status: text("status").default("PLANNED").notNull(),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true, mode: "date" }),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true, mode: "date" }),
    outcome: text("outcome"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    index("service_visits_case_status_idx").on(table.caseId, table.status),
    index("service_visits_schedule_idx").on(table.scheduledStart, table.status),
    index("service_visits_assignee_idx").on(table.assignedUserId, table.status),
    check("service_visits_status_check", sql`${table.status} IN ('PLANNED','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED')`),
    check("service_visits_schedule_order_check", sql`${table.scheduledStart} IS NULL OR ${table.scheduledEnd} IS NULL OR ${table.scheduledEnd} > ${table.scheduledStart}`),
  ],
);

export const returnRefunds = pgTable(
  "return_refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
    reason: text("reason").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    status: returnRefundStatusEnum("status").default("REQUESTED").notNull(),
    bankAccountDetails: jsonb("bank_account_details"),
    createdAt: timestamp("created_at", { mode: "date", precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", precision: 3 }).defaultNow().notNull().$onUpdate(() => new Date()),
    pickupDate: timestamp("pickup_date", { mode: "date", precision: 3 }),
    inspectionDate: timestamp("inspection_date", { mode: "date", precision: 3 }),
    refundedAt: timestamp("refunded_at", { mode: "date", precision: 3 }),
    refundSlipUrl: text("refund_slip_url"),
    creditNoteUrl: text("credit_note_url"),
  },
  (table) => [
    index("return_refunds_proposal_id_idx").on(table.proposalId),
    index("return_refunds_status_idx").on(table.status),
  ],
);

export const inventoryHolds = pgTable(
  "inventory_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id")
      .notNull()
      .references(() => proposals.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inventoryId: uuid("inventory_id")
      .notNull()
      .references(() => productInventory.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    quantity: integer("quantity").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", precision: 3 }).notNull(),
    createdAt: createdAt("created_at"),
  },
  (table) => [
    uniqueIndex("inventory_holds_order_inventory_key").on(
      table.orderId,
      table.inventoryId,
    ),
    index("inventory_holds_expiry_idx").on(table.expiresAt),
    check("inventory_holds_quantity_check", sql`${table.quantity} > 0`),
  ],
);

export const verifiedSlips = pgTable(
  "verified_slips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    transRef: text("trans_ref").notNull().unique("verified_slips_trans_ref_key"),
    receiverAccount: text("receiver_account").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    slipImageUrl: text("slip_image_url").notNull(),
    rawData: jsonb("raw_data").notNull(),
    verifiedAt: timestamp("verified_at", { mode: "date", precision: 3 }).defaultNow().notNull(),
  },
  (table) => [
    index("verified_slips_order_id_idx").on(table.orderId),
    index("verified_slips_customer_id_idx").on(table.customerId),
    index("verified_slips_verified_at_idx").on(table.verifiedAt),
  ],
);

export const paymentMilestones = pgTable(
  "payment_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
    milestoneOrder: integer("milestone_order").notNull(),
    milestoneName: text("milestone_name").notNull(),
    percentage: numeric("percentage", { precision: 5, scale: 2 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    status: milestoneStatusEnum("status").default("PENDING").notNull(),
    dueDate: timestamp("due_date", { mode: "date", precision: 3 }),
    paidAt: timestamp("paid_at", { mode: "date", precision: 3 }),
    verifiedSlipId: uuid("verified_slip_id")
      .unique("payment_milestones_verified_slip_id_key")
      .references(() => verifiedSlips.id, { onDelete: "set null", onUpdate: "cascade" }),
  },
  (table) => [
    uniqueIndex("payment_milestones_order_sequence_key").on(
      table.orderId,
      table.milestoneOrder,
    ),
    index("payment_milestones_order_status_idx").on(table.orderId, table.status),
    index("payment_milestones_due_date_idx").on(table.dueDate),
    check(
      "payment_milestones_percentage_check",
      sql`${table.percentage} > 0 AND ${table.percentage} <= 100`,
    ),
    check("payment_milestones_amount_check", sql`${table.amount} >= 0`),
  ],
);

export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    milestoneIndex: integer("milestone_index"),
    qrString: text("qr_string").notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      precision: 3,
    }).notNull(),
    status: paymentTransactionStatusEnum("status")
      .default("PENDING")
      .notNull(),
    slipGoogleDriveId: text("slip_google_drive_id"),
    easyslipData: jsonb("easyslip_data"),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    index("payment_transactions_proposal_status_idx").on(
      table.proposalId,
      table.status,
    ),
    index("payment_transactions_expiry_idx").on(
      table.status,
      table.expiresAt,
    ),
    index("payment_transactions_proposal_milestone_idx").on(
      table.proposalId,
      table.milestoneIndex,
    ),
    check("payment_transactions_amount_check", sql`${table.amount} > 0`),
    check(
      "payment_transactions_milestone_index_check",
      sql`${table.milestoneIndex} IS NULL OR ${table.milestoneIndex} > 0`,
    ),
  ],
);

export const paymentRequests = pgTable(
  "payment_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    title: text("title").notNull(),
    amountRequested: numeric("amount_requested", {
      precision: 12,
      scale: 2,
    }).notNull(),
    paymentType: text("payment_type").default("INSTALLMENT").notNull(),
    paymentMethod: text("payment_method").default("QR").notNull(),
    status: paymentRequestStatusEnum("status").default("PENDING").notNull(),
    slipUrl: text("slip_url"),
    slipImageUrl: text("slip_image_url"),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    storageProvider: text("storage_provider"),
    storageFileId: text("storage_file_id"),
    fallbackUrl: text("fallback_url"),
    easySlipData: jsonb("easy_slip_data"),
  },
  (table) => [
    index("payment_requests_proposal_id_idx").on(table.proposalId),
    index("payment_requests_proposal_status_idx").on(
      table.proposalId,
      table.status,
    ),
    check(
      "payment_requests_amount_requested_check",
      sql`${table.amountRequested} > 0`,
    ),
  ],
);

export const paymentReminderLogs = pgTable(
  "payment_reminder_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => paymentMilestones.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    channel: notificationChannelEnum("channel").notNull(),
    sentTo: text("sent_to").notNull(),
    reminderType: text("reminder_type").notNull(),
    sentAt: timestamp("sent_at", { mode: "date", precision: 3 }).defaultNow().notNull(),
  },
  (table) => [
    index("payment_reminder_logs_delivery_idx").on(
      table.milestoneId,
      table.channel,
      table.reminderType,
    ),
    index("payment_reminder_logs_milestone_id_idx").on(table.milestoneId),
    index("payment_reminder_logs_sent_at_idx").on(table.sentAt),
  ],
);

export const projectProgressions = pgTable("project_progressions", {
  id: text("id").default(idDefault).primaryKey(),
  proposalId: text("proposal_id")
    .notNull()
    .unique("project_progressions_proposal_id_key")
    .references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
  currentPhase: text("current_phase").default("PHASE_1_DEPOSIT").notNull(),
  completedPhases: text("completed_phases").array().default(emptyTextArray).notNull(),
  updatedAt: updatedAt("updated_at"),
  createdAt: createdAt("created_at"),
});

export const quotationComments = pgTable(
  "quotation_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quotationId: text("quotation_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
    userId: text("user_id").notNull(),
    message: text("message").notNull(),
    isAdminReply: boolean("is_admin_reply").default(false).notNull(),
    createdAt: timestamp("created_at", { mode: "date", precision: 3 }).defaultNow().notNull(),
  },
  (table) => [
    index("quotation_comments_quotation_id_idx").on(table.quotationId),
    index("quotation_comments_user_id_idx").on(table.userId),
    index("quotation_comments_created_at_idx").on(table.createdAt),
  ],
);

export const operationsTickets = pgTable(
  "operations_tickets",
  {
    id: text("id").default(idDefault).primaryKey(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
    ticketNumber: text("ticket_number").notNull().unique("operations_tickets_ticket_number_key"),
    phase: text("phase").notNull(),
    documentCode: integer("document_code").notNull(),
    documentTitle: text("document_title").notNull(),
    status: text("status").default("PENDING").notNull(),
    assignedRole: text("assigned_role").notNull(),
    formData: jsonb("form_data").default(emptyJson).notNull(),
    signatures: jsonb("signatures").default(emptyJson).notNull(),
    generatedDocUrl: text("generated_doc_url"),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    index("operations_tickets_proposal_id_idx").on(table.proposalId),
    index("operations_tickets_ticket_number_idx").on(table.ticketNumber),
    index("operations_tickets_status_idx").on(table.status),
    index("operations_tickets_assigned_role_idx").on(table.assignedRole),
    index("operations_tickets_phase_idx").on(table.phase),
    index("operations_tickets_document_code_idx").on(table.documentCode),
  ],
);

export const userNotifications = pgTable("UserNotification", {
  id: text("id").default(idDefault).primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  featureKey: text("feature_key"),
  title: text("title"),
  link: text("link"),
  message: text("message").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: createdAt(),
});

export const jobTickets = pgTable("JobTicket", {
  id: text("id").default(idDefault).primaryKey(),
  proposalId: text("proposalId")
    .notNull()
    .unique("JobTicket_proposalId_key")
    .references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
  customerPhone: text("customerPhone"),
  customerAddress: text("customerAddress"),
  coordinates: jsonb("coordinates"),
  signedDocumentDriveUrl: text("signedDocumentDriveUrl"),
  status: text("status").default("PENDING").notNull(),
  scheduledDate: timestamp("scheduledDate", { mode: "date", precision: 3 }),
  installerId: text("installerId").references(() => users.id),
  photos: jsonb("photos"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const installationJobTickets = pgTable(
  "job_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quotationId: text("quotation_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade", onUpdate: "cascade" }),
    jobType: jobTypeEnum("job_type").default("INSTALLATION").notNull(),
    status: text("status").default("PENDING_ASSIGNMENT").notNull(),
    assignedTeamId: text("assigned_team_id"),
    installerId: text("installer_id"),
    scheduledDate: timestamp("scheduled_date", { mode: "date", precision: 3 }),
    installationLatitude: numeric("installation_latitude", { precision: 10, scale: 8 }),
    installationLongitude: numeric("installation_longitude", { precision: 11, scale: 8 }),
    installationMapAddress: text("installation_map_address"),
    installationNotes: text("installation_notes"),
    siteSurveyDate: timestamp("site_survey_date", { mode: "date", precision: 3 }),
    siteSurveyNotes: text("site_survey_notes"),
    siteSurveyPhotos: jsonb("site_survey_photos").default(sql`'[]'::jsonb`).notNull(),
    isSiteSurveyCompleted: boolean("is_site_survey_completed").default(false).notNull(),
    isMountingCompleted: boolean("is_mounting_completed").default(false).notNull(),
    isWiringCompleted: boolean("is_wiring_completed").default(false).notNull(),
    isInverterSetupCompleted: boolean("is_inverter_setup_completed").default(false).notNull(),
    isInspectionCompleted: boolean("is_inspection_completed").default(false).notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    uniqueIndex("job_tickets_quotation_id_key").on(table.quotationId),
    index("job_tickets_job_type_idx").on(table.jobType),
    index("job_tickets_status_idx").on(table.status),
    index("job_tickets_assigned_team_id_idx").on(table.assignedTeamId),
    index("job_tickets_installer_id_idx").on(table.installerId),
    index("job_tickets_scheduled_date_idx").on(table.scheduledDate),
  ],
);

export const workflowTemplates = pgTable("workflow_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  translations: jsonb("translations").$type<Record<string, unknown>>().default(emptyJson).notNull(),
  targetJobType: jobTypeEnum("target_job_type").default("INSTALLATION").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("workflow_templates_target_job_type_idx").on(table.targetJobType),
  uniqueIndex("workflow_templates_active_job_type_key")
    .on(table.targetJobType)
    .where(sql`${table.isActive} = true`),
]);

export const workflowStages = pgTable(
  "workflow_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workflowTemplates.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    stageName: text("stage_name").notNull(),
    isMandatory: boolean("is_mandatory").default(true).notNull(),
    formSchema: jsonb("form_schema").default(sql`'[]'::jsonb`).notNull(),
    translations: jsonb("translations").$type<Record<string, unknown>>().default(emptyJson).notNull(),
  },
  (table) => [
    index("workflow_stages_template_id_idx").on(table.templateId),
    index("workflow_stages_template_order_idx").on(table.templateId, table.stepOrder),
  ],
);

export const jobWorkflows = pgTable(
  "job_workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobTicketId: uuid("job_ticket_id")
      .notNull()
      .references(() => installationJobTickets.id, { onDelete: "cascade", onUpdate: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workflowTemplates.id),
    currentStageId: uuid("current_stage_id").references(() => workflowStages.id),
    status: text("status").default("IN_PROGRESS").notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("job_workflows_job_ticket_id_idx").on(table.jobTicketId),
    index("job_workflows_template_id_idx").on(table.templateId),
    index("job_workflows_current_stage_id_idx").on(table.currentStageId),
    index("job_workflows_status_idx").on(table.status),
  ],
);

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobWorkflowId: uuid("job_workflow_id")
      .notNull()
      .references(() => jobWorkflows.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => workflowStages.id),
    submittedBy: text("submitted_by").notNull(),
    formData: jsonb("form_data").notNull(),
    gpsLocation: text("gps_location"),
    reviewStatus: text("review_status").default("PENDING").notNull(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    rejectionReason: text("rejection_reason"),
    isSkipped: boolean("is_skipped").default(false).notNull(),
    skipReason: text("skip_reason"),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  },
  (table) => [
    index("form_submissions_job_workflow_id_idx").on(table.jobWorkflowId),
    index("form_submissions_stage_id_idx").on(table.stageId),
    index("form_submissions_submitted_by_idx").on(table.submittedBy),
    index("form_submissions_review_status_idx").on(table.reviewStatus),
    index("form_submissions_submitted_at_idx").on(table.submittedAt),
    check(
      "form_submissions_skip_reason_check",
      sql`${table.isSkipped} = false OR nullif(btrim(${table.skipReason}), '') IS NOT NULL`,
    ),
  ],
);

export const jobTicketDocuments = pgTable(
  "job_ticket_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobTicketId: uuid("job_ticket_id")
      .notNull()
      .references(() => installationJobTickets.id, { onDelete: "cascade", onUpdate: "cascade" }),
    phase: integer("phase").notNull(),
    department: text("department").notNull(),
    documentGroup: text("document_group").notNull(),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    uploadedBy: text("uploaded_by"),
    uploadedAt: timestamp("uploaded_at", { mode: "date", precision: 3 }).defaultNow().notNull(),
  },
  (table) => [
    index("job_ticket_documents_job_ticket_id_idx").on(table.jobTicketId),
    index("job_ticket_documents_phase_idx").on(table.phase),
    index("job_ticket_documents_department_idx").on(table.department),
    index("job_ticket_documents_document_group_idx").on(table.documentGroup),
    index("job_ticket_documents_uploaded_at_idx").on(table.uploadedAt),
  ],
);

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobTicketId: uuid("job_ticket_id")
    .notNull()
    .references(() => installationJobTickets.id, { onDelete: "cascade", onUpdate: "cascade" }),
  erpnextInvoiceId: text("erpnext_invoice_id").notNull(), // The ID in ERPNext
  status: text("status").notNull(), // 'UNPAID', 'PARTIALLY_PAID', 'PAID'
  amount: numeric("amount").notNull(),
  pdfUrl: text("pdf_url"), // Standard ERPNext PDF print link
  eTaxUrl: text("e_tax_url"), // Placeholder for future Thai RD e-Tax XML/PDF endpoint
  slipUrl: text("slip_url"), // Public URL for payment receipt slip image
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("invoices_job_ticket_id_idx").on(table.jobTicketId),
  index("invoices_erpnext_invoice_id_idx").on(table.erpnextInvoiceId),
  index("invoices_status_idx").on(table.status),
]);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id").notNull(),
    entityType: text("entity_type").notNull(),
    action: text("action").notNull(),
    description: text("description").notNull(),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date", precision: 3 }).defaultNow().notNull(),
  },
  (table) => [
    index("activity_logs_entity_idx").on(table.entityType, table.entityId),
    index("activity_logs_action_idx").on(table.action),
    index("activity_logs_user_id_idx").on(table.userId),
    index("activity_logs_created_at_idx").on(table.createdAt),
  ],
);

export const productBundles = pgTable("product_bundles", {
  id: text("id").default(idDefault).primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("imageUrl"),
  price: doublePrecision("price").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  discountType: text("discountType").default("FIXED").notNull(),
  discountValue: doublePrecision("discountValue").notNull(),
  promoText: text("promoText"),
  labels: text("labels").array().notNull(),
  validFrom: timestamp("validFrom", { mode: "date", precision: 3 }),
  validUntil: timestamp("validUntil", { mode: "date", precision: 3 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const productBundleItems = pgTable(
  "product_bundle_items",
  {
    id: text("id").default(idDefault).primaryKey(),
    bundleId: text("bundle_id")
      .notNull()
      .references(() => productBundles.id, { onDelete: "cascade", onUpdate: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade", onUpdate: "cascade" }),
    quantity: integer("quantity").default(1).notNull(),
  },
  (table) => [
    uniqueIndex("product_bundle_items_bundle_id_product_id_key").on(
      table.bundleId,
      table.productId,
    ),
  ],
);


export const blueprintsRelations = relations(blueprints, ({ many }) => ({
  categories: many(categories),
}));

export const brandsRelations = relations(brands, ({ many }) => ({
  products: many(products),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parentCategory: one(categories, {
    fields: [categories.dependsOnCategoryId],
    references: [categories.id],
    relationName: "CategoryBranches",
  }),
  childCategories: many(categories, { relationName: "CategoryBranches" }),
  blueprint: one(blueprints, {
    fields: [categories.blueprintId],
    references: [blueprints.id],
  }),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "CategoryTree",
  }),
  subCategories: many(categories, { relationName: "CategoryTree" }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  brandEntity: one(brands, {
    fields: [products.brandId],
    references: [brands.id],
  }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  savedConfigurationLinks: many(productToSavedConfig),
  purchasedProducts: many(purchasedProducts),
  bundleItems: many(productBundleItems),
  inventory: one(productInventory),
}));

export const productInventoryRelations = relations(
  productInventory,
  ({ one, many }) => ({
    product: one(products, {
      fields: [productInventory.productId],
      references: [products.id],
    }),
    holds: many(inventoryHolds),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  savedConfigurations: many(savedConfigurations),
  articles: many(articles),
  proposals: many(proposals),
  notifications: many(userNotifications),
  consultationLeads: many(consultationLeads),
  purchasedProducts: many(purchasedProducts),
  assetRegistrations: many(assetRegistrations),
  installedAssets: many(installedAssets),
  revisions: many(proposalRevisions),
}));

export const proposalRevisionsRelations = relations(proposalRevisions, ({ one, many }) => ({
  proposal: one(proposals, { fields: [proposalRevisions.proposalId], references: [proposals.id] }),
  createdBy: one(users, { fields: [proposalRevisions.createdByUserId], references: [users.id] }),
  items: many(proposalRevisionItems),
  signatureEnvelopes: many(signatureEnvelopes),
}));

export const proposalRevisionItemsRelations = relations(proposalRevisionItems, ({ one }) => ({
  revision: one(proposalRevisions, { fields: [proposalRevisionItems.revisionId], references: [proposalRevisions.id] }),
}));

export const signatureEnvelopesRelations = relations(signatureEnvelopes, ({ one }) => ({
  revision: one(proposalRevisions, { fields: [signatureEnvelopes.revisionId], references: [proposalRevisions.id] }),
}));

export const savedConfigurationsRelations = relations(savedConfigurations, ({ one, many }) => ({
  user: one(users, {
    fields: [savedConfigurations.userId],
    references: [users.id],
  }),
  productLinks: many(productToSavedConfig),
  leads: many(leads),
}));

export const productToSavedConfigRelations = relations(productToSavedConfig, ({ one }) => ({
  product: one(products, {
    fields: [productToSavedConfig.productId],
    references: [products.id],
  }),
  savedConfiguration: one(savedConfigurations, {
    fields: [productToSavedConfig.savedConfigurationId],
    references: [savedConfigurations.id],
  }),
}));

export const purchasedProductsRelations = relations(purchasedProducts, ({ one }) => ({
  user: one(users, {
    fields: [purchasedProducts.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [purchasedProducts.productId],
    references: [products.id],
  }),
}));

export const assetRegistrationsRelations = relations(assetRegistrations, ({ one }) => ({
  user: one(users, {
    fields: [assetRegistrations.userId],
    references: [users.id],
  }),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  savedConfiguration: one(savedConfigurations, {
    fields: [leads.savedConfigurationId],
    references: [savedConfigurations.id],
  }),
  proposalDocuments: many(proposalDocuments),
  installationProject: one(installationProjects),
  consultationLeads: many(consultationLeads),
}));

export const consultationLeadsRelations = relations(consultationLeads, ({ one, many }) => ({
  user: one(users, {
    fields: [consultationLeads.userId],
    references: [users.id],
  }),
  legacyLead: one(leads, {
    fields: [consultationLeads.legacyLeadId],
    references: [leads.id],
  }),
  proposals: many(proposals),
}));

export const proposalDocumentsRelations = relations(proposalDocuments, ({ one }) => ({
  lead: one(leads, {
    fields: [proposalDocuments.leadId],
    references: [leads.id],
  }),
}));

export const installationProjectsRelations = relations(installationProjects, ({ one }) => ({
  lead: one(leads, {
    fields: [installationProjects.leadId],
    references: [leads.id],
  }),
}));

export const articlesRelations = relations(articles, ({ one }) => ({
  author: one(users, {
    fields: [articles.authorId],
    references: [users.id],
  }),
}));

export const navigationItemsRelations = relations(navigationItems, ({ one, many }) => ({
  parent: one(navigationItems, {
    fields: [navigationItems.parentId],
    references: [navigationItems.id],
    relationName: "NavigationHierarchy",
  }),
  children: many(navigationItems, { relationName: "NavigationHierarchy" }),
}));

export const wizardsRelations = relations(wizards, ({ many }) => ({
  steps: many(wizardSteps),
  rules: many(wizardRules),
}));

export const wizardStepsRelations = relations(wizardSteps, ({ one, many }) => ({
  wizard: one(wizards, {
    fields: [wizardSteps.wizardId],
    references: [wizards.id],
  }),
  questions: many(wizardQuestions),
}));

export const wizardQuestionsRelations = relations(wizardQuestions, ({ one, many }) => ({
  step: one(wizardSteps, {
    fields: [wizardQuestions.stepId],
    references: [wizardSteps.id],
  }),
  options: many(wizardOptions),
}));

export const wizardOptionsRelations = relations(wizardOptions, ({ one }) => ({
  question: one(wizardQuestions, {
    fields: [wizardOptions.questionId],
    references: [wizardQuestions.id],
  }),
}));

export const wizardRulesRelations = relations(wizardRules, ({ one }) => ({
  wizard: one(wizards, {
    fields: [wizardRules.wizardId],
    references: [wizards.id],
  }),
}));

export const crossSellRules = pgTable(
  "cross_sell_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleName: text("rule_name").notNull(),
    triggerConditions: jsonb("trigger_conditions").notNull(),
    addonTargetType: text("addon_target_type").default("PRODUCT").notNull(),
    addonProductId: text("addon_product_id").notNull(),
    promotionalTag: text("promotional_tag"),
    priority: integer("priority").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("cross_sell_rules_active_priority_idx").on(table.isActive, table.priority),
    index("cross_sell_rules_addon_product_id_idx").on(table.addonProductId),
  ],
);

export const financingOptionsRelations = relations(financingOptions, ({ many }) => ({
  proposals: many(proposals),
}));

export const proposalsRelations = relations(proposals, ({ one, many }) => ({
  user: one(users, {
    fields: [proposals.userId],
    references: [users.id],
  }),
  jobTicket: one(jobTickets),
  installationJobTicket: one(installationJobTickets),
  projectProgression: one(projectProgressions),
  operationsTickets: many(operationsTickets),
  comments: many(quotationComments),
  verifiedSlips: many(verifiedSlips),
  paymentMilestones: many(paymentMilestones),
  paymentTransactions: many(paymentTransactions),
  paymentRequests: many(paymentRequests),
  documentRequests: many(quotationDocumentRequests),
  deliveryDocuments: many(quotationDeliveryDocuments),
  inventoryHolds: many(inventoryHolds),
  installedAssets: many(installedAssets),
  returnRefunds: many(returnRefunds),
  selectedFinancing: one(financingOptions, {
    fields: [proposals.selectedFinancingId],
    references: [financingOptions.id],
  }),
  wizardLead: one(consultationLeads, {
    fields: [proposals.wizardLeadId],
    references: [consultationLeads.id],
  }),
}));

export const quotationDocumentRequestsRelations = relations(quotationDocumentRequests, ({ one, many }) => ({
  quotation: one(proposals, {
    fields: [quotationDocumentRequests.quotationId],
    references: [proposals.id],
  }),
  attachments: many(quotationDocumentRequestAttachments),
}));

export const quotationDocumentRequestAttachmentsRelations = relations(quotationDocumentRequestAttachments, ({ one }) => ({
  documentRequest: one(quotationDocumentRequests, {
    fields: [quotationDocumentRequestAttachments.documentRequestId],
    references: [quotationDocumentRequests.id],
  }),
}));

export const quotationDeliveryDocumentsRelations = relations(quotationDeliveryDocuments, ({ one, many }) => ({
  quotation: one(proposals, {
    fields: [quotationDeliveryDocuments.quotationId],
    references: [proposals.id],
  }),
  attachments: many(quotationDeliveryDocumentAttachments),
}));

export const quotationDeliveryDocumentAttachmentsRelations = relations(quotationDeliveryDocumentAttachments, ({ one }) => ({
  deliveryDocument: one(quotationDeliveryDocuments, {
    fields: [quotationDeliveryDocumentAttachments.deliveryDocumentId],
    references: [quotationDeliveryDocuments.id],
  }),
}));

export const installedAssetsRelations = relations(installedAssets, ({ one, many }) => ({
  proposal: one(proposals, {
    fields: [installedAssets.proposalId],
    references: [proposals.id],
  }),
  customer: one(users, {
    fields: [installedAssets.customerId],
    references: [users.id],
  }),
  serviceRequests: many(serviceRequests),
}));

export const serviceRequestsRelations = relations(serviceRequests, ({ one }) => ({
  asset: one(installedAssets, {
    fields: [serviceRequests.assetId],
    references: [installedAssets.id],
  }),
}));

export const returnRefundsRelations = relations(returnRefunds, ({ one }) => ({
  proposal: one(proposals, {
    fields: [returnRefunds.proposalId],
    references: [proposals.id],
  }),
}));

export const inventoryHoldsRelations = relations(inventoryHolds, ({ one }) => ({
  order: one(proposals, {
    fields: [inventoryHolds.orderId],
    references: [proposals.id],
  }),
  inventory: one(productInventory, {
    fields: [inventoryHolds.inventoryId],
    references: [productInventory.id],
  }),
}));

export const verifiedSlipsRelations = relations(verifiedSlips, ({ one }) => ({
  order: one(proposals, {
    fields: [verifiedSlips.orderId],
    references: [proposals.id],
  }),
  customer: one(users, {
    fields: [verifiedSlips.customerId],
    references: [users.id],
  }),
  paymentMilestone: one(paymentMilestones),
}));

export const paymentMilestonesRelations = relations(paymentMilestones, ({ one, many }) => ({
  order: one(proposals, {
    fields: [paymentMilestones.orderId],
    references: [proposals.id],
  }),
  verifiedSlip: one(verifiedSlips, {
    fields: [paymentMilestones.verifiedSlipId],
    references: [verifiedSlips.id],
  }),
  reminderLogs: many(paymentReminderLogs),
}));

export const paymentTransactionsRelations = relations(
  paymentTransactions,
  ({ one }) => ({
    proposal: one(proposals, {
      fields: [paymentTransactions.proposalId],
      references: [proposals.id],
    }),
  }),
);

export const paymentRequestsRelations = relations(paymentRequests, ({ one }) => ({
  proposal: one(proposals, {
    fields: [paymentRequests.proposalId],
    references: [proposals.id],
  }),
}));

export const paymentReminderLogsRelations = relations(paymentReminderLogs, ({ one }) => ({
  milestone: one(paymentMilestones, {
    fields: [paymentReminderLogs.milestoneId],
    references: [paymentMilestones.id],
  }),
}));

export const projectProgressionsRelations = relations(projectProgressions, ({ one }) => ({
  proposal: one(proposals, {
    fields: [projectProgressions.proposalId],
    references: [proposals.id],
  }),
}));

export const quotationCommentsRelations = relations(quotationComments, ({ one }) => ({
  quotation: one(proposals, {
    fields: [quotationComments.quotationId],
    references: [proposals.id],
  }),
  user: one(users, {
    fields: [quotationComments.userId],
    references: [users.id],
  }),
}));

export const operationsTicketsRelations = relations(operationsTickets, ({ one }) => ({
  proposal: one(proposals, {
    fields: [operationsTickets.proposalId],
    references: [proposals.id],
  }),
}));

export const userNotificationsRelations = relations(userNotifications, ({ one }) => ({
  user: one(users, {
    fields: [userNotifications.userId],
    references: [users.id],
  }),
}));

export const jobTicketsRelations = relations(jobTickets, ({ one }) => ({
  proposal: one(proposals, {
    fields: [jobTickets.proposalId],
    references: [proposals.id],
  }),
  installer: one(users, {
    fields: [jobTickets.installerId],
    references: [users.id],
  }),
}));

export const installationJobTicketsRelations = relations(installationJobTickets, ({ one, many }) => ({
  quotation: one(proposals, {
    fields: [installationJobTickets.quotationId],
    references: [proposals.id],
  }),
  workflows: many(jobWorkflows),
  documents: many(jobTicketDocuments),
  invoices: many(invoices),
}));

export const workflowTemplatesRelations = relations(workflowTemplates, ({ many }) => ({
  stages: many(workflowStages),
  jobWorkflows: many(jobWorkflows),
}));

export const workflowStagesRelations = relations(workflowStages, ({ one, many }) => ({
  template: one(workflowTemplates, {
    fields: [workflowStages.templateId],
    references: [workflowTemplates.id],
  }),
  activeJobWorkflows: many(jobWorkflows),
  formSubmissions: many(formSubmissions),
}));

export const jobWorkflowsRelations = relations(jobWorkflows, ({ one, many }) => ({
  jobTicket: one(installationJobTickets, {
    fields: [jobWorkflows.jobTicketId],
    references: [installationJobTickets.id],
  }),
  template: one(workflowTemplates, {
    fields: [jobWorkflows.templateId],
    references: [workflowTemplates.id],
  }),
  currentStage: one(workflowStages, {
    fields: [jobWorkflows.currentStageId],
    references: [workflowStages.id],
  }),
  formSubmissions: many(formSubmissions),
}));

export const formSubmissionsRelations = relations(formSubmissions, ({ one }) => ({
  jobWorkflow: one(jobWorkflows, {
    fields: [formSubmissions.jobWorkflowId],
    references: [jobWorkflows.id],
  }),
  stage: one(workflowStages, {
    fields: [formSubmissions.stageId],
    references: [workflowStages.id],
  }),
  submitter: one(users, {
    fields: [formSubmissions.submittedBy],
    references: [users.id],
    relationName: "formSubmissionSubmitter",
  }),
  reviewer: one(users, {
    fields: [formSubmissions.reviewedBy],
    references: [users.id],
    relationName: "formSubmissionReviewer",
  }),
}));

export const jobTicketDocumentsRelations = relations(jobTicketDocuments, ({ one }) => ({
  jobTicket: one(installationJobTickets, {
    fields: [jobTicketDocuments.jobTicketId],
    references: [installationJobTickets.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  jobTicket: one(installationJobTickets, {
    fields: [invoices.jobTicketId],
    references: [installationJobTickets.id],
  }),
}));

export const productBundlesRelations = relations(productBundles, ({ many }) => ({
  items: many(productBundleItems),
}));

export const productBundleItemsRelations = relations(productBundleItems, ({ one }) => ({
  bundle: one(productBundles, {
    fields: [productBundleItems.bundleId],
    references: [productBundles.id],
  }),
  product: one(products, {
    fields: [productBundleItems.productId],
    references: [products.id],
  }),
}));

export const threadStatusEnum = pgEnum("thread_status", ["UNASSIGNED", "OPEN", "RESOLVED", "CLOSED"]);
export const referenceTypeEnum = pgEnum("reference_type", [
  "QUOTATION",
  "PRODUCT",
  "BUNDLE",
  "SAVED_BUILD",
  "NONE",
]);

// 1. Chat Threads (Rooms/Topics)
export const chatThreads = pgTable("chat_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: text("customer_id").notNull(),
  staffId: text("staff_id"), // Nullable until a staff picks up the chat
  entityId: uuid("entity_id"), // Link to Quotation ID or Job Ticket ID (Nullable for 'General Support')
  topic: text("topic").notNull(), // e.g., "Quotation #QT-123", "Installation Support", "General Inquiry"
  status: threadStatusEnum("status").default("UNASSIGNED").notNull(),
  conversationKey: text("conversation_key"),
  automationEnabled: boolean("automation_enabled").default(true).notNull(),
  humanTakeoverAt: timestamp("human_takeover_at", { withTimezone: true, mode: "date" }),
  humanTakeoverBy: text("human_takeover_by").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  lastReplySource: text("last_reply_source").default("HUMAN").notNull(),
  isArchived: boolean("is_archived").default(false).notNull(), // Used for backup/closing threads
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("chat_threads_customer_archived_updated_idx").on(
    table.customerId,
    table.isArchived,
    desc(table.updatedAt),
  ),
  index("chat_threads_archived_updated_idx").on(
    table.isArchived,
    desc(table.updatedAt),
  ),
  index("chat_threads_automation_updated_idx").on(table.automationEnabled, desc(table.updatedAt)),
  uniqueIndex("chat_threads_customer_conversation_unique").on(table.customerId, table.conversationKey),
]);

// 2. Chat Messages
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").references(() => chatThreads.id, { onDelete: "cascade" }).notNull(),
  senderId: text("sender_id").notNull(),
  message: text("message").notNull(),
  referenceType: referenceTypeEnum("reference_type").default("NONE").notNull(),
  referenceId: text("reference_id"),
  isRead: boolean("is_read").default(false).notNull(),
  isInternalNote: boolean("is_internal_note").default(false).notNull(),
  source: text("source").default("HUMAN").notNull(),
  contentType: text("content_type").default("TEXT").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown> | null>(),
  externalMessageId: text("external_message_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("chat_messages_thread_created_at_idx").on(
    table.threadId,
    desc(table.createdAt),
  ),
  index("chat_messages_thread_read_internal_sender_idx").on(
    table.threadId,
    table.isRead,
    table.isInternalNote,
    table.senderId,
  ),
  index("chat_messages_external_message_idx").on(table.externalMessageId),
  uniqueIndex("chat_messages_external_message_unique").on(table.externalMessageId),
]);

// 3. Chat Backups (History Archive)
export const chatBackups = pgTable("chat_backups", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").notNull(),
  backupUrl: text("backup_url").notNull(), // Link to JSON/PDF backup file in Cloud Storage
  exportedBy: text("exported_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatThreadsRelations = relations(chatThreads, ({ one, many }) => ({
  messages: many(chatMessages),
  customer: one(users, {
    fields: [chatThreads.customerId],
    references: [users.id],
  }),
  staff: one(users, {
    fields: [chatThreads.staffId],
    references: [users.id],
  }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  thread: one(chatThreads, {
    fields: [chatMessages.threadId],
    references: [chatThreads.id],
  }),
  sender: one(users, {
    fields: [chatMessages.senderId],
    references: [users.id],
  }),
}));

// Feature Flags Table
export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: "date", precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", precision: 3 }).defaultNow().notNull().$onUpdate(() => new Date()),
});

// Inbound Requests Enums & Table
export const inboundRequestTypeEnum = pgEnum("inbound_request_type", [
  "WIZARD",
  "BUILD",
  "SERVICE",
]);

export const inboundRequestStatusEnum = pgEnum("inbound_request_status", [
  "NEW",
  "CONTACTED",
  "QUOTED",
  "REJECTED",
]);

export const salesDealStateEnum = pgEnum("sales_deal_state", [
  "OPEN",
  "WON",
  "LOST",
  "CANCELLED",
]);

export const salesDealLifecycleStateEnum = pgEnum("sales_deal_lifecycle_state", [
  "NEW", "QUALIFYING", "QUALIFIED", "SOLUTION_DESIGN", "QUOTATION_ISSUED",
  "ACCEPTED", "PAYMENT_PENDING", "PAID", "HANDOFF_READY", "HANDED_OFF", "LOST", "CANCELLED",
]);

export const salesDealStageEnum = pgEnum("sales_deal_stage", [
  "QUALIFICATION",
  "DISCOVERY",
  "SOLUTION",
  "PROPOSAL",
  "NEGOTIATION",
  "CLOSED",
]);

export const inboundRequests = pgTable("inbound_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  requestType: inboundRequestTypeEnum("request_type").notNull(),
  payload: jsonb("payload").default(emptyJson).notNull(),
  source: text("source").default("direct").notNull(),
  companyName: text("company_name"),
  jobTitle: text("job_title"),
  territory: text("territory").default("Thailand").notNull(),
  leadType: text("lead_type").default("Client").notNull(),
  marketSegment: text("market_segment"),
  industry: text("industry"),
  addressLine1: text("address_line1"),
  city: text("city"),
  province: text("province"),
  postalCode: text("postal_code"),
  country: text("country").default("Thailand").notNull(),
  preferredContactMethod: text("preferred_contact_method"),
  status: inboundRequestStatusEnum("status").default("NEW").notNull(),
  quotationId: text("quotation_id"),
  consultationLeadId: text("consultation_lead_id"),
  erpnextLeadId: text("erpnext_lead_id"),
  erpnextSyncStatus: text("erpnext_sync_status").default("PENDING").notNull(),
  erpnextSyncError: text("erpnext_sync_error"),
  erpnextLastSyncedAt: timestamp("erpnext_last_synced_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  salesDealId: uuid("sales_deal_id"),
});

/** A commercial opportunity with canonical and legacy-compatible customer references. */
export const salesDeals = pgTable(
  "sales_deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null", onUpdate: "cascade" }),
    consultationLeadId: text("consultation_lead_id").references(() => consultationLeads.id, { onDelete: "set null", onUpdate: "cascade" }),
    customerId: text("customer_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    salesCustomerId: uuid("sales_customer_id").references(() => salesCustomers.id, { onDelete: "set null", onUpdate: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null", onUpdate: "cascade" }),
    webRequestId: uuid("web_request_id").references(() => inboundRequests.id, { onDelete: "set null", onUpdate: "cascade" }),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    legacyId: text("legacy_id"),
    sourceSystem: text("source_system"),
    sourceId: text("source_id"),
    sourceReferences: jsonb("source_references").$type<Record<string, unknown>>().default(emptyJson).notNull(),
    state: salesDealStateEnum("state").default("OPEN").notNull(),
    lifecycleState: salesDealLifecycleStateEnum("lifecycle_state").default("NEW").notNull(),
    qualificationCompletedAt: timestamp("qualification_completed_at", { withTimezone: true, mode: "date" }),
    stage: salesDealStageEnum("stage").default("QUALIFICATION").notNull(),
    title: text("title").notNull(),
    expectedValue: numeric("expected_value", { precision: 14, scale: 2 }),
    currency: text("currency").default("THB").notNull(),
    nextActionSummary: text("next_action_summary"),
    nextActionDueAt: timestamp("next_action_due_at", { withTimezone: true, mode: "date" }),
    lossReason: text("loss_reason"),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    index("sales_deals_owner_state_idx").on(table.ownerId, table.state),
    index("sales_deals_owner_lifecycle_idx").on(table.ownerId, table.lifecycleState),
    index("sales_deals_stage_updated_at_idx").on(table.stage, desc(table.updatedAt)),
    index("sales_deals_customer_created_at_idx").on(table.customerId, desc(table.createdAt)),
    index("sales_deals_sales_customer_created_at_idx").on(table.salesCustomerId, desc(table.createdAt)),
    index("sales_deals_site_id_idx").on(table.siteId),
    index("sales_deals_open_next_action_due_at_idx").on(table.nextActionDueAt).where(sql`${table.state} = 'OPEN' AND ${table.nextActionDueAt} IS NOT NULL`),
    index("sales_deals_lead_id_idx").on(table.leadId),
    index("sales_deals_consultation_lead_id_idx").on(table.consultationLeadId),
    index("sales_deals_web_request_id_idx").on(table.webRequestId),
    uniqueIndex("sales_deals_source_key").on(table.sourceSystem, table.sourceId).where(sql`${table.sourceSystem} IS NOT NULL AND ${table.sourceId} IS NOT NULL`),
    check("sales_deals_expected_value_check", sql`${table.expectedValue} IS NULL OR ${table.expectedValue} >= 0`),
    check("sales_deals_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("sales_deals_version_check", sql`${table.version} >= 1`),
    check("sales_deals_loss_reason_check", sql`${table.state} <> 'LOST' OR NULLIF(BTRIM(${table.lossReason}), '') IS NOT NULL`),
  ],
);

export const salesQualifications = pgTable("sales_qualifications", {
  id: uuid("id").primaryKey().defaultRandom(), dealId: uuid("deal_id").notNull().references(() => salesDeals.id, { onDelete: "cascade" }),
  outcome: text("outcome").notNull(), reason: text("reason"), propertyType: text("property_type"), ownership: text("ownership"), monthlyElectricityCost: numeric("monthly_electricity_cost", { precision: 14, scale: 2 }), electricalPhase: text("electrical_phase"), roofType: text("roof_type"), budgetMin: numeric("budget_min", { precision: 14, scale: 2 }), budgetMax: numeric("budget_max", { precision: 14, scale: 2 }), timeline: text("timeline"), decisionMaker: text("decision_maker"), goal: text("goal"), details: jsonb("details").$type<Record<string, unknown>>().default(emptyJson).notNull(), createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [uniqueIndex("sales_qualifications_deal_key").on(table.dealId), check("sales_qualifications_budget_check", sql`${table.budgetMin} IS NULL OR ${table.budgetMax} IS NULL OR ${table.budgetMax} >= ${table.budgetMin}`)]);

export const salesDealActivities = pgTable("sales_deal_activities", {
  id: uuid("id").primaryKey().defaultRandom(), dealId: uuid("deal_id").notNull().references(() => salesDeals.id, { onDelete: "cascade" }), actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }), fromState: salesDealLifecycleStateEnum("from_state").notNull(), toState: salesDealLifecycleStateEnum("to_state").notNull(), reason: text("reason"), metadata: jsonb("metadata").$type<Record<string, unknown>>().default(emptyJson).notNull(), visibility: text("visibility").default("INTERNAL").notNull(), payload: jsonb("payload").$type<Record<string, unknown>>().default(emptyJson).notNull(), idempotencyKey: text("idempotency_key").notNull(), dealVersion: integer("deal_version").notNull(), createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [uniqueIndex("sales_deal_activities_deal_idempotency_key").on(table.dealId,table.idempotencyKey), index("sales_deal_activities_deal_created_at_idx").on(table.dealId,desc(table.createdAt)), check("sales_deal_activities_version_check",sql`${table.dealVersion} >= 1`)]);

export const salesFollowUpTasks = pgTable("sales_follow_up_tasks", {
 id: uuid("id").primaryKey().defaultRandom(), dealId: uuid("deal_id").notNull().references(() => salesDeals.id, { onDelete: "cascade" }), ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }), title: text("title").notNull(), dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }).notNull(), status: text("status").default("OPEN").notNull(), priority: text("priority").default("NORMAL").notNull(), completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }), completedById: text("completed_by_id").references(() => users.id, { onDelete: "set null" }), createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [index("sales_follow_up_tasks_owner_due_idx").on(table.ownerId, table.dueAt), index("sales_follow_up_tasks_deal_idx").on(table.dealId), check("sales_follow_up_tasks_status_check", sql`${table.status} IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')`), check("sales_follow_up_tasks_completion_check", sql`(${table.status} = 'COMPLETED') = (${table.completedAt} IS NOT NULL)`)]);

export const salesSolutionConfigurations = pgTable("sales_solution_configurations", {
 id: uuid("id").primaryKey().defaultRandom(), dealId: uuid("deal_id").notNull().references(() => salesDeals.id, { onDelete: "cascade" }), version: integer("version").notNull(), status: text("status").default("DRAFT").notNull(), isCurrent: boolean("is_current").default(true).notNull(), catalogVersion: text("catalog_version").notNull(), technicalConfiguration: jsonb("technical_configuration").$type<Record<string, unknown>>().notNull(), createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }), createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [uniqueIndex("sales_solution_configurations_deal_version_key").on(table.dealId,table.version), uniqueIndex("sales_solution_configurations_current_draft_key").on(table.dealId).where(sql`${table.isCurrent} = true AND ${table.status} = 'DRAFT'`), check("sales_solution_configurations_version_check", sql`${table.version} > 0`)]);

export const salesProposals = pgTable("sales_proposals", {
 id: uuid("id").primaryKey().defaultRandom(), dealId: uuid("deal_id").notNull().references(() => salesDeals.id, { onDelete: "restrict" }), legacyProposalId: text("legacy_proposal_id").references(() => proposals.id, { onDelete: "set null" }), state: text("state").default("DRAFT").notNull(), acceptedRevisionId: uuid("accepted_revision_id").references((): AnyPgColumn => salesProposalRevisions.id, { onDelete: "set null" }), version: integer("version").default(1).notNull(), createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [index("sales_proposals_deal_idx").on(table.dealId), uniqueIndex("sales_proposals_legacy_key").on(table.legacyProposalId).where(sql`${table.legacyProposalId} IS NOT NULL`), check("sales_proposals_state_check", sql`${table.state} IN ('DRAFT','ISSUED','VIEWED','ACCEPTED','DECLINED','EXPIRED','VOIDED')`)]);

export const salesProposalRevisions = pgTable("sales_proposal_revisions", {
 id: uuid("id").primaryKey().defaultRandom(), proposalId: uuid("proposal_id").notNull().references(() => salesProposals.id, { onDelete: "cascade" }), revisionNumber: integer("revision_number").notNull(), currency: text("currency").notNull(), total: numeric("total", { precision: 14, scale: 2 }).notNull(), commercialSnapshot: jsonb("commercial_snapshot").$type<Record<string, unknown>>().notNull(), erpQuotationReference: text("erp_quotation_reference"), pdfUrl: text("pdf_url"), issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }), createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [uniqueIndex("sales_proposal_revisions_number_key").on(table.proposalId,table.revisionNumber), index("sales_proposal_revisions_erp_idx").on(table.erpQuotationReference), check("sales_proposal_revisions_total_check", sql`${table.total} >= 0`)]);

export const salesProposalRevisionItems = pgTable("sales_proposal_revision_items", {
 id: uuid("id").primaryKey().defaultRandom(), revisionId: uuid("revision_id").notNull().references(() => salesProposalRevisions.id, { onDelete: "cascade" }), lineNumber: integer("line_number").notNull(), description: text("description").notNull(), catalogItemReference: text("catalog_item_reference"), quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(), unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(), total: numeric("total", { precision: 14, scale: 2 }).notNull(), snapshot: jsonb("snapshot").$type<Record<string, unknown>>().default(emptyJson).notNull(),
}, table => [uniqueIndex("sales_proposal_revision_items_line_key").on(table.revisionId,table.lineNumber), check("sales_proposal_revision_items_amount_check", sql`${table.quantity} > 0 AND ${table.unitPrice} >= 0 AND ${table.total} >= 0`)]);

export const salesSignatureEnvelopes = pgTable("sales_signature_envelopes", {
 id: uuid("id").primaryKey().defaultRandom(), proposalRevisionId: uuid("proposal_revision_id").notNull().references(() => salesProposalRevisions.id, { onDelete: "restrict" }), provider: text("provider").notNull(), providerEnvelopeId: text("provider_envelope_id").notNull(), status: text("status").default("PENDING").notNull(), signerEvidence: jsonb("signer_evidence").$type<Record<string, unknown>>().default(emptyJson).notNull(), acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }), signedAt: timestamp("signed_at", { withTimezone: true, mode: "date" }), createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [uniqueIndex("sales_signature_envelopes_provider_key").on(table.provider,table.providerEnvelopeId), index("sales_signature_envelopes_revision_idx").on(table.proposalRevisionId)]);

export const salesPaymentPlans = pgTable("sales_payment_plans", {
 id: uuid("id").primaryKey().defaultRandom(), dealId: uuid("deal_id").notNull().references(() => salesDeals.id, { onDelete: "restrict" }), proposalRevisionId: uuid("proposal_revision_id").references(() => salesProposalRevisions.id, { onDelete: "set null" }), status: text("status").default("DRAFT").notNull(), currency: text("currency").default("THB").notNull(), totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(), createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [index("sales_payment_plans_deal_idx").on(table.dealId), check("sales_payment_plans_total_check", sql`${table.totalAmount} >= 0`)]);

export const salesPaymentInstallments = pgTable("sales_payment_installments", {
 id: uuid("id").primaryKey().defaultRandom(), paymentPlanId: uuid("payment_plan_id").notNull().references(() => salesPaymentPlans.id, { onDelete: "cascade" }), sequence: integer("sequence").notNull(), label: text("label").notNull(), amount: numeric("amount", { precision: 14, scale: 2 }).notNull(), dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }), status: text("status").default("PENDING").notNull(), completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }), createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [uniqueIndex("sales_payment_installments_sequence_key").on(table.paymentPlanId,table.sequence), index("sales_payment_installments_due_idx").on(table.dueAt), check("sales_payment_installments_amount_check", sql`${table.amount} >= 0`)]);

export const salesPaymentRequests = pgTable("sales_payment_requests", {
 id: uuid("id").primaryKey().defaultRandom(), installmentId: uuid("installment_id").notNull().references(() => salesPaymentInstallments.id, { onDelete: "cascade" }), provider: text("provider").notNull(), providerRequestId: text("provider_request_id"), idempotencyKey: text("idempotency_key").notNull(), amount: numeric("amount", { precision: 14, scale: 2 }).notNull(), currency: text("currency").default("THB").notNull(), status: text("status").default("PENDING").notNull(), providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>().default(emptyJson).notNull(), completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }), createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [uniqueIndex("sales_payment_requests_idempotency_key").on(table.idempotencyKey), uniqueIndex("sales_payment_requests_provider_key").on(table.provider,table.providerRequestId).where(sql`${table.providerRequestId} IS NOT NULL`), index("sales_payment_requests_installment_idx").on(table.installmentId)]);


/** Immutable boundary contract from sales into installation operations. */
export const salesHandoffs = pgTable("sales_handoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: text("deal_id").notNull(),
  salesDealId: uuid("sales_deal_id").references(() => salesDeals.id, { onDelete: "restrict" }),
  acceptedProposalRevisionId: uuid("accepted_proposal_revision_id").references(() => salesProposalRevisions.id, { onDelete: "restrict" }),
  solutionConfigurationId: uuid("solution_configuration_id").references(() => salesSolutionConfigurations.id, { onDelete: "restrict" }),
  paymentPlanId: uuid("payment_plan_id").references(() => salesPaymentPlans.id, { onDelete: "restrict" }),
  acceptedProposalRevision: jsonb("accepted_proposal_revision").$type<Record<string, unknown>>().notNull(),
  customer: jsonb("customer").$type<Record<string, unknown>>().notNull(),
  site: jsonb("site").$type<Record<string, unknown>>().notNull(),
  erpSalesOrderReference: text("erp_sales_order_reference"),
  paymentSnapshot: jsonb("payment_snapshot").$type<Record<string, unknown>>().notNull(),
  configurationSnapshot: jsonb("configuration_snapshot").$type<Record<string, unknown>>().notNull(),
  documentManifest: jsonb("document_manifest").$type<Array<Record<string, unknown>>>().default(sql`'[]'::jsonb`).notNull(),
  operationalNote: text("operational_note"),
  readinessPolicyVersion: text("readiness_policy_version").notNull(),
  status: text("status").default("PENDING").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  installationProjectId: uuid("installation_project_id").references(() => installationWorkflowProjects.id, { onDelete: "set null", onUpdate: "cascade" }),
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("sales_handoffs_idempotency_key_key").on(table.idempotencyKey),
  index("sales_handoffs_deal_created_idx").on(table.dealId, table.createdAt),
  index("sales_handoffs_sales_deal_idx").on(table.salesDealId),
  index("sales_handoffs_status_idx").on(table.status),
  check("sales_handoffs_status_check", sql`${table.status} IN ('PENDING', 'READY', 'BLOCKED', 'CONSUMED')`),
]);

export const salesDealsRelations = relations(salesDeals, ({ one }) => ({
  lead: one(leads, { fields: [salesDeals.leadId], references: [leads.id] }),
  consultationLead: one(consultationLeads, { fields: [salesDeals.consultationLeadId], references: [consultationLeads.id] }),
  customer: one(users, { fields: [salesDeals.customerId], references: [users.id], relationName: "salesDealCustomer" }),
  salesCustomer: one(salesCustomers, { fields: [salesDeals.salesCustomerId], references: [salesCustomers.id] }),
  site: one(sites, { fields: [salesDeals.siteId], references: [sites.id] }),
  webRequest: one(inboundRequests, { fields: [salesDeals.webRequestId], references: [inboundRequests.id] }),
  owner: one(users, { fields: [salesDeals.ownerId], references: [users.id], relationName: "salesDealOwner" }),
}));

export const salesCustomersRelations = relations(salesCustomers, ({ many }) => ({ contacts: many(salesContacts), deals: many(salesDeals) }));
export const salesContactsRelations = relations(salesContacts, ({ one }) => ({ customer: one(salesCustomers, { fields: [salesContacts.customerId], references: [salesCustomers.id] }), user: one(users, { fields: [salesContacts.userId], references: [users.id] }) }));
export const salesProposalsRelations = relations(salesProposals, ({ one, many }) => ({ deal: one(salesDeals, { fields: [salesProposals.dealId], references: [salesDeals.id] }), revisions: many(salesProposalRevisions) }));
export const salesProposalRevisionsRelations = relations(salesProposalRevisions, ({ one, many }) => ({ proposal: one(salesProposals, { fields: [salesProposalRevisions.proposalId], references: [salesProposals.id] }), items: many(salesProposalRevisionItems), signatures: many(salesSignatureEnvelopes) }));
export const salesDealActivitiesRelations = relations(salesDealActivities, ({ one }) => ({ deal: one(salesDeals, { fields: [salesDealActivities.dealId], references: [salesDeals.id] }) }));

/** Catalog Synchronization Versions */
export const catalogSyncVersions = pgTable("catalog_sync_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").default("ERPNEXT").notNull(),
  status: text("status").default("STAGING").notNull(),
  sourceCursor: text("source_cursor"),
  summary: jsonb("summary").$type<Record<string, unknown>>().default(emptyJson).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
  failedAt: timestamp("failed_at", { withTimezone: true, mode: "date" }),
}, (table) => [
  index("catalog_sync_versions_status_idx").on(table.status, table.publishedAt),
  uniqueIndex("catalog_sync_versions_one_published_key").on(table.provider).where(sql`${table.status} = 'PUBLISHED'`),
  check("catalog_sync_versions_status_check", sql`${table.status} IN ('STAGING','PUBLISHED','FAILED','ARCHIVED')`),
]);

/** Catalog ERP References */
export const catalogErpReferences = pgTable("catalog_erp_references", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: text("product_id").references(() => products.id, { onDelete: "cascade" }),
  bundleId: text("bundle_id").references(() => productBundles.id, { onDelete: "cascade" }),
  provider: text("provider").default("ERPNEXT").notNull(),
  remoteType: text("remote_type").notNull(),
  remoteId: text("remote_id").notNull(),
  remoteVersion: text("remote_version"),
  syncVersionId: uuid("sync_version_id").notNull().references(() => catalogSyncVersions.id, { onDelete: "restrict" }),
  syncedAt: timestamp("synced_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("catalog_erp_references_remote_key").on(table.provider, table.remoteType, table.remoteId),
  index("catalog_erp_references_product_idx").on(table.productId),
  index("catalog_erp_references_sync_version_idx").on(table.syncVersionId),
]);

/** Catalog Price Lists */
export const catalogPriceLists = pgTable("catalog_price_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  currency: text("currency").notNull(),
  taxInclusive: boolean("tax_inclusive").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  syncVersionId: uuid("sync_version_id").notNull().references(() => catalogSyncVersions.id, { onDelete: "restrict" }),
}, (table) => [
  uniqueIndex("catalog_price_lists_code_idx").on(table.code),
  index("catalog_price_lists_sync_version_idx").on(table.syncVersionId),
]);

/** Catalog Prices */
export const catalogPrices = pgTable("catalog_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  priceListId: uuid("price_list_id").notNull().references(() => catalogPriceLists.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "cascade" }),
  bundleId: text("bundle_id").references(() => productBundles.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  minimumQuantity: integer("minimum_quantity").default(1).notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }),
  validUntil: timestamp("valid_until", { withTimezone: true, mode: "date" }),
  syncVersionId: uuid("sync_version_id").notNull().references(() => catalogSyncVersions.id, { onDelete: "restrict" }),
}, (table) => [
  index("catalog_prices_product_idx").on(table.productId, table.priceListId, table.syncVersionId),
  uniqueIndex("catalog_prices_product_version_key").on(table.priceListId, table.productId, table.minimumQuantity, table.syncVersionId).where(sql`${table.productId} IS NOT NULL`),
  uniqueIndex("catalog_prices_bundle_version_key").on(table.priceListId, table.bundleId, table.minimumQuantity, table.syncVersionId).where(sql`${table.bundleId} IS NOT NULL`),
]);

/** Catalog Tax Rules */
export const catalogTaxRules = pgTable("catalog_tax_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  rate: numeric("rate", { precision: 9, scale: 6 }).notNull(),
  mode: text("mode").notNull(),
  jurisdiction: text("jurisdiction"),
  priority: integer("priority").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }),
  validUntil: timestamp("valid_until", { withTimezone: true, mode: "date" }),
  syncVersionId: uuid("sync_version_id").notNull().references(() => catalogSyncVersions.id, { onDelete: "restrict" }),
}, (table) => [
  uniqueIndex("catalog_tax_rules_version_code_key").on(table.syncVersionId, table.code),
]);

/** Product Compatibilities */
export const productCompatibilities = pgTable("product_compatibilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceProductId: text("source_product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  targetProductId: text("target_product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  relationship: text("relationship").notNull(),
  minimumQuantity: integer("minimum_quantity"),
  maximumQuantity: integer("maximum_quantity"),
  syncVersionId: uuid("sync_version_id").notNull().references(() => catalogSyncVersions.id, { onDelete: "restrict" }),
}, (table) => [
  uniqueIndex("product_compatibilities_version_edge_key").on(table.syncVersionId, table.sourceProductId, table.targetProductId, table.relationship),
]);

export const catalogSyncVersionsRelations = relations(catalogSyncVersions, ({ many }) => ({
  priceLists: many(catalogPriceLists),
  erpReferences: many(catalogErpReferences),
  prices: many(catalogPrices),
  taxRules: many(catalogTaxRules),
  compatibilities: many(productCompatibilities),
}));

export const catalogPriceListsRelations = relations(catalogPriceLists, ({ one, many }) => ({
  syncVersion: one(catalogSyncVersions, { fields: [catalogPriceLists.syncVersionId], references: [catalogSyncVersions.id] }),
  prices: many(catalogPrices),
}));

export const catalogErpReferencesRelations = relations(catalogErpReferences, ({ one }) => ({
  product: one(products, { fields: [catalogErpReferences.productId], references: [products.id] }),
  bundle: one(productBundles, { fields: [catalogErpReferences.bundleId], references: [productBundles.id] }),
  syncVersion: one(catalogSyncVersions, { fields: [catalogErpReferences.syncVersionId], references: [catalogSyncVersions.id] }),
}));

export const catalogPricesRelations = relations(catalogPrices, ({ one }) => ({
  priceList: one(catalogPriceLists, { fields: [catalogPrices.priceListId], references: [catalogPriceLists.id] }),
  product: one(products, { fields: [catalogPrices.productId], references: [products.id] }),
  bundle: one(productBundles, { fields: [catalogPrices.bundleId], references: [productBundles.id] }),
  syncVersion: one(catalogSyncVersions, { fields: [catalogPrices.syncVersionId], references: [catalogSyncVersions.id] }),
}));

export const catalogTaxRulesRelations = relations(catalogTaxRules, ({ one }) => ({
  syncVersion: one(catalogSyncVersions, { fields: [catalogTaxRules.syncVersionId], references: [catalogSyncVersions.id] }),
}));

export const productCompatibilitiesRelations = relations(productCompatibilities, ({ one }) => ({
  sourceProduct: one(products, { fields: [productCompatibilities.sourceProductId], references: [products.id] }),
  targetProduct: one(products, { fields: [productCompatibilities.targetProductId], references: [products.id] }),
  syncVersion: one(catalogSyncVersions, { fields: [productCompatibilities.syncVersionId], references: [catalogSyncVersions.id] }),
}));
