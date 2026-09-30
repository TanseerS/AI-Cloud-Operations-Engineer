# Design system

The dashboard should read like a cloud operations product - closer to an observability
console than a product landing page. Restraint is the point: colour carries meaning, not
decoration.

## Principles

1. **Colour means something.** The neutral ramp carries the interface. The accent marks
   the active nav item and the primary action, nothing else. The four semantic colours
   only ever indicate status.
2. **Never colour alone.** A status dot always sits beside a word. The interface stays
   readable without colour vision, and in a screenshot pasted into an incident channel.
3. **No invented data.** A panel with nothing real to show says so. Placeholder charts
   and lorem metrics teach the reader to distrust the dashboard.
4. **Numbers hold still.** Anything that updates is `tabular-nums`, so a refreshing
   latency figure does not make the layout twitch.

## Tokens

All of it lives in `frontend/src/styles/tokens.css`. Nothing in the app hardcodes a
colour, radius or shadow.

| Group | Notes |
|---|---|
| Neutrals | Cool grey ramp. Never pure black or pure white. |
| Accent | A single blue, for active navigation and the primary button. |
| Semantic | Success, warning, danger, info - status meaning only. |
| Type | System font stack, 12-28px, three weights, tightened tracking on headings. |
| Spacing | 4px scale, `--space-1` to `--space-12`. |
| Radii | 4 / 6 / 8px. The only full radius is the 7px status dot. |
| Shadows | Three levels, all subtle. Surfaces lift off the canvas, they do not float. |
| Motion | 120ms and 160ms. Enough to feel considered, not enough to wait on. |

## Theming

Light is the base definition. Dark redefines only the tokens that must change, in two
places: a `prefers-color-scheme` block guarded with `:root:not([data-theme='light'])`, and
a `:root[data-theme='dark']` block so an explicit choice wins in both directions. The
choice persists in `localStorage` and is applied by an inline script in `index.html`
before first paint, so a dark-mode user never sees a white flash.

## Layout

- Fixed 232px sidebar at 1024px and up.
- Below 1024px the sidebar becomes a drawer over a scrim, opened from the top bar and
  closable with Escape or a click outside.
- Content is capped at 1360px and centred.
- Single column below 640px.
- The sticky top bar is the only glass surface in the app - a `backdrop-filter` blur so
  content scrolling underneath stays legible.

## Accessibility

- A skip link to `#main` is the first focusable element.
- `:focus-visible` is a 2px accent outline with offset, never removed.
- The drawer toggle carries `aria-expanded` and `aria-controls`; the nav is a labelled
  landmark.
- `prefers-reduced-motion` collapses every transition and the status pulse.
- Body text is 14px at `#565e6b` on `#f7f8fa` in light and `#a3acba` on `#0d1014` in
  dark, both above the 4.5:1 contrast threshold.

## What this system deliberately avoids

Gradient fills, pill-shaped buttons, glow effects, decorative illustration, and animated
background flourishes. None of them survive a 3am incident.

## Visual-first

Where information can be shown, it should be drawn rather than described: architecture as
connected nodes, cost as charts, issues as severity cards, health as status indicators,
remediation as a before and after comparison. Those modules are not built yet, and each
page states plainly what will replace its empty state.
