# Mobile

Obsidian's mobile app uses its own layout: no ribbon or side panes on screen, a floating header and bottom navigation bar, and drawers for the sidebars. The theme is the same file on mobile, so the note column must stay readable at phone width with the same fonts embedded in the theme, and Obsidian's rounded mobile controls must turn square like the rest of the theme.

## Sub-features

- `mobile-column` keeps the title, properties, prose, and headings inside the phone width with no horizontal overflow; the properties card ends at the column edges, where the title rule and code blocks end.
- `mobile-shrink` sets the inline title at 1.8em and the cell module at 12px below 600px.
- `mobile-fonts` renders MaruBuri, Source Serif 4, and D2Coding from the embedded fonts, not system fallbacks.
- `mobile-blocks` keeps code blocks, tables, and callouts inside the width or scrollable inside their own box.
- `mobile-raised` draws the floating navbar and the top sidebar, edit, and more buttons square, framed by a 1px accent ring on paper with the theme's shadow and no blur.
- `mobile-settings` opens settings as a square modal over the note.

## How to get to it (user POV)

- Open the vault in Obsidian on a phone. Here, Obsidian's built-in mobile emulation stands in for it.

## Driving it with obsidian.ts

Preconditions:

- Baseline preconditions hold for run `agent`.

- **Phone, light.** Run `obs shot --run agent --note lab-note-ko --view reading --scheme light --mobile --size 390x844`. The capture shows `mobile-column`, `mobile-shrink`, `mobile-fonts`, `mobile-raised`.
- **Blocks.** Run `obs shot --run agent --note elements-ko --view reading --scheme light --mobile --size 390x844 --scroll 600`, and again with `--scroll 1200`. The captures show `mobile-blocks`.
- **Settings.** Run `obs shot --run agent --note lab-note-ko --mobile --size 390x844 --open settings`. Under emulation settings is a modal in the main window, and `shot` captures that window. The capture shows `mobile-settings`.
- **Dark.** Repeat with `--scheme dark`.
- **Stock reference.** The same `shot` options against a stock run (`--run stock`) give the stock mobile layout; `compare` always runs on desktop.
- **Back to desktop.** The next `shot` without `--mobile` switches emulation off again.
- **Proof.** Report each sub-feature with its capture path, and state that it was proven under emulation.

## Gotchas

- Toggling emulation reloads the Obsidian window; `shot` waits for it, but a shot taken during the reload would show a blank window.
- At 390px wide Obsidian reports `is-phone`; a wider emulated window reports `is-tablet` and lays out differently. Use `--size 390x844` for phone proofs.
- On a scrolled phone capture the header is transparent, so text scrolls under the top buttons. That is stock behaviour.
- `shot` cannot open the mobile drawers (`.workspace-drawer`); prove a drawer change with a custom CDP drive.
- Emulation is a stand-in. It does not prove behaviour on a real iOS or Android WebView: safe-area insets, real font loading from a synced vault, and touch states stay unverified until checked on a device.
