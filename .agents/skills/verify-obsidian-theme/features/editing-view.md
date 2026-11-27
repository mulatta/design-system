# Editing view

Editing view is where the note is written: Live Preview renders most markdown inline and reveals markers on the active line, and source mode shows raw markdown. The theme keeps the reading fonts, shows markers faint, sets code lines on the tint with a top rule on the first line, draws tags as square cells, and uses a proof-red caret.

## Sub-features

- `edit-live` renders headings, emphasis, links, and inline code like reading view; H2 carries the same hung square marker, without reading view's trailing rule.
- `edit-markers` shows markdown markers (`#`, `*`, `` ` ``) in the faint colour.
- `edit-inline` sets inline code in D2Coding on the tint between fine rules, `==highlight==` as a pale blue wash with no underline, and `~~strikethrough~~` in mute under a red strike. The editing note shows its `%%` marks in bold red and its text in mute; a comment inside a code block keeps the code comment colour.
- `edit-code-lines` sets fenced code lines in D2Coding on the tint, with a rule above the opening fence and the same token colours as reading view, in Live Preview and source mode.
- `edit-tags` draws `#tag` as a square cell in D2Coding in the accent.
- `edit-caret` shows a proof-red caret in the editor, and the line holding it gets no fill.
- `edit-title-focus` lets the inline title be clicked and edited with no outline around it; the caret shows the focus.
- `edit-property-focus` lets a property's value or name be clicked and edited with no ring around the property row and no fill behind the value.
- `edit-property-select` leaves a property row and its name unchanged under the pointer, and shows a row selected by a click beside its value with the selected-item tint of the file tree, not a ring, once the button is released.
- `edit-table` sizes a Live Preview table to its content, up to the note column, as reading view does; a table wider than the column scrolls inside its widget.
- `edit-code-active` keeps a code line on the code block's tint while the caret is on it.
- `edit-column` keeps everything Live Preview paints, task checkboxes and the properties block included, at or right of the note column's left edge.

## How to get to it (user POV)

- Open a note in editing mode (pencil icon in the view header, or `Ctrl/Cmd+E` from reading view).
- Switch between Live Preview and source mode with the command `Toggle Live Preview/Source mode` or the editor settings.

## Driving it with obsidian.ts

Preconditions:

- Baseline preconditions hold for run `agent`.

- **Live Preview.** Run `obs shot --run agent --note elements-ko --view live --scheme light`, and again with `--scroll 1600`. The captures show `edit-live`, `edit-inline`, `edit-tags`, and `edit-code-lines`.
- **Source mode.** Run `obs shot --run agent --note elements-ko --view source --scheme light` and with `--scroll 900`. The captures show `edit-markers` and `edit-code-lines`.
- **Dark.** Repeat both with `--scheme dark`.
- **Caret.** `edit-caret` needs focus in the editor; write a custom drive over CDP (port in `build/verify/agent/run.json`) that clicks into a paragraph and captures. `shot` focuses the editor, but the caret blinks, so a plain `shot` may capture it switched off.
- **Geometry.** Run `obs compare --base stock --run agent --view live --scheme light`, then `--scheme dark`, against a stock run. The `title-rule`, `properties`, `heading`, `code-top`, `callout`, `table`, and `task-line` parts measure the Live Preview counterparts of the reading parts (see [Geometry against stock Obsidian](./stock-geometry.md)).
- **Tones.** Run `obs layers --run agent --view live --scheme light`, then `--scheme dark`. `note | code`, `note | inline-code`, and `note | property-key` prove the tint of `edit-code-lines` and `edit-inline`.
- **States.** Run `obs editcheck --run agent --scheme light`, then `--scheme dark`. `text-focus` proves `edit-title-focus` and `edit-property-focus`, `property-select` proves `edit-property-select`, `live-table` proves `edit-table`, `live-column` proves `edit-column`, and `code-active-line` proves `edit-code-active`.
- **Phone.** Add `--mobile` to `compare --view live`, `layers --view live`, and `editcheck` to repeat them under phone emulation (see [Mobile](./mobile.md)).
- **Proof.** Report each sub-feature with its capture path.

## Gotchas

- Live Preview H2 has no trailing rule: drawing one inside a CodeMirror line means painting the text spans over it, which hides the editor's selection.
- The rule above the opening fence is a plain 2px border with no 45° cut, unlike reading view's code block; the `code-top` part shows it.
- CodeMirror renders only the lines near the viewport, so a block far down the note is not in the DOM until the editor scrolls to it. `compare` and `layers` scroll from the top until a part or region appears.
- Live Preview reveals markers only on the active line; without a focused line, markers mostly stay hidden.
- `--scroll` scrolls `.cm-scroller`, whose height differs from reading view; adjust the value per capture.
