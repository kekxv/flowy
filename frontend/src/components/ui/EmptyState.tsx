import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}

/** Consistent empty / no-result state. */
export default function EmptyState({ icon: Icon, title, hint, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-8" : "py-14"}`}>
      {Icon && (
        <span className="mb-2.5 grid h-10 w-10 place-items-center rounded-full bg-[var(--bg-muted)] text-[var(--text-faint)]">
          <Icon size={18} strokeWidth={1.6} />
        </span>
      )}
      <p className="text-[12.5px] font-medium text-[var(--text-secondary)]">{title}</p>
      {hint && <p className="mt-1 max-w-[280px] text-[11.5px] leading-relaxed text-[var(--text-faint)]">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
