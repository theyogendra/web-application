"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  titleCase,
} from "@/lib/format";
import { canEdit as canEditModule } from "@/lib/auth";
import {
  Button,
  Card,
  ErrorState,
  Field,
  Loading,
  PageHeader,
  TextArea,
} from "@/components/ui";
import ExportButton from "@/components/ExportButton";
import { ExportColumn } from "@/lib/ExportService";

const SINGLE_PAYMENT_COLUMNS: ExportColumn[] = [
  { label: "Payment Number", key: "payment_number" },
  {
    label: "Invoice Number",
    key: "invoice_number",
    value: (row: any) => row.invoices?.invoice_number || "",
  },
  {
    label: "Customer Name",
    key: "customer_name",
    value: (row: any) => row.invoices?.customer_name || "",
  },
  { label: "Amount", key: "amount" },
  {
    label: "Method",
    key: "payment_method",
    value: (row: any) => titleCase(row.payment_method),
  },
  { label: "Date", key: "payment_date" },
  { label: "Reference Number", key: "reference_number" },
  { label: "Approval Status", key: "approval_status" },
  { label: "Notes", key: "notes" },
];

function ApprovalPill({ status }: { status?: string }) {
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
    label: titleCase(key),
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

export default function PaymentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [payment, setPayment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [showReject, setShowReject] = useState(false);

  const [mayEdit, setMayEdit] = useState(false);
  useEffect(() => {
    setMayEdit(canEditModule("payments"));
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/payments/${id}`);
      setPayment(data?.data || data);
    } catch (err: any) {
      setError(err?.message || "Failed to load payment.");
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

  async function handleApprove() {
    setBusy("approve");
    try {
      const res = await apiPost(`/payments/${id}/approve`);
      if (res && res.success === false) {
        throw new Error(res.message || "Failed to approve payment.");
      }
      flash(res?.message || "Payment approved.");
      load();
    } catch (err: any) {
      flashError(err?.message || "Failed to approve payment.");
    } finally {
      setBusy(null);
    }
  }

  async function handleReject(reason: string) {
    setBusy("reject");
    try {
      const res = await apiPost(`/payments/${id}/reject`, { reason });
      if (res && res.success === false) {
        throw new Error(res.message || "Failed to reject payment.");
      }
      setShowReject(false);
      flash(res?.message || "Payment rejected.");
      load();
    } catch (err: any) {
      flashError(err?.message || "Failed to reject payment.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <Loading label="Loading payment..." />;
  }
  if (error) {
    return (
      <div>
        <PageHeader title="Payment" />
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (!payment) {
    return (
      <div>
        <PageHeader title="Payment" />
        <ErrorState message="Payment not found." />
      </div>
    );
  }

  const status = (payment.approval_status || "").toLowerCase();
  const canApprove = status === "pending" && mayEdit;
  const canReject = status === "pending" && mayEdit;
  const invoice = payment.invoices || payment.invoice || null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={payment.payment_number || "Payment"}
        description="Payment details and approval status."
        actions={
          <div className="flex items-center gap-3">
            <ExportButton
              title="Payment Receipt"
              filename={payment.payment_number || "payment"}
              columns={SINGLE_PAYMENT_COLUMNS}
              data={[payment]}
              isDocument={true}
              documentData={payment}
              requiredPermission="payment.export"
            />
            {canApprove ? (
              <Button onClick={handleApprove} disabled={busy !== null}>
                {busy === "approve" ? "Approving..." : "Approve"}
              </Button>
            ) : null}
            {canReject ? (
              <Button
                variant="danger"
                onClick={() => setShowReject(true)}
                disabled={busy !== null}
              >
                Reject
              </Button>
            ) : null}
          </div>
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
              Approval
            </div>
            <div className="mt-1">
              <ApprovalPill status={payment.approval_status} />
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Amount
            </div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              {formatCurrency(payment.amount)}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Payment details
            </div>
            <div className="mt-1 text-sm text-gray-700">
              Method: {titleCase(payment.payment_method)}
            </div>
            <div className="text-sm text-gray-700">
              Date: {formatDate(payment.payment_date)}
            </div>
            <div className="text-sm text-gray-700">
              Reference: {payment.reference_number || "—"}
            </div>
            {payment.notes ? (
              <div className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                {payment.notes}
              </div>
            ) : null}
          </div>
          <div className="sm:text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Approval trail
            </div>
            <div className="mt-1 text-sm text-gray-700">
              Approved at:{" "}
              {payment.approved_at ? formatDateTime(payment.approved_at) : "—"}
            </div>
            <div className="text-sm text-gray-700">
              Approved by:{" "}
              {payment.approved_by_user?.full_name ||
                payment.approved_by_user?.email ||
                payment.approved_by ||
                "—"}
            </div>
            <div className="text-sm text-gray-700">
              Rejected at:{" "}
              {payment.rejected_at ? formatDateTime(payment.rejected_at) : "—"}
            </div>
            {payment.rejection_reason ? (
              <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-left text-xs text-red-700 sm:text-right">
                <span className="block text-[10px] font-semibold uppercase tracking-wide">
                  Rejection reason
                </span>
                {payment.rejection_reason}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Invoice</h2>
        {invoice ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Invoice #
              </div>
              <div className="mt-1 text-sm">
                <Link
                  href={`/invoices/${invoice.id || payment.invoice_id}`}
                  className="font-semibold text-accent hover:underline"
                >
                  {invoice.invoice_number || payment.invoice_id}
                </Link>
              </div>
              <div className="mt-1 text-sm text-gray-600">
                Customer: {invoice.customer_name || "—"}
              </div>
            </div>
            <div className="sm:text-right">
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Invoice total
              </div>
              <div className="mt-1 text-sm text-gray-700">
                {invoice.grand_total != null
                  ? formatCurrency(invoice.grand_total)
                  : "—"}
              </div>
              <div className="text-sm text-gray-700">
                Balance:{" "}
                {invoice.balance_due != null
                  ? formatCurrency(invoice.balance_due)
                  : "—"}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No linked invoice.</p>
        )}
      </Card>

      {showReject ? (
        <RejectPaymentModal
          onClose={() => setShowReject(false)}
          onSubmit={handleReject}
          submitting={busy === "reject"}
        />
      ) : null}
    </div>
  );
}

function RejectPaymentModal({
  onClose,
  onSubmit,
  submitting,
}: {
  onClose: () => void;
  onSubmit: (reason: string) => void;
  submitting: boolean;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Please provide a rejection reason.");
      return;
    }
    setError(null);
    onSubmit(reason.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-900">
            Reject Payment
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
          <Field label="Reason" required>
            <TextArea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this payment being rejected?"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Reject Payment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
