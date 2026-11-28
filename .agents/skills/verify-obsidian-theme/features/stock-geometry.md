# Geometry against stock Obsidian

The theme restyles Obsidian's components but should keep their geometry: sizes, positions, alignment, and where one part meets the next. A capture judged on its own does not show a box that is 5px too small or a caret that drifted 20px; a side-by-side with stock Obsidian at 2x does. `compare` captures named parts of two runs in the same state and prints how each part's boxes moved or resized, in CSS px. It measures in four places: desktop reading view (the default), Live Preview (`--view live`), the phone layout (`--mobile`), and Live Preview on the phone (`--view live --mobile`).

## Sub-features

Each sub-feature is one `compare` part. "Same as stock" means within 1 CSS px of the stock run; a deliberate difference is listed under Gotchas with its reason.

- `geo-sidebar-tabs` (part `sidebar-tabs`): the sidebar's tab icons keep stock's size and show no document-tab box, border, or cut corner.
- `geo-nav-header` (part `nav-header`): the rule under the file-tree buttons spans the sidebar's content width and ends where the sidebar ends; it does not cross into the resize handle or the note.
- `geo-nav-active` (part `nav-active`): the active file's row is stock size; the proof caret sits in the gap before the label, not out at the sidebar's left edge.
- `geo-folder-row` (part `folder-row`): the `protocols` folder row is the same height as a file row, its plus or minus cell sits where stock draws the chevron, and its label starts where stock's does.
- `geo-split-edge` (part `split-edge`): the left split's resize handle stays at stock's x, at the split's right edge; no second vertical line or strip appears inside the sidebar.
- `geo-ribbon` (part `ribbon`): the left ribbon's action icons keep stock's size, spacing, and stroke weight.
- `geo-view-header` (part `view-header`): the note's header row keeps stock's back and forward buttons, title, and action icons in place, in a row 40px tall (see Gotchas).
- `geo-vault-bar` (part `vault-bar`): the vault bar's switcher and the help and settings icons keep stock positions; no line runs between the two icons.
- `geo-doc-tab` (part `doc-tab`): the active tab has square corners; its top rule, the 45° diagonal, and the right edge form one unbroken line at 2x.
- `geo-title-rule` (part `title-rule`): the rule under the inline title runs into its 45° cut without a gap or notch at 2x.
- `geo-properties` (part `properties`): each property row shows Obsidian's own icon and no extra marker; pills in `tags` and in `aliases` have the same height.
- `geo-tasks` (part `tasks`): the checkbox keeps stock's size and its position left of the item text; the gap between box and text is stock's; a wrapped second line starts under the first line's text; the done mark fills its box in the same proportion as stock's.
- `geo-heading` (part `heading`): the H2's square marker and its trailing rule sit on the heading's line, and the marker hangs left of the heading text, which starts where stock's does. On the phone the marker sits inside the line instead, so the text starts one marker and gap to the right; `heading` measures only the heading's height and does not print it.
- `geo-code-top` (part `code-top`): the code block starts at a square edge of the tint, with no rule and no cut.
- `geo-callout` (part `callout`): the warning callout's 2px top rule and 1px bottom rule span the column, with no side line, no fill, and no cut.
- `geo-table` (part `table`): the note's first table is sized to its content as in stock, with its header rule across the table's full width.
- `geo-task-line` (part `task-line`, Live Preview only): the checkbox keeps stock's x on the task line, and the done mark fills its box as in reading view.
- `geo-navbar` (part `navbar`, phone only): the floating navbar and its back button keep stock's boxes; the navbar is square, framed by a 1px accent ring.
- `geo-top-buttons` (part `top-buttons`, phone only): the sidebar button and the edit and more buttons keep stock's boxes and are square.

The parts inside the note column run in every place they exist: `title-rule`, `properties`, `heading`, `code-top`, `callout`, and `table` in reading view and Live Preview, `tasks` in reading view, and `task-line` in Live Preview, each on desktop and on the phone. The app chrome parts from `sidebar-tabs` to `doc-tab` run on desktop in either view, and `navbar` and `top-buttons` on the phone in reading view. Each sub-feature holds in every place it runs, apart from the differences under Gotchas.

## How to get to it (user POV)

- These are the same components a user sees in the sidebar, the tab strip, and a note in reading view. The user notices them as things that look slightly off: a line that crosses into the next panel, a corner that does not close, a checkbox crowding its text.

## Driving it with obsidian.ts

Preconditions:

- Baseline preconditions hold for the theme run (`agent`, or your own run name).
- A stock run is live: `obs launch --run stock --theme none`, then `obs doctor --run stock` reports ok with `cssTheme: ""`.

- **Compare.** Run `obs compare --base stock --scheme light`, then `--scheme dark`. `--part <id>` (repeatable) limits it to some parts.
- **Other places.** Repeat both schemes with `--view live`, with `--mobile`, and with `--view live --mobile`. A change inside the note column needs all four; a change to desktop chrome needs only the first.
- **Read the output.** Each part prints `same geometry` or the boxes that differ, as `label.x|y|w|h stock -> theme`. Captures land in `build/verify/compare/<view>[-mobile]/<scheme>/`, which each `compare` in that place empties first: `<part>.<run>.png` at 2x, `metrics.json`, `index.html`, and, when `IMPECCABLE_BROWSER` is set as in the devshell, `compare.png`, one sheet with every pair and its differences. `--size` changes the window from 1440x900, or from 390x844 with `--mobile`.
- **Cuts in pixels.** `obs joins` measures where the top rule meets the 45° cut on every frame that draws one, found by its gradient, from painted pixels: `geo-doc-tab`, `geo-title-rule`, and each sequence block; `compare` shows the boxes around them.
- **Judge.** Look at each pair at 2x. A number difference is a lead, not a verdict: a part can match in numbers and still break visually (a diagonal that does not meet), or differ on purpose.
- **After a theme edit.** `obs sync`, then compare again. Keep an earlier output by copying `build/verify/compare/` aside; the next run in the same place overwrites it.
- **Proof.** Report each sub-feature as holding or failing with the part's numbers and capture paths for both schemes.

## Gotchas

- Obsidian's real base CSS is in the app bundle, not in this repository. To read the rule a component follows, extract it from a live run: in the page, `await (await fetch("app.css")).text()`. A copy taken on 2026-11-26 from Obsidian 1.15.1 sits at `build/obsidian-app.css` (gitignored).
- The left ribbon is `.workspace-ribbon.mod-primary` in Obsidian 1.15, not `.mod-left`.
- `.workspace-tab-header` is the class of both document tabs and the sidebar's tab icons in Obsidian 1.15. A rule meant for document tabs must be scoped to `.mod-root`.
- Stock itself differs between pill kinds: `tags` pills are 21px and `aliases` pills 18px tall. Decide the theme's target from the rule in app.css, not from one of the two.
- The `pre` selector also matches the hidden frontmatter block; the `code-top` part uses `.el-pre:not(.mod-frontmatter) pre`.
- On 2026-11-26, before the geometry fix, every sub-feature from `geo-sidebar-tabs` through `geo-callout` failed except `geo-heading`. After the fix the same day, all twelve hold in light and dark.
- Differences that remain on purpose, so `compare` still prints them: tree rows, folder rows included, are 28px (stock 25), and the folder cell's box is 11px where stock's chevron box is 17; property key cells are 33px and rows 37.5px apart (stock 28 and 33.5), with padded value cells; property pills in `tags` and `aliases` share one box style at 21.5px, 25.5px on the phone (stock draws `aliases` as plain text, 18px); the task list starts 24px from the left, not 30, because Obsidian indents lists by `3ch` and a `ch` in Source Serif 4 is 8px, and on the phone 27.5px as `compare` rounds it, not 30, the hang of Obsidian's larger phone checkbox, so the box sits on the column edge (`box.x 0`, stock 2.5); code blocks, callouts, and the H2 cell have the theme's own padding; the view header is 40px tall, Obsidian's own `--header-height`, where stock leaves it at 38.3px (printed as 38.5), so its rule meets the one under the file-tree buttons, and its back button sits 1px lower and its title and actions are 1.5px taller for it.
- `compare` measures one state and only the active tab. Hover states, inactive tabs, and the `+` button were checked on 2026-11-26 against a stock run by forcing hover on each through CDP, not with a part: rows and tabs keep stock size and position apart from the 28px rows above; the blue line just before `+` is the active tab's right edge when that tab is last, not a separator; the × in `tags` and `aliases` pills shares one colour.
- The H2 part measures 26px against stock's 28 because DESIGN.md sets `h2` to 1.35em and stock uses a larger size; the inline title measures 33.5px against 31 for the same reason (2.2em). Both are type tokens, not geometry changes.
- The `table` part differs only by the theme's cell padding and type size: the lab note's table is 269.5px in stock, 259px with the theme in reading view, and 238px in Live Preview, whose table widget pads cells less.
- In Live Preview the opening fence's line is 23.4px against stock's 21, the theme's code line height; the Live Preview H2 has no trailing rule (see [Editing view](./editing-view.md)). A task line is 31px against 26.5, the theme's line height.
- On the phone Obsidian hides the navbar and the top buttons while the editor has focus, so `navbar` and `top-buttons` run only in reading view. A part's root is found from the top of the note, scrolling until Live Preview renders it, so the captures of these two show the title area behind them.
- The Live Preview edit button of an embedded block sits 12px, the cut, in from the block's right edge instead of stock's 4px, clear of the diagonal. No part measures it; `editcheck`'s `embed-hover` does. A sequence block's edit button sits at its top left instead, over the position column, so it never covers the length badge; `seqcheck` hovers it in Live Preview.
- `compare` measures a part's boxes relative to its own root, so a part that moves as a whole, such as the properties block shifted 4px out of the column, prints `same geometry`. `editcheck`'s `reading-column` and `live-column` measure every painted box against the column edge instead.
