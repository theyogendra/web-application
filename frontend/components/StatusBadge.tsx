import { titleCase } from "@/lib/format";

type Props = {
  status?: string;
  isOverdue?: boolean;
};

// Subtle pill with a leading dot — used across invoice / payment / document
// lists so status reads at a glance.
const STATUS_STYLES: Record<string, { pill: string; dot: string }> = {
  draft:          { pill: "bg-ink-100 text-ink-700",         dot: "bg-ink-400" },
  sent:           { pill: "bg-brand-50 text-brand-700",      dot: "bg-brand-500" },
  partially_paid: { pill: "bg-amber-50 text-amber-800",      dot: "bg-amber-500" },
  paid:           { pill: "bg-emerald-50 text-emerald-700",  dot: "bg-emerald-500" },
  cancelled:      { pill: "bg-ink-100 text-ink-500",         dot: "bg-ink-400" },
  overdue:        { pill: "bg-red-50 text-red-700",          dot: "bg-red-500" },
  accepted:       { pill: "bg-emerald-50 text-emerald-700",  dot: "bg-emerald-500" },
  rejected:       { pill: "bg-red-50 text-red-700",          dot: "bg-red-500" },
  expired:        { pill: "bg-orange-50 text-orange-700",    dot: "bg-orange-500" },
  converted:      { pill: "bg-purple-50 text-purple-700",    dot: "bg-purple-500" },
};

function Pill({ label, styles }: { label: string; styles: { pill: string; dot: string } }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
      {label}
    </span>
  );
}

export default function StatusBadge({ status, isOverdue }: Props) {
  const key = (status || "draft").toLowerCase();
  const styles = STATUS_STYLES[key] || STATUS_STYLES.draft;

  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <Pill label={titleCase(key)} styles={styles} />
      {isOverdue ? (
        <Pill label="Overdue" styles={STATUS_STYLES.overdue} />
      ) : null}
    </span>
  );
}
