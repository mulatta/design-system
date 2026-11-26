# Obsidian theme verification map

This directory is the maintained source for verifying what the Wongoji theme does inside Obsidian. Read this index before driving the app, then use the matching feature file as the recipe. `obs` means `nix develop -c node obsidian/testbed/obsidian.ts`, run from the repository root.

## Baseline preconditions

- `obs launch --run <run>` has printed `READY`, and `obs doctor --run <run>` reports `"ok": true` with `cssTheme: "Wongoji"`.
- The vault holds only the fixture notes in `obsidian/testbed/notes/`: `lab-note-ko`, `lab-note-en`, `elements-ko`, `elements-en`, `long-note` (30 sections, for anything that must hold after scrolling), `protocols/pcr-protocol` (a folder row and a nested file), and `sequences` (one sequence block per input shape, for runs launched with `--plugin obsidian-sequence-plugin`). `launch` copies the folder tree as is.
- The run shows the working tree you want to prove. After an edit to `DESIGN.md`, `obsidian/theme/src/`, a snippet, `nix/fonts/`, or a `--plugin` source such as `obsidian/sequence-plugin/`, run `obs sync --run <run>`.
- Never drive an Obsidian that this run did not start; `doctor`'s `vaultPath` must be under `build/verify/<run>/`.

## Driving conventions

- Start each recipe from a fresh `launch`, or from a run `doctor` reports ok. `shot` presses Escape before and after capturing and brings the file explorer back, so a palette, settings window, or search pane from an earlier shot does not carry over.
- Name notes by basename or vault path, quoted, and always pass `--run`. Use Obsidian's own commands and views through `shot` options rather than clicking coordinates.
- One capture per state: change one of view, scheme, size, mobile, or open panel at a time.

## Proof and skip reporting

- A proof is a capture of the state a user sees, looked at before it is reported, for every scheme and size the change touches.
- A change that can move or resize a component is also proven against stock Obsidian with `obs compare` (see [Geometry against stock Obsidian](./stock-geometry.md)). A full-window capture at 1x hides defects of a few pixels: broken corners, a drifted caret, a box a few pixels short.
- `compare` and the `editcheck` rows measure element boxes and computed styles. A mark the theme paints with a pseudo-element, a gradient, or a mask has no box of its own. `joins` measures from painted pixels where such a mark meets the stroke it continues: the delete loop after a strikethrough, and the cut corners of the title rule, code blocks, callouts, and the active tab. No command measures the rest: the H2 square, the proof mark on the tab, and the tree caret and folder cell. Judge those from a 2x crop of the element, not a full-window capture.
- Record the run name, note, and `shot` options with each capture path.
- Report a sub-feature that could not be reached with the command tried and the unmet precondition. Do not count a different entry point as proof.

## Feature entry contract

Each feature file has an H1, one paragraph, and exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with obsidian.ts`, `Gotchas`.

## Features

- [Reading view](./reading-view.md) covers the note column: title, properties, headings, prose with italics, links, tags, code, tables, callouts, tasks, math.
- [Editing view](./editing-view.md) covers Live Preview and source mode: markdown markers, code lines and the caret on them, inline code, tags, tables, the caret, and the editable title.
- [App chrome](./app-chrome.md) covers the ribbon, file tree, tabs, status bar, command palette, settings, search, and keyboard focus.
- [Mobile](./mobile.md) covers Obsidian's mobile layout at phone width.
- [Sequence blocks](./sequence-blocks.md) covers `fasta`, `dna`, and `protein` blocks rendered by the sequence plugin: 60 residues per line in groups of ten, start positions, headers, residue cells, reflow of every input shape, copy, and inline primers.
- [Comparison](./comparison.md) covers capturing another stylesheet, such as the vault's current snippet, on the same notes.
- [Tonal layers](./tonal-layers.md) covers depth by tone: which regions share a tone, the lightness step at each layer boundary, and the absence of lines there.
- [Geometry against stock Obsidian](./stock-geometry.md) covers sizes, positions, and joins of components, compared part by part with stock Obsidian at 2x.
