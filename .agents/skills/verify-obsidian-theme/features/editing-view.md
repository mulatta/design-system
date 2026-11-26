# Editing view

Editing view is where the note is written: Live Preview renders most markdown inline and reveals markers on the active line, and source mode shows raw markdown. The theme keeps the reading fonts, shows markers faint, sets code lines on the tint with a top rule on the first line, draws tags as square cells, and uses a proof-red caret.

## Sub-features

- `edit-live` renders headings, emphasis, links, and inline code like reading view; H2 opens with the same square marker, without reading view's trailing rule.
- `edit-markers` shows markdown markers (`#`, `*`, `` ` ``) in the faint colour.
- `edit-inline` sets inline code in D2Coding on the tint between fine rules, and `==highlight==` as a pale blue wash with a blue underline.
- `edit-code-lines` sets fenced code lines in D2Coding on the tint, with a rule above the opening fence and the same token colours as reading view, in Live Preview and source mode.
- `edit-tags` draws `#tag` as a square cell in D2Coding in the accent.
- `edit-caret` shows a proof-red caret in the editor, and the line holding it gets no fill.

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
- **Proof.** Report each sub-feature with its capture path.

## Gotchas

- Live Preview H2 has no trailing rule: drawing one inside a CodeMirror line means painting the text spans over it, which hides the editor's selection.
- Live Preview reveals markers only on the active line; without a focused line, markers mostly stay hidden.
- `--scroll` scrolls `.cm-scroller`, whose height differs from reading view; adjust the value per capture.
