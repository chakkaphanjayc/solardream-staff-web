type PasskeyError = Error & {
  code?: string;
  cause?: unknown;
};

export type PasskeyMessages = {
  insecureContext: string;
  unsupported: string;
  disabled: string;
  invalidRpId: string;
  failed: string;
};

export function getPasskeyPreflightError(messages: PasskeyMessages): string | null {
  if (typeof window === "undefined" || !window.isSecureContext) {
    return messages.insecureContext;
  }
  if (!("PublicKeyCredential" in window) || !navigator.credentials?.create) {
    return messages.unsupported;
  }
  return null;
}

export function getPasskeyErrorMessage(error: PasskeyError, messages: PasskeyMessages): string {
  if (error.code === "passkey_disabled") return messages.disabled;
  if (error.code === "ERROR_INVALID_RP_ID" || error.code === "ERROR_INVALID_DOMAIN") return messages.invalidRpId;
  if (error.code === "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY" && error.cause instanceof Error) {
    return `${messages.failed} ${error.cause.message}`;
  }
  return error.message || messages.failed;
}
