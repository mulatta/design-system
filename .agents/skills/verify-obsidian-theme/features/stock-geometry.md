# Geometry against stock Obsidian

The theme restyles Obsidian's components but should keep their geometry: sizes, positions, alignment, and where one part meets the next. A capture judged on its own does not show a box that is 5px too small or a caret that drifted 20px; a side-by-side with stock Obsidian at 2x does. `compare` captures named parts of two runs in the same state and prints how each part's boxes moved or resized, in CSS px.

## Sub-features

Each sub-feature is one `compare` part. "Same as stock" means within 1 CSS px of the stock run; a deliberate difference is listed under Gotchas with its reason.

- `geo-sidebar-tabs` (part `sidebar-tabs`): the sidebar's tab icons keep stock's size and show no document-tab box, border, or cut corner.
- `geo-nav-header` (part `nav-header`): the rule under the file-tree buttons spans the sidebar's content width and ends where the sidebar ends; it does not cross into the resize handle or the note.
- `geo-nav-active` (part `nav-active`): the active file's row is stock size; the proof caret sits in the gap before the label, not out at the sidebar's left edge.
- `geo-folder-row` (part `folder-row`): the `protocols` folder row is the same height as a file row, its square sits where stock draws the chevron, and its label starts where stock's does.
- `geo-split-edge` (part `split-edge`): the left split's resize handle stays at stock's x, at the split's right edge; no second vertical line or strip appears inside the sidebar.
- `geo-ribbon` (part `ribbon`): the left ribbon's action icons keep stock's size, spacing, and stroke weight.
- `geo-view-header` (part `view-header`): the note's header row keeps stock's back and forward buttons, title, and action icons in place.
- `geo-vault-bar` (part `vault-bar`): the vault bar's switcher and the help and settings icons keep stock positions; no line runs between the two icons.
- `geo-doc-tab` (part `doc-tab`): the active tab has square corners; its top rule, the 45° diagonal, and the right edge form one unbroken line at 2x.
- `geo-title-rule` (part `title-rule`): the rule under the inline title runs into its 45° cut without a gap or notch at 2x.
- `geo-properties` (part `properties`): each property row shows Obsidian's own icon and no extra marker; pills in `tags` and in `aliases` have the same height.
- `geo-tasks` (part `tasks`): the checkbox keeps stock's size and its position left of the item text; the gap between box and text is stock's; a wrapped second line starts under the first line's text; the done mark fills its box in the same proportion as stock's.
- `geo-heading` (part `heading`): the H2's square marker and its trailing rule sit on the heading's line.
- `geo-code-top` (part `code-top`): the code block's top rule runs into its 45° cut without a gap at 2x.
- `geo-callout` (part `callout`): the callout's border runs into its 45° cut without a gap at 2x.

## How to get to it (user POV)

- These are the same components a user sees in the sidebar, the tab strip, and a note in reading view. The user notices them as things that look slightly off: a line that crosses into the next panel, a corner that does not close, a checkbox crowding its text.

## Driving it with obsidian.ts

Preconditions:

- Baseline preconditions hold for the theme run (`agent`, or your own run name).
- A stock run is live: `obs launch --run stock --theme none`, then `obs doctor --run stock` reports ok with `cssTheme: ""`.

- **Compare.** Run `obs compare --base stock --run agent --scheme light`, then `--scheme dark`. `--part <id>` (repeatable) limits it to some parts.
- **Read the output.** Each part prints `same geometry` or the boxes that differ, as `label.x|y|w|h stock -> theme`. Captures land in `build/verify/compare/<scheme>/`, which each `compare` empties first: `<part>.<run>.png` at 2x, `metrics.json`, `index.html`, and, when `IMPECCABLE_BROWSER` is set as in the devshell, `compare.png`, one sheet with every pair and its differences. `--size` changes the window from 1440x900.
- **Judge.** Look at each pair at 2x. A number difference is a lead, not a verdict: a part can match in numbers and still break visually (a diagonal that does not meet), or differ on purpose.
- **After a theme edit.** `obs sync --run agent`, then compare again. Keep an earlier output by copying `build/verify/compare/` aside; the next run overwrites it.
- **Proof.** Report each sub-feature as holding or failing with the part's numbers and capture paths for both schemes.

## Gotchas

- Obsidian's real base CSS is in the app bundle, not in this repository. To read the rule a component follows, extract it from a live run: in the page, `await (await fetch("app.css")).text()`. A copy taken on 2026-11-26 from Obsidian 1.15.1 sits at `build/obsidian-app.css` (gitignored).
- The left ribbon is `.workspace-ribbon.mod-primary` in Obsidian 1.15, not `.mod-left`.
- `.workspace-tab-header` is the class of both document tabs and the sidebar's tab icons in Obsidian 1.15. A rule meant for document tabs must be scoped to `.mod-root`.
- Stock itself differs between pill kinds: `tags` pills are 21px and `aliases` pills 18px tall. Decide the theme's target from the rule in app.css, not from one of the two.
- The `pre` selector also matches the hidden frontmatter block; the `code-top` part uses `.el-pre:not(.mod-frontmatter) pre`.
- On 2026-11-26, before the geometry fix, every sub-feature from `geo-sidebar-tabs` through `geo-callout` failed except `geo-heading`. The pre-fix record is in `build/verify/compare-before/`. After the fix the same day, all twelve hold in light and dark.
- Differences that remain on purpose, so `compare` still prints them: tree rows, folder rows included, are 28px (stock 25), and the folder square's box is 11px where stock's chevron box is 17; property key cells are 33px and rows 37.5px apart (stock 28 and 33.5), with padded value cells; property pills in `tags` and `aliases` share one box style at 21.5px (stock draws `aliases` as plain text, 18px); the task list starts 24px from the left, not 30, because Obsidian indents lists by `3ch` and a `ch` in Source Serif 4 is 8px; code blocks, callouts, and the H2 cell have the theme's own padding.
- `compare` measures one state and only the active tab. Hover states, inactive tabs, and the `+` button were checked on 2026-11-26 against a stock run with a script that hovers each through CDP (`build/verify/states.ts`), not with a part: rows and tabs keep stock size and position apart from the 28px rows above; the blue line just before `+` is the active tab's right edge when that tab is last, not a separator; the × in `tags` and `aliases` pills shares one colour.
- The H2 part measures 26px against stock's 28 because DESIGN.md sets `h2` to 1.35em and stock uses a larger size; the inline title measures 33.5px against 31 for the same reason (2.2em). Both are type tokens, not geometry changes.
