"use client";

import { useMemo, useState } from "react";
import { Calendar, PackagePlus, Search, ShieldCheck, Trash2, User, Sparkles } from "@/components/ui/icons";
import {
  createPurchasedProduct,
  deletePurchasedProduct,
  deletePurchasedProducts,
  createAssetRegistration,
  deleteAssetRegistration,
  deleteAssetRegistrations,
} from "@/app/actions/assets";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { getWarrantyState } from "@/lib/warranty";
import { cn } from "@/lib/utils";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import { useAdminSelection } from "@/hooks/useAdminSelection";

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  phoneNumber: string | null;
}

interface ProductOption {
  id: string;
  brand: string;
  model: string;
  price: number;
  imageUrl: string;
  category?: { id: string; name: string } | null;
}

interface PurchasedAsset {
  id: string;
  userId: string;
  productId: string;
  serialNumber: string;
  purchaseDate: Date | string;
  warrantyDays: number;
  createdAt: Date | string;
  user: UserOption;
  product: ProductOption;
}

interface AssetRegistrationType {
  id: string;
  userId: string;
  productName: string;
  serialNumber: string;
  purchaseDate: Date | string;
  warrantyMonths: number;
  status: string;
  createdAt: Date | string;
  user: UserOption;
}

interface AssetsClientProps {
  initialAssets: PurchasedAsset[];
  initialRegistrations: AssetRegistrationType[];
  users: UserOption[];
  products: ProductOption[];
  initialError?: string;
}

function productLabel(product: ProductOption) {
  return `${product.brand} ${product.model}`.trim();
}

function calculateRemainingDays(purchaseDate: Date | string, warrantyMonths: number) {
  const purchase = new Date(purchaseDate);
  const expiry = new Date(purchase);
  expiry.setMonth(expiry.getMonth() + warrantyMonths);
  const diffTime = expiry.getTime() - new Date().getTime();
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

function getActionError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AssetsClient({
  initialAssets,
  initialRegistrations,
  users,
  products,
  initialError = "",
}: AssetsClientProps) {
  const [assets, setAssets] = useState(initialAssets);
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [activeTab, setActiveTab] = useState<"purchased" | "registered">("purchased");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState(initialError);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // States for PurchasedProduct Form
  const [userId, setUserId] = useState(users[0]?.id || "");
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [serialNumber, setSerialNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [warrantyDays, setWarrantyDays] = useState("365");

  // States for AssetRegistration Form
  const [regUserId, setRegUserId] = useState(users[0]?.id || "");
  const [productName, setProductName] = useState("");
  const [regSerialNumber, setRegSerialNumber] = useState("");
  const [regPurchaseDate, setRegPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [warrantyMonths, setWarrantyMonths] = useState("12");

  const filteredAssets = useMemo(() => {
    const needle = query.toLowerCase().trim();
    if (!needle) return assets;
    return assets.filter((asset) =>
      [
        asset.serialNumber,
        asset.user.name,
        asset.user.email,
        productLabel(asset.product),
        asset.product.category?.name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [assets, query]);

  const filteredRegistrations = useMemo(() => {
    const needle = query.toLowerCase().trim();
    if (!needle) return registrations;
    return registrations.filter((reg) =>
      [reg.serialNumber, reg.user.name, reg.user.email, reg.productName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [registrations, query]);
  const purchasedSelection = useAdminSelection(filteredAssets.map((asset) => asset.id));
  const registrationSelection = useAdminSelection(filteredRegistrations.map((registration) => registration.id));

  const handleBulkDeletePurchased = async () => {
    if (purchasedSelection.selectedCount === 0) return;
    if (!window.confirm(`Delete ${purchasedSelection.selectedCount} selected purchased asset(s)?`)) return;

    setBusyAction("bulk-purchased");
    try {
      const ids = purchasedSelection.selectedIds;
      const result = await deletePurchasedProducts(ids);
      if (result.error) {
        setMessage(`Error: ${result.error}`);
      } else {
        setAssets((current) => current.filter((asset) => !ids.includes(asset.id)));
        purchasedSelection.clear();
        setMessage(`${result.count} purchased asset(s) deleted.`);
      }
    } catch (error) {
      setMessage(`Error: ${getActionError(error, "Failed to delete selected assets.")}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleBulkDeleteRegistrations = async () => {
    if (registrationSelection.selectedCount === 0) return;
    if (!window.confirm(`Delete ${registrationSelection.selectedCount} selected warranty registration(s)?`)) return;

    setBusyAction("bulk-registrations");
    try {
      const ids = registrationSelection.selectedIds;
      const result = await deleteAssetRegistrations(ids);
      if (result.error) {
        setMessage(`Error: ${result.error}`);
      } else {
        setRegistrations((current) => current.filter((registration) => !ids.includes(registration.id)));
        registrationSelection.clear();
        setMessage(`${result.count} warranty registration(s) deleted.`);
      }
    } catch (error) {
      setMessage(`Error: ${getActionError(error, "Failed to delete selected registrations.")}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRegisterPurchased = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusyAction("create");
    setMessage("");
    try {
      const result = await createPurchasedProduct({
        userId,
        productId,
        serialNumber,
        purchaseDate,
        warrantyDays: Number(warrantyDays),
      });

      if (result.error) {
        setMessage(`Error: ${result.error}`);
      } else if (result.asset) {
        setAssets((prev) => [result.asset as PurchasedAsset, ...prev]);
        setSerialNumber("");
        setMessage("Asset registered successfully.");
      }
    } catch (error) {
      setMessage(`Error: ${getActionError(error, "Failed to register asset.")}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRegisterAsset = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusyAction("create-reg");
    setMessage("");
    try {
      const result = await createAssetRegistration({
        userId: regUserId,
        productName,
        serialNumber: regSerialNumber,
        purchaseDate: regPurchaseDate,
        warrantyMonths: Number(warrantyMonths),
      });

      if (result.error) {
        setMessage(`Error: ${result.error}`);
      } else if (result.registration) {
        setRegistrations((prev) => [result.registration as AssetRegistrationType, ...prev]);
        setRegSerialNumber("");
        setProductName("");
        setMessage("Hardware asset warranty registered successfully.");
      }
    } catch (error) {
      setMessage(`Error: ${getActionError(error, "Failed to register hardware asset.")}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeletePurchased = async (assetId: string) => {
    if (!confirm("Delete this registered purchased product?")) return;
    setBusyAction(assetId);
    try {
      const result = await deletePurchasedProduct(assetId);
      if (result.error) {
        setMessage(`Error: ${result.error}`);
      } else {
        setAssets((prev) => prev.filter((asset) => asset.id !== assetId));
        setMessage("Asset deleted.");
      }
    } catch (error) {
      setMessage(`Error: ${getActionError(error, "Failed to delete asset.")}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteRegistration = async (id: string) => {
    if (!confirm("Delete this registered warranty asset?")) return;
    setBusyAction(id);
    try {
      const result = await deleteAssetRegistration(id);
      if (result.error) {
        setMessage(`Error: ${result.error}`);
      } else {
        setRegistrations((prev) => prev.filter((reg) => reg.id !== id));
        setMessage("Asset registration deleted.");
      }
    } catch (error) {
      setMessage(`Error: ${getActionError(error, "Failed to delete asset registration.")}`);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-100">Hardware Assets & Warranties</h1>
          <p className="mt-1 text-sm font-medium text-gray-400">
            Register and manage customer hardware serials and warranty lifecycles.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-full bg-slate-150/70 p-1 w-full max-w-sm sm:max-w-md border border-[#1E293B]/40">
          <button
            onClick={() => {
              setActiveTab("purchased");
              setQuery("");
            }}
            className={cn(
              "flex-1 rounded-full text-xs font-black uppercase tracking-wider py-2.5 transition-all text-center cursor-pointer",
              activeTab === "purchased"
                ? "bg-[#B7D1EA] text-gray-100 shadow-none shadow-[#B7D1EA]/15 font-extrabold"
                : "text-gray-400 hover:text-gray-100"
            )}
          >
            Direct Purchases
          </button>
          <button
            onClick={() => {
              setActiveTab("registered");
              setQuery("");
            }}
            className={cn(
              "flex-1 rounded-full text-xs font-black uppercase tracking-wider py-2.5 transition-all text-center cursor-pointer",
              activeTab === "registered"
                ? "bg-[#B7D1EA] text-gray-100 shadow-none shadow-[#B7D1EA]/15 font-extrabold"
                : "text-gray-400 hover:text-gray-100"
            )}
          >
            Warranty Registrations
          </button>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm font-bold",
            message.startsWith("Error")
              ? "border-rose-100 bg-rose-500/10 text-rose-600"
              : "border-emerald-100 bg-emerald-500/10 text-emerald-700"
          )}
        >
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[400px_1fr]">
        {/* Registration Form Column */}
        <div>
          {activeTab === "purchased" ? (
            /* Tab 1 Form: PurchasedProduct */
            <form
              onSubmit={handleRegisterPurchased}
              className="rounded-3xl border border-[#1E293B]/60 bg-[#0F172A]/70 backdrop-blur-md p-6 shadow-xs"
            >
              <div className="mb-5 flex items-center gap-2">
                <PackagePlus className="h-5 w-5 text-gray-300" />
                <h2 className="text-sm font-black uppercase tracking-wider text-gray-100">Direct Purchase</h2>
              </div>
              <div className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Customer</span>
                  <select
                    value={userId}
                    onChange={(event) => setUserId(event.target.value)}
                    className="w-full rounded-xl border border-[#1E293B]/60 bg-[#0B1121] px-3 py-3 text-sm font-semibold outline-none focus:border-[#B7D1EA] text-gray-100"
                  >
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.email}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Catalog Product</span>
                  <select
                    value={productId}
                    onChange={(event) => setProductId(event.target.value)}
                    className="w-full rounded-xl border border-[#1E293B]/60 bg-[#0B1121] px-3 py-3 text-sm font-semibold outline-none focus:border-[#B7D1EA] text-gray-100"
                  >
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {productLabel(product)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Serial Number</span>
                  <input
                    value={serialNumber}
                    onChange={(event) => setSerialNumber(event.target.value)}
                    required
                    placeholder="Enter unique hardware serial"
                    className="w-full rounded-xl border border-[#1E293B]/60 bg-[#0B1121] px-3 py-3 font-mono text-sm font-semibold outline-none focus:border-[#B7D1EA] text-gray-100 placeholder:text-gray-500"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Purchase Date</span>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(event) => setPurchaseDate(event.target.value)}
                      className="w-full rounded-xl border border-[#1E293B]/60 bg-[#0B1121] px-3 py-3 text-sm font-semibold outline-none focus:border-[#B7D1EA] text-gray-100"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Warranty Days</span>
                    <input
                      inputMode="numeric"
                      value={warrantyDays}
                      onChange={(event) => setWarrantyDays(event.target.value)}
                      className="w-full rounded-xl border border-[#1E293B]/60 bg-[#0B1121] px-3 py-3 text-sm font-semibold outline-none focus:border-[#B7D1EA] text-gray-100"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={busyAction === "create"}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-6 py-3.5 text-xs font-black uppercase tracking-wider text-gray-100 transition-all hover:bg-[#B7D1EA]/80 shadow-none shadow-[#B7D1EA]/25 cursor-pointer disabled:opacity-60"
                >
                  {busyAction === "create" ? (
                    <GsapSpinner className="h-4 w-4 text-gray-100" />
                  ) : (
                    <ShieldCheck className="h-4.5 w-4.5 text-gray-100" />
                  )}
                  <span>Register Assignment</span>
                </button>
              </div>
            </form>
          ) : (
            /* Tab 2 Form: AssetRegistration (Under AssetRegistration Schema) */
            <form
              onSubmit={handleRegisterAsset}
              className="rounded-3xl border border-[#1E293B]/60 bg-[#0F172A]/70 backdrop-blur-md p-6 shadow-xs"
            >
              <div className="mb-5 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-gray-300" />
                <h2 className="text-sm font-black uppercase tracking-wider text-gray-100">Warranty Registration</h2>
              </div>
              <div className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Customer Account</span>
                  <select
                    value={regUserId}
                    onChange={(event) => setRegUserId(event.target.value)}
                    className="w-full rounded-xl border border-[#1E293B]/60 bg-[#0B1121] px-3 py-3 text-sm font-semibold outline-none focus:border-[#B7D1EA] text-gray-100"
                  >
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.email}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Product Variant Name</span>
                  <input
                    type="text"
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    required
                    placeholder="e.g. Huawei SUN2000-10KTL Inverter"
                    className="w-full rounded-xl border border-[#1E293B]/60 bg-[#0B1121] px-3 py-3 text-sm font-semibold outline-none focus:border-[#B7D1EA] text-gray-100 placeholder:text-gray-500"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Unique Serial Number</span>
                  <input
                    value={regSerialNumber}
                    onChange={(event) => setRegSerialNumber(event.target.value)}
                    required
                    placeholder="Enter hardware serial (must be unique)"
                    className="w-full rounded-xl border border-[#1E293B]/60 bg-[#0B1121] px-3 py-3 font-mono text-sm font-semibold outline-none focus:border-[#B7D1EA] text-gray-100 placeholder:text-gray-500"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Purchase Date</span>
                    <input
                      type="date"
                      value={regPurchaseDate}
                      onChange={(event) => setRegPurchaseDate(event.target.value)}
                      className="w-full rounded-xl border border-[#1E293B]/60 bg-[#0B1121] px-3 py-3 text-sm font-semibold outline-none focus:border-[#B7D1EA] text-gray-100"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Warranty Duration Months</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={warrantyMonths}
                      onChange={(event) => setWarrantyMonths(event.target.value)}
                      className="w-full rounded-xl border border-[#1E293B]/60 bg-[#0B1121] px-3 py-3 text-sm font-semibold outline-none focus:border-[#B7D1EA] text-gray-100"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={busyAction === "create-reg"}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-6 py-3.5 text-xs font-black uppercase tracking-wider text-gray-100 transition-all hover:bg-[#B7D1EA]/80 shadow-none shadow-[#B7D1EA]/25 cursor-pointer disabled:opacity-60"
                >
                  {busyAction === "create-reg" ? (
                    <GsapSpinner className="h-4 w-4 text-gray-100" />
                  ) : (
                    <ShieldCheck className="h-4.5 w-4.5 text-gray-100" />
                  )}
                  <span>Register Warranty Asset</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Listing Column */}
        <div className="overflow-hidden rounded-3xl border border-[#1E293B]/60 bg-[#0F172A]/70 backdrop-blur-md shadow-xs">
          <div className="border-b border-[#1E293B] p-4 bg-[#0F172A]/30">
            <div className="relative max-w-md">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  activeTab === "purchased"
                    ? "Search direct purchase, serial, customer..."
                    : "Search warranty variant, serial, customer..."
                }
                className="w-full rounded-full border border-[#1E293B]/60 bg-[#0B1121] py-2.5 pl-10 pr-4 text-sm font-medium outline-none focus:border-[#B7D1EA] text-gray-100 placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {activeTab === "purchased" ? (
              /* Tab 1 Table: Direct Purchases (PurchasedProduct) */
              <div className="space-y-3 p-3">
              <AdminBulkActionBar
                selectedCount={purchasedSelection.selectedCount}
                visibleCount={filteredAssets.length}
                allVisibleSelected={purchasedSelection.allVisibleSelected}
                someVisibleSelected={purchasedSelection.someVisibleSelected}
                onToggleVisible={purchasedSelection.toggleVisible}
                onClear={purchasedSelection.clear}
                isPending={busyAction !== null}
                actions={[{
                  id: "delete-purchased",
                  label: "Delete",
                  icon: Trash2,
                  tone: "danger",
                  onClick: () => void handleBulkDeletePurchased(),
                }]}
              />
              <table className="w-full min-w-[800px] text-left">
                <thead className="border-b border-[#1E293B] bg-[#0B1121]/70 text-[10px] font-black uppercase tracking-widest text-gray-500">
                  <tr>
                    <th className="w-14 px-5 py-4">
                      <AdminSelectionCheckbox
                        checked={purchasedSelection.allVisibleSelected}
                        indeterminate={purchasedSelection.someVisibleSelected}
                        disabled={filteredAssets.length === 0 || busyAction !== null}
                        label="Select all visible purchased assets"
                        onChange={purchasedSelection.toggleVisible}
                      />
                    </th>
                    <th className="px-5 py-4">Customer Account</th>
                    <th className="px-5 py-4">Product Variant</th>
                    <th className="px-5 py-4 font-mono">Serial Code</th>
                    <th className="px-5 py-4">Warranty Scope</th>
                    <th className="px-5 py-4 text-right">Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAssets.map((asset) => {
                    const warranty = getWarrantyState(asset.purchaseDate, asset.warrantyDays);
                    return (
                      <tr key={asset.id} className="hover:bg-[#0B1121]/70 transition-colors">
                        <td className="px-5 py-4">
                          <AdminSelectionCheckbox
                            checked={purchasedSelection.isSelected(asset.id)}
                            disabled={busyAction !== null}
                            label={`Select asset ${asset.serialNumber}`}
                            onChange={() => purchasedSelection.toggle(asset.id)}
                          />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <User className="h-4 w-4 text-gray-500 shrink-0" />
                            <div>
                              <p className="text-sm font-bold text-gray-100">
                                {asset.user.name || "Unnamed Customer"}
                              </p>
                              <p className="text-[11px] text-gray-400 font-medium">{asset.user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-bold text-gray-100">{productLabel(asset.product)}</p>
                          <p className="text-xs text-gray-400 font-semibold">
                            {asset.product.category?.name || "Uncategorized"}
                          </p>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs font-bold text-gray-300">
                          {asset.serialNumber}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 text-xs font-bold text-gray-300">
                            <Calendar className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                            <span>{warranty.remainingDays} days left</span>
                          </div>
                          <div className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-[#0B1121]">
                            <div
                              className="h-full rounded-full bg-[#B7D1EA]"
                              style={{ width: `${Math.max(0, Math.min(100, 100 - warranty.progressPct))}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => void handleDeletePurchased(asset.id)}
                            disabled={busyAction === asset.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-rose-100 bg-rose-500/10 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-rose-600 transition-colors hover:bg-rose-100 disabled:opacity-60 cursor-pointer"
                          >
                            {busyAction === asset.id ? (
                              <GsapSpinner className="h-3.5 w-3.5" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            <span>Delete</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredAssets.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-12 text-center text-xs font-bold uppercase tracking-widest text-gray-500"
                      >
                        No direct purchases registered.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            ) : (
              /* Tab 2 Table: Warranty Registrations (AssetRegistration) */
              <div className="space-y-3 p-3">
              <AdminBulkActionBar
                selectedCount={registrationSelection.selectedCount}
                visibleCount={filteredRegistrations.length}
                allVisibleSelected={registrationSelection.allVisibleSelected}
                someVisibleSelected={registrationSelection.someVisibleSelected}
                onToggleVisible={registrationSelection.toggleVisible}
                onClear={registrationSelection.clear}
                isPending={busyAction !== null}
                actions={[{
                  id: "delete-registrations",
                  label: "Delete",
                  icon: Trash2,
                  tone: "danger",
                  onClick: () => void handleBulkDeleteRegistrations(),
                }]}
              />
              <table className="w-full min-w-[800px] text-left">
                <thead className="border-b border-[#1E293B] bg-[#0B1121]/70 text-[10px] font-black uppercase tracking-widest text-gray-500">
                  <tr>
                    <th className="w-14 px-5 py-4">
                      <AdminSelectionCheckbox
                        checked={registrationSelection.allVisibleSelected}
                        indeterminate={registrationSelection.someVisibleSelected}
                        disabled={filteredRegistrations.length === 0 || busyAction !== null}
                        label="Select all visible warranty registrations"
                        onChange={registrationSelection.toggleVisible}
                      />
                    </th>
                    <th className="px-5 py-4">Customer Account</th>
                    <th className="px-5 py-4">Product Variant Name</th>
                    <th className="px-5 py-4 font-mono">Serial Code</th>
                    <th className="px-5 py-4">Warranty Scope</th>
                    <th className="px-5 py-4 text-right">Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRegistrations.map((reg) => {
                    const remainingDays = calculateRemainingDays(reg.purchaseDate, reg.warrantyMonths);
                    const isExpired = remainingDays === 0;

                    return (
                      <tr key={reg.id} className="hover:bg-[#0B1121]/70 transition-colors">
                        <td className="px-5 py-4">
                          <AdminSelectionCheckbox
                            checked={registrationSelection.isSelected(reg.id)}
                            disabled={busyAction !== null}
                            label={`Select registration ${reg.serialNumber}`}
                            onChange={() => registrationSelection.toggle(reg.id)}
                          />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <User className="h-4 w-4 text-gray-500 shrink-0" />
                            <div>
                              <p className="text-sm font-bold text-gray-100">
                                {reg.user.name || "Unnamed Customer"}
                              </p>
                              <p className="text-[11px] text-gray-400 font-medium">{reg.user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-bold text-gray-100">{reg.productName}</p>
                          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">
                            Customer Registered
                          </p>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs font-bold text-gray-300">
                          {reg.serialNumber}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 text-xs font-bold text-gray-300">
                            <Calendar className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                            <span>
                              {isExpired ? "Expired" : `${remainingDays} days left (${reg.warrantyMonths} m)`}
                            </span>
                          </div>
                          <div className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-[#0B1121]">
                            <div
                              className={cn("h-full rounded-full", isExpired ? "bg-rose-400" : "bg-[#B7D1EA]")}
                              style={{ width: isExpired ? "100%" : "50%" }}
                            />
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => void handleDeleteRegistration(reg.id)}
                            disabled={busyAction === reg.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-rose-100 bg-rose-500/10 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-rose-600 transition-colors hover:bg-rose-100 disabled:opacity-60 cursor-pointer"
                          >
                            {busyAction === reg.id ? (
                              <GsapSpinner className="h-3.5 w-3.5" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            <span>Delete</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRegistrations.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-12 text-center text-xs font-bold uppercase tracking-widest text-gray-500"
                      >
                        No warranty registrations found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
