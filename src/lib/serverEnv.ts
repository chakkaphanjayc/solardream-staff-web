import "server-only";

const LEGACY_PUBLIC_ERP_ENV_NAMES = [
  "NEXT_PUBLIC_ERPNEXT_API_KEY",
  "NEXT_PUBLIC_ERPNEXT_API_SECRET",
] as const;

/**
 * Keep the legacy guard in one server-only module so private ERP credentials
 * cannot be accidentally moved into browser-exposed environment variables.
 */
export function assertNoLegacyPublicErpSecrets() {
  const configuredLegacyNames = LEGACY_PUBLIC_ERP_ENV_NAMES.filter((name) =>
    Boolean(process.env[name]?.trim()),
  );

  if (configuredLegacyNames.length > 0) {
    throw new Error(
      "ERPNext API credentials must use ERPNEXT_API_KEY and ERPNEXT_API_SECRET, not NEXT_PUBLIC_ environment variables.",
    );
  }
}
