import "server-only";
import { createHash } from "node:crypto";
export function normalizeLegacyEmail(value:string|null|undefined):string|null{return value?.trim().toLowerCase()||null;}
export function normalizeLegacyPhone(value:string|null|undefined):string|null{const digits=value?.replace(/\D/g,"")??"";return digits?digits.startsWith("0")?`+66${digits.slice(1)}`:digits.startsWith("66")?`+${digits}`:`+${digits}`:null;}
export function legacyMappingKey(entity:string,id:string):string{return `legacy:${entity}:${id}`;}
export function legacyInputChecksum(value:unknown):string{return createHash("sha256").update(JSON.stringify(value,Object.keys((value??{}) as object).sort())).digest("hex");}
