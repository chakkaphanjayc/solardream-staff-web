import { getEmailSettings } from "@/app/actions/emailSettings";
import { requireAdmin } from "@/lib/auth-guard";
import EmailSettingsClient from "./EmailSettingsClient";


export default async function EmailSettingsPage() {
  await requireAdmin();
  const result = await getEmailSettings();
  const automations = result.success && result.automations ? result.automations : null;

  return (
    <EmailSettingsClient initialAutomations={automations} />
  );
}
