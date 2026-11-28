# Editing view

Editing view is where the note is written: Live Preview renders most markdown inline and reveals markers on the active line, and source mode shows raw markdown. The theme keeps the reading fonts, shows markers faint, sets code lines on the tint, draws tags as square cells, and uses a proof-red caret.

## Sub-features

- `edit-live` renders headings, emphasis, links, and inline code like reading view; H2 carries the same hung square marker, without reading view's trailing rule.
- `edit-footnote` sets a footnote reference in blue, raised and smaller, as reading view does. The editor shows it as typed, `[^1]`, where reading view prints `[1]`.
- `edit-links` underlines a link as reading view does: blue text over a 1px pale line set 0.22em below it, in full blue under the pointer; an unresolved link is mute over a dotted line.
- `edit-wrap` breaks a line between words as reading view does, never inside a Hangul word; a string too long for the column still breaks.
- `edit-markers` shows markdown markers (`#`, `*`, `` ` ``) in the faint colour.
- `edit-inline` sets inline code in D2Coding on the tint inside a fine box, at reading view's size, with its backticks inside the same box on the line holding the caret, `==highlight==` as a pale blue wash with no underline, and `~~strikethrough~~` in mute under a red strike that ends in the delete loop, as in reading view, once per strikethrough even when bold, code, or a link inside it splits it. The line holding the caret shows the raw `~~` and no loop. The editing note shows its `%%` marks in bold red and its text in mute; a comment inside a code block keeps the code comment colour.
- `edit-quote` draws a blockquote as reading view does: a 2px pale left rule, the text 2ch in from it, a nested quote behind a second rule, and a wrapped line starting under the first line's text. The line holding the caret shows its `>` marks.
- `edit-hr` draws `---` as the strip of cells reading view draws, the same width and height. The line holding the caret shows the raw `---`.
- `edit-code-lines` sets fenced code lines in D2Coding on the tint alone, with no rule above the opening fence, at reading view's type size, line height, and inset, in Live Preview and source mode. A token takes reading view's colour and weight wherever CodeMirror's class says what Prism's says; `obs pairs` prints the pairs of classes that do not line up as `diff` lines. Live Preview names the block's language at its top right in mute D2Coding, which reading view does not.
- `edit-tags` draws `#tag` as the square cell reading view draws, in D2Coding in the accent at the same type size, padding, and height.
- `edit-caret` shows a proof-red caret in the editor, and the line holding it gets no fill.
- `edit-title-focus` lets the inline title be clicked and edited with no outline around it; the caret shows the focus.
- `edit-property-focus` lets a property's value or name be clicked and edited with no ring around the property row and no fill behind the value.
- `edit-property-select` leaves a property row and its name unchanged under the pointer, and shows a row selected by a click beside its value with the selected-item tint of the file tree, not a ring, once the button is released.
- `edit-table` sizes a Live Preview table to its content, up to the note column, as reading view does, with reading view's cell padding; a table wider than the column scrolls inside its widget and ends at the column's right edge, and its add-column button comes into the column once the table is scrolled to its end.
- `edit-code-active` keeps a code line on the code block's tint while the caret is on it.
- `edit-column` keeps everything Live Preview paints, task checkboxes and the properties block included, at or right of the note column's left edge.
- `edit-embed-hover` leaves an embedded block's frame as it is under the pointer: hovering a callout or a math block draws no ring around it, and its edit button sits inside the frame, below the top rule and clear of the 45° cut.

## How to get to it (user POV)

- Open a note in editing mode (pencil icon in the view header, or `Ctrl/Cmd+E` from reading view).
- Switch between Live Preview and source mode with the command `Toggle Live Preview/Source mode` or the editor settings.

## Driving it with obsidian.ts

Preconditions:

- Baseline preconditions hold for run `agent`.

- **Live Preview.** Run `obs shot --note elements-ko --view live --scheme light`, and again with `--scroll 1600`. The captures show `edit-live`, `edit-inline`, `edit-tags`, and `edit-code-lines`.
- **Source mode.** Run `obs shot --note elements-ko --view source --scheme light` and with `--scroll 900`. The captures show `edit-markers` and `edit-code-lines`.
- **Dark.** Repeat both with `--scheme dark`.
- **Caret.** `edit-caret` needs focus in the editor; run a probe with `obs drive --note lab-note-ko --view live` that clicks into a paragraph and captures. `shot` focuses the editor, but the caret blinks, so a plain `shot` may capture it switched off.
- **Geometry.** Run `obs compare --base stock --view live --scheme light`, then `--scheme dark`, against a stock run. The `title-rule`, `properties`, `heading`, `code-top`, `callout`, `table`, and `task-line` parts measure the Live Preview counterparts of the reading parts (see [Geometry against stock Obsidian](./stock-geometry.md)).
- **Tones.** Run `obs layers --view live --scheme light`, then `--scheme dark`. `note | code`, `note | inline-code`, and `note | property-key` prove the tint of `edit-code-lines` and `edit-inline`.
- **Joins.** Run `obs joins --view live`, and with `--mobile`. `delete-loop` proves the loop of `edit-inline` meets its strike.
- **States.** Run `obs editcheck --scheme light`, then `--scheme dark`. `text-focus` proves `edit-title-focus` and `edit-property-focus`, `property-select` proves `edit-property-select`, `live-table` proves `edit-table`, `live-column` proves `edit-column`, `code-active-line` proves `edit-code-active`, and `embed-hover` proves `edit-embed-hover`; add `--note elements-ko` to hover every callout kind and a math block.
- **Same as reading view.** Run `obs pairs`, then `--scheme dark`, and both with `--mobile`. It compares every device of the `pairs` note between reading view and Live Preview, with the caret outside the device, which is what a sub-feature above means by "as reading view does". A `diff` line is a difference declared in `pairDiffs` with its reason. The rows are `paragraph`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `h2-marker`, `h2-rule`, `bold`, `italic`, `strikethrough`, `delete-loop`, `highlight`, `inline-code`, `internal-link`, `unresolved-link`, `external-link`, `external-link-icon`, `tag`, `footnote-ref`, `footnote-ref-raise`, `list-item`, `list-bullet`, `list-number`, `task-open`, `task-done`, `task-done-mark`, `task-done-text`, `blockquote`, `blockquote-rule`, `blockquote-text`, `nested-quote-rule`, `nested-quote-text`, `divider`, `footnote-separator`, `code-block`, `code-text`, `code-label`, `table`, `table-head`, `table-cell`, `callout`, `callout-title`, `callout-text`, `embed`, and `embed-title`.
- **Phone.** Add `--mobile` to `compare --view live`, `layers --view live`, and `editcheck` to repeat them under phone emulation (see [Mobile](./mobile.md)).
- **Proof.** Report each sub-feature with its capture path.

## Gotchas

- Live Preview H2 has no trailing rule: drawing one inside a CodeMirror line means painting the text spans over it, which hides the editor's selection.
- Live Preview's table widget pads itself by the drag-handle size and pulls itself out by the same amount, so a table starts on the column edge. Obsidian makes the handles 24px on the phone but pulls only 16px; the theme pulls by the handle size, or a column-wide table comes up 16px short.
- CodeMirror renders only the lines near the viewport, so a block far down the note is not in the DOM until the editor scrolls to it. `compare` and `layers` scroll from the top until a part or region appears.
- Live Preview hides a marker such as `~~` or `**` as an empty `contenteditable="false"` span between `img.cm-widgetBuffer`s, and splits a strikethrough into one `.cm-strikethrough` span per run between markers. The loop goes on a piece followed by a hidden marker unless another `.cm-strikethrough` follows that marker, so only a strikethrough's last piece carries it. A revealed marker is a `.cm-formatting` span, not a hidden one, so the caret's line gets no loop.
- Live Preview reveals markers only on the active line; without a focused line, markers mostly stay hidden.
- `--scroll` scrolls `.cm-scroller`, whose height differs from reading view; adjust the value per capture.
