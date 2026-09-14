"use client";

import React, { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Shield,
  Award,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Key,
  Search,
  CheckCircle2,
  Ban,
} from "@/components/ui/icons";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
} from "@/components/ui/sheet";
import ProgressiveImage from "@/components/ui/progressive-image";
import Combobox from "@/components/ui/combobox";
import { toggleUsersStatus, upsertUserAccount, toggleUserStatus, deleteUserAccount } from "@/app/actions/users";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import { toast } from "sonner";
import { GsapReveal, GsapSpinner } from "@/components/ui/GsapMotion";

interface DbUser {
  id: string;
  email: string;
  name: string | null;
  fullName: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  role: string;
  department: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  createdAt: string | Date;
  isActive: boolean;
}

interface AdminUsersClientProps {
  initialUsers: DbUser[];
}

const ROLES = [
  { label: "Super Admin", value: "SUPER_ADMIN" },
  { label: "Manager", value: "MANAGER" },
  { label: "Staff", value: "STAFF" },
  { label: "Installer", value: "INSTALLER" },
];

const DEPARTMENTS = [
  { label: "Sales", value: "SALES" },
  { label: "Accounting", value: "ACCOUNTING" },
  { label: "Engineering", value: "ENGINEERING" },
  { label: "Warehouse", value: "WAREHOUSE" },
  { label: "Project Team", value: "PROJECT_TEAM" },
];

const ROLE_FILTER_OPTIONS = [
  { label: "All Roles", value: "ALL" },
  ...ROLES,
];

const DEPARTMENT_FILTER_OPTIONS = [
  { label: "All Departments", value: "ALL" },
  ...DEPARTMENTS,
  { label: "None / Admin", value: "NONE" },
];

const STATUS_FILTER_OPTIONS = [
  { label: "All Statuses", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];

export default function AdminUsersClient({ initialUsers }: AdminUsersClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // State for user selection
  const [isOpen, setIsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DbUser | null>(null);

  // Form State
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("STAFF");
  const [department, setDepartment] = useState("NONE");
  const [tempPassword, setTempPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Filtering Logic
  const filteredUsers = useMemo(() => {
    return initialUsers.filter((user) => {
      // 1. Search Query
      const searchLower = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !searchLower ||
        (user.fullName || "").toLowerCase().includes(searchLower) ||
        (user.name || "").toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower);

      // 2. Role Filter
      const matchesRole =
        roleFilter === "ALL" || user.role === roleFilter;

      // 3. Department Filter
      const matchesDepartment =
        departmentFilter === "ALL" || user.department === departmentFilter;

      // 4. Status Filter
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && user.isActive) ||
        (statusFilter === "INACTIVE" && !user.isActive);

      return matchesSearch && matchesRole && matchesDepartment && matchesStatus;
    });
  }, [initialUsers, searchQuery, roleFilter, departmentFilter, statusFilter]);
  const selection = useAdminSelection(filteredUsers.map((user) => user.id));

  const activeFilterCount = useMemo(() => {
    return [
      searchQuery !== "",
      roleFilter !== "ALL",
      departmentFilter !== "ALL",
      statusFilter !== "ALL",
    ].filter(Boolean).length;
  }, [searchQuery, roleFilter, departmentFilter, statusFilter]);

  const handleClearFilters = () => {
    setSearchQuery("");
    setRoleFilter("ALL");
    setDepartmentFilter("ALL");
    setStatusFilter("ALL");
  };

  const handleOpenCreate = () => {
    setSelectedUser(null);
    setFullName("");
    setEmail("");
    setRole("STAFF");
    setDepartment("SALES"); // default department for staff
    setTempPassword("");
    setErrorMessage(null);
    setIsOpen(true);
  };

  const handleOpenEdit = (user: DbUser) => {
    setSelectedUser(user);
    setFullName(user.fullName || user.name || "");
    setEmail(user.email);
    setRole(user.role);
    setDepartment(user.department);
    setTempPassword(""); // Leave password blank on edit unless updating
    setErrorMessage(null);
    setIsOpen(true);
  };

  const handleGeneratePassword = () => {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let pwd = "";
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setTempPassword(pwd);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!fullName.trim() || !email.trim()) {
      setErrorMessage("Full name and email are required.");
      return;
    }

    const finalRole = role;
    const finalDepartment = finalRole === "SUPER_ADMIN" ? "NONE" : department;

    if (finalRole !== "SUPER_ADMIN" && finalDepartment === "NONE") {
      setErrorMessage("Please select a department for this role.");
      return;
    }

    // Temporary password check for new accounts
    if (!selectedUser && (!tempPassword || tempPassword.trim() === "")) {
      setErrorMessage("Please set a temporary password for the new account.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await upsertUserAccount({
          id: selectedUser?.id,
          email,
          fullName,
          role: finalRole,
          department: finalDepartment,
          password: tempPassword || undefined,
        });

        if (res.error) {
          setErrorMessage(res.error);
        } else {
          toast.success(selectedUser ? "User account updated successfully." : "User account created successfully.");
          setIsOpen(false);
          router.refresh();
        }
      } catch (error) {
        console.error("User account save error:", error);
        setErrorMessage("Could not save the user account. Please try again.");
      }
    });
  };

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    startTransition(async () => {
      try {
        const res = await toggleUserStatus(userId, !currentStatus);
        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success(`User is now ${!currentStatus ? "active" : "inactive"}.`);
          router.refresh();
        }
      } catch (error) {
        console.error("User status update error:", error);
        toast.error("Could not update the user status. Please try again.");
      }
    });
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm("Are you sure you want to delete this user account? This action cannot be undone.")) {
      startTransition(async () => {
        try {
          const res = await deleteUserAccount(userId);
          if (res.error) {
            toast.error(res.error);
          } else {
            toast.success("User account deleted successfully.");
            router.refresh();
          }
        } catch (error) {
          console.error("User account delete error:", error);
          toast.error("Could not delete the user account. Please try again.");
        }
      });
    }
  };

  const handleBulkStatusChange = (isActive: boolean) => {
    if (selection.selectedCount === 0) return;
    startTransition(async () => {
      try {
        const result = await toggleUsersStatus(selection.selectedIds, isActive);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(`${result.count} user account(s) ${isActive ? "activated" : "deactivated"}.`);
        selection.clear();
        router.refresh();
      } catch (error) {
        console.error("Bulk user status update error:", error);
        toast.error("Could not update the selected user accounts. Please try again.");
      }
    });
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case "SUPER_ADMIN":
      case "ADMIN":
      case "MANAGER":
        return "bg-[#2C486A] text-white border-transparent";
      case "STAFF":
        return "bg-[#B7D1EA] text-gray-100 border-[#B7D1EA]/25";
      case "INSTALLER":
        return "bg-[#F1D6B8] text-gray-100 border-[#F1D6B8]/25";
      default:
        return "bg-[#0B1121] text-gray-300 border-[#1E293B]";
    }
  };

  return (
    <GsapReveal className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-gray-100 font-sans uppercase">
            User <span className="text-[#2C486A]">Accounts</span>
          </h1>
          <p className="text-gray-400 text-xs mt-1 uppercase font-black tracking-widest">
            Audit register records, update roles, and track acquisition campaigns.
          </p>
        </div>
        <div className="flex items-center gap-4 self-start sm:self-auto">
          <div className="flex items-center gap-2.5 bg-[#0F172A] border border-[#1E293B] px-4 py-2.5 rounded-2xl text-[10px] font-mono font-black uppercase text-gray-400 shadow-xs">
            <Award className="w-4 h-4 text-[#2C486A]" />
            <span>{filteredUsers.length} of {initialUsers.length} Users</span>
          </div>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-5 py-3 bg-[#B7D1EA] hover:bg-[#B7D1EA]/80 text-[#2C486A] text-xs font-black uppercase tracking-wider rounded-2xl transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Create New Account
          </button>
        </div>
      </div>

      {/* Horizontal Filter Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 w-full bg-[#0F172A]/50 border border-[#1E293B] p-4 rounded-2xl mb-4">
        {/* Search Field */}
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-11 pr-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-2xl focus:outline-none focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20 text-sm font-semibold transition-all placeholder:text-gray-500 text-gray-100"
          />
        </div>

        {/* Filters Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
          <Combobox
            options={ROLE_FILTER_OPTIONS}
            value={roleFilter}
            onSelect={(val) => setRoleFilter(val)}
            placeholder="Filter Role"
            buttonLabel={ROLE_FILTER_OPTIONS.find((o) => o.value === roleFilter)?.label}
            className="w-full sm:w-48"
          />

          <Combobox
            options={DEPARTMENT_FILTER_OPTIONS}
            value={departmentFilter}
            onSelect={(val) => setDepartmentFilter(val)}
            placeholder="Filter Dept"
            buttonLabel={DEPARTMENT_FILTER_OPTIONS.find((o) => o.value === departmentFilter)?.label}
            className="w-full sm:w-48"
          />

          <Combobox
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onSelect={(val) => setStatusFilter(val)}
            placeholder="Filter Status"
            buttonLabel={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label}
            className="w-full sm:w-40"
          />
        </div>

        {/* Clear Action */}
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="rounded-2xl border border-[#1E293B] bg-[#0B1121] px-4 py-3 text-xs font-black uppercase tracking-wider text-gray-400 transition hover:border-slate-350 hover:bg-[#0B1121] hover:text-gray-100 cursor-pointer text-center md:ml-auto"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Users Table / Grid Layout */}
      {filteredUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 text-center border-2 border-dashed border-[#1E293B] rounded-2xl bg-[#0F172A]/60 backdrop-blur-sm shadow-none">
          <div className="w-16 h-16 bg-[#B7D1EA]/15 border border-[#B7D1EA]/30 rounded-full flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-[#2C486A]" />
          </div>
          <h3 className="text-lg font-bold text-gray-100 mb-1">No user accounts found</h3>
          <p className="text-sm text-gray-400 max-w-sm mb-6">
            We couldn't find any users matching your search terms or filter criteria. Try adjusting your settings.
          </p>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="px-5 py-2.5 bg-[#B7D1EA] hover:bg-[#B7D1EA]/80 text-[#2C486A] text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-xs border border-transparent"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <AdminBulkActionBar
            selectedCount={selection.selectedCount}
            visibleCount={filteredUsers.length}
            allVisibleSelected={selection.allVisibleSelected}
            someVisibleSelected={selection.someVisibleSelected}
            onToggleVisible={selection.toggleVisible}
            onClear={selection.clear}
            isPending={isPending}
            actions={[
              {
                id: "activate",
                label: "Activate",
                icon: CheckCircle2,
                tone: "success",
                onClick: () => handleBulkStatusChange(true),
              },
              {
                id: "deactivate",
                label: "Deactivate",
                icon: Ban,
                tone: "warning",
                onClick: () => handleBulkStatusChange(false),
              },
            ]}
          />
          <div className="bg-[#0F172A]/60 backdrop-blur-sm border border-[#1E293B] rounded-2xl overflow-hidden shadow-none">
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] bg-[#0B1121]/70 text-[9px] uppercase tracking-widest text-gray-500 font-black">
                  <th className="w-14 px-6 py-4">
                    <AdminSelectionCheckbox
                      checked={selection.allVisibleSelected}
                      indeterminate={selection.someVisibleSelected}
                      disabled={filteredUsers.length === 0 || isPending}
                      label="Select all visible users"
                      onChange={selection.toggleVisible}
                    />
                  </th>
                  <th className="px-6 py-4">User Profile</th>
                  <th className="px-6 py-4">System Role</th>
                  <th className="px-6 py-4">Department</th>
                  <th className="px-6 py-4">Campaign Source</th>
                  <th className="px-6 py-4">Registered</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-[#0B1121]/30 transition-colors group">
                    <td className="px-6 py-4">
                      <AdminSelectionCheckbox
                        checked={selection.isSelected(user.id)}
                        disabled={isPending}
                        label={`Select user ${user.email}`}
                        onChange={() => selection.toggle(user.id)}
                      />
                    </td>
                    {/* Profile */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {user.avatarUrl && user.avatarUrl.trim() !== "" ? (
                          <div className="relative w-10 h-10 overflow-hidden rounded-full border border-[#1E293B] shadow-none shrink-0">
                            <ProgressiveImage
                              src={user.avatarUrl}
                              alt={user.fullName || user.name || user.email}
                              fill
                              sizes="40px"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <GsapReveal className="w-10 h-10 rounded-full bg-[#B7D1EA]/25 border border-[#B7D1EA]/40 flex items-center justify-center font-black text-xs text-[#2C486A] shrink-0">
                            {(user.fullName || user.name || user.email).charAt(0).toUpperCase()}
                          </GsapReveal>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-gray-100 truncate">
                            {user.fullName || user.name || "Unnamed User"}
                          </p>
                          <p className="text-[10px] text-gray-500 font-mono font-bold uppercase truncate">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Role Badge */}
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 w-fit border ${getRoleBadgeClass(
                          user.role
                        )}`}
                      >
                        <Shield className="w-3.5 h-3.5" />
                        {user.role.replace("_", " ")}
                      </span>
                    </td>

                    {/* Department Badge */}
                    <td className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wide">
                      {user.department !== "NONE" ? (
                        <span className="px-2 py-0.5 rounded bg-[#0B1121]/80 border border-[#1E293B]/60 text-gray-400">
                          {user.department.replace("_", " ")}
                        </span>
                      ) : (
                        <span className="text-gray-500 italic font-semibold">N/A</span>
                      )}
                    </td>

                    {/* Campaign Info */}
                    <td className="px-6 py-4">
                      {user.utm_source ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-900 text-[10px] font-black border border-amber-250 uppercase tracking-wider">
                              {user.utm_source}
                            </span>
                            {user.utm_medium && (
                              <span className="px-1.5 py-0.5 rounded bg-[#0B1121] text-gray-300 text-[10px] border border-[#1E293B]">
                                {user.utm_medium}
                              </span>
                            )}
                          </div>
                          {user.utm_campaign && (
                            <p className="text-[9px] text-gray-500 font-mono font-bold uppercase pl-0.5 truncate max-w-[200px]">
                              Campaign: {user.utm_campaign}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500 font-semibold italic">Direct / Organic</span>
                      )}
                    </td>

                    {/* Registered Date */}
                    <td className="px-6 py-4 text-xs font-mono font-bold text-gray-400">
                      {new Date(user.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>

                    {/* Active/Inactive Switch Toggle */}
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(user.id, user.isActive)}
                        disabled={isPending}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] focus:ring-offset-2 ${
                          user.isActive ? "bg-emerald-500" : "bg-[#1E293B]"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[#0F172A] shadow ring-0 transition duration-200 ease-in-out ${
                            user.isActive ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </td>

                    {/* Action buttons */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenEdit(user)}
                          className="p-2 rounded-xl text-gray-500 hover:text-[#2C486A] hover:bg-[#0B1121] transition-all cursor-pointer"
                          title="Edit User"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-2 rounded-xl text-gray-400 hover:text-rose-700 hover:bg-[#0B1121] transition-all cursor-pointer"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* Slide-out Sheet */}
      <Sheet isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <SheetContent className="flex flex-col h-full bg-[#F8FAFC]">
          <form onSubmit={handleSubmit} className="flex flex-col h-full">
            <SheetHeader onClose={() => setIsOpen(false)}>
              <SheetTitle>
                {selectedUser ? "Edit User Account" : "Create User Account"}
              </SheetTitle>
              <SheetDescription>
                {selectedUser
                  ? `Updating profile and role credentials for ${selectedUser.email}`
                  : "Provision access credentials and department assignment"}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Full Name */}
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-500 uppercase tracking-wider">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  required
                  className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-2xl focus:ring-2 focus:ring-[#B7D1EA] outline-none text-sm font-semibold transition-all"
                />
              </div>

              {/* Email Address */}
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-500 uppercase tracking-wider">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john.doe@company.com"
                  required
                  disabled={!!selectedUser} // Lock email edits for safety
                  className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-2xl focus:ring-2 focus:ring-[#B7D1EA] outline-none text-sm font-semibold transition-all disabled:bg-[#0B1121] disabled:text-gray-400"
                />
              </div>

              {/* Role Selection */}
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-500 uppercase tracking-wider">
                  Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-2xl focus:ring-2 focus:ring-[#B7D1EA] outline-none text-sm font-semibold transition-all"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Department Selection (Conditionally rendered/disabled if role is Super Admin) */}
              {role !== "SUPER_ADMIN" && (
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-wider">
                    Department
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-2xl focus:ring-2 focus:ring-[#B7D1EA] outline-none text-sm font-semibold transition-all"
                  >
                    <option value="NONE">Select Department...</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Temporary Password Section */}
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-500 uppercase tracking-wider flex justify-between items-center">
                  <span>
                    {selectedUser ? "Update Password (Optional)" : "Temporary Password"}
                  </span>
                  {!selectedUser && (
                    <span className="text-[10px] text-gray-500 font-semibold font-mono">Required</span>
                  )}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                      placeholder={selectedUser ? "Leave blank to keep current" : "temporary-pwd-123"}
                      required={!selectedUser}
                      className="w-full pl-10 pr-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-2xl focus:ring-2 focus:ring-[#B7D1EA] outline-none text-sm font-semibold transition-all font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="px-4 py-3 bg-[#0B1121] hover:bg-[#1E293B] text-gray-400 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 border border-[#1E293B] cursor-pointer shrink-0"
                    title="Generate Password"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Generate
                  </button>
                </div>
              </div>

              {errorMessage && (
                <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-100 rounded-xl p-3">
                  {errorMessage}
                </p>
              )}
            </SheetBody>

            <SheetFooter>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 py-3 text-xs font-black uppercase tracking-wider text-gray-400 hover:bg-[#0B1121] border border-[#1E293B] rounded-2xl transition-all cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 bg-[#B7D1EA] hover:bg-[#B7D1EA]/80 disabled:bg-[#1E293B] text-[#2C486A] disabled:text-gray-500 py-3 rounded-2xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {isPending && <GsapSpinner className="w-4 h-4" />}
                {selectedUser ? "Save Changes" : "Create Account"}
              </button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </GsapReveal>
  );
}
