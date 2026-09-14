"use server";

import { db } from "@/db";
import { users, proposals, consultationLeads, inboundRequests } from "@/db/schema";
import { eq, desc, isNotNull, sql } from "drizzle-orm";
import { frappeRequest, createErpnextCustomerIdempotently, lookupErpnextCustomers } from "@/lib/erpnext";
import { revalidatePath } from "next/cache";

export interface SalesCustomer {
  id: string;
  userId: string | null;
  customerName: string;
  email: string | null;
  phone: string | null;
  erpnextCustomerId: string | null;
  erpnextSyncStatus: "SYNCED" | "PENDING" | "LOCAL_ONLY";
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  proposalsCount: number;
  totalPipelineValue: number;
  latestStatus: string;
  hasLocationPin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SyncCustomersResult {
  success: boolean;
  syncedCount: number;
  newMatchesCount: number;
  totalCustomers: number;
  error?: string;
}

function normalizeKey(str: string | null | undefined): string {
  return (str || "").trim().toLowerCase();
}

/**
 * Aggregates all unique customers from users, proposals, consultation leads, and inbound requests.
 */
export async function getSalesCustomers(): Promise<SalesCustomer[]> {
  try {
    const [allUsers, allProposals, allConsultations, allInbounds] = await Promise.all([
      db.select({
        id: users.id,
        email: users.email,
        name: users.name,
        fullName: users.fullName,
        phoneNumber: users.phoneNumber,
        erpnextCustomerId: users.erpnextCustomerId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      }).from(users),

      db.select({
        id: proposals.id,
        userId: proposals.userId,
        erpnextCustomerId: proposals.erpnextCustomerId,
        installationLatitude: proposals.installationLatitude,
        installationLongitude: proposals.installationLongitude,
        installationMapAddress: proposals.installationMapAddress,
        configurationData: proposals.configurationData,
        totalPrice: proposals.totalPrice,
        status: proposals.status,
        createdAt: proposals.createdAt,
        updatedAt: proposals.updatedAt,
      }).from(proposals).orderBy(desc(proposals.createdAt)),

      db.select({
        id: consultationLeads.id,
        userId: consultationLeads.userId,
        customerName: consultationLeads.customerName,
        email: consultationLeads.email,
        phone: consultationLeads.phone,
        postalCode: consultationLeads.postalCode,
        dynamicCalculations: consultationLeads.dynamicCalculations,
        rawPayload: consultationLeads.rawPayload,
        status: consultationLeads.status,
        createdAt: consultationLeads.createdAt,
        updatedAt: consultationLeads.updatedAt,
      }).from(consultationLeads).orderBy(desc(consultationLeads.createdAt)),

      db.select({
        id: inboundRequests.id,
        customerName: inboundRequests.customerName,
        email: inboundRequests.email,
        phone: inboundRequests.phone,
        addressLine1: inboundRequests.addressLine1,
        postalCode: inboundRequests.postalCode,
        payload: inboundRequests.payload,
        erpnextLeadId: inboundRequests.erpnextLeadId,
        status: inboundRequests.status,
        createdAt: inboundRequests.createdAt,
        updatedAt: inboundRequests.updatedAt,
      }).from(inboundRequests).orderBy(desc(inboundRequests.createdAt)),
    ]);

    // Grouping by unique identifier (email, phone, or normalized name)
    const customerMap = new Map<string, SalesCustomer>();

    const getOrInitCustomer = (
      key: string,
      initial: {
        id: string;
        userId?: string | null;
        customerName: string;
        email?: string | null;
        phone?: string | null;
        erpnextCustomerId?: string | null;
        createdAt: Date | string | null;
        updatedAt: Date | string | null;
      }
    ): SalesCustomer => {
      let existing = customerMap.get(key);
      if (!existing) {
        existing = {
          id: initial.id,
          userId: initial.userId || null,
          customerName: initial.customerName || "Customer",
          email: initial.email || null,
          phone: initial.phone || null,
          erpnextCustomerId: initial.erpnextCustomerId || null,
          erpnextSyncStatus: initial.erpnextCustomerId ? "SYNCED" : "LOCAL_ONLY",
          latitude: null,
          longitude: null,
          address: null,
          proposalsCount: 0,
          totalPipelineValue: 0,
          latestStatus: "ACTIVE",
          hasLocationPin: false,
          createdAt: initial.createdAt ? new Date(initial.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: initial.updatedAt ? new Date(initial.updatedAt).toISOString() : new Date().toISOString(),
        };
        customerMap.set(key, existing);
      }
      return existing;
    };

    // 1. Process Registered Users
    for (const u of allUsers) {
      const emailKey = normalizeKey(u.email);
      const phoneKey = normalizeKey(u.phoneNumber);
      const primaryKey = emailKey || phoneKey || u.id;

      const customer = getOrInitCustomer(primaryKey, {
        id: u.id,
        userId: u.id,
        customerName: u.fullName || u.name || u.email,
        email: u.email,
        phone: u.phoneNumber,
        erpnextCustomerId: u.erpnextCustomerId,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      });

      if (u.erpnextCustomerId) {
        customer.erpnextCustomerId = u.erpnextCustomerId;
        customer.erpnextSyncStatus = "SYNCED";
      }
    }

    // 2. Process Proposals & Quotations
    for (const p of allProposals) {
      const config = (p.configurationData && typeof p.configurationData === "object" ? p.configurationData : {}) as Record<string, unknown>;
      const propCustomerName = String(config.customerName || config.name || config.fullName || "Valued Customer");
      const propEmail = String(config.customerEmail || config.email || "");
      const propPhone = String(config.customerPhone || config.phone || "");

      const emailKey = normalizeKey(propEmail);
      const phoneKey = normalizeKey(propPhone);
      const userKey = p.userId ? normalizeKey(p.userId) : "";
      const primaryKey = emailKey || phoneKey || userKey || p.id;

      const customer = getOrInitCustomer(primaryKey, {
        id: p.userId || p.id,
        userId: p.userId,
        customerName: propCustomerName,
        email: propEmail || null,
        phone: propPhone || null,
        erpnextCustomerId: p.erpnextCustomerId,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      });

      customer.proposalsCount += 1;
      const value = Number(p.totalPrice || 0);
      if (Number.isFinite(value) && value > 0) {
        customer.totalPipelineValue += value;
      }
      customer.latestStatus = p.status || customer.latestStatus;

      if (p.erpnextCustomerId && !customer.erpnextCustomerId) {
        customer.erpnextCustomerId = p.erpnextCustomerId;
        customer.erpnextSyncStatus = "SYNCED";
      }

      // Extract Coordinates from Proposal
      if (p.installationLatitude && p.installationLongitude && !customer.latitude) {
        const lat = Number(p.installationLatitude);
        const lng = Number(p.installationLongitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          customer.latitude = lat;
          customer.longitude = lng;
          customer.address = p.installationMapAddress || customer.address;
          customer.hasLocationPin = true;
        }
      }

      // Check configurationData
      if (!customer.hasLocationPin && p.configurationData && typeof p.configurationData === "object") {
        const config = p.configurationData as Record<string, unknown>;
        const siteLoc = config.siteLocation as Record<string, unknown> | undefined;
        if (siteLoc && typeof siteLoc === "object") {
          const lat = Number(siteLoc.latitude);
          const lng = Number(siteLoc.longitude);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            customer.latitude = lat;
            customer.longitude = lng;
            customer.address = (typeof siteLoc.displayName === "string" ? siteLoc.displayName : null) || customer.address;
            customer.hasLocationPin = true;
          }
        }
      }
    }

    // 3. Process Consultation Leads
    for (const c of allConsultations) {
      const emailKey = normalizeKey(c.email);
      const phoneKey = normalizeKey(c.phone);
      const primaryKey = emailKey || phoneKey || c.id;

      const customer = getOrInitCustomer(primaryKey, {
        id: c.userId || c.id,
        userId: c.userId,
        customerName: c.customerName,
        email: c.email,
        phone: c.phone,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      });

      if (!customer.hasLocationPin) {
        const calc = c.dynamicCalculations as Record<string, unknown> | undefined;
        const siteLoc = calc?.siteLocation as Record<string, unknown> | undefined;
        if (siteLoc && typeof siteLoc === "object") {
          const lat = Number(siteLoc.latitude);
          const lng = Number(siteLoc.longitude);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            customer.latitude = lat;
            customer.longitude = lng;
            customer.address = (typeof siteLoc.displayName === "string" ? siteLoc.displayName : null) || c.postalCode || customer.address;
            customer.hasLocationPin = true;
          }
        }
      }
    }

    // 4. Process Inbound Requests
    for (const inb of allInbounds) {
      const emailKey = normalizeKey(inb.email);
      const phoneKey = normalizeKey(inb.phone);
      const primaryKey = emailKey || phoneKey || inb.id;

      const customer = getOrInitCustomer(primaryKey, {
        id: inb.id,
        customerName: inb.customerName,
        email: inb.email,
        phone: inb.phone,
        createdAt: inb.createdAt,
        updatedAt: inb.updatedAt,
      });

      if (!customer.hasLocationPin && inb.payload && typeof inb.payload === "object") {
        const payload = inb.payload as Record<string, unknown>;
        const siteLoc = (payload.siteLocation || (payload.wizardAnswers as Record<string, unknown> | undefined)?.siteLocation) as Record<string, unknown> | undefined;
        if (siteLoc && typeof siteLoc === "object") {
          const lat = Number(siteLoc.latitude);
          const lng = Number(siteLoc.longitude);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            customer.latitude = lat;
            customer.longitude = lng;
            customer.address = (typeof siteLoc.displayName === "string" ? siteLoc.displayName : null) || inb.addressLine1 || customer.address;
            customer.hasLocationPin = true;
          }
        }
      }
    }

    return Array.from(customerMap.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch (error) {
    console.error("Failed to aggregate sales customers:", error);
    return [];
  }
}

/**
 * Syncs and matches local customer records with ERPNext Customer doctypes in real-time.
 */
export async function syncCustomersFromErpnext(): Promise<SyncCustomersResult> {
  try {
    const fields = encodeURIComponent(
      JSON.stringify(["name", "customer_name", "email_id", "mobile_no", "primary_address", "territory", "modified"])
    );

    // Fetch up to 100 recent ERPNext customers
    const result = await frappeRequest(
      "GET",
      `/api/resource/Customer?fields=${fields}&limit_page_length=100&order_by=modified desc`
    );

    const dataPayload = (result.data as { data?: Array<Record<string, unknown>> })?.data || (Array.isArray(result.data) ? result.data : []);

    let newMatchesCount = 0;
    let syncedCount = 0;

    for (const item of dataPayload) {
      const erpCustomerId = String(item.name || "").trim();
      const email = String(item.email_id || "").trim().toLowerCase();
      const phone = String(item.mobile_no || "").trim().replace(/\D/g, "");
      const customerName = String(item.customer_name || "").trim();

      if (!erpCustomerId) continue;
      syncedCount += 1;

      // Check if user exists in DB and update erpnextCustomerId if missing
      if (email) {
        const matchingUser = await db.query.users.findFirst({
          where: eq(users.email, email),
        });

        if (matchingUser) {
          if (!matchingUser.erpnextCustomerId) {
            await db
              .update(users)
              .set({ erpnextCustomerId: erpCustomerId, updatedAt: new Date() })
              .where(eq(users.id, matchingUser.id));
            newMatchesCount += 1;
          }

          // Also update any unlinked proposals for this user
          await db
            .update(proposals)
            .set({ erpnextCustomerId: erpCustomerId, updatedAt: new Date() })
            .where(sql`${proposals.userId} = ${matchingUser.id} AND ${proposals.erpnextCustomerId} IS NULL`);
        }
      }
    }

    revalidatePath("/admin/quotations");
    revalidatePath("/th/admin/quotations");
    revalidatePath("/en/admin/quotations");

    const totalCustomers = (await getSalesCustomers()).length;

    return {
      success: true,
      syncedCount,
      newMatchesCount,
      totalCustomers,
    };
  } catch (error) {
    console.error("Failed to sync customers from ERPNext:", error);
    return {
      success: false,
      syncedCount: 0,
      newMatchesCount: 0,
      totalCustomers: 0,
      error: error instanceof Error ? error.message : "ERPNext customer sync failed.",
    };
  }
}
