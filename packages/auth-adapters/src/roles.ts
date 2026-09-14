export const STAFF_ROLES = ["ADMIN", "SUPER_ADMIN", "MANAGER", "STAFF"] as const;
export const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
export type AdminRole = (typeof ADMIN_ROLES)[number];

export function isStaffRole(value: string | null | undefined): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

export function isAdminRole(value: string | null | undefined): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}
