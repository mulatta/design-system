---
version: alpha
name: Wongoji
description: A manuscript-grid design system for mixed Korean and Latin research notes, with sequences, math, and code on one page.
colors:
  primary: "{colors.light.rule}"
  light:
    paper: "#fafafa"
    paper-alt: "#f0f1f3"
    ink: "#1a1a1a"
    mute: "#5c5c5c"
    faint: "#6b6b6b"
    rule: "#0359b0"
    rule-soft: "#3f6183"
    pale: "#d4d7dd"
    tint: "#ecedef"
    cell-line: "#9fbfe2"
    proof: "#b23a30"
    ribbon: "#f0f1f3"
    on-ribbon: "#444444"
  dark:
    paper: "#1a1a1a"
    paper-alt: "#1e2025"
    ink: "#e3e3e3"
    mute: "#a3a3a3"
    faint: "#8f8f8f"
    rule: "#9accfd"
    rule-soft: "#9fb8d0"
    pale: "#31343c"
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
    fontSize: 1.15em
    fontWeight: 700
  h4:
    fontSize: 1em
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

Wongoji is Korean manuscript paper: a sheet of square cells with fine printed rules, written on by hand and corrected in red. The system treats every component as something printed on that sheet or marked on it afterwards. Tabs, tags, checkboxes, and callouts read as cells and frames stamped onto the page, never as raised buttons or floating cards. The mood is quiet and exact, with the warmth of a page someone wrote on.

It serves one person's research notes, where long Korean prose, Latin species and gene names, DNA and protein sequences, math, code, and tables share a page and must each read correctly beside the others. Structure carries the identity: a filled blue square opening each section heading, ruled property rows, square tags, and one corner of each frame cut at 45°. Ornament does not.

**Key Characteristics:**
- Square cells and fine rules instead of fills and rounded containers.
- Two accents with fixed jobs: a printed-rule blue for structure, a proofreader's red for marks.
- Depth from tonal steps of paper, not from shadows.
- Obsidian's own component geometry, restyled in colour, type, and rules only.

## Colors

A cool neutral paper with one printed blue and one correcting red; each scheme, `light` and `dark`, carries the full set.

### Primary
- **Manuscript Rule Blue** (`rule`, `rule-soft`): the colour of the printed grid. Links, tags, the H2 marker, the title rule, the top rule of code blocks and callouts, the active tab's rule, folder markers in the file tree, the ring on raised mobile controls, and focus rings. A highlight is this blue at 12% over the page with a 1px underline in full blue. `rule-soft` is its hover and secondary-string tone.

### Secondary
- **Proofreader's Red** (`proof`): only for marks a proofreader would make on the sheet. The text caret, the active-file caret, the active tab's mark, the X and strike line of a done task, the strike and delete loop of deleted text, the marks around an editing note, and warning and danger callouts.

### Neutral
- **Paper** (`paper`): the note page.
- **Paper Alt** (`paper-alt`): side panels, the ribbon, and both tab strips, one tonal step from the page.
- **Tint** (`tint`): blocks set into the page, such as code, inline code, and property keys. Table headers stay on the page and are marked by a rule, not a tone.
- **Ink, Mute, Faint** (`ink`, `mute`, `faint`): body text, secondary text, and the faintest labels.
- **Pale** (`pale`): dividers and inactive frames.
- **Cell Line** (`cell-line`): the faint lines of sequence cells.
- **Ribbon, On Ribbon** (`ribbon`, `on-ribbon`): the app's narrow left ribbon and its icons.

`primary` at the top level points at the light scheme's rule blue for tools that expect a single brand colour.

**The Proof-Mark Rule.** Proofreader's Red marks; it never decorates. If a reader would not expect a proofreader to have put it there, it is not red. Body text and code tokens never use it.

**The One Blue Rule.** Manuscript Rule Blue is the only accent. A new role gets a tone of paper, ink, or blue, not a new hue.

**The Printed Apparatus Rule.** In a sequence block, the parts printed on the sheet take Manuscript Rule Blue: the top rule, the cell lines in `cell-line`, the length badge, and its molecule cell. What the writer put there, the header and the residues, is ink. The header's `>` mark is `mute`. The length badge is the block's copy control. Hovered, it sits on Manuscript Rule Blue at 12%. Focused, it takes the focus ring. Once it has copied, it fills with Manuscript Rule Blue for one second, with its text and molecule divider in `paper`.

## Typography

**Body Font:** Source Serif 4, with MaruBuri for Hangul (`text`)
**Mono Font:** D2Coding (`code`)

**Character:** A book serif for Latin with true italics for species and gene names, and a Korean serif whose stroke contrast sits beside it without shouting. D2Coding sets Hangul at twice the Latin width, so sequences and code keep their columns.

### Hierarchy
- **Body** (`text`, line height 1.8): long mixed Korean and Latin prose in a 700px column.
- **Headings** (`heading`, line height 1.3; `h1` to `h4` at 1.75em, 1.35em, 1.15em, 1em, bold through `h3`): H2 opens with a filled square marker, and in reading view a fine rule runs on to the column edge; H3 and H4 stay plain.
- **Code and sequences** (`code`): code blocks, inline code, property values, and sequence blocks.

**The True Italic Rule.** A Latin binomial or gene name is set in real italics from Source Serif 4. Never let it fall through to a synthesized slant.

## Layout

The note column is 700px (`line-width`). `cell` (14px) is the grid unit for padding in the app chrome. Sequence blocks stay inside the column and set as many GenBank groups of ten per line as fit, up to 60 residues, with the start position on each line. The position column is at least three digits wide. Every length badge ends where the last cell of a full line ends at the block's line length, so the badges of a note stand on one edge, a short primer's included. On a phone the column takes the full width and blocks fit it without scrolling sideways.

## Elevation & Depth

Depth comes from tonal layers of paper. The note page and the active tab are the top layer (`paper`), side panels and the tab strips sit one step down (`paper-alt`), and blocks set into the page (code, inline code, property keys) take a further step (`tint`). Rules mark structure inside a layer; they do not stand in for a change of layer. Shadows appear only under surfaces that float over the page, such as menus, popovers, the command palette, and the raised controls on mobile.

**The Paper Stack Rule.** If two regions sit at different depths, they differ in tone by at least 0.025 in OKLCH lightness, enough to read without a line. No line marks a change of layer; a line between two regions of the same tone is a rule on the page.

## Shapes

Every corner is square (`rounded.none`). The theme sets every Obsidian radius variable to it, again on the body classes where Obsidian redefines them (macOS, iOS, mobile, tablet, phone, floating navbar). A framed block (the active tab, the title rule, code blocks, callouts) cuts exactly one corner at 45°, `cut` (12px) on a side, and its rule runs along the diagonal without a break.

**The One Cut Rule.** One cut corner per frame, top right, and the line never breaks at the diagonal.

## Components

Every component looks printed on the sheet or marked on it afterwards. Obsidian decides each component's size and position; the theme changes its colour, type, and rules.

**The Stock Geometry Rule.** A component keeps Obsidian's own size and position unless this document names the difference. Restyling never moves a box.

**The Shared Line Rule.** Rules that neighbouring panes draw at one height meet on one line. The note's view header takes Obsidian's `--header-height`, 40px against stock's 38.3px, so its rule continues the one under the sidebar's pane header.

### Tabs
- **Shape:** square cells sharing borders along the tab strip.
- **Active:** a 2px Manuscript Rule Blue top rule that turns down the 45° cut, with a small red proof mark before the title.

### Chips (tags and property pills)
- **Style:** square cells outlined in Manuscript Rule Blue, transparent fill, mono text. Pills in `tags` and `aliases` share one height.

### Checkboxes
- **Style:** a square cell at Obsidian's size and position. A done task fills its box with a red X and sets its text in mute, struck through with a 1.5px red line.

### Title rule
- **Style:** a 2px Manuscript Rule Blue rule under the note title that turns down the 45° cut at its right end. It belongs to the title, 0.2em below it, so it shows whether or not the note has properties.

### Highlight
- **Style:** `==text==` keeps ink text on Manuscript Rule Blue at 12%, in reading view and the editor. It takes no underline, which would read as a link.

### Proof marks
- **Delete:** `~~text~~` turns `mute` under a 1.5px Proofreader's Red strike. The strike ends with the delete loop, curling up from the line as a proofreader draws it. In Live Preview the line holding the caret shows its raw `~~` and no loop.
- **Editing note:** in the editor the `%%` marks of a comment are bold Proofreader's Red and the note between them is `mute`. Reading view hides the note.
- A footnote reference stays blue: the writer adds it, a proofreader does not.

### Callouts and code blocks
- **Corner Style:** square, with the one 45° cut.
- **Background:** the `tint` layer, or the callout colour at low strength.
- **Border:** a Manuscript Rule Blue top rule for code; warning and danger callouts take Proofreader's Red. Neither takes a side or bottom line: the tint already sets the block apart as its own layer.
- **Live Preview hover:** a hovered block draws no ring around its frame, and its edit button sits `cut` in from the right edge, clear of the diagonal. A sequence block is the exception: its edit button sits at the top left, over the empty position column, because the length badge, its copy control, ends on the grid edge, and the space left of the cut changes with the window width.

### Navigation (file tree)
- **Style:** plain rows on the `paper-alt` layer under a bold ink pane header with a fine `pale` underline.
- **Folders:** an 11px cell drawn in a 1px Manuscript Rule Blue line replaces the chevron in the collapse-icon gutter, with a plus inside when collapsed and a minus when open. A filled square is the H2's mark and an empty cell is a checkbox's, so a folder takes neither.
- **Active file:** bold ink with a red proof caret in the same gutter, never a filled row.

### Raised mobile controls
- **Style:** the floating navbar and the top buttons are square on `paper`, with a 1px Manuscript Rule Blue ring, the floating shadow, and no backdrop blur. A phone without the floating navbar gives its navbar a 1px blue top rule instead.

### Icons
- **Style:** Obsidian's Lucide set at a 1.5px stroke, and 1.25px at the large size. The sequence block has no copy icon: its length badge is the copy control.

### Section heading marker
A signature component. Each H2 carries a filled square, 0.36em on a side, in Manuscript Rule Blue, in reading view and Live Preview. It hangs in the left margin 0.6em before the heading text, so the text starts at the column edge with the body; on a phone, where the margin is too narrow, it sits inside the line instead. Reading view runs a fine `pale` rule from the text to the column edge; Live Preview shows the square alone. The marker carries no number: Obsidian unloads sections outside the viewport, so a CSS counter numbers long notes wrong. Numbered H2 through the companion plugin is an open item and has not shipped.

## Do's and Don'ts

### Do:
- **Do** keep Obsidian's component sizes and positions, and prove it against stock Obsidian.
- **Do** separate layers by tone: `paper`, `paper-alt`, `tint`.
- **Do** set Latin names in true italics.
- **Do** keep one 45° cut per frame with an unbroken rule.

### Don't:
- **Don't** round a corner.
- **Don't** use Proofreader's Red for decoration, body text, or code tokens.
- **Don't** add a second accent hue.
- **Don't** fill the active row or tab with colour; mark it.
- **Don't** number headings with a CSS counter; Obsidian unloads off-screen sections and the count goes wrong.
