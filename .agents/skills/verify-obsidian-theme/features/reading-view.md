# Reading view

Reading view shows a rendered note in a calm reading column: the title in MaruBuri, properties on ruled cells, H2 headings marked by a small blue square hung in the margin, Latin gene names in Source Serif 4 italic, tables closed by rules, callouts ruled off above and below, and themed code.

## Sub-features

- `read-title-props` shows the inline title over a rule that runs into its 45° cut, and the properties block with ruled rows, keys in mute on the page with no tint, Obsidian's own property icons, and square tags of one height, starting at the column edge where the title rule starts. Geometry: `geo-title-rule`, `geo-properties`. Joins: `cut`.
- `read-title-bare` draws the same title rule and cut on a note without properties (`long-note`).
- `read-headings` marks each H2 with a small filled blue square hung in the left margin, so the heading text starts at the body's left edge, and ends it with a fine trailing rule; H3 to H6 stay plain, H5 at H4's size in mute and H6 smaller again in mute. Geometry: `geo-heading`.
- `read-prose` sets Korean in MaruBuri and Latin in Source Serif 4; `*gfp*`, `*Escherichia coli*` render italic; α and µ render in the Latin face.
- `read-links-tags` shows resolved links in the accent with an offset underline, unresolved links muted and dotted, tags as square cells.
- `read-inline` shows inline code on the tint inside a fine box, `==highlight==` as a blue wash over a 1px blue underline, and `~~strikethrough~~` in mute under a red strike that ends in a red delete loop curling up from the line. The loop's foot lies on the strike line. A strikethrough that wraps keeps its line on every line and draws the loop once, at its end. The editing note is hidden. Joins: `delete-loop`.
- `read-code` shows code blocks on the tint alone, with no rule and no cut corner, at most four token colours, no proof red, and a square copy button. Geometry: `geo-code-top`.
- `read-table` shows a table as wide as its content, up to the note column, with Hangul wrapping between words, never inside one, and a table wider than the column scrolling sideways in its own box; it has a fine rule above the header, a 1px ink rule under it, fine row rules, and tabular lining numerals; the header row stays on the page tone.
- `read-callouts` shows a callout on the page tone between a 1px cell-line rule above and one below, with its icon and title in the accent blue, its content on the column's left edge, and no fill or cut. Two callouts in a row share one rule: the first has none below. Warning, caution, attention, danger, error, bug, failure, fail, and missing take a 2px proof rule above, a 1px proof rule below, and a proof label. Quote and cite take a 2px cell-line rule on the left and text set in 2ch, with no rule above or below, under a mute label. `elements-ko` holds note, tip, danger, quote, summary, todo, and important. Geometry: `geo-callout`.
- `read-quote-hr` shows a blockquote in ink beside a 2px cell-line left rule, with its text 2ch in from the rule and a nested quote behind a second rule, and a horizontal rule drawn as a strip of whole cells that spans the column, one cell high and closed at its right end. The line above the footnotes is a plain 1px cell-line line, not the strip.
- `read-tasks` shows square checkboxes at stock size and position; a done task has a red cross that fills its box and a red strike; the checkbox never touches its label and never starts left of the column edge, and a wrapped second line starts under the first line's text. Geometry: `geo-tasks`.
- `read-edges` draws a 1px pale line the note's full height three cells (42px) outside each edge of the column when the pane has that room; a narrower pane and the phone draw none.
- `read-end` closes the note with three rows of blank cells in cell-line, 3em below the last block and spanning the column.

## How to get to it (user POV)

- Open a note; Obsidian shows reading view when the note's mode is reading (the book icon in the view header).
- Toggle with the view header's edit/read button or `Ctrl/Cmd+E`.

## Driving it with obsidian.ts

Preconditions:

- Baseline preconditions hold for run `agent`.

- **Lab note, light.** Run `obs shot --note lab-note-ko --view reading --scheme light`. The capture shows `read-title-props`, `read-headings`, `read-prose`, and the start of the `dna` block.
- **Lab note, lower half.** Run `obs shot --note lab-note-ko --view reading --scheme light --scroll 620`. The capture shows `read-table`, `read-callouts` (warning), `read-code`, `read-tasks`.
- **Element note.** Run `obs shot --note elements-ko --view reading --scheme light` and again with `--scroll 700` and `--scroll 1400`. Together they show `read-links-tags`, `read-inline`, all callout types, `read-quote-hr`, the two-line task, block math, every code language, and the right-aligned table.
- **No properties.** Run `obs shot --note long-note --view reading --scheme light`. The capture shows `read-title-bare`.
- **English.** Repeat the lab note and element note captures with `lab-note-en` and `elements-en`. Body text is Source Serif 4 throughout, and the headings, table, and callouts keep the rhythm of the Korean notes.
- **Dark.** Repeat each capture with `--scheme dark`. The same elements keep their roles with the dark palette.
- **Geometry.** For `read-title-props`, `read-headings`, `read-code`, `read-callouts`, and `read-tasks`, also run their parts with `obs compare` against a stock run: `--part title-rule --part properties --part heading --part code-top --part callout --part tasks`.
- **Joins.** Run `obs joins --scheme light`, then `--scheme dark`, and both again with `--mobile`. Each instance prints `ok` when its stroke and mark meet within 0.5px; the crops in `build/verify/joins/` show each join at 2x.
- **Wrapped strikethrough.** `elements-ko` and `elements-en` hold a strikethrough after the editing-note paragraph that wraps at both sizes. A 2x crop of it shows the strike on every line and the loop once, after the last word.
- **Table width.** `obs editcheck` measures `read-table`'s width against its content and the column as `reading-table`.
- **Column edge.** The same `editcheck` run measures everything the note column paints against its left edge as `reading-column`, which proves the column-edge parts of `read-title-props` and `read-tasks`. Add `--mobile` for the phone and `--note elements-ko` for the nested lists and the two-line task.
- **Proof.** Look at every capture against the sub-feature list and report each sub-feature as holding or not, with the capture path.

## Gotchas

- The `dna` block in the lab notes renders as a plain code block unless the run was launched with `--plugin obsidian-sequence-plugin`. The plugin's rendering is covered in [Sequence blocks](./sequence-blocks.md).
- `--scroll` values depend on the window height; check that the capture shows the intended part before reporting.
- Math is MathJax's own font; the theme does not style it.
- On desktop Obsidian shifts the properties block 4px left with a `transform`, so its unpainted rows' text lines up with the column. The theme paints the rows and the rule under the block, so it removes the shift; the phone has none.
- `reading-column` and `live-column` measure every element in the note column that paints and every run of text. None may start more than 0.5px left of the column's content edge. A mark drawn by a pseudo-element has no box, so the H2 square, which hangs in the margin on desktop by design, is outside these checks, and so is Obsidian's fold handle, which shows in the margin while the pointer is over a heading or list item.
- The reading-view strike is a 1.5px gradient behind the text, not `text-decoration`, so glyphs paint over it. It sits 0.703em below the top of the `del`'s content box, the same reference the loop's box takes with `vertical-align: text-top`. With the font's strikeout line, the loop's foot sat 2.3px below the strike on desktop and 1.8px on the phone (`joins`, 2026-11-27). Live Preview's `.cm-strikethrough` keeps the font's line, and there the loop's foot lands on it (`joins --view live`, 0.00 on desktop and the phone, 2026-11-27).
- Obsidian strikes a done task with the `text-decoration` shorthand on `ul > li.task-list-item[data-task=x]` and on `.HyperMD-task-line[data-task=x]` in Live Preview, which resets the line's colour to the text's. A rule on `.task-list-item.is-checked` ranks below the reading one, so the theme's red strike sits on Obsidian's own selectors. Until 2026-11-27 it did not, and the strike was mute grey in both views.
- On the phone, `delete-loop` in `elements-en` passes at the edge of the tolerance: the strike is 10.25..11.75px from the line top and the foot reaches 12.25, one device pixel lower (bottom 0.50). The line's top falls at a fraction of a pixel there and the strike and the mask round to different device rows. Desktop and the Korean note measure 0.00.
- Obsidian unloads sections scrolled far out of view, in reading view and in the editor, so CSS counters restart partway through a long note. `long-note` (30 sections) shows it: with a counter, "Section 29" read 3. Do not number headings with CSS.
