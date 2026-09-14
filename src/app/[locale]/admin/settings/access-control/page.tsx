import { connection } from "next/server";
import { getDeveloperAccessState } from "@/lib/developerAccess";
import AccessControlClient from "./AccessControlClient";

export const instant = false;

export default async function AccessControlPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const [{ locale }, state] = await Promise.all([params, getDeveloperAccessState()]);
  return <AccessControlClient initialState={state} locale={locale === "th" ? "th" : "en"} />;
}
