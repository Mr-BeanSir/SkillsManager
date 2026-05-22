import type { ReactNode } from "react";
import { getRemoteContentFallback, parseRemoteMarkdown } from "./remoteContent";

type SafeRemoteMarkdownPreviewProps = {
  allowUnsafeText?: boolean;
  bulletClassName?: string;
  fallback?: string;
  lineClassName?: string;
  value: string;
};

export function SafeRemoteMarkdownPreview({
  allowUnsafeText = false,
  bulletClassName,
  fallback,
  lineClassName,
  value
}: SafeRemoteMarkdownPreviewProps) {
  const downgraded =
    fallback === undefined
      ? null
      : getRemoteContentFallback({
          allowUnsafeText,
          fallback,
          value
        });

  if (downgraded) {
    return <span>{downgraded}</span>;
  }

  return <>{renderRemoteMarkdownBlocks({ bulletClassName, lineClassName, value })}</>;
}

function renderRemoteMarkdownBlocks({
  bulletClassName,
  lineClassName,
  value
}: Pick<SafeRemoteMarkdownPreviewProps, "bulletClassName" | "lineClassName" | "value">): ReactNode[] {
  return parseRemoteMarkdown(value).map((block, index) => {
    if (block.kind === "bullet") {
      return (
        <p className={lineClassName} key={`${block.kind}-${index}`}>
          <span className={bulletClassName}>•</span>
          <span>{renderInlineMarkdownSegments(block.segments)}</span>
        </p>
      );
    }

    return (
      <p className={lineClassName} key={`${block.kind}-${index}`}>
        {renderInlineMarkdownSegments(block.segments)}
      </p>
    );
  });
}

function renderInlineMarkdownSegments(
  segments: Array<{ strong: boolean; text: string }>
): ReactNode[] {
  return segments.map((segment, index) =>
    segment.strong ? (
      <strong key={`${segment.text}-${index}`}>{segment.text}</strong>
    ) : (
      <span key={`${segment.text}-${index}`}>{segment.text}</span>
    )
  );
}
