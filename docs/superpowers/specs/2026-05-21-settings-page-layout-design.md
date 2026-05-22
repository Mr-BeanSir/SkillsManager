# Settings Page Layout Design

## Scope

This change only restructures the layout of `src/features/settings/SettingsPage.tsx` and its local CSS module.
It does not change settings behavior, data flow, copy, or navigation.

## Problem

The current Settings page renders as a vertical stack of nearly identical panels.
All settings have the same visual weight, so the page reads like a flat form dump instead of a clear utility workspace.

The main issues are:

- weak hierarchy: the app-wide reconcile toggle does not stand out from secondary preferences
- repetitive structure: every panel uses the same rhythm and width
- wasted vertical space: each block is comfortable in isolation but monotonous as a sequence

## Direction

Keep the page conservative and familiar.
Do not introduce section navigation, side summaries, new visual motifs, or modal interactions.

Use a single-page settings layout with one primary block and one secondary grid:

- the page header remains unchanged in role and copy
- the `Auto reconcile` section becomes the primary block and spans the full row
- the `Language`, `Discover page size`, and `CLI Targets` sections become secondary blocks in a responsive two-column grid
- on narrow screens, the grid collapses back to one column

## Layout Rules

### Page structure

The page body should be split into two clear regions:

1. a full-width primary settings panel at the top
2. a responsive grid of secondary settings panels below

This creates hierarchy with structure rather than decoration.

### Panel rhythm

All settings panels keep the existing warm monochrome style and border language.
The change is spatial:

- tighter header-to-body spacing
- tighter internal gaps between controls and notes
- consistent action placement near the bottom of each panel body
- no nested cards or extra containers

### Density

The page should feel like a desktop utility interface, not a landing page and not a sparse preferences screen.

- desktop: compact but readable
- tablet: two columns when space allows
- mobile: single column with preserved control order

## Component Treatment

### Auto reconcile

This is the only setting that changes app-wide synchronization behavior, so it remains first and gets the strongest placement.

- spans the full row
- keeps the current radio choice model
- keeps status and error messages close to the control group

### Language

Language stays a simple form panel:

- select control first
- apply action directly below the control group
- note and feedback remain in the same panel body

### Discover page size

This stays a compact form panel:

- numeric input first
- apply button aligned with the language panel pattern
- validation and note remain local to the panel

### CLI Targets

This remains a navigation-style panel:

- single primary action to open CLI Targets
- short note beneath
- no extra statistics or preview content

## Implementation Notes

- keep the React logic in `SettingsPage.tsx` intact unless a small markup change is needed to support layout grouping
- prefer CSS Grid at the page section level and simple Flex layouts inside panel bodies
- preserve existing accessibility semantics: `fieldset`, `legend`, labelled controls, live regions, and button text

## Testing

Targeted verification is sufficient for this layout-only change:

- `npm test -- src/App.test.tsx`
- `npm run build`

If implementation touches additional settings-specific tests, run those too.
