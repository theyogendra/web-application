"use client";

import React, { useMemo, useState, useEffect } from "react";
import { computeLineTotal, computeTotals } from "@/lib/totals";
import { formatCurrency, todayInputValue, toInputDate } from "@/lib/format";
import { apiGet } from "@/lib/api";
import {
  Button,
  Card,
  ErrorState,
  Field,
  TextArea,
  TextInput,
} from "@/components/ui";

export type InvoiceFormItem = {
  product_id?: any;
  description: string;
  quantity: any;
  unit_price: any;
  discount: any;
  tax_rate: any;
};

export type InvoiceFormValues = {
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  billing_address: string;
  shipping_address: string;
  invoice_date: string;
  due_date: string;
  currency: string;
  status: string;
  terms: string;
  sales_person: string;
  notes: string;
  internal_notes: string;
  shipping_charges: any;
  additional_charges: any;
  attachments: string;
  tags: string;
  custom_fields: { key: string; value: string }[];
  items: InvoiceFormItem[];
};

function emptyItem(): InvoiceFormItem {
  return {
    product_id: "",
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
      invoice_number: "",
      customer_id: "",
      customer_name: "",
      customer_email: "",
      customer_phone: "",
      billing_address: "",
      shipping_address: "",
      invoice_date: todayInputValue(),
      due_date: "",
      currency: "INR",
      status: "draft",
      terms: "",
      sales_person: "",
      notes: "",
      internal_notes: "",
      shipping_charges: 0,
      additional_charges: 0,
      attachments: "",
      tags: "",
      custom_fields: [],
      items: [emptyItem()],
    };
  }

  const items = Array.isArray(invoice.invoice_items)
    ? invoice.invoice_items
    : Array.isArray(invoice.items)
      ? invoice.items
      : [];

  let attachmentsStr = "";
  if (Array.isArray(invoice.attachments)) {
    attachmentsStr = invoice.attachments.join(", ");
  } else if (typeof invoice.attachments === "string") {
    try {
      const parsed = JSON.parse(invoice.attachments);
      if (Array.isArray(parsed)) {
        attachmentsStr = parsed.join(", ");
      } else {
        attachmentsStr = invoice.attachments;
      }
    } catch {
      attachmentsStr = invoice.attachments;
    }
  }

  let tagsStr = "";
  if (Array.isArray(invoice.tags)) {
    tagsStr = invoice.tags.join(", ");
  } else if (typeof invoice.tags === "string") {
    try {
      const parsed = JSON.parse(invoice.tags);
      if (Array.isArray(parsed)) {
        tagsStr = parsed.join(", ");
      } else {
        tagsStr = invoice.tags;
      }
    } catch {
      tagsStr = invoice.tags;
    }
  }

  let customFieldsArr: { key: string; value: string }[] = [];
  if (invoice.custom_fields && typeof invoice.custom_fields === "object") {
    customFieldsArr = Object.entries(invoice.custom_fields).map(([k, v]) => ({
      key: k,
      value: String(v),
    }));
  } else if (typeof invoice.custom_fields === "string") {
    try {
      const parsed = JSON.parse(invoice.custom_fields);
      if (parsed && typeof parsed === "object") {
        customFieldsArr = Object.entries(parsed).map(([k, v]) => ({
          key: k,
          value: String(v),
        }));
      }
    } catch {}
  }

  return {
    invoice_number: invoice.invoice_number || "",
    customer_id: invoice.customer_id || "",
    customer_name: invoice.customer_name || "",
    customer_email: invoice.customer_email || "",
    customer_phone: invoice.customer_phone || "",
    billing_address: invoice.billing_address || "",
    shipping_address: invoice.shipping_address || "",
    invoice_date: toInputDate(invoice.invoice_date) || todayInputValue(),
    due_date: toInputDate(invoice.due_date) || "",
    currency: invoice.currency || "INR",
    status: invoice.status || "draft",
    terms: invoice.terms || "",
    sales_person: invoice.sales_person || "",
    notes: invoice.notes || "",
    internal_notes: invoice.internal_notes || "",
    shipping_charges: invoice.shipping_charges ?? 0,
    additional_charges: invoice.additional_charges ?? 0,
    attachments: attachmentsStr,
    tags: tagsStr,
    custom_fields: customFieldsArr,
    items:
      items.length > 0
        ? items.map((it: any) => ({
            product_id: it.product_id || "",
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
  onSubmit: (values: any) => Promise<void>;
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

  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  // Load Customers and Products lists for lookup and auto-fill
  useEffect(() => {
    async function loadMetadata() {
      try {
        const custRes = await apiGet("/customers");
        setCustomers(custRes?.data || custRes || []);
      } catch (e) {
        console.error("Failed to load customers:", e);
      }
      try {
        const prodRes = await apiGet("/inventory");
        setProducts(prodRes?.data || prodRes || []);
      } catch (e) {
        console.error("Failed to load products:", e);
      }
    }
    loadMetadata();
  }, []);

  const totals = useMemo(() => {
    const baseTotals = computeTotals(values.items);
    const shipping = Number(values.shipping_charges) || 0;
    const additional = Number(values.additional_charges) || 0;
    return {
      ...baseTotals,
      grand_total: baseTotals.grand_total + shipping + additional,
    };
  }, [values.items, values.shipping_charges, values.additional_charges]);

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
      (it) => (it.description || "").trim() !== "",
    );
    if (validItems.length === 0) {
      setError("Add at least one line item with a description.");
      return;
    }

    // Format custom fields object
    const customFieldsObj: Record<string, string> = {};
    for (const f of values.custom_fields) {
      if (f.key.trim()) {
        customFieldsObj[f.key.trim()] = f.value;
      }
    }

    // Format tags & attachments array
    const attachmentsArr = values.attachments
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const tagsArr = values.tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: any = {
      ...values,
      items: validItems.map((it) => ({
        product_id: it.product_id ? Number(it.product_id) : null,
        description: it.description,
        quantity: Number(it.quantity) || 0,
        unit_price: Number(it.unit_price) || 0,
        discount: Number(it.discount) || 0,
        tax_rate: Number(it.tax_rate) || 0,
      })),
      shipping_charges: Number(values.shipping_charges) || 0,
      additional_charges: Number(values.additional_charges) || 0,
      attachments: attachmentsArr,
      tags: tagsArr,
      custom_fields: customFieldsObj,
    };

    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err: any) {
      setError(err?.message || "Failed to save the invoice.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <ErrorState message={error} /> : null}

      {/* Customer details card */}
      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Customer details
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Link Customer Account"
            hint="Choose an existing customer to auto-fill details, or select custom."
          >
            <select
              className="w-full rounded-md border border-gray-300 bg-white py-2 px-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={values.customer_id || ""}
              onChange={(e) => {
                const cid = e.target.value;
                const selected = customers.find((c) => String(c.id) === cid);
                if (selected) {
                  setValues((v) => ({
                    ...v,
                    customer_id: cid,
                    customer_name: selected.name || "",
                    customer_email: selected.email || "",
                    customer_phone: selected.phone || "",
                    billing_address: selected.billing_address || "",
                  }));
                } else {
                  setField("customer_id", "");
                }
              }}
            >
              <option value="">-- Custom Customer (Type below) --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.email ? `(${c.email})` : ""}
                </option>
              ))}
            </select>
          </Field>

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
          <Field label="Shipping address">
            <TextInput
              value={values.shipping_address}
              onChange={(e) => setField("shipping_address", e.target.value)}
              placeholder="Destination Address"
            />
          </Field>
        </div>
      </Card>

      {/* Invoice details card */}
      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Invoice details
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="Invoice number"
            hint="Leave blank to auto-generate sequential number"
          >
            <TextInput
              value={values.invoice_number}
              onChange={(e) => setField("invoice_number", e.target.value)}
              placeholder="INV-0000"
            />
          </Field>
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
          <Field label="Currency">
            <select
              className="w-full rounded-md border border-gray-300 bg-white py-2 px-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={values.currency}
              onChange={(e) => setField("currency", e.target.value)}
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </Field>
          <Field label="Status">
            <select
              className="w-full rounded-md border border-gray-300 bg-white py-2 px-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={values.status}
              onChange={(e) => setField("status", e.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="needs_review">Needs Review</option>
              <option value="sent">Sent</option>
            </select>
          </Field>
          <Field label="Sales person">
            <TextInput
              value={values.sales_person}
              onChange={(e) => setField("sales_person", e.target.value)}
              placeholder="e.g. Sarah Jenkins"
            />
          </Field>
        </div>
      </Card>

      {/* Line items card */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Line items</h2>
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
                      <div className="flex flex-col gap-1.5 min-w-[200px]">
                        <select
                          className="w-full rounded-md border border-gray-300 bg-white py-1.5 px-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          value={item.product_id || ""}
                          onChange={(e) => {
                            const pid = e.target.value;
                            const prod = products.find(
                              (p) => String(p.id) === pid,
                            );
                            if (prod) {
                              updateItem(idx, "product_id", pid);
                              updateItem(idx, "description", prod.name || "");
                              updateItem(idx, "unit_price", prod.price || 0);
                              updateItem(idx, "tax_rate", prod.tax_rate || 0);
                            } else {
                              updateItem(idx, "product_id", "");
                            }
                          }}
                        >
                          <option value="">
                            -- Custom Item (Type description below) --
                          </option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.sku ? `[${p.sku}]` : ""} -{" "}
                              {formatCurrency(p.price)}
                            </option>
                          ))}
                        </select>
                        <TextInput
                          value={item.description}
                          onChange={(e) =>
                            updateItem(idx, "description", e.target.value)
                          }
                          placeholder="Item description"
                        />
                      </div>
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

        {/* Adjustments and Totals grid */}
        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Left panel for charges */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">
              Financial Adjustments
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Shipping charges">
                <TextInput
                  type="number"
                  min="0"
                  step="any"
                  value={values.shipping_charges}
                  onChange={(e) => setField("shipping_charges", e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Additional charges">
                <TextInput
                  type="number"
                  min="0"
                  step="any"
                  value={values.additional_charges}
                  onChange={(e) =>
                    setField("additional_charges", e.target.value)
                  }
                  placeholder="0.00"
                />
              </Field>
            </div>
          </div>

          {/* Right panel for overall summaries */}
          <div className="flex justify-end items-end">
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
              {Number(values.shipping_charges) > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span>{formatCurrency(values.shipping_charges)}</span>
                </div>
              )}
              {Number(values.additional_charges) > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Additional charges</span>
                  <span>{formatCurrency(values.additional_charges)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-1.5 text-base font-semibold text-gray-900">
                <span>Grand total</span>
                <span>{formatCurrency(totals.grand_total)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Notes & terms card */}
      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Notes &amp; terms
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          <Field label="Internal notes">
            <TextArea
              rows={3}
              value={values.internal_notes}
              onChange={(e) => setField("internal_notes", e.target.value)}
              placeholder="Private system details (not visible to customer)"
            />
          </Field>
        </div>
      </Card>

      {/* Enterprise metadata card */}
      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Enterprise metadata
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Tags"
            hint="Comma-separated tags (e.g. Q3, Enterprise, Retail)"
          >
            <TextInput
              value={values.tags}
              onChange={(e) => setField("tags", e.target.value)}
              placeholder="Q3, Enterprise, Retail"
            />
          </Field>
          <Field label="Attachments" hint="Comma-separated URL links to files">
            <TextInput
              value={values.attachments}
              onChange={(e) => setField("attachments", e.target.value)}
              placeholder="https://example.com/invoice-doc.pdf"
            />
          </Field>
        </div>
      </Card>

      {/* Custom fields card */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Custom fields
          </h2>
          <Button
            variant="secondary"
            type="button"
            onClick={() =>
              setValues((v) => ({
                ...v,
                custom_fields: [...v.custom_fields, { key: "", value: "" }],
              }))
            }
          >
            + Add Custom Field
          </Button>
        </div>
        {values.custom_fields.length === 0 ? (
          <p className="text-sm text-gray-500">No custom fields added yet.</p>
        ) : (
          <div className="space-y-3">
            {values.custom_fields.map((field, fIdx) => (
              <div key={fIdx} className="flex gap-2 items-center">
                <TextInput
                  placeholder="Field Name (e.g., Cost Center)"
                  value={field.key}
                  onChange={(e) => {
                    const key = e.target.value;
                    setValues((v) => {
                      const custom_fields = v.custom_fields.slice();
                      custom_fields[fIdx] = { ...custom_fields[fIdx], key };
                      return { ...v, custom_fields };
                    });
                  }}
                />
                <TextInput
                  placeholder="Value"
                  value={field.value}
                  onChange={(e) => {
                    const val = e.target.value;
                    setValues((v) => {
                      const custom_fields = v.custom_fields.slice();
                      custom_fields[fIdx] = {
                        ...custom_fields[fIdx],
                        value: val,
                      };
                      return { ...v, custom_fields };
                    });
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setValues((v) => {
                      const custom_fields = v.custom_fields.slice();
                      custom_fields.splice(fIdx, 1);
                      return { ...v, custom_fields };
                    });
                  }}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
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
