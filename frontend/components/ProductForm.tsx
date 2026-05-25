"use client";

import React, { useState } from "react";
import {
  Button,
  Card,
  ErrorState,
  Field,
  TextArea,
  TextInput,
} from "@/components/ui";

export type ProductFormValues = {
  name: string;
  sku: string;
  category: string;
  unit: string;
  description: string;
  price: any;
  cost: any;
  tax_rate: any;
  stock: any;
  reorder_level: any;
  is_active: boolean;
};

export function buildInitialProductValues(product?: any): ProductFormValues {
  if (!product) {
    return {
      name: "",
      sku: "",
      category: "",
      unit: "",
      description: "",
      price: 0,
      cost: 0,
      tax_rate: 18,
      stock: 0,
      reorder_level: 0,
      is_active: true,
    };
  }
  return {
    name: product.name || "",
    sku: product.sku || "",
    category: product.category || "",
    unit: product.unit || "",
    description: product.description || "",
    price: product.price ?? 0,
    cost: product.cost ?? 0,
    tax_rate: product.tax_rate ?? 0,
    stock: product.stock ?? 0,
    reorder_level: product.reorder_level ?? 0,
    is_active: product.is_active !== false,
  };
}

type Props = {
  initialValues: ProductFormValues;
  submitLabel: string;
  onSubmit: (payload: any) => Promise<void>;
  onCancel?: () => void;
};

export default function ProductForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField(field: keyof ProductFormValues, value: any) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!values.name.trim()) {
      setError("Product name is required.");
      return;
    }
    const costNum = Number(values.cost);
    if (!isFinite(costNum) || costNum < 0) {
      setError("Cost must be a non-negative number.");
      return;
    }
    const taxNum = Number(values.tax_rate);
    if (!isFinite(taxNum) || taxNum < 0) {
      setError("GST % must be a non-negative number.");
      return;
    }

    const payload = {
      name: values.name,
      sku: values.sku || null,
      category: values.category || null,
      unit: values.unit || null,
      description: values.description || null,
      price: Number(values.price) || 0,
      cost: Number(values.cost) || 0,
      tax_rate: Number(values.tax_rate) || 0,
      stock: Number(values.stock) || 0,
      reorder_level: parseInt(String(values.reorder_level || 0), 10) || 0,
      is_active: !!values.is_active,
    };

    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err: any) {
      setError(err?.message || "Failed to save product.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <ErrorState message={error} /> : null}

      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Basic details
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Product name" required>
            <TextInput
              value={values.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. Premium Hosting Plan"
            />
          </Field>
          <Field label="SKU">
            <TextInput
              value={values.sku}
              onChange={(e) => setField("sku", e.target.value)}
              placeholder="HOST-PREM-01"
            />
          </Field>
          <Field label="Category">
            <TextInput
              value={values.category}
              onChange={(e) => setField("category", e.target.value)}
              placeholder="Services"
            />
          </Field>
          <Field label="Unit">
            <TextInput
              value={values.unit}
              onChange={(e) => setField("unit", e.target.value)}
              placeholder="hr / each / month"
            />
          </Field>
          <Field label="Description">
            <TextArea
              rows={3}
              value={values.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="Optional description shown when this product is added to a document"
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Pricing
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Price">
            <TextInput
              type="number"
              min="0"
              step="any"
              value={values.price}
              onChange={(e) => setField("price", e.target.value)}
            />
          </Field>
          <Field
            label="Cost"
            required
            hint="Your purchase price (used for margin reporting)."
          >
            <TextInput
              type="number"
              min="0"
              step="any"
              required
              value={values.cost}
              onChange={(e) => setField("cost", e.target.value)}
            />
          </Field>
          <Field
            label="GST %"
            required
            hint="Default tax applied when this item is on a proposal/quotation/invoice line."
          >
            <TextInput
              type="number"
              min="0"
              step="any"
              required
              value={values.tax_rate}
              onChange={(e) => setField("tax_rate", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Inventory
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Stock on hand">
            <TextInput
              type="number"
              min="0"
              step="any"
              value={values.stock}
              onChange={(e) => setField("stock", e.target.value)}
            />
          </Field>
          <Field label="Reorder level">
            <TextInput
              type="number"
              min="0"
              step="1"
              value={values.reorder_level}
              onChange={(e) => setField("reorder_level", e.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={values.is_active}
                onChange={(e) => setField("is_active", e.target.checked)}
              />
              Active
            </label>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
