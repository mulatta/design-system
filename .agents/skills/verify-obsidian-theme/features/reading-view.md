# Reading view

Reading view shows a rendered note in a calm reading column: the title in MaruBuri, properties on ruled cells, H2 headings marked by a small blue square hung in the margin, Latin gene names in Source Serif 4 italic, tables closed by rules, callouts with a cut corner, and themed code.

## Sub-features

- `read-title-props` shows the inline title over a rule that runs into its 45° cut, and the properties block with ruled rows, Obsidian's own property icons, and square tags of one height. Geometry: `geo-title-rule`, `geo-properties`.
- `read-title-bare` draws the same title rule and cut on a note without properties (`long-note`).
- `read-headings` marks each H2 with a small filled blue square hung in the left margin, so the heading text starts at the body's left edge, and ends it with a fine trailing rule; H3 and H4 stay plain. Geometry: `geo-heading`.
- `read-prose` sets Korean in MaruBuri and Latin in Source Serif 4; `*gfp*`, `*Escherichia coli*` render italic; α, µ, Δ render in the Latin face.
- `read-links-tags` shows resolved links in the accent with an offset underline, unresolved links muted and dotted, tags as square cells.
- `read-inline` shows inline code on the tint inside a fine box, `==highlight==` as a pale blue wash with no underline, and `~~strikethrough~~` in mute under a red strike that ends in a red delete loop curling up from the line. The editing note is hidden.
- `read-code` shows code blocks on the tint with a top rule that runs into the cut corner, at most four token colours, no proof red, and a square copy button. Geometry: `geo-code-top`.
- `read-table` shows a full-width table with a fine rule above the header, a heavy rule under it, fine row rules, and tabular lining numerals; the header row stays on the page tone.
- `read-callouts` shows every callout type in the accent except warning, fail, danger, error, and bug in proof red and quote in grey, each on its tint under a top rule that turns down a cut corner, with no side or bottom line. `elements-ko` holds note, tip, danger, quote, summary, todo, and important. Geometry: `geo-callout`.
- `read-quote-hr` shows a plain blockquote between fine rules in the muted colour, and a horizontal rule drawn as a strip of cells.
- `read-tasks` shows square checkboxes at stock size and position; a done task has a red cross that fills its box and a red strike; the checkbox never touches its label, and a wrapped second line starts under the first line's text. Geometry: `geo-tasks`.

## How to get to it (user POV)

- Open a note; Obsidian shows reading view when the note's mode is reading (the book icon in the view header).
- Toggle with the view header's edit/read button or `Ctrl/Cmd+E`.

## Driving it with obsidian.ts

Preconditions:

- Baseline preconditions hold for run `agent`.

- **Lab note, light.** Run `obs shot --run agent --note lab-note-ko --view reading --scheme light`. The capture shows `read-title-props`, `read-headings`, `read-prose`, and the start of the `fasta` block.
- **Lab note, lower half.** Run `obs shot --run agent --note lab-note-ko --view reading --scheme light --scroll 620`. The capture shows `read-table`, `read-callouts` (warning), `read-code`, `read-tasks`.
- **Element note.** Run `obs shot --run agent --note elements-ko --view reading --scheme light` and again with `--scroll 700` and `--scroll 1400`. Together they show `read-links-tags`, `read-inline`, all callout types, `read-quote-hr`, the two-line task, block math, every code language, and the right-aligned table.
- **No properties.** Run `obs shot --run agent --note long-note --view reading --scheme light`. The capture shows `read-title-bare`.
- **English.** Repeat the lab note and element note captures with `lab-note-en` and `elements-en`. Body text is Source Serif 4 throughout, and the headings, table, and callouts keep the rhythm of the Korean notes.
- **Dark.** Repeat each capture with `--scheme dark`. The same elements keep their roles with the dark palette.
- **Geometry.** For `read-title-props`, `read-headings`, `read-code`, `read-callouts`, and `read-tasks`, also run their parts with `obs compare` against a stock run: `--part title-rule --part properties --part heading --part code-top --part callout --part tasks`.
- **Proof.** Look at every capture against the sub-feature list and report each sub-feature as holding or not, with the capture path.

## Gotchas

- The `fasta` block renders as a plain code block.
- `--scroll` values depend on the window height; check that the capture shows the intended part before reporting.
- Math is MathJax's own font; the theme does not style it.
- Obsidian unloads sections scrolled far out of view, in reading view and in the editor, so CSS counters restart partway through a long note. `long-note` (30 sections) shows it: with a counter, "Section 29" read 3. Do not number headings with CSS.
