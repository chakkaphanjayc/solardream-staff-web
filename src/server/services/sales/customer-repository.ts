import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { salesContacts,salesCustomers } from "@/db/schema";
export async function findSalesCustomer(id:string){return db.query.salesCustomers.findFirst({where:eq(salesCustomers.id,id),with:{contacts:true}});}
export async function createSalesCustomer(input:{displayName:string;legalName?:string;customerType?:"PERSON"|"BUSINESS";legacyUserId?:string}){return db.transaction(async tx=>{const [customer]=await tx.insert(salesCustomers).values({...input,legacyKey:`sales-v2:${crypto.randomUUID()}`}).returning();if(!customer)throw new Error("Customer insert failed");return customer;});}
export async function addSalesContact(input:typeof salesContacts.$inferInsert){const [contact]=await db.insert(salesContacts).values(input).returning();if(!contact)throw new Error("Contact insert failed");return contact;}
