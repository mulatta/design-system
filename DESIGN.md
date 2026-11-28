---
version: alpha
name: Wongoji
description: A manuscript-grid design system for mixed Korean and Latin research notes, with sequences, math, and code on one page.
colors:
  primary: "{colors.light.rule}"
  light:
    paper: "#fafafa"
    paper-alt: "#eef1f6"
    ink: "#1a1a1a"
    mute: "#4f5a69"
    faint: "#5f6b7b"
    rule: "#0359b0"
    rule-soft: "#3f6183"
    pale: "#b9cde6"
    tint: "#e8ecf2"
    cell-line: "#9fbfe2"
    proof: "#b23a30"
    ribbon: "#eef1f6"
    on-ribbon: "#444444"
  dark:
    paper: "#1a1a1a"
    paper-alt: "#1e2025"
    ink: "#e3e3e3"
    mute: "#9aa6b5"
    faint: "#8793a3"
    rule: "#9accfd"
    rule-soft: "#9fb8d0"
    pale: "#34485f"
    tint: "#23262d"
    cell-line: "#3a5878"
    proof: "#e2806f"
    ribbon: "#1e2025"
    on-ribbon: "#b8b8b8"
typography:
  text:
    fontFamily: '"Source Serif 4", "MaruBuri", serif'
    lineHeight: "1.8"
  code:
    fontFamily: '"D2Coding", ui-monospace, monospace'
  heading:
    lineHeight: "1.3"
  h1:
    fontSize: 1.75em
    fontWeight: 700
  h2:
    fontSize: 1.35em
    fontWeight: 700
  h3:
    fontSize: 1.2em
    fontWeight: 700
  h4:
    fontSize: 1em
    fontWeight: 700
  h5:
    fontSize: 1em
    fontWeight: 700
  h6:
    fontSize: 0.875em
    fontWeight: 700
spacing:
  cell: 14px
  cut: 12px
  line-width: 700px
rounded:
  none: 0px
---

# Design System: Wongoji

## Overview

**Creative North Star: "The Manuscript Grid"**

Wongoji is Korean manuscript paper: a sheet of square cells with fine printed rules, written on by hand and corrected in red. The system treats every component as something printed on that sheet or marked on it afterwards. Tabs, tags, and checkboxes read as cells and frames stamped onto the page, and a callout as a passage ruled off above and below, never as raised buttons, floating cards, or shaded boxes. The mood is quiet and exact, with the warmth of a page someone wrote on.

It serves one person's research notes, where long Korean prose, Latin species and gene names, DNA and protein sequences, math, code, and tables share a page and must each read correctly beside the others. Structure carries the identity: a filled blue square opening each section heading, ruled property rows, square tags, and a corner cut at 45° at the head of the open note. Ornament does not.

**Key Characteristics:**
- Square cells and fine rules instead of fills and rounded containers.
- Two accents with fixed jobs: a printed-rule blue for structure, a proofreader's red for marks.
- Depth from tonal steps of paper, not from shadows.
- Obsidian's own component geometry, restyled in colour, type, and rules only.

## Colors

A cool neutral paper with one printed blue and one correcting red; each scheme, `light` and `dark`, carries the full set.

### Primary
- **Manuscript Rule Blue** (`rule`, `rule-soft`): the colour of the printed grid. Links, tags, the H2 marker, the title rule, the active tab's rule, the sequence block's top rule, folder markers in the file tree, the ring on raised mobile controls, focus rings, and the labels of callouts. A highlight is this blue at 22% over the page, 30% in the dark scheme, with a 1px underline in full blue. `rule-soft` is its hover and secondary-string tone.

### Secondary
- **Proofreader's Red** (`proof`): only for marks a proofreader would make on the sheet. The text caret, the active-file caret, the active tab's mark, the X and strike line of a done task, the strike and delete loop of deleted text, the marks around an editing note, and the rules and label of a warning callout.

### Neutral
- **Paper** (`paper`): the note page.
- **Paper Alt** (`paper-alt`): side panels, the ribbon, and both tab strips, one tonal step from the page.
- **Tint** (`tint`): blocks set into the page, such as code and inline code. Table headers and property keys stay on the page; a table header is marked by a 1px ink rule, not a tone.
- **Ink, Mute, Faint** (`ink`, `mute`, `faint`): body text, secondary text, and the faintest labels.
- **Pale** (`pale`): the rules of the app around the note, such as pane and header underlines, and the two lines that stand three cells outside the note column.
- **Cell Line** (`cell-line`): every fine rule printed inside the note: table, property, and callout rules, the blockquote's rule, the divider strip, link underlines, the inline code box, the H2's trailing rule, the blank cells at the note's end, and the lines of sequence cells.
- **Ribbon, On Ribbon** (`ribbon`, `on-ribbon`): the app's narrow left ribbon and its icons.

`primary` at the top level points at the light scheme's rule blue for tools that expect a single brand colour.

**The Proof-Mark Rule.** Proofreader's Red marks; it never decorates. If a reader would not expect a proofreader to have put it there, it is not red. Body text and code tokens never use it.

**The One Blue Rule.** Manuscript Rule Blue is the only accent. A new role gets a tone of paper, ink, or blue, not a new hue.

**The Printed Line Rule.** A fine rule inside the note column is printed on the sheet and takes `cell-line`. A rule of the app around the sheet, the column's edge lines included, takes `pale`. The tab divider is the one exception: `pale` reaches only 1.31:1 against the dark strip, so the divider takes `cell-line` in both schemes.

**The Printed Apparatus Rule.** In a sequence block, the parts printed on the sheet take Manuscript Rule Blue: the top rule, the cell lines in `cell-line`, the length badge, and its molecule cell. What the writer put there, the header and the residues, is ink. The header's `>` mark is `mute`. The length badge is the block's copy control. Hovered, it sits on Manuscript Rule Blue at 12%. Focused, it takes the focus ring. Once it has copied, it fills with Manuscript Rule Blue for one second, with its text and molecule divider in `paper`.

## Typography

**Body Font:** Source Serif 4, with MaruBuri for Hangul (`text`)
**Mono Font:** D2Coding (`code`)

**Character:** A book serif for Latin with true italics for species and gene names, and a Korean serif whose stroke contrast sits beside it without shouting. D2Coding sets Hangul at twice the Latin width, so sequences and code keep their columns.

### Hierarchy
- **Body** (`text`, line height 1.8): long mixed Korean and Latin prose in a 700px column.
- **Headings** (`heading`, line height 1.3; `h1` to `h6` at 1.75em, 1.35em, 1.2em, 1em, 1em, and 0.875em, all bold): H2 opens with a filled square marker, and in reading view a fine rule runs on to the column edge; H3 to H6 stay plain. H5 is H4's size in `mute` and H6 is smaller again in `mute`, so no heading is larger than the one above it.
- **Code and sequences** (`code`): code blocks, inline code, property values, and sequence blocks.

**The True Italic Rule.** A Latin binomial or gene name is set in real italics from Source Serif 4. Never let it fall through to a synthesized slant.

## Layout

The note column is 700px (`line-width`). `cell` (14px) is the grid unit for padding in the app chrome. Sequence blocks stay inside the column and set as many GenBank groups of ten per line as fit, up to 60 residues, with the start position on each line. The position column is at least three digits wide. Every length badge ends where the last cell of a full line ends at the block's line length, so the badges of a note stand on one edge, a short primer's included. On a phone the column takes the full width and blocks fit it without scrolling sideways. Where a note pane has room for three cells (42px) beside the column, a 1px `pale` line runs the note's full height three cells outside each edge of the column, the sheet's margin. A narrower pane, a phone included, draws none.

## Elevation & Depth

Depth comes from tonal layers of paper. The note page and the active tab are the top layer (`paper`), side panels and the tab strips sit one step down (`paper-alt`), and blocks set into the page (code and inline code) take a further step (`tint`). Rules mark structure inside a layer; they do not stand in for a change of layer. Shadows appear only under surfaces that float over the page, such as menus, popovers, the command palette, and the raised controls on mobile.

**The Paper Stack Rule.** If two regions sit at different depths, they differ in tone by at least 0.025 in OKLCH lightness, enough to read without a line. No line marks a change of layer; a line between two regions of the same tone is a rule on the page.

## Shapes

Every corner is square (`rounded.none`). The theme sets every Obsidian radius variable to it, again on the body classes where Obsidian redefines them (macOS, iOS, mobile, tablet, phone, floating navbar). Three frames cut one corner at 45°, `cut` (12px) on a side, under a 2px Manuscript Rule Blue rule that runs along the diagonal without a break: the title rule, the active tab, and the sequence block.

**The One Cut Rule.** The cut and the 2px blue rule mark the head of the open note (the title rule and the active tab) and the sequence block, nothing else. A cut frame has one cut corner, top right, and its line never breaks at the diagonal.

## Components

Every component looks printed on the sheet or marked on it afterwards. Obsidian decides each component's size and position; the theme changes its colour, type, and rules.

**The Stock Geometry Rule.** A component keeps Obsidian's own size and position unless this document names the difference. Restyling never moves a box.

**The Shared Line Rule.** Rules that neighbouring panes draw at one height meet on one line. The note's view header takes Obsidian's `--header-height`, 40px against stock's 38.3px, so its rule continues the one under the sidebar's pane header.

### Reading and editing
A device looks the same in reading view and in Live Preview while the caret is outside it. The two views differ only where the editor needs something reading view has no use for, and this list is all of it:
- The line holding the caret shows its markdown marks.
- Reading view runs the H2's fine rule to the column edge. An editor line cannot be the flex row that rule needs, so Live Preview shows the square alone.
- Live Preview names a code block's language at the block's top right, in the code family in `mute`.
- Live Preview shows a footnote reference as typed, `[^1]`, and keeps the footnote where it was written, so it has no footnote section and no line above one.
- A list item and a task box sit where Obsidian's editor puts them, after the marker and the spaces typed before it.
- The two highlighters name code tokens differently, and a token takes the same colour in both views only where the names line up. The editor sets brackets, separators, and a literal such as `true` in ink and a name that a statement defines in bold, and reading view sets a called member in bold. Where the editor has no mode for a language, as for nix, it leaves the code plain.

### Tabs
- **Inactive:** no box and no ring. A `mute` title sits on the strip's tone, at Obsidian's own tab position.
- **Divider:** a 1px line one em tall between two inactive neighbours. No divider stands beside the active tab or after the last tab. It is `cell-line` in both schemes, the exception the Printed Line Rule names.
- **Active:** the only frame on the strip. It is `paper` under a 2px Manuscript Rule Blue top rule that turns down the 45° cut, with 1px blue sides, a bold ink title, and a small red proof mark before the title.

### Properties
- **Style:** the note's printed head, under the title rule. Each property is a row with its key in `mute` on the page and its value in the code family, under a 1px `cell-line` rule, and one more closes the block. A key takes no tint and no rule beside it, hovered or focused, and on a phone the block takes no panel.

### Chips (tags and property pills)
- **Style:** square cells outlined in Manuscript Rule Blue, transparent fill, mono text. Pills in `tags` and `aliases` share one height.

### Checkboxes
- **Style:** a square cell at Obsidian's size and position. A done task fills its box with a red X and sets its text in mute, struck through with a 1.5px red line.

### Title rule
- **Style:** a 2px Manuscript Rule Blue rule under the note title that turns down the 45° cut at its right end. It belongs to the title, 0.2em below it, so it shows whether or not the note has properties.

### Highlight
- **Style:** `==text==` keeps ink text on Manuscript Rule Blue at 22%, 30% in the dark scheme, over a 1px underline in full blue, in reading view and the editor. The wash and the underline keep it apart from inline code, which sits on `tint` in a box; its ink text keeps it apart from a link, which is blue.

### Proof marks
- **Delete:** `~~text~~` turns `mute` under a 1.5px Proofreader's Red strike. The strike ends with the delete loop, curling up from the line as a proofreader draws it. In Live Preview the line holding the caret shows its raw `~~` and no loop.
- **Editing note:** in the editor the `%%` marks of a comment are bold Proofreader's Red and the note between them is `mute`. Reading view hides the note.
- A footnote reference stays blue: the writer adds it, a proofreader does not.

### Blockquote
- **Style:** a 2px `cell-line` left rule with the text 2ch in from it, in ink on the page: no top or bottom rule, no fill, square. A nested quote draws the same rule again inside the first.

### Divider
- **Style:** `---` is a strip of empty cells in 1px `cell-line` lines, one `cell` high, in whole cells stretched to span the column, closed at its right end. Only a divider takes the strip: the line above the footnotes is a plain 1px `cell-line` line.

### Sheet end
- **Style:** three rows of blank cells close the note, 3em below its last block, in reading view and Live Preview: the unwritten rest of the sheet. They take the divider's cells in 1px `cell-line` lines, each row a full cell high and 8px from the next.

### Callouts and code blocks
- **Callout:** no fill and no cut. It sits on the page between a 1px `cell-line` rule above and one below, with its content on the column's left edge and its body text in ink. Two callouts in a row share one rule: the first drops its rule below, and the second's rule above stands between them.
- **Callout label:** the type's icon and the title in Manuscript Rule Blue, in the body family at 0.85em and weight 700. The label is printed on the sheet; the text under it is the writer's, in ink.
- **Warning tier:** warning, caution, attention, danger, error, bug, failure, fail, and missing take a 2px Proofreader's Red rule above, a 1px red rule below, and a red label.
- **Quote callout:** quote and cite take the blockquote's form, a 2px `cell-line` rule on the left with the text set in 2ch and no rule above or below, under the `mute` label.
- **Code block:** the `tint` layer only, with square corners, no rule, and no cut. The tint already sets the block apart as its own layer.
- **Live Preview hover:** a hovered block draws no ring, and its edit button sits `cut` in from the right edge. A sequence block is the exception: its edit button sits at the top left, over the empty position column, because the length badge, its copy control, ends on the grid edge, and the space left of the cut changes with the window width.

### Navigation (file tree)
- **Style:** plain rows on the `paper-alt` layer under a bold ink pane header with a fine `pale` underline.
- **Folders:** an 11px cell drawn in a 1px Manuscript Rule Blue line replaces the chevron in the collapse-icon gutter, with a plus inside when collapsed and a minus when open. A filled square is the H2's mark and an empty cell is a checkbox's, so a folder takes neither.
- **Active file:** bold ink with a red proof caret in the same gutter, never a filled row.

### Raised mobile controls
- **Style:** the floating navbar and the top buttons are square on `paper`, with a 1px Manuscript Rule Blue ring, the floating shadow, and no backdrop blur. A phone without the floating navbar gives its navbar a 1px blue top rule instead.

### Icons
- **Style:** Obsidian's Lucide set at a 1.5px stroke, and 1.25px at the large size. The sequence block has no copy icon: its length badge is the copy control.

### Section heading marker
A signature component. Each H2 carries a filled square, 0.36em on a side, in Manuscript Rule Blue, in reading view and Live Preview. It hangs in the left margin 0.6em before the heading text, so the text starts at the column edge with the body; on a phone, where the margin is too narrow, it sits inside the line instead. Reading view runs a fine `cell-line` rule from the text to the column edge; Live Preview shows the square alone. The marker carries no number: Obsidian unloads sections outside the viewport, so a CSS counter numbers long notes wrong. Numbered H2 through the companion plugin is an open item and has not shipped.

## Do's and Don'ts

### Do:
- **Do** keep Obsidian's component sizes and positions, and prove it against stock Obsidian.
- **Do** separate layers by tone: `paper`, `paper-alt`, `tint`.
- **Do** set Latin names in true italics.
- **Do** keep the 45° cut and the 2px blue rule for the head of the open note (the title rule and the active tab) and the sequence block, and nothing else.

### Don't:
- **Don't** round a corner.
- **Don't** use Proofreader's Red for decoration, body text, or code tokens.
- **Don't** add a second accent hue.
- **Don't** fill the active row or tab with colour; mark it.
- **Don't** set a callout or a summary in a tinted, shaded, or gradient box.
- **Don't** number headings with a CSS counter; Obsidian unloads off-screen sections and the count goes wrong.
