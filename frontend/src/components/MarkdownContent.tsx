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
 * Unified Markdown renderer with GFM support (tables, strikethrough, task lists, autolinks).
 */
export default function MarkdownContent({
  children,
  className = "",
  urlTransform,
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
