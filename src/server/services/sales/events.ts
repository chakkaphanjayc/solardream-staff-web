import "server-only";
import type { JsonValue,SalesEvent } from "@/types/sales-v2";
export function createSalesEvent<T extends JsonValue>(type:string,aggregateId:string,payload:T,actorId?:string,now=new Date()):SalesEvent<T>{if(!type.trim()||!aggregateId.trim())throw new Error("Event type and aggregate ID are required");return{type,aggregateId,payload,actorId,occurredAt:now.toISOString()};}
export function activityIdempotencyKey(event:SalesEvent):string{return `${event.aggregateId}:${event.type}:${event.occurredAt}:${event.actorId??"system"}`;}
