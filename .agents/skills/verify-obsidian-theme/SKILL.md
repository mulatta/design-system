---
name: verify-obsidian-theme
description: Launch the devshell's Obsidian against a disposable vault with this repository's working-tree Wongoji theme (generated from DESIGN.md and obsidian/theme/src, plus the nix-built fonts) and capture screenshots of reading view, editing view, app chrome, and mobile, in light and dark, and compare component geometry part by part with stock Obsidian at 2x. Use to prove any change to the Obsidian theme or to compare it with another stylesheet in the real app.
---

# Verify the Obsidian theme

The surface is Obsidian's desktop app, an Electron window. The thing under test is the theme as the working tree generates it: `obsidian/theme/build.ts` reads the tokens in `DESIGN.md`, writes them as `--wg-*` variables, and appends the rule files in `obsidian/theme/src/`; the harness puts the embedded fonts from `nix build .#fonts` in front. `nix build .#obsidian-theme` builds the same file as the package a vault installs. A theme change is proven only by captures from this skill.

Every command runs from the repository root inside the devshell, so `obsidian`, `node`, and `playwright-core` are the flake's own:

```sh
nix develop -c node obsidian/testbed/obsidian.ts <launch|doctor|shot|compare|layers|editcheck|sync|stop> [options]
```

Below, `obs` stands for that whole command. The same harness backs the owner's npm scripts (`npm run obsidian`, `obsidian:doctor`, `obsidian:shot`, `obsidian:compare`, `obsidian:layers`, `obsidian:sync`, `obsidian:stop`), so a run the owner started by hand is the same kind of run. `npm run obsidian` is `launch --foreground`: it stays in the terminal, streams Obsidian's log there and into `obsidian.log`, and tears the run down on Ctrl+C, hangup, or when Obsidian quits. Agents use plain `launch`, which detaches and returns after `READY`, and keep the owner's run for the owner: launch your own run name (for example `--run agent`) instead of driving `main` while the owner looks at it.

## Launch

```sh
obs launch --run agent
```

- Writes a fresh vault and Electron user-data directory under `build/verify/<run>/`, copies the notes from `obsidian/testbed/notes/` with their folders, and, unless `--theme none`, builds `.#fonts` into `build/fonts` and installs the theme as `Wongoji`. Then it starts `obsidian --remote-debugging-port=<free port> --user-data-dir=build/verify/<run>/data`.
- Ready means the line `READY run=<run> pid=<pid> port=<port> vault=<path>`. It prints only after Obsidian's workspace reports `layoutReady`, so the vault is open and the theme is applied. If CDP or the layout never comes up, `launch` tears the run down and exits non-zero, so a failed launch leaves no process behind.
- Electron has no headless mode, so a plain `launch` makes its windows invisible instead: opacity 0, click-through, never focusable, always on top, on every Space. The window still paints, so captures work, and it never takes the owner's focus. Do not use `app.hide()` or move the window off screen: macOS stops painting a hidden or occluded window and the capture times out, and it clamps off-screen positions back on screen.
- The window flashes on screen for a moment at launch, before it turns invisible, and again when `--open settings` opens the settings window. Every other step stays invisible.
- `--visible` keeps a plain `launch` on screen. `--foreground` (the owner's `npm run obsidian`) is always visible.
- `doctor` reports `windowOpacity`: 0 for an invisible run, 1 for a visible one.
- Options:
  - `--theme wongoji|none`: `none` launches stock Obsidian.
  - `--snippet <file.css>`: repeatable, copied and enabled as a CSS snippet.
  - `--cssclass <class>`: added to every note's `cssclasses`.
  - `--scheme light|dark`: the scheme at start.
  - `--notes <dir>`: replaces the fixture notes.
- After editing `DESIGN.md`, a file in `obsidian/theme/src/`, a `--snippet` file, or `nix/fonts/`, run `obs sync --run <run>`. It rewrites the theme and snippets into the live vault, waits until Obsidian has loaded the new CSS, and prints `SYNCED`. No relaunch is needed. Notes are not synced; relaunch to pick up edited fixture notes.
- The disposable Obsidian config sets `updateDisabled`, so the app makes no update request.
- Runs are isolated by name. `--run a` and `--run b` can be live side by side. `launch` refuses a name whose recorded process is still alive.
- Teardown is `obs stop --run <run>`.
- Always pass `--run`. `doctor`, `shot`, and `sync` default to `main` and `compare` and `layers` to `agent`; `stop` refuses to run without `--run`, so it can never stop the owner's run by omission. `editcheck` refuses too, since it clicks into the window and moves its focus.
- The owner may have run `main` live from `npm run obsidian`, on screen. Leave it alone: do not drive or stop it. Run `obs doctor --run agent` first; if it reports ok, reuse that invisible run instead of launching again, and leave it live for the next proof unless the task is over. Stop only runs you launched.

## Doctor

```sh
obs doctor --run agent
```

This is read-only and prints JSON. `"ok": true` requires all of these:
- The recorded process is alive.
- The CDP endpoint answers with an `obsidian/<version>` user agent.
- The workspace layout is ready.
- `vaultPath` is this run's disposable vault. A different path means you are attached to the wrong Obsidian; stop.
- `cssTheme` is `Wongoji` when launched with the theme. A stock run reports `""`.
- `stylesCurrent` is true: the theme in the live vault contains what `buildTheme()` makes from the working tree now, and each snippet starts with its source file. False means an edit has not been synced; run `obs sync`.

It also lists the open vault's notes and the enabled snippets. Run it first whenever a shot looks wrong.

## Drive

```sh
obs shot --run agent --note "<basename or path>" --view reading|live|source --scheme light|dark \
  [--size 1440x900] [--scroll <px>] [--open none|palette|settings|search] [--mobile] [--hide-right] [--out <file.png>]
```

Defaults: `--view reading`, `--scheme light` (this overrides the scheme `launch` started with), `--size 1440x900`, `--scroll 0`, `--open none`. A value outside these lists, or a malformed size or scroll, fails before anything is captured.

Each `shot` call does the following, in order:
1. Connects over CDP and sets the viewport.
2. Toggles mobile emulation if `--mobile` differs from the current state. This reloads the window, and the helper waits for the reload.
3. Presses Escape, and on desktop brings the file explorer back to the front of the left sidebar, so a panel an earlier shot opened does not carry over.
4. Opens the note in the active leaf. `reading` is preview, `live` is Live Preview, `source` is source mode.
5. Switches the color scheme through Obsidian's own `app.changeTheme`.
6. Hides the right sidebar with `--hide-right`, and shows it again without.
7. Scrolls the view's own scroller (`.markdown-preview-view` for reading, `.cm-scroller` for live and source) to `--scroll`, 0 included, retrying until the position holds for three polls. A note reopened in the same leaf keeps its old position otherwise. If the note is too short it prints a warning and captures anyway.
8. Opens the palette, settings, or search through Obsidian commands, after the scroll so the scroll targets the note.
9. Waits for fonts to finish loading, then captures the window and presses Escape. With `--open settings` it captures Obsidian's separate settings window instead, after clearing its search box and setting `--size` on it, then closes that window.

`--note` is the note's basename without `.md`, or its vault path (`protocols/pcr-protocol`). Without `--note` it opens the first note by path.

Fixture notes, in `obsidian/testbed/notes/`. The lab and element notes come in a Korean (`-ko`) and an English (`-en`) version with the same structure, so a change to Latin text or to Hangul can be checked on its own:
- `lab-note-ko`, `lab-note-en`: a mixed lab note with prose, gene names in italics, an inline primer, math, a `fasta` block, a table, a warning callout, a python block, tasks, and a quote.
- `elements-ko`, `elements-en`: headings 1 to 4, inline marks, an editing note (`%%`), resolved and unresolved links, a tag, a footnote, nested lists, tasks including a two-line one, note, tip, danger, quote, summary, todo, and important callouts, a blockquote, a horizontal rule, block math, nix/typescript/bash/yaml code, and a right-aligned table.
- `long-note`: 30 H2 sections of plain paragraphs, for anything that must still hold after Obsidian unloads off-screen sections.
- `protocols/pcr-protocol`: a note inside a folder, so the file tree shows a folder row and a nested file.

### Compare with stock Obsidian

```sh
obs launch --run stock --theme none
obs compare --base stock --run agent --scheme light|dark [--part <id>]... [--size 1440x900]
```

`compare` puts both runs in the same state, captures named parts of the window at 2x, and prints each part's box differences in CSS px against the base run. Each run of `compare` empties `build/verify/compare/<scheme>/` and writes `<part>.<run>.png`, `metrics.json`, and `index.html` there, plus `compare.png`, one sheet with every pair, when `IMPECCABLE_BROWSER` is set (the devshell sets it). Copy the directory away before a second `compare` on the same scheme if you need both. The parts and what each must show are in `features/stock-geometry.md`; the part list lives in the `parts` table in `obsidian/testbed/obsidian.ts`. Add a part there when a new component needs a geometry check.

### Measure tonal layers

```sh
obs layers --run agent --scheme light|dark [--note lab-note-ko] [--threshold 0.025]
```

`layers` always measures at 1440x900 on desktop, in reading view with the right sidebar hidden. It reads each named region's painted background, its OKLCH lightness, and its visible borders and shadow, then prints the lightness difference at each boundary and flags those below the threshold. The regions and boundaries are the `regions` and `boundaries` tables in `obsidian/testbed/obsidian.ts`; what each must show is in `features/tonal-layers.md`. Output JSON goes to `build/verify/layers/`.

### Check editing states

```sh
obs editcheck --run agent [--scheme light|dark] [--note lab-note-ko]
```

`editcheck` puts the window in states a plain `shot` never reaches, because `shot` clears focus and never places the cursor, and measures one invariant in each. It runs at 1440x900 on desktop with the right sidebar hidden. The checks are the `editChecks` table in `obsidian/testbed/obsidian.ts`; add a row there when a bug shows up in a state no check reaches. A row finds its targets in the DOM by kind, as `text-focus` takes every editing root, never from a list of selectors for the instances already seen: a hand list proved only the instance a user had reported, and the next instance of the same kind was found by the user again.

`editcheck` records the vault's files before its checks and puts them back after, deleting any file a check created, because clicking in a note can toggle a task or create the note behind an unresolved link, and Obsidian has no setting that stops either. It prints a `VAULT removed <file>` or `VAULT restored <file>` line for each, so a check that edits the vault shows at first look.

- `text-focus`: with the search panel open, it clicks every visible editing root in the window, a read-write element whose parent is not read-write, (the search field, the tab title, the inline title, each property's name and value, and each editor) at a point on plain text, not on a link or widget. Each click must put focus on read-write text and change neither its nor any ancestor's outline, box-shadow, or background from before the click; the caret already shows where focus is. The pointer moves off the window before the measurement, so a hover style does not count. A target that a re-render removes before its click is skipped and counted in the result.
- `property-select`: for every property row, it hovers the name and the empty part of the value cell, then presses and releases there, which selects the row itself. Hovering may change neither the row's ring nor the background of the row or its name; the row stays untinted while the button is held, and after release it is selected, has no ring, and has a changed background.
- `control-focus`: the first control that `Tab` reaches outside a text field shows an outline, so keyboard focus stays visible.
- `reading-table`, `live-table`: the note's first table spans the note column, within 1px, in reading view and in Live Preview's table widget.
- `code-active-line`: with the cursor on the first line inside the note's first fenced code block, that line keeps the background of the block's other lines.

It prints one `ok` or `FAIL` line per check with its measurement, `REPORT <path>`, and last `EDITCHECK ok` or `EDITCHECK fail <count>`; it exits 1 on any failure. The report goes to `build/verify/<run>/editcheck-<scheme>.json`, and a 2x capture of each check's element to `build/verify/<run>/shots/editcheck-<scheme>-<check>.png`.

## Evidence

- Shots land in `build/verify/<run>/shots/`. The name encodes the note, view, scheme, mobile, open panel, and scroll, unless `--out` is given. Obsidian's own log is `build/verify/<run>/obsidian.log`; each `launch` of the same run name appends to it after a `--- launch <time> ---` line. `build/` is gitignored.
- A proof captures the state a user sees after doing the action. Pick the note, view, and scheme the changed CSS affects. For hover or focus states, write a custom drive with `playwright-core` `connectOverCDP` against the port in `build/verify/<run>/run.json`. Do not inject CSS: the theme must come from the launched files.
- Prove both schemes for any colour change, and add `--mobile --size 390x844` for anything inside the note column.
- Judge size, position, and joins of components with `compare` against stock, not from a full-window capture: at 1x a broken corner or a box a few pixels short is too small to see.
- Look at every capture before reporting it. A capture of the wrong note, a half-loaded window, or the default theme (`doctor` would show `cssTheme: ""`) proves nothing.

## Cleanup

```sh
obs stop --run agent
```

This sends SIGTERM to the process group `launch` started, from the pid in `run.json`, and sends SIGKILL to the same group after 10 s. Then it deletes the run's `vault/`, `data/`, and `run.json`. It keeps `shots/` and `obsidian.log`. It never kills by process name, so the user's own Obsidian is untouched. Delete `build/verify/<run>/` by hand when the evidence is no longer needed.

## Helpers

- `obsidian/testbed/obsidian.ts`: the only helper, outside the skill so the owner can run it through npm. Run it with node from the devshell as shown above. Type-check it with `nix develop -c npm run obsidian:check`.
- `obsidian/testbed/notes/*.md`: the notes every run starts from.
- `features/`: the verification map. Read `features/README.md` before proving a feature.
