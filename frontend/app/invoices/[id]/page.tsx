"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiDelete, apiGet, apiPost, downloadFile } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  titleCase,
  todayInputValue,
} from "@/lib/format";
import { computeLineTotal } from "@/lib/totals";
import { canEdit as canEditModule } from "@/lib/auth";
import StatusBadge from "@/components/StatusBadge";
import DocumentChain from "@/components/DocumentChain";
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
import ExportButton from "@/components/ExportButton";
import { ExportColumn } from "@/lib/ExportService";

const SINGLE_INVOICE_COLUMNS: ExportColumn[] = [
  { label: "Description", key: "description" },
  { label: "Quantity", key: "quantity" },
  { label: "Unit Price", key: "unit_price" },
  { label: "Tax Rate (%)", key: "tax_rate" },
];

function ApprovalBadge({ status }: { status?: string }) {
  const key = (status || "").toLowerCase();
  if (!key) return <span className="text-xs text-gray-400">—</span>;
  const styles: Record<string, { pill: string; dot: string; label: string }> = {
    pending: {
      pill: "bg-amber-50 text-amber-800",
      dot: "bg-amber-500",
      label: "Pending",
    },
    approved: {
      pill: "bg-emerald-50 text-emerald-700",
      dot: "bg-emerald-500",
      label: "Approved",
    },
    rejected: {
      pill: "bg-red-50 text-red-700",
      dot: "bg-red-500",
      label: "Rejected",
    },
  };
  const s = styles[key] || {
    pill: "bg-ink-100 text-ink-600",
    dot: "bg-ink-400",
    label: key.charAt(0).toUpperCase() + key.slice(1),
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "online", label: "Online" },
];

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [showPayment, setShowPayment] = useState(false);

  const [mayEditInvoices, setMayEditInvoices] = useState(false);
  const [mayEditPayments, setMayEditPayments] = useState(false);
  useEffect(() => {
    setMayEditInvoices(canEditModule("invoices"));
    setMayEditPayments(canEditModule("payments"));
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/invoices/${id}`);
      setInvoice(data?.data || data);
    } catch (err: any) {
      setError(err?.message || "Failed to load invoice.");
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

  async function handleSend() {
    setBusy("send");
    try {
      const res = await apiPost(`/invoices/${id}/send`);
      flash(res?.message || "Invoice sent.");
      load();
    } catch (err: any) {
      flashError(err?.message || "Failed to send invoice.");
    } finally {
      setBusy(null);
    }
  }

  async function handleReminder() {
    setBusy("reminder");
    try {
      const res = await apiPost(`/invoices/${id}/send-reminder`);
      flash(res?.message || "Reminder sent.");
    } catch (err: any) {
      flashError(err?.message || "Failed to send reminder.");
    } finally {
      setBusy(null);
    }
  }

  async function handlePdf() {
    setBusy("pdf");
    try {
      await downloadFile(
        `/invoices/${id}/pdf`,
        `${invoice?.invoice_number || "invoice"}.pdf`,
      );
    } catch (err: any) {
      flashError(err?.message || "Failed to download PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit() {
    setBusy("submit");
    try {
      const res = await apiPost(`/invoices/${id}/submit`);
      if (res && res.success === false) {
        throw new Error(res.message || "Failed to submit invoice.");
      }
      flash(res?.message || "Invoice submitted for approval.");
      load();
    } catch (err: any) {
      flashError(err?.message || "Failed to submit invoice.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRequestApproval() {
    setBusy("request_approval");
    try {
      const res = await apiPost(`/invoices/${id}/request-approval`);
      if (res && res.success === false) {
        throw new Error(res.message || "Failed to request approval.");
      }
      flash(res?.message || "Approval requested.");
      load();
    } catch (err: any) {
      flashError(err?.message || "Failed to request approval.");
    } finally {
      setBusy(null);
    }
  }

  async function handleApprove() {
    setBusy("approve");
    // Debug: log current status before calling the approve endpoint
    console.log(
      "[Invoice Approve] Invoice ID:",
      id,
      "| Current status:",
      invoice?.status,
    );
    try {
      const res = await apiPost(`/invoices/${id}/approve`, { remarks: "" });
      if (res && res.success === false) {
        throw new Error(res.message || "Failed to approve invoice.");
      }
      flash(res?.message || "Invoice approved.");
      load();
    } catch (err: any) {
      flashError(err?.message || "Failed to approve invoice.");
    } finally {
      setBusy(null);
    }
  }

  async function handleReject() {
    const remarks = window.prompt("Enter rejection reason (optional):") ?? "";
    setBusy("reject");
    // Debug: log current status before calling the reject endpoint
    console.log(
      "[Invoice Reject] Invoice ID:",
      id,
      "| Current status:",
      invoice?.status,
      "| Remarks:",
      remarks,
    );
    try {
      const res = await apiPost(`/invoices/${id}/reject`, { remarks });
      if (res && res.success === false) {
        throw new Error(res.message || "Failed to reject invoice.");
      }
      flash(res?.message || "Invoice rejected.");
      load();
    } catch (err: any) {
      flashError(err?.message || "Failed to reject invoice.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Are you sure you want to delete / cancel this invoice? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy("delete");
    try {
      const res = await apiDelete(`/invoices/${id}`);
      if (res && res.success === false) {
        throw new Error(res.message || "Failed to delete invoice.");
      }
      if (res?.cascaded?.quotation_number) {
        setActionMsg(
          `Invoice ${res.deleted ? "deleted" : "cancelled"}. Linked quotation ${res.cascaded.quotation_number} was also marked rejected.`,
        );
        setTimeout(() => router.push("/invoices"), 2000);
      } else {
        router.push("/invoices");
      }
    } catch (err: any) {
      flashError(err?.message || "Failed to delete invoice.");
      setBusy(null);
    }
  }

  if (loading) {
    return <Loading label="Loading invoice..." />;
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Invoice" />
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div>
        <PageHeader title="Invoice" />
        <ErrorState message="Invoice not found." />
      </div>
    );
  }

  const items: any[] = Array.isArray(invoice.invoice_items)
    ? invoice.invoice_items
    : [];
  const payments: any[] = Array.isArray(invoice.payments)
    ? invoice.payments
    : [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={invoice.invoice_number || "Invoice"}
        description="Invoice details, payments and actions."
        actions={
          <>
            {/* ── Enterprise Export Center: always available ── */}
            <ExportButton
              title="Invoice"
              filename={invoice.invoice_number || "invoice"}
              columns={SINGLE_INVOICE_COLUMNS}
              data={[invoice]}
              isDocument={true}
              documentData={invoice}
              pdfUrl={`/invoices/${id}/pdf`}
              requiredPermission="invoice.export"
            />

            {/* ── DRAFT: Edit + Submit ── */}
            {mayEditInvoices &&
            ["draft", "needs_review"].includes(
              (invoice.status || "").toLowerCase(),
            ) ? (
              <>
                <Link href={`/invoices/${id}/edit`}>
                  <Button variant="secondary" disabled={busy !== null}>
                    Edit
                  </Button>
                </Link>
                <Button onClick={handleSubmit} disabled={busy !== null}>
                  {busy === "submit" ? "Submitting..." : "Submit"}
                </Button>
              </>
            ) : null}

            {/* ── SUBMITTED: Request Approval ── */}
            {mayEditInvoices &&
            (invoice.status || "").toLowerCase() === "submitted" ? (
              <Button onClick={handleRequestApproval} disabled={busy !== null}>
                {busy === "request_approval"
                  ? "Requesting..."
                  : "Request Approval"}
              </Button>
            ) : null}

            {/* ── PENDING APPROVAL: Approve + Reject ── */}
            {mayEditInvoices &&
            (invoice.status || "").toLowerCase() === "pending_approval" ? (
              <>
                <Button onClick={handleApprove} disabled={busy !== null}>
                  {busy === "approve" ? "Approving..." : "Approve"}
                </Button>
                <Button
                  variant="danger"
                  onClick={handleReject}
                  disabled={busy !== null}
                >
                  {busy === "reject" ? "Rejecting..." : "Reject"}
                </Button>
              </>
            ) : null}

            {/* ── APPROVED: Send to customer ── */}
            {mayEditInvoices &&
            (invoice.status || "").toLowerCase() === "approved" ? (
              <Button onClick={handleSend} disabled={busy !== null}>
                {busy === "send" ? "Sending..." : "Send Invoice"}
              </Button>
            ) : null}

            {/* ── SENT / PARTIALLY PAID: Send Reminder ── */}
            {mayEditInvoices &&
            ["sent", "partially_paid"].includes(
              (invoice.status || "").toLowerCase(),
            ) ? (
              <Button
                variant="secondary"
                onClick={handleReminder}
                disabled={busy !== null}
              >
                {busy === "reminder" ? "Sending..." : "Send Reminder"}
              </Button>
            ) : null}

            {/* ── Delete/Cancel: available until paid ── */}
            {mayEditInvoices &&
            !["paid", "cancelled"].includes(
              (invoice.status || "").toLowerCase(),
            ) ? (
              <Button
                variant="danger"
                onClick={handleDelete}
                disabled={busy !== null}
              >
                {busy === "delete" ? "Deleting..." : "Delete / Cancel"}
              </Button>
            ) : null}
          </>
        }
      />

      <DocumentChain
        currentType="invoice"
        proposal={
          invoice.quotations && invoice.quotations.proposals
            ? {
                id: invoice.quotations.proposals.id,
                number: invoice.quotations.proposals.proposal_number,
                status: invoice.quotations.proposals.status,
              }
            : null
        }
        quotation={
          invoice.quotations
            ? {
                id: invoice.quotations.id,
                number: invoice.quotations.quotation_number,
                status: invoice.quotations.status,
              }
            : null
        }
        invoice={{
          id: invoice.id,
          number: invoice.invoice_number,
          status: invoice.status,
        }}
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
              <StatusBadge
                status={invoice.status}
                isOverdue={invoice.is_overdue}
              />
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Grand Total
            </div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              {formatCurrency(invoice.grand_total)}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Billed To
            </div>
            <div className="mt-1 text-sm text-gray-900">
              {invoice.customer_name}
            </div>
            <div className="text-sm text-gray-500">
              {invoice.customer_email}
            </div>
            <div className="text-sm text-gray-500">
              {invoice.customer_phone}
            </div>
            <div className="text-sm text-gray-500">
              <strong>Billing:</strong> {invoice.billing_address}
            </div>
            {invoice.shipping_address && (
              <div className="text-sm text-gray-500">
                <strong>Shipping:</strong> {invoice.shipping_address}
              </div>
            )}
          </div>
          <div className="sm:text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Details
            </div>
            <div className="mt-1 text-sm text-gray-600">
              Invoice date: {formatDate(invoice.invoice_date)}
            </div>
            <div className="text-sm text-gray-600">
              Due date: {formatDate(invoice.due_date)}
            </div>
            {invoice.currency && (
              <div className="text-sm text-gray-600">
                Currency: {invoice.currency}
              </div>
            )}
            {invoice.sales_person && (
              <div className="text-sm text-gray-600">
                Sales person: {invoice.sales_person}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="mb-5 p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          Line Items
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 px-2 text-right">Qty</th>
                <th className="py-2 px-2 text-right">Unit Price</th>
                <th className="py-2 px-2 text-right">Disc %</th>
                <th className="py-2 px-2 text-right">Tax %</th>
                <th className="py-2 pl-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-4 text-center text-sm text-gray-400"
                  >
                    No line items.
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => {
                  const r = computeLineTotal(it);
                  return (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-2 pr-3 text-gray-900">
                        {it.description}
                      </td>
                      <td className="py-2 px-2 text-right text-gray-600">
                        {it.quantity}
                      </td>
                      <td className="py-2 px-2 text-right text-gray-600">
                        {formatCurrency(it.unit_price)}
                      </td>
                      <td className="py-2 px-2 text-right text-gray-600">
                        {it.discount ?? 0}
                      </td>
                      <td className="py-2 px-2 text-right text-gray-600">
                        {it.tax_rate ?? 0}
                      </td>
                      <td className="py-2 pl-2 text-right font-medium text-gray-900">
                        {formatCurrency(
                          it.line_total != null ? it.line_total : r.lineTotal,
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Discount</span>
              <span>- {formatCurrency(invoice.discount)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Tax</span>
              <span>{formatCurrency(invoice.tax_amount)}</span>
            </div>
            {Number(invoice.shipping_charges) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span>
                <span>{formatCurrency(invoice.shipping_charges)}</span>
              </div>
            )}
            {Number(invoice.additional_charges) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Additional Charges</span>
                <span>{formatCurrency(invoice.additional_charges)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold text-gray-900">
              <span>Grand Total</span>
              <span>{formatCurrency(invoice.grand_total)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Paid</span>
              <span>{formatCurrency(invoice.paid_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1.5 text-base font-semibold text-accent">
              <span>Balance Due</span>
              <span>{formatCurrency(invoice.balance_due)}</span>
            </div>
          </div>
        </div>
      </Card>

      {invoice.notes || invoice.terms || invoice.internal_notes ? (
        <Card className="mb-5 p-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Notes
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
                {invoice.notes || "-"}
              </p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Terms
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
                {invoice.terms || "-"}
              </p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Internal Notes
              </div>
              <p className="mt-1 whitespace-pre-wrap text-xs font-mono text-gray-600 bg-gray-50 p-2 rounded">
                {invoice.internal_notes || "-"}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {invoice.tags?.length > 0 ||
      invoice.attachments?.length > 0 ||
      (invoice.custom_fields &&
        Object.keys(invoice.custom_fields).length > 0) ? (
        <Card className="mb-5 p-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {invoice.tags?.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-400">
                  Tags
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {invoice.tags.map((tag: string, tIdx: number) => (
                    <span
                      key={tIdx}
                      className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {invoice.attachments?.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-400">
                  Attachments
                </div>
                <div className="mt-1.5 space-y-1">
                  {invoice.attachments.map((att: string, aIdx: number) => (
                    <a
                      key={aIdx}
                      href={att}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-indigo-600 hover:underline truncate"
                    >
                      {att}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {invoice.custom_fields &&
              Object.keys(invoice.custom_fields).length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">
                    Additional Details
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {Object.entries(invoice.custom_fields).map(([k, v]) => (
                      <div key={k} className="text-xs text-gray-600">
                        <strong className="text-gray-800">{k}:</strong>{" "}
                        {String(v)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        </Card>
      ) : null}

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Payments</h2>
          {mayEditPayments ? (
            <Button onClick={() => setShowPayment(true)}>Record Payment</Button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3">Payment #</th>
                <th className="py-2 px-2">Date</th>
                <th className="py-2 px-2">Method</th>
                <th className="py-2 px-2">Reference</th>
                <th className="py-2 px-2">Approval</th>
                <th className="py-2 pl-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-4 text-center text-sm text-gray-400"
                  >
                    No payments recorded yet.
                  </td>
                </tr>
              ) : (
                payments.map((p, idx) => (
                  <tr
                    key={idx}
                    onClick={() =>
                      p.id ? router.push(`/payments/${p.id}`) : null
                    }
                    className={`border-b border-gray-100 ${
                      p.id ? "cursor-pointer hover:bg-blue-50" : ""
                    }`}
                  >
                    <td className="py-2 pr-3 text-gray-900">
                      {p.payment_number}
                    </td>
                    <td className="py-2 px-2 text-gray-600">
                      {formatDate(p.payment_date)}
                    </td>
                    <td className="py-2 px-2 text-gray-600">
                      {titleCase(p.payment_method)}
                    </td>
                    <td className="py-2 px-2 text-gray-600">
                      {p.reference_number || "-"}
                    </td>
                    <td className="py-2 px-2">
                      <ApprovalBadge status={p.approval_status} />
                    </td>
                    <td className="py-2 pl-2 text-right font-medium text-gray-900">
                      {formatCurrency(p.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showPayment ? (
        <RecordPaymentModal
          invoiceId={id}
          balanceDue={invoice.balance_due}
          onClose={() => setShowPayment(false)}
          onSuccess={(msg) => {
            setShowPayment(false);
            flash(msg);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function RecordPaymentModal({
  invoiceId,
  balanceDue,
  onClose,
  onSuccess,
}: {
  invoiceId: string;
  balanceDue: any;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [amount, setAmount] = useState<string>(
    balanceDue != null ? String(balanceDue) : "",
  );
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(todayInputValue());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [sendReceipt, setSendReceipt] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiPost("/payments", {
        invoice_id: invoiceId,
        amount: amt,
        payment_method: method,
        payment_date: date,
        reference_number: reference,
        notes,
        send_receipt: sendReceipt,
      });
      if (res && res.success === false) {
        // Overpayment / validation errors come back here too.
        throw new Error(res.message || "Failed to record payment.");
      }
      // Payments now enter the workflow as `pending` and require approval.
      onSuccess(res?.message || "Payment recorded; awaiting approval.");
    } catch (err: any) {
      // HTTP 400 overpayment message is surfaced via err.message.
      setError(err?.message || "Failed to record payment.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-900">
            Record Payment
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

          <Field label="Amount" required>
            <TextInput
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Payment method" required>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Payment date" required>
            <TextInput
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Reference number">
            <TextInput
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Transaction / cheque #"
            />
          </Field>
          <Field label="Notes">
            <TextArea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={sendReceipt}
              onChange={(e) => setSendReceipt(e.target.checked)}
            />
            Send receipt email to customer
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Record Payment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
