"use server";

import { db } from "@/db";
import { contactLinks } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { checkAdmin } from "./auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { locales } from "@/i18n/locales";

const contactLinkSchema = z.object({
  platform: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(1000),
  label: z.string().trim().max(180).optional(),
  icon: z.string().trim().max(80).optional(),
  displayOrder: z.number().finite().int().min(-100000).max(100000).optional(),
  isActive: z.boolean().optional(),
});
const contactLinkIdSchema = z.string().trim().min(1).max(200);

function revalidateContactSurfaces() {
  revalidatePath("/", "layout");
  for (const locale of locales) {
    revalidatePath(`/${locale}`);
    revalidatePath(`/${locale}/admin/settings/contact`);
  }
}

export async function getContactLinks(onlyActive = false) {
  return db.select()
    .from(contactLinks)
    .where(onlyActive ? eq(contactLinks.isActive, true) : undefined)
    .orderBy(asc(contactLinks.displayOrder));
}

export async function createContactLink(data: {
  platform: string;
  value: string;
  label?: string;
  icon?: string;
  displayOrder?: number;
  isActive?: boolean;
}) {
  await checkAdmin();
  const parsed = contactLinkSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || "Invalid contact link." };

  const [link] = await db.insert(contactLinks)
    .values({
      platform: parsed.data.platform,
      value: parsed.data.value,
      label: parsed.data.label || null,
      icon: parsed.data.icon || null,
      displayOrder: parsed.data.displayOrder ?? 0,
      isActive: parsed.data.isActive ?? true
    })
    .returning();

  if (!link) return { success: false, error: "Contact link could not be created." };
  revalidateContactSurfaces();
  return { success: true, link };
}

export async function updateContactLink(
  id: string,
  data: {
    platform?: string;
    value?: string;
    label?: string;
    icon?: string;
    displayOrder?: number;
    isActive?: boolean;
  }
) {
  await checkAdmin();
  const parsedId = contactLinkIdSchema.safeParse(id);
  if (!parsedId.success) return { success: false, error: "Contact link was not found." };
  const parsed = contactLinkSchema.partial().safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || "Invalid contact link." };

  const [link] = await db.update(contactLinks)
    .set({
      platform: parsed.data.platform,
      value: parsed.data.value,
      label: parsed.data.label !== undefined ? parsed.data.label || null : undefined,
      icon: parsed.data.icon !== undefined ? parsed.data.icon || null : undefined,
      displayOrder: parsed.data.displayOrder,
      isActive: parsed.data.isActive
    })
    .where(eq(contactLinks.id, parsedId.data))
    .returning();

  if (!link) return { success: false, error: "Contact link was not found." };
  revalidateContactSurfaces();
  return { success: true, link };
}

export async function toggleContactLinkStatus(id: string, newStatus: boolean) {
  await checkAdmin();
  const parsedId = contactLinkIdSchema.safeParse(id);
  if (!parsedId.success || typeof newStatus !== "boolean") return { success: false, error: "Invalid contact link status." };

  const [link] = await db.update(contactLinks)
    .set({ isActive: newStatus })
    .where(eq(contactLinks.id, parsedId.data))
    .returning();

  if (!link) return { success: false, error: "Contact link was not found." };
  revalidateContactSurfaces();
  return { success: true, link };
}

export async function deleteContactLink(id: string) {
  await checkAdmin();
  const parsedId = contactLinkIdSchema.safeParse(id);
  if (!parsedId.success) return { success: false, error: "Contact link was not found." };

  const [deleted] = await db.delete(contactLinks)
    .where(eq(contactLinks.id, parsedId.data))
    .returning({ id: contactLinks.id });
  if (!deleted) return { success: false, error: "Contact link was not found." };

  revalidateContactSurfaces();
  return { success: true };
}
