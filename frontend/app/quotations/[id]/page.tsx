"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  apiDelete,
  apiGet,
  apiPost,
  downloadFile,
} from "@/lib/api";
import {
  formatCurrency,
  formatDate,
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
  TextInput,
} from "@/components/ui";

export default function QuotationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [quotation, setQuotation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [showConvert, setShowConvert] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<{ id: string; invoice_number: string } | null>(null);

  const [mayEdit, setMayEdit] = useState(false);
  useEffect(() => {
    setMayEdit(canEditModule("quotations"));
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/quotations/${id}`);
      setQuotation(data?.data || data);
    } catch (err: any) {
      setError(err?.message || "Failed to load quotation.");
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
    setInfoMsg(null);
    setActionError(null);
    setTimeout(() => setActionMsg(null), 5000);
  }
  function flashInfo(msg: string) {
    setInfoMsg(msg);
    setActionMsg(null);
    setActionError(null);
    setTimeout(() => setInfoMsg(null), 6000);
  }
  function flashError(msg: string) {
    setActionError(msg);
    setActionMsg(null);
    setInfoMsg(null);
  }

  async function handleSend() {
    if (!quotation?.customer_email) {
      flashError("Add a customer email before sending.");
      return;
    }
    setBusy("send");
    try {
      const res = await apiPost(`/quotations/${id}/send`);
      if (res?.email?.skipped) {
        flashInfo("Email skipped — RESEND_API_KEY not configured.");
      } else {
        flash(res?.message || "Quotation sent.");
      }
      load();
    } catch (err: any) {
      flashError(err?.message || "Failed to send quotation.");
    } finally {
      setBusy(null);
    }
  }

  async function handlePdf() {
    setBusy("pdf");
    try {
      await downloadFile(
        `/quotations/${id}/pdf`,
        `${quotation?.quotation_number || "quotation"}.pdf`
      );
    } catch (err: any) {
      flashError(err?.message || "Failed to download PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function handleMark(action: "accepted" | "rejected") {
    setBusy(action);
    try {
      const path =
        action === "accepted" ? "mark-accepted" : "mark-rejected";
      const res = await apiPost(`/quotations/${id}/${path}`);
      if (res && res.success === false) {
        throw new Error(res.message || `Failed to mark ${action}.`);
      }
      // When accepting, the backend now auto-creates a draft invoice and
      // returns it alongside the updated quotation.
      const inv = res?.data?.invoice || res?.invoice;
      if (action === "accepted" && inv?.id) {
        setCreatedInvoice({
          id: inv.id,
          invoice_number: inv.invoice_number || inv.id,
        });
        flash(
          `Quotation accepted; draft invoice ${inv.invoice_number || ""} created.`,
        );
      } else if (action === "rejected" && res?.cascaded?.proposal_number) {
        // Backward cascade: linked proposal was also marked rejected.
        setCreatedInvoice(null);
        flash(
          `Quotation rejected. Linked proposal ${res.cascaded.proposal_number} was also marked rejected.`
        );
      } else {
        setCreatedInvoice(null);
        flash(`Marked ${action}.`);
      }
      load();
    } catch (err: any) {
      flashError(err?.message || `Failed to mark ${action}.`);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    const isDraft = (quotation?.status || "").toLowerCase() === "draft";
    const verb = isDraft ? "delete" : "cancel";
    if (
      !window.confirm(
        `Are you sure you want to ${verb} this quotation? This cannot be undone.`
      )
    ) {
      return;
    }
    setBusy("delete");
    try {
      const res = await apiDelete(`/quotations/${id}`);
      if (res && res.success === false) {
        throw new Error(res.message || `Failed to ${verb} quotation.`);
      }
      if (res?.cascaded?.proposal_number) {
        setActionMsg(
          `Quotation ${verb}ed. Linked proposal ${res.cascaded.proposal_number} was also marked rejected.`
        );
        setTimeout(() => router.push("/quotations"), 2000);
      } else {
        router.push("/quotations");
      }
    } catch (err: any) {
      flashError(err?.message || `Failed to ${verb} quotation.`);
      setBusy(null);
    }
  }

  if (loading) {
    return <Loading label="Loading quotation..." />;
  }
  if (error) {
    return (
      <div>
        <PageHeader title="Quotation" />
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (!quotation) {
    return (
      <div>
        <PageHeader title="Quotation" />
        <ErrorState message="Quotation not found." />
      </div>
    );
  }

  const status = (quotation.status || "draft").toLowerCase();
  const isOpen = status === "draft" || status === "sent";
  const isTerminal =
    status === "converted" || status === "cancelled" || status === "rejected";
  const statusAllowsEdit = status !== "converted" && status !== "cancelled";
  const canSend = (status === "draft" || status === "sent") && mayEdit;
  const canMark = isOpen && mayEdit;
  const canConvert = !isTerminal && status !== "rejected" && mayEdit;
  const canDelete = status !== "converted" && mayEdit;
  const showEditLink = statusAllowsEdit && mayEdit;

  const items: any[] = Array.isArray(quotation.quotation_items)
    ? quotation.quotation_items
    : [];
  const linkedInvoice = quotation.invoices;
  const linkedProposal = quotation.proposals;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={quotation.quotation_number || "Quotation"}
        description="Quotation details and actions."
        actions={
          <>
            {showEditLink ? (
              <Link href={`/quotations/${id}/edit`}>
                <Button variant="secondary">Edit</Button>
              </Link>
            ) : null}
            {canSend ? (
              <Button
                variant="secondary"
                onClick={handleSend}
                disabled={busy !== null}
              >
                {busy === "send" ? "Sending..." : "Send"}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={handlePdf}
              disabled={busy !== null}
            >
              {busy === "pdf" ? "Preparing..." : "Download PDF"}
            </Button>
            {canMark ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => handleMark("accepted")}
                  disabled={busy !== null}
                >
                  {busy === "accepted" ? "Saving..." : "Mark Accepted"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleMark("rejected")}
                  disabled={busy !== null}
                >
                  {busy === "rejected" ? "Saving..." : "Mark Rejected"}
                </Button>
              </>
            ) : null}
            {canConvert ? (
              <Button
                onClick={() => setShowConvert(true)}
                disabled={busy !== null}
              >
                Convert to Invoice
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                variant="danger"
                onClick={handleDelete}
                disabled={busy !== null}
              >
                {busy === "delete"
                  ? "Working..."
                  : status === "draft"
                  ? "Delete"
                  : "Cancel"}
              </Button>
            ) : null}
          </>
        }
      />

      <DocumentChain
        currentType="quotation"
        proposal={
          quotation.proposals
            ? {
                id: quotation.proposals.id,
                number: quotation.proposals.proposal_number,
                status: quotation.proposals.status,
              }
            : null
        }
        quotation={{
          id: quotation.id,
          number: quotation.quotation_number,
          status: quotation.status,
        }}
        invoice={
          quotation.invoices
            ? {
                id: quotation.invoices.id,
                number: quotation.invoices.invoice_number,
                status: quotation.invoices.status,
              }
            : null
        }
      />

      {actionMsg ? (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <div>{actionMsg}</div>
          {createdInvoice ? (
            <Link
              href={`/invoices/${createdInvoice.id}`}
              className="mt-1 inline-block font-semibold underline"
            >
              Open invoice →
            </Link>
          ) : null}
        </div>
      ) : null}
      {infoMsg ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {infoMsg}
        </div>
      ) : null}
      {actionError ? (
        <div className="mb-4">
          <ErrorState message={actionError} />
        </div>
      ) : null}

      {linkedInvoice ? (
        <div className="mb-4 rounded-md border border-purple-200 bg-purple-50 p-3 text-sm text-purple-800">
          Converted to Invoice{" "}
          <Link
            href={`/invoices/${linkedInvoice.id}`}
            className="font-semibold underline"
          >
            {linkedInvoice.invoice_number}
          </Link>
          .
        </div>
      ) : null}
      {linkedProposal ? (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Created from Proposal{" "}
          <Link
            href={`/proposals/${linkedProposal.id}`}
            className="font-semibold underline"
          >
            {linkedProposal.proposal_number}
          </Link>
          .
        </div>
      ) : null}

      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Status
            </div>
            <div className="mt-1 inline-flex flex-wrap gap-1.5">
              <StatusBadge status={quotation.status} />
              {quotation.is_expired ? (
                <StatusBadge status="expired" />
              ) : null}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Grand Total
            </div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              {formatCurrency(quotation.grand_total)}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Customer
            </div>
            <div className="mt-1 text-sm text-gray-900">
              {quotation.customer_name}
            </div>
            <div className="text-sm text-gray-500">
              {quotation.customer_email}
            </div>
            <div className="text-sm text-gray-500">
              {quotation.customer_phone}
            </div>
            <div className="text-sm text-gray-500">
              {quotation.billing_address}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Dates
            </div>
            <div className="mt-1 text-sm text-gray-600">
              Quotation date: {formatDate(quotation.quotation_date)}
            </div>
            <div className="text-sm text-gray-600">
              Valid until: {formatDate(quotation.valid_until)}
            </div>
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
                          it.line_total != null ? it.line_total : r.lineTotal
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
              <span>{formatCurrency(quotation.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Discount</span>
              <span>- {formatCurrency(quotation.discount)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Tax</span>
              <span>{formatCurrency(quotation.tax_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1.5 text-base font-semibold text-gray-900">
              <span>Grand Total</span>
              <span>{formatCurrency(quotation.grand_total)}</span>
            </div>
          </div>
        </div>
      </Card>

      {quotation.notes || quotation.terms ? (
        <Card className="mb-5 p-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Notes
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
                {quotation.notes || "-"}
              </p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Terms
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
                {quotation.terms || "-"}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {showConvert ? (
        <ConvertToInvoiceModal
          quotationId={id}
          onClose={() => setShowConvert(false)}
          onSuccess={(invoiceId) => {
            setShowConvert(false);
            router.push(`/invoices/${invoiceId}`);
          }}
          onError={flashError}
        />
      ) : null}
    </div>
  );
}

function ConvertToInvoiceModal({
  quotationId,
  onClose,
  onSuccess,
  onError,
}: {
  quotationId: string;
  onClose: () => void;
  onSuccess: (invoiceId: string) => void;
  onError: (msg: string) => void;
}) {
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        "Convert this quotation to an invoice? The quotation will be marked Converted."
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      const body: any = {};
      if (dueDate) body.due_date = dueDate;
      const res = await apiPost(
        `/quotations/${quotationId}/convert-to-invoice`,
        body
      );
      if (res && res.success === false) {
        throw new Error(res.message || "Failed to convert.");
      }
      const invoice = res?.data?.invoice || res?.invoice;
      const invoiceId = invoice?.id;
      if (!invoiceId) {
        throw new Error("Conversion succeeded but no invoice id was returned.");
      }
      onSuccess(invoiceId);
    } catch (err: any) {
      onError(err?.message || "Failed to convert.");
      setSubmitting(false);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-900">
            Convert to Invoice
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
          <Field
            label="Invoice due date"
            hint="Optional — backend chooses a default if you leave this blank."
          >
            <TextInput
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Converting..." : "Convert"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
