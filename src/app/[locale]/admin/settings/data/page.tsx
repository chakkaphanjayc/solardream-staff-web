import { connection } from "next/server";
import { getDeveloperDataResourceDefinitions, getDeveloperDataRows, type DeveloperDataRow } from "@/lib/developerData";
import DataManagerClient from "./DataManagerClient";

export const instant = false;

export default async function DeveloperDataPage() {
  await connection();
  const resources = getDeveloperDataResourceDefinitions();
  let initialRows: DeveloperDataRow[] = [];
  try {
    initialRows = (await getDeveloperDataRows(resources[0].id)) ?? [];
  } catch (error: unknown) {
    console.error("[Developer data] Failed to load the initial collection:", error);
  }
  return <DataManagerClient resources={resources} initialRows={initialRows} />;
}
