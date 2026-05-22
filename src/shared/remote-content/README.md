# Remote Content

Shared safety and rendering utilities for untrusted remote text.

## Scope

- `remoteContent.ts`: pure utilities for remote content detection, fallback decisions, and limited markdown parsing
- `SafeRemoteMarkdownPreview.tsx`: shared renderer for escaped remote text with optional downgrade behavior

## CSS Contract

`SafeRemoteMarkdownPreview` does not own a CSS module. The caller must supply any layout classes it needs through props.

### `lineClassName`

Applied to each rendered paragraph or bullet row.

Required rules when the caller wants the compact two-column bullet layout used by `RemoteSkillDetailPage`:

- `display: flex`
- `align-items: flex-start`
- a horizontal gap between bullet and content
- `margin: 0`

Current discover detail implementation uses:

```css
.summaryLine {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 0;
}
```

### `bulletClassName`

Applied to the bullet glyph wrapper for `* ` list items.

Required rules when the caller wants stable alignment with wrapped text:

- `flex: 0 0 auto`
- a muted text color distinct from the body copy
- a line-height that matches the text row

Current discover detail implementation uses:

```css
.summaryBullet {
  flex: 0 0 auto;
  color: #787774;
  line-height: 1.6;
}
```

## Rendering Rules

- All remote text is escaped before markdown parsing.
- Only a narrow markdown subset is supported: paragraphs, `* ` bullets, and `**strong**`.
- No HTML is rendered.
- If `fallback` is provided and `allowUnsafeText` is not enabled, dangerous remote patterns downgrade to the fallback string instead of rendering the original text.

## Integration Notes

- The wrapper container remains consumer-owned. Scroll behavior, font size, text color, and max height belong to the page-level CSS, not the shared component.
- `RemoteSkillDetailPage.module.css` currently owns `.summaryCopy`, `.summaryLine`, and `.summaryBullet`.
- If another feature needs a different visual treatment, keep the shared renderer unchanged and pass different class names from that feature.
