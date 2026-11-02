export function canRescheduleVisit(status: string): boolean {
  return status === "PLANNED" || status === "CONFIRMED";
}

export function clearVisitDateDraft(
  drafts: Record<string, string>,
  visitId: string,
): Record<string, string> {
  const next = { ...drafts };
  delete next[visitId];
  return next;
}
