"use client";

import Link from "next/link";
import { ChevronRight, FileText, Receipt, Sparkles } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

type StageProps = {
  href: string | null;
  label: string;
  number: string;
  status?: string;
  current?: boolean;
  Icon: any;
};

function Stage({ href, label, number, status, current, Icon }: StageProps) {
  const body = (
    <div
      className={[
        "flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors",
        current
          ? "border-[#0071E3]/30 bg-[#0A84FF]/8"
          : href
          ? "border-[var(--separator-soft)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)] hover:border-[var(--separator)]"
          : "border-dashed border-[var(--separator-soft)] bg-transparent opacity-60",
      ].join(" ")}
    >
      <Icon
        size={15}
        className={current ? "text-[#0071E3]" : "text-[var(--text-tertiary)]"}
      />
      <div className="leading-tight">
        <p className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
          {label}
        </p>
        <p className="text-[13px] font-semibold text-[var(--text-primary)]">
          {number || "—"}
        </p>
      </div>
      {status ? (
        <span className="ml-1">
          <StatusBadge status={status} />
        </span>
      ) : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block">{body}</Link>
  ) : (
    body
  );
}

/**
 * Renders the proposal → quotation → invoice breadcrumb so the user can see
 * the whole chain at a glance, regardless of which detail page they're on.
 *
 * Pass the three stages directly. Any null stage renders as a placeholder
 * (greyed out, no link).
 */
export default function DocumentChain({
  proposal,
  quotation,
  invoice,
  currentType,
}: {
  proposal?: { id?: string | null; number?: string | null; status?: string | null } | null;
  quotation?: { id?: string | null; number?: string | null; status?: string | null } | null;
  invoice?: { id?: string | null; number?: string | null; status?: string | null } | null;
  currentType: "proposal" | "quotation" | "invoice";
}) {
  return (
    <div className="surface mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--separator-soft)] p-3 shadow-card">
      <span className="ml-1 mr-2 text-[11px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
        Document chain
      </span>

      <Stage
        href={proposal?.id ? `/proposals/${proposal.id}` : null}
        label="Proposal"
        number={proposal?.number || "Not linked"}
        status={proposal?.status || undefined}
        current={currentType === "proposal"}
        Icon={Sparkles}
      />
      <ChevronRight size={14} className="text-[var(--text-tertiary)]" />
      <Stage
        href={quotation?.id ? `/quotations/${quotation.id}` : null}
        label="Quotation"
        number={quotation?.number || "Not linked"}
        status={quotation?.status || undefined}
        current={currentType === "quotation"}
        Icon={FileText}
      />
      <ChevronRight size={14} className="text-[var(--text-tertiary)]" />
      <Stage
        href={invoice?.id ? `/invoices/${invoice.id}` : null}
        label="Invoice"
        number={invoice?.number || "Not linked"}
        status={invoice?.status || undefined}
        current={currentType === "invoice"}
        Icon={Receipt}
      />
    </div>
  );
}
