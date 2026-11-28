---
name: verify-obsidian-theme
description: Launch the devshell's Obsidian against a disposable vault with this repository's working-tree Wongoji theme (generated from DESIGN.md and obsidian/theme/src, plus the nix-built fonts) and capture screenshots of reading view, editing view, app chrome, and mobile, in light and dark, and compare component geometry part by part with stock Obsidian at 2x. Can also install the repository's sequence plugin (fasta, dna, rna, protein blocks) into the vault. Use to prove any change to the Obsidian theme or the sequence plugin, or to compare the theme with another stylesheet in the real app. This is the repository's own harness for driving Obsidian: a one-off probe of the live app runs through its `drive` command, not through a second driver.
---

# Verify the Obsidian theme

The thing under test is the Wongoji theme as the working tree generates it, in the devshell's Obsidian on a disposable vault. A theme change is proven only by captures from this skill.

[features/README.md](features/README.md) is the verification map. Read it before you drive the app, then follow the feature file that matches the change.

Every command runs from the repository root inside the devshell, so `obsidian`, `node`, and `playwright-core` are the flake's own:

```sh
nix develop -c node obsidian/testbed/obsidian.ts <launch|doctor|shot|drive|compare|layers|joins|editcheck|pairs|seqcheck|sync|stop> [options]
```

Below, `obs` stands for that whole command. Every command takes `--run <name>` and defaults to the run `agent`. The run `main` is the owner's, live on screen from `npm run obsidian`. Do not drive or stop it. A second run of your own, such as a stock run, needs its own name.

## Launch

```sh
obs launch
```

- Run `obs doctor` first. If it reports ok, reuse that run and do not launch again. Leave the run live for the next proof unless the task is over.
- `launch` writes a fresh vault from `obsidian/testbed/notes/` under `build/verify/<run>/`, so nothing in the vault survives a relaunch.
- `launch` returns after the line `READY run=<run> pid=<pid> port=<port> vault=<path>`. It prints once the vault is open, the theme is applied, and every plugin has loaded. A launch that fails tears the run down and exits non-zero, so it leaves nothing to clean.
- The window is invisible. It takes no focus and still paints, so captures work. Do not use `app.hide()` or move it off screen. macOS stops painting such a window and the capture times out. `--visible` keeps it on screen.
- Options:
  - `--theme wongoji|none`: `none` launches stock Obsidian.
  - `--snippet <file.css>`: repeatable, copied and enabled as a CSS snippet.
  - `--plugin <flake-attr>`: repeatable. Builds `.#<attr>` and enables it, and `READY` waits until it has loaded. The repository's plugin is `obsidian-sequence-plugin` (id `sequence-blocks`).
  - `--cssclass <class>`: added to every note's `cssclasses`.
  - `--scheme light|dark`: the scheme at start.
  - `--notes <dir>`: replaces the fixture notes.
- After an edit to `DESIGN.md`, `obsidian/theme/src/`, a `--snippet` file, `nix/fonts/`, or a `--plugin` source such as `obsidian/sequence-plugin/`, run `obs sync`. It loads the edit into the live run and prints `SYNCED`. Notes are not synced, so relaunch to pick up an edited fixture note.

## Doctor

```sh
obs doctor
```

This changes nothing in the run, prints JSON, and exits 1 unless `"ok"` is true. When it is false, read these fields:

- `vaultPath` is this run's disposable vault. A different path means you are attached to the wrong Obsidian. Stop.
- `cssTheme` is `Wongoji` when launched with the theme. A stock run reports `""`.
- `installCurrent` is true. False means an edit has not been synced, so run `obs sync`.
- `pageErrors` is empty. It lists every uncaught exception, unhandled promise rejection, and `console.error` call in the page since `launch` or the last `sync`. Obsidian catches an error a plugin throws while rendering and logs it this way, so a block can look right in a capture while its code failed. The record misses an error thrown before `launch` connects, and one in the settings window, which is a second page.

Run it first whenever a capture looks wrong, and after the last drive of a proof.

## Drive

| Command | Question it answers | Verdict | Output under `build/verify/` | Rules in `features/` |
|---|---|---|---|---|
| `shot` | What does this state look like? | none | `<run>/shots/` | each feature file |
| `compare` | Did a part's boxes move or resize against a base run? | none | `compare/<view>[-mobile]/<scheme>/` | `stock-geometry.md` |
| `layers` | How far apart in lightness are the two regions at a boundary? | none | `layers/<run>-<view>[-mobile]-<scheme>.json` | `tonal-layers.md` |
| `joins` | Does a stroke meet the mark it runs into? | `JOINS` | `joins/<run>-<view>[-mobile]-<scheme>/` | `README.md` |
| `editcheck` | Does a rule hold in a state `shot` cannot reach? | `EDITCHECK` | `<run>/editcheck-<scheme>[-mobile].json`, crops in `<run>/shots/` | the file that names the row |
| `pairs` | Does a device look the same in reading view and Live Preview? | `PAIRS` | `<run>/pairs-<scheme>[-mobile].json` | `editing-view.md` |
| `seqcheck` | Do sequence blocks keep their layout and copy rules? | `SEQCHECK` | `<run>/seqcheck-<view>-<scheme>-<size>[-mobile].json`, captures in `<run>/shots/` | `sequence-blocks.md` |
| `drive` | Anything no command answers yet | `DRIVE` | what the probe captures | none |

`shot`, `compare`, and `layers` give no verdict. They exit 0 whatever they measured, so a clean exit is not a pass. Read what they print and look at their captures. `joins`, `editcheck`, `pairs`, and `seqcheck` judge. Each prints its result lines, then `REPORT <path>`, and last its verdict, such as `JOINS ok` or `JOINS fail <count>`, and exits 1 on any failure. All eight commands print `PAGE ERROR <first line>` for each error the page recorded while the command ran, and then exit 1.

The window is 1440x900, or 390x844 under phone emulation with `--mobile`. `shot`, `compare`, `seqcheck`, and `drive` take `--size <width>x<height>` to set another size.

`editcheck`, `pairs`, and `drive` put the vault back as they found it. A `VAULT removed <file>` or `VAULT restored <file>` line names a file a check changed.

A command's rows are a table in `obsidian/testbed/obsidian.ts`: `parts` for `compare`, `regions` and `boundaries` for `layers`, and `joins`, `editChecks`, and `pairs`. Every call runs every row that applies to its view and layout. Only `compare` takes a filter, `--part`.

### Capture a state

```sh
obs shot --note "<basename or path>" --view reading|live|source --scheme light|dark \
  [--size <width>x<height>] [--scroll <px>] [--open none|palette|settings|search] [--mobile] [--hide-right] [--out <file.png>]
```

Defaults: `--view reading`, `--scheme light` whatever scheme `launch` started with, `--scroll 0`, `--open none`. `--note` is the note's basename without `.md`, or its vault path (`protocols/pcr-protocol`). Without `--note` it opens the first note by path. `features/README.md` lists the fixture notes.

Each `shot` sets the whole state and closes a panel or drawer an earlier shot opened, so shots do not depend on their order. `--mobile` reloads the window when it changes the layout.

### Compare with stock Obsidian

```sh
obs launch --run stock --theme none
obs compare --base stock --scheme light|dark [--view reading|live] [--mobile] [--part <id>]... [--size <width>x<height>]
```

`compare` puts both runs in the same state, captures each part at 2x, and prints each part's box differences in CSS px against the base run. It empties its output folder first.

### Measure tonal layers

```sh
obs layers --scheme light|dark [--view reading|live] [--mobile] [--note lab-note-ko] [--threshold 0.025]
```

`layers` prints each region's painted background and its OKLCH lightness, then the lightness difference at each boundary, and flags a difference below the threshold. Some flags are expected. `features/tonal-layers.md` names the boundaries that must differ.

### Check joins

```sh
obs joins --scheme light|dark [--view reading|live] [--mobile]
```

`joins` reads painted pixels where a stroke meets a mark that has no box: a pseudo-element, a gradient, or a mask. It fails a join whose two sides lie more than 0.5 CSS px apart, and writes a crop of each join.

- `delete-loop`: the strike line of each strikethrough and the foot of the delete loop after it, in `elements-ko` and `elements-en`.
- `cut`: the top rule and the diagonal of every frame cut at 45°, in `lab-note-ko`, `elements-ko`, `long-note`, and `sequences`. It finds the frames by their `linear-gradient(225deg, …)` layer, so a new cut frame needs no row. A sequence block is measured only in a run with `--plugin obsidian-sequence-plugin`.

### Check editing states

```sh
obs editcheck [--scheme light|dark] [--mobile] [--note lab-note-ko]
```

`editcheck` puts the window in states a plain `shot` never reaches, because `shot` clears focus and never places the cursor, and measures one rule in each. It writes a 2x crop of each row's element as `editcheck-<scheme>[-mobile]-<row>.png`.

The rows are `text-focus`, `note-text-focus`, `property-select`, `raised-surfaces`, `control-focus`, `pane-rules`, `reading-table`, `live-table`, `reading-column`, `live-column`, `reading-edges`, `live-edges`, `floating-header`, `code-active-line`, `toggle-states`, and `embed-hover`. `note-text-focus` and `floating-header` run only on the phone, and `control-focus`, `pane-rules`, and `toggle-states` only on desktop. The feature file that names a row says what the row proves and what it cannot see. Search `features/` for the id.

### Check that the two views match

```sh
obs pairs [--scheme light|dark] [--mobile] [--note pairs]
```

`pairs` holds the theme to the rule `DESIGN.md` states under "Reading and editing": a device looks the same in reading view and in Live Preview while the caret is outside it. Run it after any change to a device either view draws.

A difference the editor needs is declared in the `pairDiffs` table with its reason. It prints as a `diff` line, so no difference passes without a line. `DESIGN.md` lists the same differences. A row added to one goes into the other.

Code tokens are compared character by character, and the check prints one line per pair of token classes, such as `typescript keyword as keyword "export"`.

### Check sequence blocks

```sh
obs seqcheck [--note sequences] [--view reading|live] [--scheme light|dark] \
  [--size <width>x<height>] [--mobile] [--hide-right]
```

`seqcheck` needs a run launched with `--plugin obsidian-sequence-plugin`. It checks the block each `fasta`, `dna`, `rna`, and `protein` fence renders against the invariants that `features/sequence-blocks.md` defines. It never writes the system clipboard.

It prints the whole report as JSON first, so read the last lines: one `FAIL block <n> <language>: <invariant>: <reason>` line per failure, then the report path and the verdict. The reason holds what was measured, without the rule. A fence with no rendered block fails as `rendered`.

### Run a probe

```sh
obs drive [--note <note> --view reading|live|source --scheme light|dark --mobile --size <width>x<height> --hide-right] <probe.ts> [args]...
```

`drive` is the way to ask the live app a question no check answers yet: a measurement, a state reached by typing, hovering or scrolling, a capture of one part. It imports the probe file, which may sit anywhere, such as a scratch directory, and calls its default export. With `--note` it first puts the window in that note, view, scheme and layout as `shot` does. Without it the window stays as the last command left it.

```ts
export default async ({ page, cdp, capture, prepare, args, state, browser }) => {
	const bottom = await page.evaluate(
		() => document.querySelector(".view-header")?.getBoundingClientRect().bottom,
	);
	const shot = await capture("view-header.png", { x: 340, y: 40, width: 400, height: 60 });
	return { bottom, shot };
};
```

- `page` is the Playwright page of the Obsidian window and `cdp` a CDP session on it, for `CSS.forcePseudoState` and the like. `state` is the run's `run.json`.
- `capture(name, clip?)` writes a PNG to `build/verify/<run>/shots/<name>`, or to `name` when it is an absolute path, and returns the path. A clip is in CSS px, captured at scale 2. Without a clip it captures the window.
- `prepare({ note, view, scheme, mobile, ... })` changes the window's state again from inside the probe, starting from the command's options.
- `args` are the words after the probe file.

It prints what the probe returns as JSON and last `DRIVE ok` or `DRIVE fail`. It exits 1 when the probe throws or the page recorded an error.

A probe that answers a question a second time is a check. Give it a row in the table of the command it belongs to, or in `editChecks` when a bug shows up in a state no check reaches. A row finds its targets in the DOM by kind and never from a list of the instances already reported. A hand list of cut frames named the title, callouts, code blocks, and the tab, and missed the sequence block.

Do not connect to the run's port from a script of your own. Such a script misses the error record, the vault restore, and the invisible window, and breaks in a second worktree.

## Evidence

- Obsidian's own log is `build/verify/<run>/obsidian.log`. `build/` is gitignored.
- A proof captures the state a user sees after doing the action. Pick the note, view, and scheme the changed CSS affects.
- For a hover or focus state, force the pseudo-class with CDP `CSS.forcePseudoState` in a probe run by `obs drive`. Do not move the mouse to hover. macOS still sends the owner's cursor to the click-through window, so moving the mouse anywhere on screen can take the hover away.
- Do not inject CSS. The theme must come from the launched files.
- Prove both schemes for any colour change, and add `--mobile` for anything inside the note column.
- Judge size, position, and joins of components with `compare` against stock, not from a full-window capture. At 1x a broken corner or a box a few pixels short is too small to see.
- Look at every capture before reporting it. A capture of the wrong note, a half-loaded window, or the default theme (`doctor` would show `cssTheme: ""`) proves nothing.

## Cleanup

```sh
obs stop
```

This stops the process group `launch` started for the run and deletes the run's `vault/`, `data/`, and `run.json`. Stop only runs you launched. It keeps `shots/`, the report JSON files, and `obsidian.log`, and it never kills by process name, so the user's own Obsidian is untouched. Delete `build/verify/<run>/` by hand when the evidence is no longer needed.

## Helpers

- `obsidian/testbed/obsidian.ts`: the only helper. Type-check it with `nix develop -c npm run obsidian:check`.
- `obsidian/testbed/notes/*.md`: the notes every run starts from.
- `features/`: the verification map, one file per feature.
