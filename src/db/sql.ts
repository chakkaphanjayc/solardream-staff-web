import { sql } from "drizzle-orm";

export function sqlArray(values: readonly string[], type: "text" | "uuid") {
  return sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::${sql.raw(type)}[]`;
}
