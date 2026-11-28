# App chrome

App chrome is everything around the note: the left ribbon, the sidebar with the file tree and its tab icons, the tab strip, the view header, the status bar, and the modal surfaces (command palette, settings, search). The theme keeps these quiet: neutral panels, fine rules, square corners, the active note marked by a red proof caret instead of a fill, and the active tab cut at one corner.

## Sub-features

- `chrome-tree` lists notes and folders; a folder shows a blue cell in the gutter where stock draws its chevron, with a plus when collapsed and a minus when open, so folder and file names line up; the open note carries the red caret right before its bold label at any depth; no stray strips or columns narrow the list. Geometry: `geo-nav-active`, `geo-folder-row`, `geo-split-edge`.
- `chrome-ribbon` shows the ribbon's icons in its own muted ink on the sidebar tone, with no line at its edge. Geometry: `geo-ribbon`.
- `chrome-sidebar-tabs` shows the sidebar's own tab icons (files, search, bookmarks) without document-tab boxes. Geometry: `geo-sidebar-tabs`.
- `chrome-rules` keeps every separator inside its own panel: the fine rule under the file-tree buttons ends at the sidebar's edge, and the vault bar at the bottom shows no line between help and settings. Rules that neighbouring panes draw at one height meet on one line: the rule under the view header continues the one under the file-tree buttons. Geometry: `geo-nav-header`, `geo-vault-bar`.
- `chrome-tabs` shows document tabs as square cells on the strip tone, sharing their borders; the active one is page-toned, has the accent top rule, a red proof mark before its title, and a cut corner whose diagonal meets the top rule and the right edge. Geometry: `geo-doc-tab`. Joins: `cut`.
- `chrome-view-header` keeps stock's back and forward buttons, breadcrumb, and actions, over a fine rule. On the phone the header floats over the note and draws no rule (see [Mobile](./mobile.md)). Geometry: `geo-view-header`.
- `chrome-focus` draws a 2px accent outline around a control reached with `Tab`, and none around a text field or the editable title, where the caret shows focus.
- `chrome-status` shows the status bar with tabular numerals and fine rules.
- `chrome-palette` shows the command palette as a square, ruled modal with a visible selected row.
- `chrome-settings` shows the settings window readable in both schemes, with the theme's fonts and accent. A toggle reads on or off at a glance: the on track is the accent, the off track a neutral, and the thumb stands out from both.
- `chrome-search` shows the search pane with its square input; `--open search` opens it with an empty query, so results need a custom drive that types one.

## How to get to it (user POV)

- The ribbon, sidebar, tabs, and status bar are always on screen on desktop.
- Command palette: `Ctrl/Cmd+P`.
- Settings: the gear at the bottom of the sidebar.
- Search: the magnifier in the sidebar or `Ctrl/Cmd+Shift+F`.

## Driving it with obsidian.ts

Preconditions:

- Baseline preconditions hold for run `agent`.

- **Frame.** Run `obs shot --run agent --note lab-note-ko --view reading --scheme light`. The capture shows `chrome-tree`, `chrome-sidebar-tabs`, `chrome-tabs`, `chrome-status`.
- **Nested file.** Run `obs shot --run agent --note protocols/pcr-protocol --view reading --scheme light`. The capture shows the open folder's minus cell and the caret before the nested label.
- **Palette.** Run `obs shot --run agent --note lab-note-ko --view reading --scheme light --open palette`. The capture shows `chrome-palette` over the note.
- **Settings.** Run `obs shot --run agent --note lab-note-ko --view reading --scheme light --open settings`. `shot` captures the settings window, not the main window, and closes it afterwards. The capture shows `chrome-settings`.
- **Search.** Run `obs shot --run agent --note lab-note-ko --view reading --scheme light --open search`. The capture shows `chrome-search` in the left sidebar. The next `shot` brings the file explorer back.
- **Dark.** Repeat each with `--scheme dark`.
- **Geometry.** Run `obs compare --base stock --run agent --scheme light --part nav-active --part folder-row --part split-edge --part ribbon --part sidebar-tabs --part nav-header --part vault-bar --part doc-tab --part view-header`, then with `--scheme dark`.
- **Focus and toggles.** Run `obs editcheck --run agent --scheme light`, then `--scheme dark`: `control-focus` and `text-focus` together prove `chrome-focus`, and `toggle-states` proves the toggle part of `chrome-settings`.
- **Shared line.** `pane-rules` in the same `editcheck` runs proves the shared line of `chrome-rules`.
- **Proof.** Report each sub-feature with its capture path.

## Gotchas

- A full-window capture at 1x shows these parts too small to judge; the 2026-11-26 captures showed every defect listed in `stock-geometry.md` and none was reported until a side-by-side with stock at 2x. Use `compare`.
- Obsidian 1.15 opens settings in its own window (a second CDP page at `about:blank`, title `설정 - vault - …`), not as a modal over the note. `shot` finds that page, clears its search box (Obsidian keeps the last query), sets `--size` on it, and captures it.
- Obsidian's UI language follows the system locale; command names in the palette may be Korean.
- The fixture vault has one folder, `protocols/`, collapsed in a fresh run. `shot` with a note inside a folder runs Obsidian's "reveal active file", which expands the folder and draws Obsidian's focus box around the revealed row; the folder stays expanded for later shots in that run.
- The tree's file tags and counts, menus, and popovers are not reached by `shot`; prove them with a custom CDP drive when a change touches them. The keyboard focus ring is reached only by `editcheck`'s `control-focus`.
