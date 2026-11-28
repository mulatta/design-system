# Mobile

Obsidian's mobile app uses its own layout: no ribbon or side panes on screen, a floating header and bottom navigation bar, and drawers for the sidebars. The theme is the same file on mobile, so the note column must stay readable at phone width with the same fonts embedded in the theme, and Obsidian's rounded mobile controls must turn square like the rest of the theme.

## Sub-features

- `mobile-column` keeps the title, properties, prose, and headings inside the phone width with no horizontal overflow; the properties block ends at the column edges, on the page with no panel behind it, where the title rule and code blocks end; no task checkbox or other block starts left of the column edge.
- `mobile-shrink` sets the inline title at 1.8em and the cell module at 12px below 600px, and moves the H2 marker from the margin into the heading line.
- `mobile-fonts` renders MaruBuri, Source Serif 4, and D2Coding from the embedded fonts, not system fallbacks.
- `mobile-blocks` keeps code blocks, tables, and callouts inside the width or scrollable inside their own box.
- `mobile-raised` draws the floating navbar and the top sidebar, edit, and more buttons square, framed by a 1px accent ring on paper with the theme's shadow and no blur. The floating view header behind the top buttons draws no underline, as in stock. The command palette opens on paper with the theme's rule and shadow, as on desktop, and its input is square.
- `mobile-settings` opens settings as a square modal over the note.
- `mobile-editing` keeps Live Preview at phone width like desktop Live Preview: the title rule, properties, the H2 marker, code lines on the tint, callouts, task boxes, and a table sized to its content within the column.

## How to get to it (user POV)

- Open the vault in Obsidian on a phone. Here, Obsidian's built-in mobile emulation stands in for it.

## Driving it with obsidian.ts

Preconditions:

- Baseline preconditions hold for run `agent`.

- **Phone, light.** Run `obs shot --note lab-note-ko --view reading --scheme light --mobile`. The capture shows `mobile-column`, `mobile-shrink`, `mobile-fonts`, `mobile-raised`.
- **Blocks.** Run `obs shot --note elements-ko --view reading --scheme light --mobile --scroll 600`, and again with `--scroll 1200`. The captures show `mobile-blocks`.
- **Settings.** Run `obs shot --note lab-note-ko --mobile --open settings`. Under emulation settings is a modal in the main window, and `shot` captures that window. The capture shows `mobile-settings`.
- **Dark.** Repeat with `--scheme dark`.
- **Stock reference.** The same `shot` options against a stock run (`--run stock`) give the stock mobile layout.
- **Geometry.** Run `obs compare --base stock --mobile --scheme light` and `--view live --mobile`, then both with `--scheme dark`. The note parts prove `mobile-column`, `mobile-blocks`, and `mobile-editing`; `navbar` and `top-buttons` prove `mobile-raised` (see [Geometry against stock Obsidian](./stock-geometry.md)).
- **Tones.** Run `obs layers --mobile --scheme light` and `--view live --mobile`, then dark.
- **Joins.** Run `obs joins --mobile --scheme light` and `--view live --mobile`, then dark. The phone has no tab strip, so `cut` measures no tab there.
- **States.** Run `obs editcheck --mobile --scheme light`, then dark. It runs the rows marked for the phone at 390x844. `reading-column` and `live-column` prove the column-edge part of `mobile-column`, `reading-edges` and `live-edges` that no line stands beside the column, `floating-header` proves the header part of `mobile-raised`, and `raised-surfaces` its palette part: on the phone Obsidian makes the palette translucent, gives it its own shadow, and rounds its input.
- **Back to desktop.** The next `shot` without `--mobile` switches emulation off again.
- **Proof.** Report each sub-feature with its capture path, and state that it was proven under emulation.

## Gotchas

- Toggling emulation reloads the Obsidian window; `shot` waits for it, but a shot taken during the reload would show a blank window.
- `--mobile` sets the window to 390x844 unless `--size` is given. At 390px wide Obsidian reports `is-phone`; a wider emulated window reports `is-tablet` and lays out differently.
- On a scrolled phone capture the header is transparent, so text scrolls under the top buttons. That is stock behaviour.
- `shot` cannot open the mobile drawers (`.workspace-drawer`) apart from search; prove a drawer change with a probe run by `obs drive`. Each step of the harness closes both drawers first, so a drawer from an earlier step does not cover the note.
- Obsidian hides the navbar and the top buttons while the editor has focus, so `compare` and `layers` measure them only in reading view.
- The search drawer covers the note, so `editcheck --mobile` reaches only the search field in `text-focus` and the note's editing roots in `note-text-focus`.
- On the phone Obsidian sizes the task checkbox at 1.15 times the font size, 18.4px, and hangs it 1.5 box widths, 27.6px, into the list item's indent. The theme widens the indent to that hang, so list items start 27.6px in on the phone and 24px (3ch) on desktop, and the box sits on the column edge in both.
- With floating navigation the phone's view header is fixed over the note with a transparent background. The theme's desktop underline is transparent there; it keeps its width so no box moves.
- The sequence plugin is not installed in these runs, so the `.seq-*` rules for phone width are not exercised here. [Sequence blocks](./sequence-blocks.md) proves them with `shot --mobile` and `seqcheck --mobile` on a run launched with the plugin. `seqcheck` emulates `prefers-reduced-motion: reduce`; `shot` does not.
- Emulation is a stand-in. It does not prove behaviour on a real iOS or Android WebView: safe-area insets, real font loading from a synced vault, and touch states stay unverified until checked on a device.
