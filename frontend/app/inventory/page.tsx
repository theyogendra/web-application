"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { canEdit as canEditModule } from "@/lib/auth";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  PageHeader,
  Select,
  TextInput,
} from "@/components/ui";

export default function InventoryPage() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [isActive, setIsActive] = useState("");
  const [lowStock, setLowStock] = useState(false);

  const [mayEdit, setMayEdit] = useState(false);
  useEffect(() => {
    setMayEdit(canEditModule("inventory"));
  }, []);

  async function loadCategories() {
    try {
      const res = await apiGet("/inventory/categories");
      const list = Array.isArray(res) ? res : res?.data || [];
      setCategories(list);
    } catch {
      // Categories are non-critical; ignore failures.
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category) params.set("category", category);
      if (isActive !== "") params.set("is_active", isActive);
      if (lowStock) params.set("low_stock", "true");
      const qs = params.toString();
      const data = await apiGet("/inventory" + (qs ? "?" + qs : ""));
      const list = Array.isArray(data) ? data : data?.data || [];
      setProducts(list);
    } catch (err: any) {
      setError(err?.message || "Failed to load inventory.");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  function clearFilters() {
    setSearch("");
    setCategory("");
    setIsActive("");
    setLowStock(false);
    setTimeout(load, 0);
  }

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Manage your products, stock levels and pricing."
        actions={
          mayEdit ? (
            <Link href="/inventory/create">
              <Button>+ New Product</Button>
            </Link>
          ) : null
        }
      />

      <Card className="mb-5 p-4">
        <form
          onSubmit={applyFilters}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <Field label="Search">
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or SKU"
            />
          </Field>
          <Field label="Category">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={isActive}
              onChange={(e) => setIsActive(e.target.value)}
            >
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Field>
          <Field label="Stock">
            <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={lowStock}
                onChange={(e) => setLowStock(e.target.checked)}
              />
              Low stock only
            </label>
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit">Apply</Button>
            <Button variant="secondary" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        {loading ? (
          <Loading label="Loading products..." />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : products.length === 0 ? (
          <EmptyState message="No products found. Add your first product to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/inventory/${p.id}`)}
                    className={`cursor-pointer border-b border-gray-100 hover:bg-blue-50 ${
                      p.low_stock ? "bg-red-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-accent">
                      {p.sku || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{p.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.category || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.unit || "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {formatCurrency(p.price)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        p.out_of_stock || p.low_stock ? "text-red-600" : "text-gray-900"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        {p.stock}
                        {p.out_of_stock ? (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                            Out
                          </span>
                        ) : p.low_stock ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            Low
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.is_active ? (
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
