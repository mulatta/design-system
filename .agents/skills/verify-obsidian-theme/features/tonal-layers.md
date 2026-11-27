# Tonal layers

The theme shows depth with tones of paper, not with lines or shadows. The note page and the active tab are the top layer, side panels and the tab strips one step down, and blocks set into the page a further step. Two regions at different depths must read apart by tone alone; a line never marks a change of layer. The rule and its threshold are in DESIGN.md (Elevation & Depth, the Paper Stack Rule).

## Sub-features

- `tone-three-steps` gives `paper`, `paper-alt`, and `tint` three different tones in each scheme.
- `tone-sidebar` sets the ribbon (its own `ribbon` token, the same value), the sidebar's tab row, the file tree, and the vault bar in one tone, `paper-alt`.
- `tone-tab-strip` sets the document tab strip in `paper-alt` and the active tab in `paper`, so the active tab joins the note.
- `tone-boundaries` keeps each layer boundary at an OKLCH lightness difference of at least 0.025: sidebar and note, tab strip and active tab, tab strip and view header, note and code, note and inline code, and note and property key. A callout has no fill, so `layers` prints note and callout as one tone and callout and code as the step between note and code. The note's boundaries hold in reading view, in Live Preview, where `code` is a line inside a fenced block and `inline-code` the editor's inline code, and on the phone.
- `tone-no-boundary-lines` draws no visible line on a layer boundary: the ribbon's edge, the sidebar's edge, the bottom of both tab strips. One frame sits on a boundary on purpose and is not a layer line: the active tab's accent frame (top rule and sides, part of its cut). The 1px divider between two inactive tabs stands inside the strip, not on a boundary.
- `tone-rules-kept` keeps lines inside one tone: the view header's underline, the rule above the vault bar (Obsidian's own), the status bar's frame, and the theme's own block rules.

## How to get to it (user POV)

- The layers are always on screen on desktop: sidebar on the left, tab strip on top, the note in the middle, code blocks and property rows inside the note.

## Driving it with obsidian.ts

Preconditions:

- Baseline preconditions hold for the theme run (`agent`). A stock run (`obs launch --run stock --theme none`) gives reference numbers.

- **Measure.** Run `obs layers --run agent --scheme light`, then `--scheme dark`. It prints each region's painted background (transparent backgrounds composited up the tree), its OKLCH lightness, and its visible borders and shadow; then each boundary's lightness difference, flagged below `--threshold` (default 0.025). The JSON lands in `build/verify/layers/<run>-<view>[-mobile]-<scheme>.json`. `layers` never fails a run; the flags are for the reader to judge against the gotchas below. The output proves `tone-three-steps`, `tone-sidebar`, `tone-tab-strip`, `tone-boundaries`, the ribbon and tab-strip parts of `tone-no-boundary-lines` (no border listed on the boundary's side), and `tone-rules-kept`.
- **Editor and phone.** Repeat both schemes with `--view live`, with `--mobile`, and with `--view live --mobile`. Live Preview keeps the desktop regions and swaps the note's own regions for the editor's; the phone drops the desktop chrome and adds `navbar` and `top-buttons` in reading view.
- **Look.** Run `obs shot --run agent --note lab-note-ko --view reading --scheme light --hide-right` and the same with `--scheme dark`. The sidebar reads as one column, the active tab runs into the note, and no vertical line separates sidebar and note. The sidebar's edge is not a `layers` region, so this look and the `split-edge` part prove it.
- **Geometry.** Removing a line must not move a box: run `obs compare` for `ribbon`, `sidebar-tabs`, `split-edge`, `doc-tab`, `view-header`, `vault-bar`. The theme makes boundary lines transparent instead of removing their width for that reason.
- **Proof.** Report each sub-feature with the `layers` numbers for both schemes and the capture paths.

## Gotchas

- Boundaries flagged "< threshold" between two regions of the same layer are expected: they are one tone by design. They are ribbon and sidebar, sidebar tabs and sidebar, sidebar and vault bar, view header and note, note and status bar, note and table head, note and callout, and note and palette. On the phone, note and navbar and note and top buttons are 0.000 as well: the raised controls sit on paper and stand apart by their 1px accent ring and shadow, which `layers` prints as `shadow` (see [Mobile](./mobile.md)). Judge only the layer boundaries listed under `tone-boundaries`.
- On 2026-11-27 Live Preview gave the same steps as reading view (note and code, inline code, property key: 0.039 light, 0.051 dark), and so did the phone. On the phone Obsidian mixes the palette's background toward transparent and gives it its own three-layer shadow; the theme sets paper and its own shadow there, so the palette matches the note as on desktop. `editcheck`'s `raised-surfaces` fails if that slips.
- Obsidian sets the tab strips' background from `--titlebar-background`; mapping it to `paper` puts both strips in the page tone and breaks `tone-sidebar` and `tone-tab-strip`.
- `--divider-color` also draws dividers in the settings window, the community plugin browser, and the PDF sidebar. The theme clears it only on the ribbon, the resize handle, and the tab strips. `--tab-outline-color` is resolved on `body`, so it has to be cleared on the tab strips as well.
- The 0.025 threshold was set on 2026-11-26 by comparing 2x captures with boundary lines removed: stock Obsidian's 0.027 (light) read clearly, the theme's earlier 0.018 (light) and 0.013 (dark) read faintly or not at all.
