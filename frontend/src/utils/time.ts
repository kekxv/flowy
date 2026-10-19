export function timeAgo(date: string, language?: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  const zh = language === "zh";
  const intervals = [
    [31536000, "year", "年"], [2592000, "month", "个月"], [604800, "week", "周"],
    [86400, "day", "天"], [3600, "hour", "小时"], [60, "minute", "分钟"],
  ] as const;
  for (const [secs, label, zhLabel] of intervals) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) {
      return zh ? `${count} ${zhLabel}前` : `${count} ${label}${count > 1 ? "s" : ""} ago`;
    }
  }
  return zh ? "刚刚" : "just now";
}

/** Locale-aware date (no time). */
export function formatDate(value: string | number | Date, language?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(language === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** Locale-aware date + time. */
export function formatDateTime(value: string | number | Date, language?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(language === "zh" ? "zh-CN" : "en-US", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
