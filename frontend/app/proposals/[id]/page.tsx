"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiDelete, apiGet, apiPost, downloadFile } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
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
import ExportButton from "@/components/ExportButton";
import { ExportColumn } from "@/lib/ExportService";

const SINGLE_PROPOSAL_COLUMNS: ExportColumn[] = [
  { label: "Description", key: "description" },
  { label: "Quantity", key: "quantity" },
  { label: "Unit Price", key: "unit_price" },
  { label: "Tax Rate (%)", key: "tax_rate" },
];

export default function ProposalDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [proposal, setProposal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [showConvert, setShowConvert] = useState(false);

  const [mayEdit, setMayEdit] = useState(false);
  useEffect(() => {
    setMayEdit(canEditModule("proposals"));
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/proposals/${id}`);
      setProposal(data?.data || data);
    } catch (err: any) {
      setError(err?.message || "Failed to load proposal.");
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
    if (!proposal?.customer_email) {
      flashError("Add a customer email before sending.");
      return;
    }
    setBusy("send");
    try {
      const res = await apiPost(`/proposals/${id}/send`);
      if (res?.email?.skipped) {
        flashInfo("Email skipped — RESEND_API_KEY not configured.");
      } else {
        flash(res?.message || "Proposal sent.");
      }
      load();
    } catch (err: any) {
      flashError(err?.message || "Failed to send proposal.");
    } finally {
      setBusy(null);
    }
  }

  async function handlePdf() {
    setBusy("pdf");
    try {
      await downloadFile(
        `/proposals/${id}/pdf`,
        `${proposal?.proposal_number || "proposal"}.pdf`,
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
      const path = action === "accepted" ? "mark-accepted" : "mark-rejected";
      const res = await apiPost(`/proposals/${id}/${path}`);
      if (res && res.success === false) {
        throw new Error(res.message || `Failed to mark ${action}.`);
      }
      flash(`Marked ${action}.`);
      load();
    } catch (err: any) {
      flashError(err?.message || `Failed to mark ${action}.`);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    const isDraft = (proposal?.status || "").toLowerCase() === "draft";
    const verb = isDraft ? "delete" : "cancel";
    if (
      !window.confirm(
        `Are you sure you want to ${verb} this proposal? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy("delete");
    try {
      const res = await apiDelete(`/proposals/${id}`);
      if (res && res.success === false) {
        throw new Error(res.message || `Failed to ${verb} proposal.`);
      }
      // Cascade: if a linked quotation was rejected, surface it inline
      // before navigating away so the user understands the chain.
      if (res?.cascaded?.quotation_number) {
        setActionMsg(
          `Proposal ${verb}ed. Linked quotation ${res.cascaded.quotation_number} was also marked rejected.`,
        );
        // Brief delay so the message is visible before the redirect.
        setTimeout(() => router.push("/proposals"), 2000);
      } else {
        router.push("/proposals");
      }
    } catch (err: any) {
      flashError(err?.message || `Failed to ${verb} proposal.`);
      setBusy(null);
    }
  }

  if (loading) {
    return <Loading label="Loading proposal..." />;
  }
  if (error) {
    return (
      <div>
        <PageHeader title="Proposal" />
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (!proposal) {
    return (
      <div>
        <PageHeader title="Proposal" />
        <ErrorState message="Proposal not found." />
      </div>
    );
  }

  const status = (proposal.status || "draft").toLowerCase();
  const isOpen = status === "draft" || status === "sent";
  const isTerminal =
    status === "converted" || status === "cancelled" || status === "rejected";
  const statusAllowsEdit = status !== "converted" && status !== "cancelled";
  const canSend = (status === "draft" || status === "sent") && mayEdit;
  const canMark = isOpen && mayEdit;
  const canConvert = !isTerminal && mayEdit;
  const canDelete = status !== "converted" && mayEdit;
  const showEditLink = statusAllowsEdit && mayEdit;

  const items: any[] = Array.isArray(proposal.proposal_items)
    ? proposal.proposal_items
    : [];
  const linkedQuotation = proposal.quotations;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={proposal.proposal_number || "Proposal"}
        description="Proposal details and actions."
        actions={
          <>
            {showEditLink ? (
              <Link href={`/proposals/${id}/edit`}>
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
            <ExportButton
              title="Proposal"
              filename={proposal?.proposal_number || "proposal"}
              columns={SINGLE_PROPOSAL_COLUMNS}
              data={[proposal]}
              isDocument={true}
              documentData={proposal}
              pdfUrl={`/proposals/${id}/pdf`}
              requiredPermission="proposals.read"
            />
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
                Convert to Quotation
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
        currentType="proposal"
        proposal={{
          id: proposal.id,
          number: proposal.proposal_number,
          status: proposal.status,
        }}
        quotation={
          proposal.quotations
            ? {
                id: proposal.quotations.id,
                number: proposal.quotations.quotation_number,
                status: proposal.quotations.status,
              }
            : null
        }
        invoice={
          proposal.quotations && proposal.quotations.invoices
            ? {
                id: proposal.quotations.invoices.id,
                number: proposal.quotations.invoices.invoice_number,
                status: proposal.quotations.invoices.status,
              }
            : null
        }
      />

      {actionMsg ? (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {actionMsg}
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

      {linkedQuotation ? (
        <div className="mb-4 rounded-md border border-purple-200 bg-purple-50 p-3 text-sm text-purple-800">
          Converted to Quotation{" "}
          <Link
            href={`/quotations/${linkedQuotation.id}`}
            className="font-semibold underline"
          >
            {linkedQuotation.quotation_number}
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
              <StatusBadge status={proposal.status} />
              {proposal.is_expired ? <StatusBadge status="expired" /> : null}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Grand Total
            </div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              {formatCurrency(proposal.grand_total)}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Customer
            </div>
            <div className="mt-1 text-sm text-gray-900">
              {proposal.customer_name}
            </div>
            <div className="text-sm text-gray-500">
              {proposal.customer_email}
            </div>
            <div className="text-sm text-gray-500">
              {proposal.customer_phone}
            </div>
            <div className="text-sm text-gray-500">
              {proposal.billing_address}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Dates
            </div>
            <div className="mt-1 text-sm text-gray-600">
              Proposal date: {formatDate(proposal.proposal_date)}
            </div>
            <div className="text-sm text-gray-600">
              Valid until: {formatDate(proposal.valid_until)}
            </div>
          </div>
        </div>
      </Card>

      {proposal.scope ? (
        <Card className="mb-5 p-5">
          <div className="text-xs uppercase tracking-wide text-gray-400">
            Scope of work
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
            {proposal.scope}
          </p>
        </Card>
      ) : null}

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
              <span>{formatCurrency(proposal.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Discount</span>
              <span>- {formatCurrency(proposal.discount)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Tax</span>
              <span>{formatCurrency(proposal.tax_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1.5 text-base font-semibold text-gray-900">
              <span>Grand Total</span>
              <span>{formatCurrency(proposal.grand_total)}</span>
            </div>
          </div>
        </div>
      </Card>

      {proposal.notes || proposal.terms ? (
        <Card className="mb-5 p-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Notes
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
                {proposal.notes || "-"}
              </p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Terms
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
                {proposal.terms || "-"}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {showConvert ? (
        <ConvertToQuotationModal
          proposalId={id}
          onClose={() => setShowConvert(false)}
          onSuccess={(quotationId) => {
            setShowConvert(false);
            router.push(`/quotations/${quotationId}`);
          }}
          onError={flashError}
        />
      ) : null}
    </div>
  );
}

function ConvertToQuotationModal({
  proposalId,
  onClose,
  onSuccess,
  onError,
}: {
  proposalId: string;
  onClose: () => void;
  onSuccess: (quotationId: string) => void;
  onError: (msg: string) => void;
}) {
  const [validUntil, setValidUntil] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        "Convert this proposal to a quotation? The proposal will be marked Converted.",
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      const body: any = {};
      if (validUntil) body.valid_until = validUntil;
      const res = await apiPost(
        `/proposals/${proposalId}/convert-to-quotation`,
        body,
      );
      if (res && res.success === false) {
        throw new Error(res.message || "Failed to convert.");
      }
      const quotation = res?.data?.quotation || res?.quotation;
      const quotationId = quotation?.id;
      if (!quotationId) {
        throw new Error(
          "Conversion succeeded but no quotation id was returned.",
        );
      }
      onSuccess(quotationId);
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
            Convert to Quotation
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
            label="Quotation valid until"
            hint="Optional — backend chooses a default if you leave this blank."
          >
            <TextInput
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
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
