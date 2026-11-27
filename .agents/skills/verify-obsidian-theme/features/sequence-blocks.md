# Sequence blocks

The sequence plugin (`obsidian/sequence-plugin/`, flake attribute `obsidian-sequence-plugin`, plugin id `sequence-blocks`) renders `fasta`, `dna`, and `protein` code blocks in the GenBank layout, and the theme's `obsidian/theme/src/sequence.css` draws them as manuscript cells. Whatever shape the input has, the block stays inside the note column and shows as many groups of ten per line as fit it, up to 60 residues, with the start position on each line, and copying gives back the sequence as written. These checks need a run launched with `--plugin obsidian-sequence-plugin`; without it the same notes show plain code blocks.

## Sub-features

- `seq-lines` sets the residues per line to the largest multiple of ten, from 10 to 60, whose line fits the block, the last line of a record shorter. Resizing the window lays the lines out again. Blocks under 1000 residues in one note get the same line length.
- `seq-groups` splits each line into groups of ten with a space between groups.
- `seq-pos` puts the start position (1, 41, 81, ... at 40 per line) before each line, right-aligned in tabular numerals, so the groups of every line start in one column.
- `seq-header` shows a FASTA `>` header line styled apart from the residues. The plugin writes the `>` as text in its own element (`.seq-header-mark`), so a copied selection keeps it, and the theme draws it once, in the muted colour at normal weight. A long header wraps onto more lines and is never cut off. A block without a header (the `dna` block) has no header text.
- `seq-length` shows each record's length and unit in a badge. A `dna` block counts nt and a `protein` block aa. A `fasta` record counts aa when it holds E, F, I, J, L, O, P, Q, Z, or `*` in either case (`96 aa`), and nt/aa otherwise (`174 nt/aa`); X alone keeps nt/aa. The badge covers no residue and no header text. The badge holds the length and the unit in two parts: the unit part is as wide as the block's widest unit, 2ch in a block of `nt` or `aa` records and 5ch when a record says `nt/aa`, and the length part is as wide as the block's longest length, so every badge in a block, and every badge whose block has lengths of as many digits and as wide a unit, has one width. The badge is one cell tall plus its border. It sits at the right end of the record's head row, and every head row keeps the copy button's width free beside it, so the badges of all records stand in one column. When the header leaves no room beside it, the badge moves to the next line. The copy button stays at the top right of the first head row. A record without a header has a head row with only the badge. On a phone every badge sits on its own row under the header row and ends under the copy icon's right edge, so all records of a block have one head shape; a record without a header keeps the header row empty.
- `seq-records` separates the records of a multi-FASTA block with a fine rule, and each record numbers its lines from 1.
- `seq-cells` draws each residue in a square cell, and cells sit only behind residues: the gaps between groups, the position column, and the empty end of a short last line have none.
- `seq-column` keeps the block inside the 700px note column: its left and right edges meet the column's, and it never scrolls sideways.
- `seq-reflow` gives the same layout to every input shape: one long line, lines wrapped at 60, 70, or 80, multi-FASTA records of 42, 60, and 132 nt, a 214 aa protein, and a GenBank `ORIGIN` paste, whose position numbers and `ORIGIN` and `//` lines the plugin drops.
- `seq-copy` returns the original text: the copy button copies the block's source exactly, and a selection copied from the block carries no position numbers or group spaces. The button is an icon of two overlapping cells with no fill or border, as tall as the badge. Its label and tooltip say `Copy sequence`, or `Copy 3 records` for a multi-FASTA block, since the button sits on record 1's head row but copies the whole block. After a click it shows a check and its label names what it copied (`Copied 174 nt`, or `Copied 3 records`) for 1.5 seconds. The button stays shown for that time after the pointer leaves the block, a polite live region in the block says the same label, and a tooltip open on the button says it too. When the clipboard refuses the text, an Obsidian notice says `Could not copy the sequence` and the button stays as it was. On a phone the icon stays one cell tall, and a tap anywhere in a three-cell square at the block's top right reaches it. The square ends at the block's right edge, or in Live Preview at Obsidian's edit button, and the first header wraps short of it. The badge row starts below the square, so a tap on a badge copies nothing.
- `seq-inline` leaves an inline primer in backticks as ordinary inline code, ungrouped and unnumbered.
- `seq-live` renders the blocks in Live Preview as in reading view.
- `seq-dark` keeps every sub-feature above in the dark palette.
- `seq-phone` keeps the block inside the phone width without scrolling sideways; lines drop to 20 residues.

## How to get to it (user POV)

- Install the plugin in the vault and enable it under Settings, Community plugins.
- Write a code block fenced with `fasta`, `dna`, or `protein` and open the note in reading view or Live Preview.
- Hover the block to show the copy button at the right end of its first head row, or select residues and press `Cmd/Ctrl+C`.

## Driving it with obsidian.ts

Preconditions:

- Baseline preconditions hold for run `agent`, launched with `obs launch --run agent --plugin obsidian-sequence-plugin`.
- `obs doctor --run agent` lists `sequence-blocks` in `enabledPlugins` and reports `installCurrent: true`. After an edit under `obsidian/sequence-plugin/`, run `obs sync --run agent`.

- **Every input shape, light.** Run `obs shot --run agent --note sequences --view reading --scheme light` and again with `--scroll 600` and `--scroll 1200`. Together they show `seq-lines`, `seq-groups`, `seq-pos`, `seq-header`, `seq-records`, `seq-cells`, `seq-column`, `seq-reflow`, and `seq-inline` on the last capture.
- **Live Preview.** Run `obs shot --run agent --note sequences --view live --scheme light`. The capture shows `seq-live`.
- **Dark.** Repeat the three reading captures with `--scheme dark` for `seq-dark`.
- **Phone width.** Run `obs shot --run agent --note sequences --view reading --scheme light --mobile --size 390x844`, and again with `--scroll 700`, for `seq-phone`.
- **Lab notes.** Run `obs shot --run agent --note lab-note-ko --view reading --scheme light` for a sequence block among prose.
- **Layout and copy.** Run `obs seqcheck --run agent --view reading --scheme light`, again with `--size 1100x800`, again with `--view live --size 1100x800`, and again with `--view reading --mobile --size 390x844`. Each prints `SEQCHECK ok` or `SEQCHECK fail <count>` and writes `build/verify/agent/seqcheck-<view>-<scheme>-<size>[-mobile].json`. The skill's [Check sequence blocks](../SKILL.md#check-sequence-blocks) section defines each invariant. Each invariant proves these sub-features:
  - `not-clipped` proves `seq-column` in reading view, `seq-live` with `--view live`, and `seq-phone` with `--mobile`.
  - `fits` proves `seq-lines`: the chosen line length fits without scrolling, at every size and with `--mobile`.
  - `in-column` proves `seq-column`, and `seq-phone` with `--mobile`.
  - `badge-clear`, `badge-column`, `badge-height`, `badge-width`, and `badge-unit` prove `seq-length`, and `head-shape` its phone layout with `--mobile`.
  - `copy-clear` proves that the copy button of `seq-copy` hides no header, residue, or badge.
  - `copy-reach` proves that the button's tap area covers no header, residue, or other control, and that it is three cells square with `--mobile`.
  - `copy-button` and `copy-failure` prove the button half of `seq-copy`, on success and when the clipboard refuses. `copy-label` proves its rest label, and `copy-held` that the copied state stays shown and is announced for its 1.5 seconds.
  - `copy-selection` proves the selection half of `seq-copy`, and that the header keeps its `>`.
- **Proof.** Look at every capture against the sub-feature list and report each sub-feature as holding or not, with the capture path.

## Gotchas

- A run launched without `--plugin` shows plain code blocks. `doctor` then lists no `sequence-blocks` in `enabledPlugins`.
- `sync` disables and re-enables the plugin, so an open note re-renders its blocks with the new code. Fixture notes still need a relaunch.
- `seqcheck` replaces `navigator.clipboard.writeText` for its clicks and never writes the system clipboard. A hand-written drive must do the same: clicking the copy button for real puts the sequence on the owner's clipboard.
- The copy button is invisible until hover, so `shot` captures never show it. Look at the hovered captures `seqcheck` writes to `shots/seqcheck-*.png` instead.
- `--scroll` values depend on the window height and on the note; check that each capture shows the intended block before reporting.
