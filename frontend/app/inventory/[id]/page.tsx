"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  Button,
  Card,
  ErrorState,
  Field,
  Loading,
  PageHeader,
  Select,
  TextArea,
  TextInput,
} from "@/components/ui";

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [showAdjust, setShowAdjust] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/inventory/${id}`);
      setProduct(data?.data || data);
    } catch (err: any) {
      setError(err?.message || "Failed to load product.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function flash(msg: string) {
    setActionMsg(msg);
    setActionError(null);
    setTimeout(() => setActionMsg(null), 5000);
  }

  function flashError(msg: string) {
    setActionError(msg);
    setActionMsg(null);
  }

  async function handleToggleActive() {
    if (!product) return;
    setBusy("toggle");
    try {
      const res = await apiPut(`/inventory/${id}`, {
        is_active: !product.is_active,
      });
      if (res && res.success === false) {
        throw new Error(res.message || "Failed to update product.");
      }
      flash(
        product.is_active
          ? "Product deactivated."
          : "Product activated."
      );
      load();
    } catch (err: any) {
      flashError(err?.message || "Failed to update product.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Hard-delete this product? This cannot be undone. If the product is referenced by any document the delete will fail — use Deactivate instead."
      )
    ) {
      return;
    }
    setBusy("delete");
    try {
      const res = await apiDelete(`/inventory/${id}?hard=true`);
      if (res && res.success === false) {
        throw new Error(res.message || "Failed to delete product.");
      }
      router.push("/inventory");
    } catch (err: any) {
      flashError(
        (err?.message || "Failed to delete product.") +
          " Tip: deactivate the product instead if it is referenced by existing documents."
      );
      setBusy(null);
    }
  }

  if (loading) {
    return <Loading label="Loading product..." />;
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Product" />
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  if (!product) {
    return (
      <div>
        <PageHeader title="Product" />
        <ErrorState message="Product not found." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={product.name || "Product"}
        description={
          product.sku ? `SKU: ${product.sku}` : "Product details and stock."
        }
        actions={
          <>
            <Link href={`/inventory/${id}/edit`}>
              <Button variant="secondary">Edit</Button>
            </Link>
            <Button
              variant="secondary"
              onClick={handleToggleActive}
              disabled={busy !== null}
            >
              {busy === "toggle"
                ? "Saving..."
                : product.is_active
                ? "Deactivate"
                : "Activate"}
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={busy !== null}
            >
              {busy === "delete" ? "Deleting..." : "Delete"}
            </Button>
          </>
        }
      />

      {actionMsg ? (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {actionMsg}
        </div>
      ) : null}
      {actionError ? (
        <div className="mb-4">
          <ErrorState message={actionError} />
        </div>
      ) : null}

      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Status
            </div>
            <div className="mt-1">
              {product.is_active ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
                  Inactive
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Price
            </div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              {formatCurrency(product.price)}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Details
            </div>
            <div className="mt-1 text-sm text-gray-600">
              Category: {product.category || "-"}
            </div>
            <div className="text-sm text-gray-600">
              Unit: {product.unit || "-"}
            </div>
            <div className="text-sm text-gray-600">
              Tax rate: {product.tax_rate ?? 0}%
            </div>
            <div className="text-sm text-gray-600">
              Cost: {formatCurrency(product.cost)}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Timestamps
            </div>
            <div className="mt-1 text-sm text-gray-600">
              Created: {formatDateTime(product.created_at)}
            </div>
            <div className="text-sm text-gray-600">
              Updated: {formatDateTime(product.updated_at)}
            </div>
          </div>
        </div>

        {product.description ? (
          <div className="mt-5">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Description
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
              {product.description}
            </p>
          </div>
        ) : null}
      </Card>

      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">Stock</h2>
          <Button onClick={() => setShowAdjust(true)}>Adjust Stock</Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">
              On hand
            </div>
            <div
              className={`mt-1 text-2xl font-semibold ${
                product.low_stock ? "text-red-600" : "text-gray-900"
              }`}
            >
              {product.stock ?? 0}
            </div>
            {product.low_stock ? (
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-red-600">
                Low stock
              </div>
            ) : null}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Reorder level
            </div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              {product.reorder_level ?? 0}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Unit
            </div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              {product.unit || "-"}
            </div>
          </div>
        </div>
      </Card>

      {showAdjust ? (
        <AdjustStockModal
          productId={id}
          onClose={() => setShowAdjust(false)}
          onSuccess={(msg) => {
            setShowAdjust(false);
            flash(msg);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function AdjustStockModal({
  productId,
  onClose,
  onSuccess,
}: {
  productId: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [type, setType] = useState<"in" | "out" | "set">("in");
  const [quantity, setQuantity] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const qty = Number(quantity);
    if (!isFinite(qty) || qty < 0) {
      setError("Enter a valid quantity.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiPost(`/inventory/${productId}/stock-adjust`, {
        type,
        quantity: qty,
        notes,
      });
      if (res && res.success === false) {
        throw new Error(res.message || "Failed to adjust stock.");
      }
      const data = res?.data || {};
      onSuccess(
        `Stock updated: ${data.old_stock ?? "?"} → ${data.new_stock ?? "?"}`
      );
    } catch (err: any) {
      setError(err?.message || "Failed to adjust stock.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-900">
            Adjust Stock
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5">
          {error ? <ErrorState message={error} /> : null}

          <Field label="Adjustment type" required>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
            >
              <option value="in">Stock in (+)</option>
              <option value="out">Stock out (-)</option>
              <option value="set">Set to value (=)</option>
            </Select>
          </Field>
          <Field label="Quantity" required>
            <TextInput
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
          <Field label="Notes">
            <TextArea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for the adjustment"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Apply"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
