import { google } from "googleapis";

const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/drive.file",
] as const;

function getNormalizedPrivateKey(rawKey?: string): string | undefined {
  if (!rawKey) return undefined;
  let formatted = rawKey.trim();
  if (formatted.startsWith('"') && formatted.endsWith('"')) {
    formatted = formatted.slice(1, -1);
  }
  return formatted.replace(/\\n/g, "\n");
}

export function getGoogleAuthClient(subjectEmail?: string) {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey =
    getNormalizedPrivateKey(process.env.GOOGLE_PRIVATE_KEY) ||
    getNormalizedPrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing Google Service Account credentials. Please set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in .env."
    );
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [...GOOGLE_WORKSPACE_SCOPES],
    subject: subjectEmail || process.env.GOOGLE_ADMIN_IMPERSONATE_EMAIL || undefined,
  });
}

export function getCalendarClient(subjectEmail?: string) {
  const auth = getGoogleAuthClient(subjectEmail);
  return google.calendar({ version: "v3", auth });
}

export function getGmailClient(subjectEmail?: string) {
  const auth = getGoogleAuthClient(subjectEmail);
  return google.gmail({ version: "v1", auth });
}

export function getDriveClient(subjectEmail?: string) {
  const auth = getGoogleAuthClient(subjectEmail);
  return google.drive({ version: "v3", auth });
}
