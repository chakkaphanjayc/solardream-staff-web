import "server-only";
import type { SalesActor } from "@/types/sales-v2";
export type SalesPermission="sales:read"|"sales:write"|"sales:assign"|"sales:accept"|"sales:handoff";
const grants:Record<SalesActor["role"],readonly SalesPermission[]>={OWNER:["sales:read","sales:write"],SALES:["sales:read","sales:write"],MANAGER:["sales:read","sales:write","sales:assign","sales:accept","sales:handoff"],ADMIN:["sales:read","sales:write","sales:assign","sales:accept","sales:handoff"],SYSTEM:["sales:read","sales:write","sales:handoff"]};
export function hasSalesPermission(actor:SalesActor,permission:SalesPermission,ownerId?:string|null):boolean{return grants[actor.role].includes(permission)&&(actor.role!=="OWNER"||!ownerId||ownerId===actor.userId);}
export function assertSalesPermission(actor:SalesActor,permission:SalesPermission,ownerId?:string|null):void{if(!hasSalesPermission(actor,permission,ownerId))throw new Error("Sales permission denied");}
