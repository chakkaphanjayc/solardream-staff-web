import "server-only";
import { and,eq,sql } from "drizzle-orm";
import { db } from "@/db";
import { salesDealActivities,salesDeals } from "@/db/schema";
import type { DealState,JsonValue } from "@/types/sales-v2";
import { assertDealTransition } from "./domain/deal-state";
export async function findDealById(id:string){return db.query.salesDeals.findFirst({where:eq(salesDeals.id,id)});}
export async function transitionDeal(input:{id:string;expectedVersion:number;to:DealState;actorId?:string;payload?:Record<string,JsonValue>;lossReason?:string;hasQualification?:boolean;hasAcceptedProposal?:boolean}){return db.transaction(async tx=>{const current=await tx.query.salesDeals.findFirst({where:and(eq(salesDeals.id,input.id),eq(salesDeals.version,input.expectedVersion))});if(!current)throw new Error("Deal was concurrently modified or does not exist");assertDealTransition(current.lifecycleState,input.to,input);const [updated]=await tx.update(salesDeals).set({lifecycleState:input.to,version:sql`${salesDeals.version}+1`,lossReason:input.lossReason,updatedAt:new Date()}).where(and(eq(salesDeals.id,input.id),eq(salesDeals.version,input.expectedVersion))).returning();if(!updated)throw new Error("Deal was concurrently modified");await tx.insert(salesDealActivities).values({dealId:input.id,actorUserId:input.actorId,fromState:current.lifecycleState,toState:input.to,idempotencyKey:`deal:${input.id}:version:${updated.version}`,dealVersion:updated.version,metadata:input.payload??{},payload:{from:current.lifecycleState,to:input.to,...input.payload}});return updated;});}
