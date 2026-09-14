export type CustomerMatchCandidate = {
  id: string;
  erpnextCustomerId?: string | null;
  normalizedEmail?: string | null;
  normalizedPhone?: string | null;
};

export type DuplicateMatchResult =
  | { kind: "EXACT_PROVIDER"; customerId: string }
  | { kind: "CONTACT_MATCH"; customerId: string; signals: readonly ("EMAIL" | "PHONE")[] }
  | { kind: "AMBIGUOUS"; candidateIds: readonly string[] }
  | { kind: "NONE" };

export function matchDuplicateCustomer(
  input: Omit<CustomerMatchCandidate, "id">,
  candidates: readonly CustomerMatchCandidate[],
): DuplicateMatchResult {
  const providerId = input.erpnextCustomerId?.trim();
  if (providerId) {
    const exact = candidates.filter((candidate) => candidate.erpnextCustomerId?.trim() === providerId);
    if (exact.length === 1) return { kind: "EXACT_PROVIDER", customerId: exact[0].id };
    if (exact.length > 1) return { kind: "AMBIGUOUS", candidateIds: exact.map(({ id }) => id).sort() };
  }
  const matches = candidates.flatMap((candidate) => {
    const signals: ("EMAIL" | "PHONE")[] = [];
    if (input.normalizedEmail && candidate.normalizedEmail === input.normalizedEmail) signals.push("EMAIL");
    if (input.normalizedPhone && candidate.normalizedPhone === input.normalizedPhone) signals.push("PHONE");
    return signals.length ? [{ candidate, signals }] : [];
  });
  if (matches.length === 1) return { kind: "CONTACT_MATCH", customerId: matches[0].candidate.id, signals: matches[0].signals };
  if (matches.length > 1) return { kind: "AMBIGUOUS", candidateIds: matches.map(({ candidate }) => candidate.id).sort() };
  return { kind: "NONE" };
}
