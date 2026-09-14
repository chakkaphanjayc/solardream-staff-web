"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Archive,
  Pencil,
  Layers3,
  Percent,
  Plus,
  Settings2,
  Trash2,
  Wrench,
} from "@/components/ui/icons";
import {
  archiveServiceCatalogRecord,
  archiveServiceCatalogRecords,
  deleteServiceCatalogRecord,
  deleteServiceCatalogRecords,
  upsertServiceBundle,
  upsertServiceOffering,
  upsertServicePromotion,
  upsertServiceSystemOption,
} from "@/app/actions/adminServiceCatalog";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/ui/StatusBadge";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

type Text = { en: string; th: string };
type Offering = {
  id: string;
  slug: string;
  code: string;
  name: Text;
  description: Text;
  basePrice: string;
  ratePerKwp: string;
  minimumPrice: string;
  loyaltyDiscount: string;
  externalPrice: string;
  solarDreamCustomerPrice: string;
  durationMinutes: number;
  erpItemCode: string | null;
  isActive: boolean;
};
type Option = {
  id: string;
  kind: "INVERTER_BRAND" | "ROOF_TYPE";
  code: string;
  label: Text;
  sortOrder: number;
  isActive: boolean;
};
type Bundle = {
  id: string;
  code: string;
  name: Text;
  discountBps: number;
  minimumDistinctItems: number;
  isActive: boolean;
};
type Promotion = {
  id: string;
  name: Text;
  discountType: "PERCENT_BPS" | "FIXED_SATANG";
  value: number;
  minimumSubtotalSatang: number;
  maximumDiscountSatang: number | null;
  usageLimit: number | null;
  perActorLimit: number;
  redemptionCount: number;
  isActive: boolean;
};
export type AdminData = {
  offerings: Offering[];
  options: Option[];
  bundles: Bundle[];
  bundleItems: Array<{ bundleId: string; offeringId: string }>;
  promotions: Promotion[];
  eligibility: Array<{ promotionId: string }>;
};

const tabs = [
  { id: "services", icon: Wrench, en: "Services", th: "บริการ" },
  { id: "options", icon: Settings2, en: "System options", th: "ตัวเลือกระบบ" },
  { id: "bundles", icon: Layers3, en: "Bundles", th: "แพ็กเกจ" },
  { id: "promotions", icon: Percent, en: "Promotions", th: "โปรโมชัน" },
] as const;
type Tab = (typeof tabs)[number]["id"];
const value = (form: FormData, key: string) =>
  String(form.get(key) || "").trim();
const number = (form: FormData, key: string) => Number(form.get(key) || 0);

export default function ServiceCatalogAdminClient({
  data,
}: {
  data: AdminData;
}) {
  const th = useLocale() === "th";
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("services");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [editingOffering, setEditingOffering] = useState<Offering | null>(null);
  const selectableRows = tab === "services"
    ? data.offerings.map((row) => ({ id: row.id, kind: "OFFERING" as const }))
    : tab === "options"
      ? data.options.map((row) => ({ id: row.id, kind: "OPTION" as const }))
      : tab === "bundles"
        ? data.bundles.map((row) => ({ id: row.id, kind: "BUNDLE" as const }))
        : data.promotions.map((row) => ({ id: row.id, kind: "PROMOTION" as const }));
  const selection = useAdminSelection(selectableRows.map((row) => `${row.kind}-${row.id}`));
  const showMessage = (text: string, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  };
  const run = (task: () => Promise<unknown>) =>
    startTransition(() => {
      showMessage("");
      void task()
        .then(() => {
          showMessage(th ? "บันทึกแล้ว" : "Saved");
          router.refresh();
        })
        .catch((error: unknown) =>
          showMessage(error instanceof Error ? error.message : "Failed", true),
        );
    });
  const archive = (
    kind: "OFFERING" | "OPTION" | "BUNDLE" | "PROMOTION",
    id: string,
  ) => run(() => archiveServiceCatalogRecord(kind, id));
  const remove = (
    kind: "OFFERING" | "OPTION" | "BUNDLE" | "PROMOTION",
    id: string,
    name: string,
  ) => {
    if (
      !window.confirm(
        th
          ? `ลบ ${name} แบบถาวรหรือไม่? รายการที่ถูกใช้งานในคำสั่งซื้อจะต้องเก็บถาวรแทน`
          : `Permanently delete ${name}? Items used in sales must be archived instead.`,
      )
    )
      return;
    run(() => deleteServiceCatalogRecord(kind, id));
  };
  const handleBulkArchive = () => {
    const selectedRows = selectableRows.filter((row) => selection.isSelected(`${row.kind}-${row.id}`));
    if (selectedRows.length === 0) return;
    if (
      !window.confirm(
        th
          ? `เก็บถาวรรายการที่เลือก ${selectedRows.length} รายการหรือไม่? จะนำรายการออกจากหน้าขายแต่ยังคงประวัติไว้`
          : `Archive ${selectedRows.length} selected catalog item${selectedRows.length === 1 ? "" : "s"}? They will be removed from sales while history is preserved.`,
      )
    )
      return;

    run(async () => {
      await archiveServiceCatalogRecords(selectedRows);
      selection.clear();
    });
  };
  const handleBulkDelete = () => {
    const selectedRows = selectableRows.filter((row) =>
      selection.isSelected(`${row.kind}-${row.id}`),
    );
    if (selectedRows.length === 0) return;
    if (
      !window.confirm(
        th
          ? `ลบรายการที่เลือก ${selectedRows.length} รายการแบบถาวรหรือไม่? รายการที่มีประวัติการขายจะไม่ถูกลบ`
          : `Permanently delete ${selectedRows.length} selected catalog item${selectedRows.length === 1 ? "" : "s"}? Items with sales history will be kept.`,
      )
    )
      return;

    startTransition(() => {
      showMessage("");
      void deleteServiceCatalogRecords(selectedRows)
        .then((result) => {
          const reason = result.errors[0]?.message || "Some items could not be deleted.";
          selection.clear();
          showMessage(
            result.success
              ? th
                ? `ลบ ${result.deletedCount} รายการแล้ว`
                : `${result.deletedCount} catalog item${result.deletedCount === 1 ? "" : "s"} deleted`
              : th
                ? `ลบแล้ว ${result.deletedCount} รายการ แต่ลบไม่ได้ ${result.errors.length} รายการ: ${reason}`
                : `${result.deletedCount} deleted; ${result.errors.length} could not be deleted: ${reason}`,
            !result.success,
          );
          router.refresh();
        })
        .catch((error: unknown) =>
          showMessage(error instanceof Error ? error.message : "Delete failed", true),
        );
    });
  };
  const onService = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const isActive = f.get("isActive") === "on";
    const erpItemCode = value(f, "erpItemCode");
    if (isActive && !erpItemCode) {
      showMessage(
        th
          ? "บริการที่เปิดใช้งานต้องมีรหัสสินค้า ERP"
          : "An active service requires an ERP item code.",
        true,
      );
      return;
    }
    run(() =>
      upsertServiceOffering({
        id: value(f, "id") || undefined,
        slug: value(f, "slug"),
        code: value(f, "code"),
        name: { en: value(f, "nameEn"), th: value(f, "nameTh") },
        description: {
          en: value(f, "descriptionEn"),
          th: value(f, "descriptionTh"),
        },
        basePrice: value(f, "basePrice"),
        ratePerKwp: value(f, "ratePerKwp"),
        minimumPrice: value(f, "minimumPrice"),
        loyaltyDiscount: value(f, "loyaltyDiscount"),
        externalPrice: value(f, "externalPrice"),
        solarDreamCustomerPrice: value(f, "customerPrice"),
        durationMinutes: number(f, "duration"),
        erpItemCode: erpItemCode || null,
        isActive,
      }),
    );
  };
  const onOption = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    run(() =>
      upsertServiceSystemOption({
        kind: value(f, "kind"),
        code: value(f, "code").toUpperCase(),
        label: { en: value(f, "nameEn"), th: value(f, "nameTh") },
        sortOrder: number(f, "sortOrder"),
        isActive: true,
      }),
    );
  };
  const onBundle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    run(() =>
      upsertServiceBundle({
        code: value(f, "code").toUpperCase(),
        name: { en: value(f, "nameEn"), th: value(f, "nameTh") },
        discountBps: number(f, "discountBps"),
        minimumDistinctItems: number(f, "minimum"),
        offeringIds: f.getAll("offeringIds").map(String),
        isActive: true,
      }),
    );
  };
  const onPromotion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    run(() =>
      upsertServicePromotion({
        code: value(f, "code"),
        name: { en: value(f, "nameEn"), th: value(f, "nameTh") },
        discountType: value(f, "discountType"),
        value: number(f, "value"),
        minimumSubtotalSatang: number(f, "minimumSubtotalSatang"),
        maximumDiscountSatang: value(f, "maximumDiscountSatang")
          ? number(f, "maximumDiscountSatang")
          : null,
        usageLimit: value(f, "usageLimit") ? number(f, "usageLimit") : null,
        perActorLimit: number(f, "perActorLimit"),
        eligibility: [],
        isActive: true,
      }),
    );
  };
  return (
    <main className="min-h-full bg-[#0B1121] p-4 text-[#F8FAFC] sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              SolarDream Admin
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#F8FAFC]">
              {th ? "จัดการบริการ" : "Service commerce"}
            </h1>
            <p className="mt-2 text-sm font-medium text-[#94A3B8]">
              {th
                ? "บริการ ตัวเลือกระบบ แพ็กเกจ และโปรโมชัน · เก็บถาวรเพื่อนำออกจากหน้าขาย ลบถาวรได้เมื่อยังไม่มีประวัติการขาย"
                : "Services, system options, bundles, and promotions. Archive removes an item from sales; permanent delete is available when it has no sales history."}
            </p>
          </div>
          {message ? (
            <p
              role={messageIsError ? "alert" : "status"}
              className={cn(
                "rounded-lg border px-4 py-3 text-sm font-bold",
                messageIsError
                  ? "border-rose-500/20 bg-rose-500/10 text-rose-300"
                  : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
              )}
            >
              {message}
            </p>
          ) : null}
        </div>
        <div className="mt-7 flex gap-1 overflow-x-auto border-b border-slate-800" role="tablist">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`services-tab-${item.id}`}
                aria-controls={`services-panel-${item.id}`}
                aria-selected={tab === item.id}
                onClick={() => {
                  selection.clear();
                  setTab(item.id);
                }}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-bold transition-colors",
                  tab === item.id
                    ? "border-[#B7D1EA] bg-[#B7D1EA]/10 text-[#B7D1EA]"
                    : "border-transparent text-slate-400 hover:bg-slate-800/30 hover:text-[#F8FAFC]",
                )}
              >
                <Icon className="h-4 w-4" />
                {th ? item.th : item.en}
              </button>
            );
          })}
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section
            role="tabpanel"
            id={`services-panel-${tab}`}
            aria-labelledby={`services-tab-${tab}`}
            className="overflow-hidden rounded-xl border border-slate-800 bg-[#0F172A]"
          >
            <AdminBulkActionBar
              selectedCount={selection.selectedCount}
              visibleCount={selectableRows.length}
              allVisibleSelected={selection.allVisibleSelected}
              someVisibleSelected={selection.someVisibleSelected}
              onToggleVisible={selection.toggleVisible}
              onClear={selection.clear}
              isPending={pending}
              actions={[
                {
                  id: "archive",
                  label: th ? "เก็บถาวรที่เลือก" : "Archive selected",
                  icon: Archive,
                  tone: "danger",
                  onClick: handleBulkArchive,
                },
                {
                  id: "delete",
                  label: th ? "ลบถาวรที่เลือก" : "Delete selected",
                  icon: Trash2,
                  tone: "danger",
                  onClick: handleBulkDelete,
                },
              ]}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 bg-[#0B1121] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">
                      <AdminSelectionCheckbox
                        checked={selection.allVisibleSelected}
                        indeterminate={selection.someVisibleSelected}
                        onChange={selection.toggleVisible}
                        label="Select all visible catalog items"
                      />
                    </th>
                    <th className="px-4 py-3">{th ? "ชื่อ" : "Name"}</th>
                    <th className="px-4 py-3">{th ? "รหัส" : "Code"}</th>
                    <th className="px-4 py-3">{th ? "สถานะ" : "Status"}</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {tab === "services" &&
                    data.offerings.map((row) => (
                      <Row
                        key={row.id}
                        name={th ? row.name.th : row.name.en}
                        code={row.code}
                        active={row.isActive}
                        th={th}
                        selected={selection.isSelected(`OFFERING-${row.id}`)}
                        toggleSelected={() => selection.toggle(`OFFERING-${row.id}`)}
                        edit={() => setEditingOffering(row)}
                        archive={() => archive("OFFERING", row.id)}
                        remove={() =>
                          remove("OFFERING", row.id, th ? row.name.th : row.name.en)
                        }
                      />
                    ))}
                  {tab === "options" &&
                    data.options.map((row) => (
                      <Row
                        key={row.id}
                        name={th ? row.label.th : row.label.en}
                        code={`${row.kind} · ${row.code}`}
                        active={row.isActive}
                        th={th}
                        selected={selection.isSelected(`OPTION-${row.id}`)}
                        toggleSelected={() => selection.toggle(`OPTION-${row.id}`)}
                        archive={() => archive("OPTION", row.id)}
                        remove={() =>
                          remove("OPTION", row.id, th ? row.label.th : row.label.en)
                        }
                      />
                    ))}
                  {tab === "bundles" &&
                    data.bundles.map((row) => (
                      <Row
                        key={row.id}
                        name={th ? row.name.th : row.name.en}
                        code={`${row.code} · ${row.discountBps / 100}%`}
                        active={row.isActive}
                        th={th}
                        selected={selection.isSelected(`BUNDLE-${row.id}`)}
                        toggleSelected={() => selection.toggle(`BUNDLE-${row.id}`)}
                        archive={() => archive("BUNDLE", row.id)}
                        remove={() =>
                          remove("BUNDLE", row.id, th ? row.name.th : row.name.en)
                        }
                      />
                    ))}
                  {tab === "promotions" &&
                    data.promotions.map((row) => (
                      <Row
                        key={row.id}
                        name={th ? row.name.th : row.name.en}
                        code={`${row.discountType} · ${row.redemptionCount}`}
                        active={row.isActive}
                        th={th}
                        selected={selection.isSelected(`PROMOTION-${row.id}`)}
                        toggleSelected={() => selection.toggle(`PROMOTION-${row.id}`)}
                        archive={() => archive("PROMOTION", row.id)}
                        remove={() =>
                          remove("PROMOTION", row.id, th ? row.name.th : row.name.en)
                        }
                      />
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-xl border border-slate-800 bg-[#0F172A] p-5">
            <h2 className="flex items-center gap-2 text-lg font-black text-[#F8FAFC]">
              <Plus className="h-5 w-5 text-[#B7D1EA]" />
              {editingOffering
                ? th
                  ? "แก้ไขบริการ"
                  : "Edit service"
                : th
                  ? "เพิ่มรายการ"
                  : "Add item"}
            </h2>
            {tab === "services" ? (
              <ServiceForm
                key={editingOffering?.id || "new"}
                submit={onService}
                offering={editingOffering}
              />
            ) : tab === "options" ? (
              <OptionForm submit={onOption} />
            ) : tab === "bundles" ? (
              <BundleForm submit={onBundle} offerings={data.offerings} />
            ) : (
              <PromotionForm submit={onPromotion} />
            )}
            <button
              form="catalog-form"
              disabled={pending}
              className="mt-5 min-h-12 w-full rounded-lg bg-[#B7D1EA] px-4 text-sm font-black text-[#0F172A] transition-colors hover:bg-[#99BFE3] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "…" : th ? "บันทึก" : "Save"}
            </button>
            {editingOffering ? (
              <button
                type="button"
                onClick={() => setEditingOffering(null)}
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-700 bg-[#0B1121] px-4 text-sm font-bold text-slate-300 transition-colors hover:border-[#B7D1EA] hover:text-[#F8FAFC]"
              >
                {th ? "ยกเลิกการแก้ไข" : "Cancel edit"}
              </button>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
function Row({
  name,
  code,
  active,
  archive,
  remove,
  edit,
  th,
  selected,
  toggleSelected,
}: {
  name: string;
  code: string;
  active: boolean;
  archive: () => void;
  remove: () => void;
  edit?: () => void;
  th: boolean;
  selected: boolean;
  toggleSelected: () => void;
}) {
  return (
    <tr className="transition-colors hover:bg-slate-800/30">
      <td className="px-4 py-4">
        <AdminSelectionCheckbox
          checked={selected}
          onChange={toggleSelected}
          label={`Select ${name}`}
        />
      </td>
      <td className="px-4 py-4 font-bold text-[#F8FAFC]">{name}</td>
      <td className="px-4 py-4 font-mono text-xs text-[#94A3B8]">{code}</td>
      <td className="px-4 py-4">
        <StatusBadge tone={active ? "success" : "slate"}>
          {active
            ? th
              ? "เปิดใช้งาน"
              : "Active"
            : th
              ? "เก็บถาวร"
              : "Archived"}
        </StatusBadge>
      </td>
      <td className="px-4 py-4 text-right">
        <div className="flex justify-end gap-1">
          {edit ? (
            <button
              type="button"
              onClick={edit}
              className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-[#B7D1EA]/10 hover:text-[#B7D1EA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
              aria-label={th ? "แก้ไข" : "Edit"}
            >
              <Pencil className="h-4 w-4" />
            </button>
          ) : null}
          {active ? (
            <button
              type="button"
              onClick={archive}
              className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
              aria-label={th ? "นำออกจากหน้าขาย" : "Remove from sales"}
              title={th ? "นำออกจากหน้าขาย" : "Remove from sales"}
            >
              <Archive className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={remove}
            className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
            aria-label={th ? "ลบถาวร" : "Delete permanently"}
            title={th ? "ลบถาวร" : "Delete permanently"}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
const Input = ({
  name,
  placeholder,
  type = "text",
  defaultValue,
}: {
  name: string;
  placeholder: string;
  type?: string;
  defaultValue?: string | number;
}) => (
  <label className="block space-y-1.5">
    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
      {placeholder}
    </span>
    <input
      required
      name={name}
      type={type}
      placeholder={placeholder}
      defaultValue={defaultValue}
      className="min-h-12 w-full rounded-lg border border-slate-700 bg-[#0B1121] px-3 text-sm font-medium text-[#F8FAFC] outline-none focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA]"
    />
  </label>
);
function ServiceForm({
  submit,
  offering,
}: {
  submit: (e: FormEvent<HTMLFormElement>) => void;
  offering: Offering | null;
}) {
  return (
    <form id="catalog-form" onSubmit={submit} className="mt-4 grid gap-3">
      <input type="hidden" name="id" value={offering?.id || ""} />
      <Input name="slug" placeholder="slug" defaultValue={offering?.slug} />
      <Input name="code" placeholder="Code" defaultValue={offering?.code} />
      <Input
        name="erpItemCode"
        placeholder="ERP item code"
        defaultValue={offering?.erpItemCode || ""}
      />
      <Input
        name="nameEn"
        placeholder="Name (EN)"
        defaultValue={offering?.name.en}
      />
      <Input
        name="nameTh"
        placeholder="ชื่อ (TH)"
        defaultValue={offering?.name.th}
      />
      <Input
        name="descriptionEn"
        placeholder="Description (EN)"
        defaultValue={offering?.description.en}
      />
      <Input
        name="descriptionTh"
        placeholder="คำอธิบาย (TH)"
        defaultValue={offering?.description.th}
      />
      {[
        "basePrice",
        "ratePerKwp",
        "minimumPrice",
        "loyaltyDiscount",
        "externalPrice",
        "customerPrice",
      ].map((n) => (
        <Input
          key={n}
          name={n}
          placeholder={n}
          defaultValue={
            n === "customerPrice"
              ? offering?.solarDreamCustomerPrice
              : offering?.[
                  n as
                    | "basePrice"
                    | "ratePerKwp"
                    | "minimumPrice"
                    | "loyaltyDiscount"
                    | "externalPrice"
                ]
          }
        />
      ))}
      <Input
        name="duration"
        type="number"
        placeholder="Duration minutes"
        defaultValue={offering?.durationMinutes}
      />
      <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-700 bg-[#0B1121] px-3 text-sm font-bold text-slate-300">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={offering?.isActive ?? true}
        />
        Active
      </label>
    </form>
  );
}
function OptionForm({
  submit,
}: {
  submit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form id="catalog-form" onSubmit={submit} className="mt-4 grid gap-3">
      <label className="block space-y-1.5">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Option type</span>
        <select name="kind" className="min-h-12 w-full rounded-lg border border-slate-700 bg-[#0B1121] px-3 font-semibold text-[#F8FAFC] outline-none focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA]">
          <option value="INVERTER_BRAND">Inverter brand</option>
          <option value="ROOF_TYPE">Roof type</option>
        </select>
      </label>
      <Input name="code" placeholder="Code" />
      <Input name="nameEn" placeholder="Label (EN)" />
      <Input name="nameTh" placeholder="ป้ายกำกับ (TH)" />
      <Input name="sortOrder" type="number" placeholder="Sort order" />
    </form>
  );
}
function BundleForm({
  submit,
  offerings,
}: {
  submit: (e: FormEvent<HTMLFormElement>) => void;
  offerings: Offering[];
}) {
  return (
    <form id="catalog-form" onSubmit={submit} className="mt-4 grid gap-3">
      <Input name="code" placeholder="Code" />
      <Input name="nameEn" placeholder="Name (EN)" />
      <Input name="nameTh" placeholder="ชื่อ (TH)" />
      <Input
        name="discountBps"
        type="number"
        placeholder="Discount basis points"
      />
      <Input name="minimum" type="number" placeholder="Minimum items" />
      <fieldset className="space-y-2 rounded-lg border border-slate-700 bg-[#0B1121] p-3">
        {offerings.map((o) => (
          <label key={o.id} className="flex gap-2 text-sm font-semibold text-slate-300">
            <input type="checkbox" name="offeringIds" value={o.id} />
            {o.name.en}
          </label>
        ))}
      </fieldset>
    </form>
  );
}
function PromotionForm({
  submit,
}: {
  submit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form id="catalog-form" onSubmit={submit} className="mt-4 grid gap-3">
      <Input name="code" placeholder="Private code" />
      <Input name="nameEn" placeholder="Name (EN)" />
      <Input name="nameTh" placeholder="ชื่อ (TH)" />
      <label className="block space-y-1.5">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Discount type</span>
        <select name="discountType" className="min-h-12 w-full rounded-lg border border-slate-700 bg-[#0B1121] px-3 font-semibold text-[#F8FAFC] outline-none focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA]">
          <option value="PERCENT_BPS">Percent (bps)</option>
          <option value="FIXED_SATANG">Fixed (satang)</option>
        </select>
      </label>
      <Input name="value" type="number" placeholder="Value" />
      <Input
        name="minimumSubtotalSatang"
        type="number"
        placeholder="Minimum subtotal (satang)"
      />
      <Input
        name="maximumDiscountSatang"
        type="number"
        placeholder="Maximum discount (optional)"
      />
      <Input
        name="usageLimit"
        type="number"
        placeholder="Usage limit (optional)"
      />
      <Input
        name="perActorLimit"
        type="number"
        placeholder="Per-customer limit"
      />
    </form>
  );
}
