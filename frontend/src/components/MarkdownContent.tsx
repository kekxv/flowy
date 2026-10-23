import { isValidElement } from 'react';
import ReportVisual from './markdown/ReportVisual';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { Components } from "react-markdown";

const defaultComponents: Components = {
  pre: ({ children, className }) => {
    if (isValidElement<{ className?: string; children?: unknown }>(children)) {
      const language = children.props.className?.match(/language-(chart|mermaid)(?:\s|$)/)?.[1];
      if (language === 'chart' || language === 'mermaid') {
        return <ReportVisual kind={language} source={String(children.props.children || '').trim()}/>;
      }
    }
    return <pre className={className}>{children}</pre>;
  },
};

interface MarkdownContentProps {
  children: string;
  className?: string;
  urlTransform?: (url: string) => string;
  components?: Components;
  remarkPlugins?: any[];
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
function defaultUrlTransform(url: string): string {
  if (url.startsWith("attachment:")) {
    return `api/v1/bot-attachments/${url.replace("attachment:", "")}`;
  }
  if (url.startsWith("/api/") || url.startsWith("/bot-attachments/")) {
    return url.slice(1);
  }
  return url;
}

/**
 * Unified Markdown renderer with GFM support and single-newline line breaks.
 * URLs are automatically rewritten to relative paths for subdirectory deployment.
 */
export default function MarkdownContent({
  children,
  className = "",
  urlTransform = defaultUrlTransform,
  components,
  remarkPlugins = [],
}: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, ...remarkPlugins]}
        urlTransform={urlTransform}
        components={{
          ...defaultComponents,
          ...components,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
