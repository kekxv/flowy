interface SegmentedItem<T extends string> {
  key: T;
  label: React.ReactNode;
  count?: number;
  /** Tooltip / accessible name for icon-only items. */
  title?: string;
}

interface SegmentedProps<T extends string> {
  items: Array<SegmentedItem<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
  size?: "sm" | "md";
}

/** Pill-style tab switch used for filters and view modes. */
export default function Segmented<T extends string>({ items, value, onChange, className, ariaLabel, size = "md" }: SegmentedProps<T>) {
  return (
    <div className={`seg${size === "sm" ? " seg-sm" : ""}${className ? ` ${className}` : ""}`} role="tablist" aria-label={ariaLabel}>
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={value === item.key}
          onClick={() => onChange(item.key)}
          title={item.title}
          aria-label={item.title}
          className={`seg-item${value === item.key ? " is-on" : ""}`}
        >
          {item.label}
          {item.count !== undefined && item.count > 0 && <span className="seg-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}
