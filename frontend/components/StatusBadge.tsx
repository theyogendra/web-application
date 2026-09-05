import { titleCase } from "@/lib/format";

type Props = {
  status?: string;
  isOverdue?: boolean;
};

// Apple-style status pill: filled dot + tinted background, no border.
// All variants tuned to read clearly on both light and dark surfaces.
const STATUS_STYLES: Record<string, { pill: string; dot: string }> = {
  draft: {
    pill: "bg-[#E5E5EA] text-[#3A3A3C] dark:bg-[#3A3A3C]/40 dark:text-[#D2D2D7]",
    dot: "bg-[#86868B]",
  },
  needs_review: {
    pill: "bg-[#FF6B35]/12 text-[#CC4400] dark:bg-[#FF6B35]/20 dark:text-[#FF8C5A]",
    dot: "bg-[#FF6B35]",
  },
  submitted: {
    pill: "bg-[#5856D6]/12 text-[#3634A3] dark:bg-[#5E5CE6]/20 dark:text-[#5E5CE6]",
    dot: "bg-[#5856D6]",
  },
  pending_approval: {
    pill: "bg-[#FF9500]/15 text-[#A05C00] dark:bg-[#FF9F0A]/20 dark:text-[#FF9F0A]",
    dot: "bg-[#FF9500]",
  },
  approved: {
    pill: "bg-[#34C759]/12 text-[#248A3D] dark:bg-[#30D158]/20 dark:text-[#30D158]",
    dot: "bg-[#34C759]",
  },
  sent: {
    pill: "bg-[#0A84FF]/10 text-[#0071E3] dark:bg-[#0A84FF]/20 dark:text-[#0A84FF]",
    dot: "bg-[#0A84FF]",
  },
  partially_paid: {
    pill: "bg-[#FF9500]/12 text-[#C77800] dark:bg-[#FF9F0A]/20 dark:text-[#FF9F0A]",
    dot: "bg-[#FF9500]",
  },
  paid: {
    pill: "bg-[#34C759]/12 text-[#248A3D] dark:bg-[#30D158]/20 dark:text-[#30D158]",
    dot: "bg-[#34C759]",
  },
  cancelled: {
    pill: "bg-[#E5E5EA] text-[#86868B] dark:bg-[#3A3A3C]/40 dark:text-[#8E8E93]",
    dot: "bg-[#86868B]",
  },
  overdue: {
    pill: "bg-[#FF3B30]/12 text-[#C20F0F] dark:bg-[#FF453A]/20 dark:text-[#FF453A]",
    dot: "bg-[#FF3B30]",
  },
  accepted: {
    pill: "bg-[#34C759]/12 text-[#248A3D] dark:bg-[#30D158]/20 dark:text-[#30D158]",
    dot: "bg-[#34C759]",
  },
  rejected: {
    pill: "bg-[#FF3B30]/12 text-[#C20F0F] dark:bg-[#FF453A]/20 dark:text-[#FF453A]",
    dot: "bg-[#FF3B30]",
  },
  expired: {
    pill: "bg-[#FF9500]/12 text-[#C77800] dark:bg-[#FF9F0A]/20 dark:text-[#FF9F0A]",
    dot: "bg-[#FF9500]",
  },
  converted: {
    pill: "bg-[#AF52DE]/12 text-[#7E3AC8] dark:bg-[#BF5AF2]/20 dark:text-[#BF5AF2]",
    dot: "bg-[#AF52DE]",
  },
  pending: {
    pill: "bg-[#FF9500]/12 text-[#C77800] dark:bg-[#FF9F0A]/20 dark:text-[#FF9F0A]",
    dot: "bg-[#FF9500]",
  },
};

function Pill({
  label,
  styles,
}: {
  label: string;
  styles: { pill: string; dot: string };
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-medium ${styles.pill}`}
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
