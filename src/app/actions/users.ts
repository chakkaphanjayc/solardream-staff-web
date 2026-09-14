"use server";

import { db } from "@/db";
import { users, activityLogs } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";

const ACCOUNT_ROLES = ["SUPER_ADMIN", "MANAGER", "STAFF", "INSTALLER"] as const;
const DEPARTMENTS = ["SALES", "ACCOUNTING", "ENGINEERING", "WAREHOUSE", "PROJECT_TEAM", "NONE"] as const;

type AccountRole = (typeof ACCOUNT_ROLES)[number];
type Department = (typeof DEPARTMENTS)[number];

const userAccountInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  email: z.string().trim().email().max(320),
  fullName: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(40),
  department: z.string().trim().min(1).max(40),
  password: z.string().max(200).optional(),
});

function normalizeAccountRole(role: string): AccountRole | null {
  const normalized = role.toUpperCase();
  return ACCOUNT_ROLES.includes(normalized as AccountRole) ? normalized as AccountRole : null;
}

function normalizeDepartment(department: string): Department | null {
  const normalized = department.toUpperCase();
  return DEPARTMENTS.includes(normalized as Department) ? normalized as Department : null;
}

export async function upsertUserAccount(data: {
  id?: string;
  email: string;
  fullName: string;
  role: string;
  department: string;
  password?: string;
}) {
  try {
    const currentAdmin = await requireAdmin();
    const parsedInput = userAccountInputSchema.safeParse(data);
    if (!parsedInput.success) return { error: "Please provide a valid name, email, role, and department." };
    const input = parsedInput.data;

    const roleUpper = normalizeAccountRole(input.role);
    const departmentUpper = normalizeDepartment(input.department);

    // Validations
    if (!roleUpper) {
      return { error: "Invalid role selected." };
    }
    if (!departmentUpper) {
      return { error: "Invalid department selected." };
    }
    if (roleUpper !== "SUPER_ADMIN" && departmentUpper === "NONE") {
      return { error: "Department is required for this role." };
    }

    if (input.id) {
      const existingUser = await db.query.users.findFirst({
        where: eq(users.id, input.id),
      });
      if (!existingUser) {
        return { error: "User account not found." };
      }

      // Editing
      const updateData: {
        email: string;
        fullName: string;
        name: string;
        role: AccountRole;
        department: Department;
        updatedAt: Date;
        passwordHash?: string;
      } = {
        email: input.email,
        fullName: input.fullName,
        name: input.fullName,
        role: roleUpper,
        department: departmentUpper,
        updatedAt: new Date(),
      };

      if (input.password && input.password.trim() !== "") {
        const salt = await bcrypt.genSalt(10);
        updateData.passwordHash = await bcrypt.hash(input.password, salt);
      }

      const [updatedUser] = await db.update(users).set(updateData).where(eq(users.id, input.id)).returning({ id: users.id });
      if (!updatedUser) return { error: "User account no longer exists. Refresh the page and try again." };

      // Audit Log
      const roleChanged = existingUser.role !== roleUpper;
      await db.insert(activityLogs).values({
        entityId: input.id,
        entityType: "USER_ACCOUNT",
        action: roleChanged ? "ROLE_CHANGED" : "ACCOUNT_UPDATED",
        description: roleChanged
          ? `Changed account role for ${input.email} from ${existingUser.role} to ${roleUpper}`
          : `Updated account details for ${input.email} (${roleUpper})`,
        userId: currentAdmin.id,
      });

      revalidatePath("/admin/users");
      return { success: true, userId: input.id };
    } else {
      // Creating
      if (!input.password || input.password.trim() === "") {
        return { error: "Password is required for new accounts." };
      }

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: {
          full_name: input.fullName,
          role: roleUpper,
        },
      });

      if (authError) {
        console.error("Failed to create Supabase Auth user:", authError.message);
        return { error: "Failed to create user account." };
      }

      if (!authData.user?.id) {
        return { error: "Supabase did not return a user ID." };
      }

      const authUserId = authData.user.id;

      try {
        const [newUser] = await db.transaction(async (tx) => {
          const [createdUser] = await tx
            .insert(users)
            .values({
              id: authUserId,
              email: input.email,
              fullName: input.fullName,
              name: input.fullName,
              role: roleUpper,
              department: departmentUpper,
            })
            .returning();
          if (!createdUser) throw new Error("User account could not be created.");

          await tx.insert(activityLogs).values({
            entityId: createdUser.id,
            entityType: "USER_ACCOUNT",
            action: "ACCOUNT_CREATED",
            description: `Created new ${roleUpper} account for ${input.email}`,
            userId: currentAdmin.id,
          });

          return [createdUser];
        });

        revalidatePath("/admin/users");
        return { success: true, userId: newUser.id };
      } catch (dbError) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(authUserId);
        } catch (rollbackError) {
          console.error("Failed to rollback Supabase Auth user:", rollbackError);
        }
        throw dbError;
      }
    }
  } catch (error: unknown) {
    console.error("Failed to upsert user account:", error);
    return { error: "Failed to upsert user account." };
  }
}

/**
 * Toggles a user's active status (isActive).
 */
export async function toggleUserStatus(userId: string, isActive: boolean) {
  try {
    const currentAdmin = await requireAdmin();
    const normalizedUserId = userId.trim();

    if (!normalizedUserId) {
      return { error: "User ID is required." };
    }
    if (typeof isActive !== "boolean") return { error: "User status is invalid." };
    if (normalizedUserId === currentAdmin.id && !isActive) {
      return { error: "You cannot deactivate your own account." };
    }

    const [updated] = await db.update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, normalizedUserId))
      .returning({ id: users.id });
    if (!updated) return { error: "User account not found." };

    // Audit Log
    await db.insert(activityLogs).values({
      entityId: normalizedUserId,
      entityType: "USER_ACCOUNT",
      action: "STATUS_CHANGED",
      description: `Changed active status of user ${normalizedUserId} to ${isActive ? "ACTIVE" : "INACTIVE"}`,
      userId: currentAdmin.id,
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to toggle user status:", error);
    return { error: "Failed to toggle user status." };
  }
}

export async function toggleUsersStatus(userIds: string[], isActive: boolean) {
  try {
    const currentAdmin = await requireAdmin();
    if (!Array.isArray(userIds) || typeof isActive !== "boolean") return { error: "Invalid user status update." };
    const cleanIds = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
    if (cleanIds.length === 0) return { error: "No users selected." };
    if (cleanIds.length > 100) return { error: "Select no more than 100 users at a time." };

    const safeIds = isActive
      ? cleanIds
      : cleanIds.filter((id) => id !== currentAdmin.id);
    if (safeIds.length === 0) return { error: "You cannot deactivate your own account." };

    const updated = await db
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(inArray(users.id, safeIds))
      .returning({ id: users.id });
    if (updated.length === 0) return { error: "The selected user accounts no longer exist." };

    await db.insert(activityLogs).values(
      updated.map(({ id }) => ({
        entityId: id,
        entityType: "USER_ACCOUNT",
        action: "STATUS_CHANGED",
        description: `Changed active status of user ${id} to ${isActive ? "ACTIVE" : "INACTIVE"}`,
        userId: currentAdmin.id,
      })),
    );

    revalidatePath("/admin/users");
    return { success: true, count: updated.length };
  } catch (error: unknown) {
    console.error("Failed to toggle user statuses:", error);
    return { error: "Failed to update selected users." };
  }
}

/**
 * Deletes a user account from the database.
 */
export async function deleteUserAccount(userId: string) {
  try {
    const currentAdmin = await requireAdmin();
    const normalizedUserId = userId.trim();

    if (!normalizedUserId) {
      return { error: "User ID is required." };
    }
    if (normalizedUserId === currentAdmin.id) {
      return { error: "You cannot delete your own account." };
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, normalizedUserId),
    });

    if (!user) {
      return { error: "User account not found." };
    }

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(normalizedUserId);
    if (authDeleteError) {
      console.error("Failed to delete Supabase Auth user:", authDeleteError.message);
      return { error: "Failed to delete user account." };
    }

    const [deleted] = await db.delete(users).where(eq(users.id, normalizedUserId)).returning({ id: users.id });
    if (!deleted) return { error: "User account no longer exists." };

    // Audit Log
    await db.insert(activityLogs).values({
      entityId: normalizedUserId,
      entityType: "USER_ACCOUNT",
      action: "ACCOUNT_DELETED",
      description: `Deleted account for ${user.email}`,
      userId: currentAdmin.id,
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to delete user account:", error);
    return { error: "Failed to delete user account." };
  }
}
