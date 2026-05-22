export type RemoteMarkdownSegment = {
  strong: boolean;
  text: string;
};

export type RemoteMarkdownBlock = {
  kind: "paragraph" | "bullet";
  segments: RemoteMarkdownSegment[];
};

export function containsUnsafeRemoteMarkup(value: string) {
  const normalized = value.toLowerCase();

  return (
    /<\s*script\b/.test(normalized) ||
    /<\s*(iframe|object|embed|svg|math|img|video|audio|link|style)\b/.test(normalized) ||
    /\bon[a-z]+\s*=/.test(normalized) ||
    /javascript\s*:/.test(normalized) ||
    /data\s*:\s*text\/html/.test(normalized) ||
    /vbscript\s*:/.test(normalized)
  );
}

export function getRemoteContentFallback({
  allowUnsafeText = false,
  fallback,
  value
}: {
  allowUnsafeText?: boolean;
  fallback: string;
  value: string;
}) {
  if (!allowUnsafeText && containsUnsafeRemoteMarkup(value)) {
    return fallback;
  }

  return null;
}

export function parseRemoteMarkdown(value: string): RemoteMarkdownBlock[] {
  const sanitized = sanitizeRemoteText(value);

  return sanitized
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("* ")) {
        return {
          kind: "bullet" as const,
          segments: parseRemoteInlineMarkdown(trimmed.slice(2))
        };
      }

      return {
        kind: "paragraph" as const,
        segments: parseRemoteInlineMarkdown(trimmed)
      };
    });
}

function parseRemoteInlineMarkdown(line: string): RemoteMarkdownSegment[] {
  return line
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return {
          strong: true,
          text: part.slice(2, -2)
        };
      }

      return {
        strong: false,
        text: part
      };
    });
}

function sanitizeRemoteText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
