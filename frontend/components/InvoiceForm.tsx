"use client";

import React, { useMemo, useState } from "react";
import { computeLineTotal, computeTotals } from "@/lib/totals";
import { formatCurrency, todayInputValue, toInputDate } from "@/lib/format";
import {
  Button,
  Card,
  ErrorState,
  Field,
  TextArea,
  TextInput,
} from "@/components/ui";

export type InvoiceFormItem = {
  description: string;
  quantity: any;
  unit_price: any;
  discount: any;
  tax_rate: any;
};

export type InvoiceFormValues = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  billing_address: string;
  invoice_date: string;
  due_date: string;
  notes: string;
  terms: string;
  items: InvoiceFormItem[];
};

function emptyItem(): InvoiceFormItem {
  return {
    description: "",
    quantity: 1,
    unit_price: 0,
    discount: 0,
    tax_rate: 18,
  };
}

export function buildInitialValues(invoice?: any): InvoiceFormValues {
  if (!invoice) {
    return {
      customer_name: "",
      customer_email: "",
      customer_phone: "",
      billing_address: "",
      invoice_date: todayInputValue(),
      due_date: "",
      notes: "",
      terms: "",
      items: [emptyItem()],
    };
  }
  const items = Array.isArray(invoice.invoice_items)
    ? invoice.invoice_items
    : Array.isArray(invoice.items)
    ? invoice.items
    : [];
  return {
    customer_name: invoice.customer_name || "",
    customer_email: invoice.customer_email || "",
    customer_phone: invoice.customer_phone || "",
    billing_address: invoice.billing_address || "",
    invoice_date: toInputDate(invoice.invoice_date) || todayInputValue(),
    due_date: toInputDate(invoice.due_date) || "",
    notes: invoice.notes || "",
    terms: invoice.terms || "",
    items:
      items.length > 0
        ? items.map((it: any) => ({
            description: it.description || "",
            quantity: it.quantity ?? 1,
            unit_price: it.unit_price ?? 0,
            discount: it.discount ?? 0,
            tax_rate: it.tax_rate ?? 0,
          }))
        : [emptyItem()],
  };
}

type Props = {
  initialValues: InvoiceFormValues;
  submitLabel: string;
  onSubmit: (values: InvoiceFormValues) => Promise<void>;
  onCancel?: () => void;
};

export default function InvoiceForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const [values, setValues] = useState<InvoiceFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => computeTotals(values.items), [values.items]);

  function setField(field: keyof InvoiceFormValues, value: any) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  function updateItem(index: number, field: keyof InvoiceFormItem, value: any) {
    setValues((v) => {
      const items = v.items.slice();
      items[index] = { ...items[index], [field]: value };
      return { ...v, items };
    });
  }

  function addItem() {
    setValues((v) => ({ ...v, items: [...v.items, emptyItem()] }));
  }

  function removeItem(index: number) {
    setValues((v) => {
      if (v.items.length <= 1) return v;
      const items = v.items.slice();
      items.splice(index, 1);
      return { ...v, items };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!values.customer_name.trim()) {
      setError("Customer name is required.");
      return;
    }
    const validItems = values.items.filter(
      (it) => (it.description || "").trim() !== ""
    );
    if (validItems.length === 0) {
      setError("Add at least one line item with a description.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ ...values, items: validItems });
    } catch (err: any) {
      setError(err?.message || "Failed to save the invoice.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <ErrorState message={error} /> : null}

      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Customer details
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Customer name" required>
            <TextInput
              value={values.customer_name}
              onChange={(e) => setField("customer_name", e.target.value)}
              placeholder="Acme Corp"
            />
          </Field>
          <Field label="Customer email">
            <TextInput
              type="email"
              value={values.customer_email}
              onChange={(e) => setField("customer_email", e.target.value)}
              placeholder="billing@acme.com"
            />
          </Field>
          <Field label="Customer phone">
            <TextInput
              value={values.customer_phone}
              onChange={(e) => setField("customer_phone", e.target.value)}
              placeholder="+91 90000 00000"
            />
          </Field>
          <Field label="Billing address">
            <TextInput
              value={values.billing_address}
              onChange={(e) => setField("billing_address", e.target.value)}
              placeholder="Street, City, State"
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Invoice details
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Invoice date" required>
            <TextInput
              type="date"
              value={values.invoice_date}
              onChange={(e) => setField("invoice_date", e.target.value)}
            />
          </Field>
          <Field label="Due date">
            <TextInput
              type="date"
              value={values.due_date}
              onChange={(e) => setField("due_date", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Line items
          </h2>
          <Button variant="secondary" onClick={addItem}>
            + Add item
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 px-2 w-20">Qty</th>
                <th className="py-2 px-2 w-28">Unit price</th>
                <th className="py-2 px-2 w-24">Disc %</th>
                <th className="py-2 px-2 w-24">Tax %</th>
                <th className="py-2 px-2 w-28 text-right">Line total</th>
                <th className="py-2 pl-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {values.items.map((item, idx) => {
                const r = computeLineTotal(item);
                return (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-2 pr-3">
                      <TextInput
                        value={item.description}
                        onChange={(e) =>
                          updateItem(idx, "description", e.target.value)
                        }
                        placeholder="Item description"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <TextInput
                        type="number"
                        min="0"
                        step="any"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(idx, "quantity", e.target.value)
                        }
                      />
                    </td>
                    <td className="py-2 px-2">
                      <TextInput
                        type="number"
                        min="0"
                        step="any"
                        value={item.unit_price}
                        onChange={(e) =>
                          updateItem(idx, "unit_price", e.target.value)
                        }
                      />
                    </td>
                    <td className="py-2 px-2">
                      <TextInput
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={item.discount}
                        onChange={(e) =>
                          updateItem(idx, "discount", e.target.value)
                        }
                      />
                    </td>
                    <td className="py-2 px-2">
                      <TextInput
                        type="number"
                        min="0"
                        step="any"
                        value={item.tax_rate}
                        onChange={(e) =>
                          updateItem(idx, "tax_rate", e.target.value)
                        }
                      />
                    </td>
                    <td className="py-2 px-2 text-right font-medium text-gray-900">
                      {formatCurrency(r.lineTotal)}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        disabled={values.items.length <= 1}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                        aria-label="Remove item"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Discount</span>
              <span>- {formatCurrency(totals.discount)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Tax</span>
              <span>{formatCurrency(totals.tax_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1.5 text-base font-semibold text-gray-900">
              <span>Grand total</span>
              <span>{formatCurrency(totals.grand_total)}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Notes &amp; terms
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Notes">
            <TextArea
              rows={3}
              value={values.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Internal or customer-facing notes"
            />
          </Field>
          <Field label="Terms">
            <TextArea
              rows={3}
              value={values.terms}
              onChange={(e) => setField("terms", e.target.value)}
              placeholder="Payment terms and conditions"
            />
          </Field>
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
