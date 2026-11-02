export function canRescheduleVisit(status: string): boolean {
  return status === "PLANNED" || status === "CONFIRMED";
}
