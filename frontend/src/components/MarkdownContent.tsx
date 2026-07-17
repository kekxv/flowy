import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownContentProps {
  children: string;
  className?: string;
  urlTransform?: (url: string) => string;
  components?: Components;
}

/**
 * Default URL transform: convert absolute API/attachment paths to relative paths
 * so the app works when deployed under any subdirectory.
 *
 * - `attachment:xxx`           → `api/v1/bot-attachments/xxx`
 * - `/api/v1/...`              → `api/v1/...`
 * - `/bot-attachments/...`     → `bot-attachments/...`
 * - other URLs                 → unchanged
 */
export function defaultUrlTransform(url: string): string {
  if (url.startsWith("attachment:")) {
    return `api/v1/bot-attachments/${url.replace("attachment:", "")}`;
  }
  if (url.startsWith("/api/") || url.startsWith("/bot-attachments/")) {
    return url.slice(1);
  }
  return url;
}

/**
 * Unified Markdown renderer with GFM support (tables, strikethrough, task lists, autolinks).
 * URLs are automatically rewritten to relative paths for subdirectory deployment.
 */
export default function MarkdownContent({
  children,
  className = "",
  urlTransform = defaultUrlTransform,
  components,
}: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={urlTransform}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
