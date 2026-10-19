import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: LucideIcon;
  eyebrow?: string;
}

/** Shared page heading: 22px title + muted subtitle + right-aligned actions. */
export default function PageHeader({ title, subtitle, actions, icon: Icon, eyebrow }: PageHeaderProps) {
  return (
    <div className="page-head">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[var(--primary-subtle)] text-[var(--primary)]">
            <Icon size={17} strokeWidth={1.9} />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-[var(--text-faint)]">{eyebrow}</p>
          )}
          <h1 className="truncate">{title}</h1>
          {subtitle && <p className="page-sub">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
