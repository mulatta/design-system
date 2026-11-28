---
name: verify-obsidian-theme
description: Launch the devshell's Obsidian against a disposable vault with this repository's working-tree Wongoji theme (generated from DESIGN.md and obsidian/theme/src, plus the nix-built fonts) and capture screenshots of reading view, editing view, app chrome, and mobile, in light and dark, and compare component geometry part by part with stock Obsidian at 2x. Can also install the repository's sequence plugin (fasta, dna, rna, protein blocks) into the vault. Use to prove any change to the Obsidian theme or the sequence plugin, or to compare the theme with another stylesheet in the real app. This is the repository's own harness for driving Obsidian: a one-off probe of the live app runs through its `drive` command, not through a second driver.
---

# Verify the Obsidian theme

The surface is Obsidian's desktop app, an Electron window. The thing under test is the Wongoji theme as the working tree generates it. A theme change is proven only by captures from this skill.

Every command runs from the repository root inside the devshell, so `obsidian`, `node`, and `playwright-core` are the flake's own:

```sh
nix develop -c node obsidian/testbed/obsidian.ts <launch|doctor|shot|drive|compare|layers|joins|editcheck|pairs|seqcheck|sync|stop> [options]
```

Below, `obs` stands for that whole command.

## Launch

```sh
obs launch
```

- `launch` writes a fresh vault from `obsidian/testbed/notes/` and a fresh Electron profile under `build/verify/<run>/`, so nothing in the vault survives a relaunch.
- Ready means the line `READY run=<run> pid=<pid> port=<port> vault=<path>`. It prints once the vault is open, the theme is applied, and every plugin has loaded. A launch that fails tears the run down and exits non-zero, so it leaves nothing to clean.
- A plain `launch` makes its windows invisible. They take no focus and still paint, so captures work. Do not hide the window with `app.hide()` or move it off screen, because macOS stops painting a hidden or occluded window and the capture times out.
- `--visible` keeps the window on screen. `--foreground` is the owner's mode, visible and attached to the terminal until Obsidian quits.
- Options:
  - `--theme wongoji|none`: `none` launches stock Obsidian.
  - `--snippet <file.css>`: repeatable, copied and enabled as a CSS snippet.
  - `--plugin <flake-attr>`: repeatable. Builds `.#<attr>` and enables it, and `READY` waits until it has loaded. The repository's plugin is `obsidian-sequence-plugin` (id `sequence-blocks`).
  - `--cssclass <class>`: added to every note's `cssclasses`.
  - `--scheme light|dark`: the scheme at start.
  - `--notes <dir>`: replaces the fixture notes.
- After an edit to `DESIGN.md`, `obsidian/theme/src/`, a `--snippet` file, `nix/fonts/`, or a `--plugin` source such as `obsidian/sequence-plugin/`, run `obs sync`. It loads the edit into the live run and prints `SYNCED`. No relaunch is needed. Notes are not synced, so relaunch to pick up an edited fixture note.
- Runs are isolated by name. `--run a` and `--run b` can be live side by side.
- Every command defaults to `--run agent`, `stop` included. Pass `--run` only for a second run, which needs its own name.
- The owner may have run `main` live from `npm run obsidian`, on screen. Leave it alone: do not drive or stop it. Run `obs doctor` first; if it reports ok, reuse that invisible run instead of launching again, and leave it live for the next proof unless the task is over. Stop only runs you launched.

## Doctor

```sh
obs doctor
```

This changes nothing in the run, prints JSON, and exits 1 unless `"ok"` is true. When it is false, read these fields:
- `vaultPath` is this run's disposable vault. A different path means you are attached to the wrong Obsidian; stop.
- `cssTheme` is `Wongoji` when launched with the theme. A stock run reports `""`.
- `installCurrent` is true. False means an edit has not been synced, so run `obs sync`.
- `pageErrors` is empty. It lists every uncaught exception, unhandled promise rejection, and `console.error` call in the page since `launch` or the last `sync`. Obsidian catches an error a plugin throws while rendering and logs it this way, so a block can look right in a capture while its code failed. The record misses an error thrown before `launch` connects, and one in the settings window, which is a second page.

It also lists the open vault's notes, the enabled snippets, and the loaded plugins. Run it first whenever a shot looks wrong, and after the last drive of a proof.

## Drive

Every command in this section sets the window to 1440x900, or to 390x844 under phone emulation with `--mobile`. `shot`, `compare`, `seqcheck`, and `drive` take `--size <width>x<height>` to set another size. `layers`, `joins`, `editcheck`, and `pairs` hide the right sidebar while they measure.

`joins`, `editcheck`, `pairs`, and `seqcheck` print their result lines, then `REPORT <path>`, and last `<NAME> ok` or `<NAME> fail <count>`, where `<NAME>` is the command in capitals. They exit 1 on any failure. Every command in this section also prints a `PAGE ERROR <first line>` for each error the page recorded while the command ran, and then exits 1.

`editcheck`, `pairs`, and `drive` record the vault's files before they start and put them back after, deleting any file a check created, because clicking in a note can toggle a task or create the note behind an unresolved link, and Obsidian has no setting that stops either. Each prints a `VAULT removed <file>` or `VAULT restored <file>` line for a file it put back, so a check that edits the vault shows at first look.

```sh
obs shot --note "<basename or path>" --view reading|live|source --scheme light|dark \
  [--size <width>x<height>] [--scroll <px>] [--open none|palette|settings|search] [--mobile] [--hide-right] [--out <file.png>]
```

Defaults: `--view reading`, `--scheme light` (this overrides the scheme `launch` started with), `--scroll 0`, `--open none`.

Each `shot` sets the whole state: the layout, the note, the view, the scheme, the right sidebar, the scroll position, and the panel. It closes a panel or drawer an earlier shot opened, so shots do not depend on their order. `--mobile` reloads the window when it changes the layout.

`--note` is the note's basename without `.md`, or its vault path (`protocols/pcr-protocol`). Without `--note` it opens the first note by path.

The fixture notes are listed in `features/README.md`, and `doctor` lists the notes of the open vault.

### Compare with stock Obsidian

```sh
obs launch --run stock --theme none
obs compare --base stock --scheme light|dark [--view reading|live] [--mobile] [--part <id>]... [--size <width>x<height>]
```

`compare` puts both runs in the same state, captures named parts of the window at 2x, and prints each part's box differences in CSS px against the base run. `--view` opens each part's note in reading view (the default) or Live Preview. The parts and what each must show are in `features/stock-geometry.md`. The part list is the `parts` table in `obsidian/testbed/obsidian.ts`. Add a row there when a new component needs a geometry check.

### Measure tonal layers

```sh
obs layers --scheme light|dark [--view reading|live] [--mobile] [--note lab-note-ko] [--threshold 0.025]
```

`layers` reads each named region's painted background and its OKLCH lightness, in reading view or, with `--view live`, in Live Preview. It prints the lightness difference at each boundary and flags those below the threshold. The regions and boundaries are the `regions` and `boundaries` tables in `obsidian/testbed/obsidian.ts`. What each must show is in `features/tonal-layers.md`. Output JSON goes to `build/verify/layers/<run>-<view>[-mobile]-<scheme>.json`.

### Check joins

```sh
obs joins --scheme light|dark [--view reading|live] [--mobile]
```

`joins` measures where two pieces the theme paints apart must meet: a stroke and the mark it runs into. These marks are pseudo-elements, gradients, and masks with no box, so `joins` reads painted pixels, and it fails a join whose two sides lie more than 0.5 CSS px apart. The rows are the `joins` table in `obsidian/testbed/obsidian.ts`.

- `delete-loop` (reading view and Live Preview): the strike line of each strikethrough and the foot of the delete loop after it, in `elements-ko` and `elements-en`, the wrapped strikethrough included.
- `cut` (reading view and Live Preview): the top rule and the diagonal of every frame cut at 45°, in `lab-note-ko`, `elements-ko`, `long-note`, and `sequences`. That is the active tab on desktop, the title rule, and every sequence block, which a run reaches only with `--plugin obsidian-sequence-plugin`. The row finds its frames by kind, as every element or pseudo-element whose computed `background-image` has a `linear-gradient(225deg, …)` layer, so a new frame cut at 45° is measured without a new row. A hand list of frames named the title, callouts, code blocks, and the tab, and missed the sequence block.

Each line names one instance, with both bands in CSS px from the top of the element's line or box and their difference. The report and each instance's crop go to `build/verify/joins/<run>-<view>[-mobile]-<scheme>/`, which each run empties first.

### Check editing states

```sh
obs editcheck [--scheme light|dark] [--mobile] [--note lab-note-ko]
```

`editcheck` puts the window in states a plain `shot` never reaches, because `shot` clears focus and never places the cursor, and measures one invariant in each. The checks are the `editChecks` table in `obsidian/testbed/obsidian.ts`, and every call runs every row of its layout. Add a row there when a bug shows up in a state no check reaches. A row finds its targets in the DOM by kind, as `text-focus` takes every editing root, never from a list of selectors for the instances already seen: a hand list proved only the instance a user had reported, and the next instance of the same kind was found by the user again.

The rows are `text-focus`, `note-text-focus`, `property-select`, `raised-surfaces`, `control-focus`, `pane-rules`, `reading-table`, `live-table`, `reading-column`, `live-column`, `floating-header`, `code-active-line`, `toggle-states`, and `embed-hover`. `note-text-focus` and `floating-header` run only on the phone, and `control-focus`, `pane-rules`, and `toggle-states` only on desktop. The feature file that names a row says what the row proves and what it cannot see. Search `features/` for the id.

Each line names one check with its measurement. The report goes to `build/verify/<run>/editcheck-<scheme>[-mobile].json`, and a 2x capture of each check's element to `build/verify/<run>/shots/editcheck-<scheme>[-mobile]-<check>.png`.

### Check that the two views match

```sh
obs pairs [--scheme light|dark] [--mobile] [--note pairs]
```

`pairs` holds the theme to one rule: a device looks the same in reading view and in Live Preview while the caret is outside it.

The rows are the `pairs` table in `obsidian/testbed/obsidian.ts`. A row finds every instance of its kind in the DOM and pairs the instances of the two views in document order.

Code tokens are compared character by character. The check prints one line per pair of token classes, such as `typescript keyword as keyword "export"`, so a class that one highlighter has and the other lacks shows up by name.

A difference the editor needs is declared in the `pairDiffs` table with its reason. It prints as a `diff` line with both values and the reason, so no difference passes without a line. `DESIGN.md` lists the same differences under "Reading and editing"; a row added to one goes into the other.

Each line is `ok`, `diff`, or `FAIL` for a group of instances with the same outcome, with the group's size and its first instance's text. The report goes to `build/verify/<run>/pairs-<scheme>[-mobile].json`.

### Check sequence blocks

```sh
obs seqcheck [--note sequences] [--view reading|live] [--scheme light|dark] \
  [--size <width>x<height>] [--mobile] [--hide-right]
```

`seqcheck` needs a run launched with `--plugin obsidian-sequence-plugin`. It finds each `fasta`, `dna`, `rna`, and `protein` fence in the note and checks the block the fence renders against the invariants that `features/sequence-blocks.md` defines. Every press goes through a `writeText` recorder, so the system clipboard is never written.

It prints the report as JSON before its lines, and one `FAIL block <n> <language>: <invariant>: <reason>` line per failure. The reason holds what was measured, not the rule, so look the invariant up in `features/sequence-blocks.md`. The report goes to `build/verify/<run>/seqcheck-<view>-<scheme>-<size>[-mobile].json`, and a capture of each hovered block to `build/verify/<run>/shots/seqcheck-<view>-<scheme>-<size>[-mobile]-<index>.png`. A fence with no rendered block fails as `rendered`.

### Run a probe

```sh
obs drive [--note <note> --view reading|live|source --scheme light|dark --mobile --size <width>x<height> --hide-right] <probe.ts> [args]...
```

`drive` is the way to ask the live app a question no check answers yet: a measurement, a state reached by typing, hovering or scrolling, a capture of one part. It imports the probe file, which may sit anywhere, such as a scratch directory, and calls its default export. With `--note` it first puts the window in that note, view, scheme and layout as `shot` does; without it the window is left as the last command left it.

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
- `capture(name, clip?)` writes a PNG to `build/verify/<run>/shots/<name>`, or to `name` when it is an absolute path, and returns the path. A clip is in CSS px and is captured at the scale `editcheck` uses; without one it captures the window.
- `prepare({ note, view, scheme, mobile, ... })` changes the window's state again from inside the probe, starting from the command's options.
- `args` are the words after the probe file.

It prints what the probe returns as JSON, a `VAULT` line for each file it put back, and last `DRIVE ok` or `DRIVE fail`. It exits 1 when the probe throws or the page recorded an error.

A probe that answers a question a second time is a check: give it a row in `editChecks` or a place in the command it belongs to. Do not connect to the run's port from a script of your own. Such a script misses the error record, the vault restore, and the invisible window, and breaks in a second worktree.

## Evidence

- Shots land in `build/verify/<run>/shots/`. The name encodes the note, view, scheme, mobile, open panel, and scroll, unless `--out` is given. Obsidian's own log is `build/verify/<run>/obsidian.log`; each `launch` of the same run name appends to it after a `--- launch <time> ---` line. `build/` is gitignored.
- A proof captures the state a user sees after doing the action. Pick the note, view, and scheme the changed CSS affects. For hover or focus states, force the pseudo-class with CDP `CSS.forcePseudoState` in a probe run by `obs drive`. Do not move the mouse to hover. macOS still sends the owner's cursor to the click-through window, so moving the mouse anywhere on screen can take the hover away. Do not inject CSS: the theme must come from the launched files.
- Prove both schemes for any colour change, and add `--mobile` for anything inside the note column.
- Judge size, position, and joins of components with `compare` against stock, not from a full-window capture: at 1x a broken corner or a box a few pixels short is too small to see.
- Look at every capture before reporting it. A capture of the wrong note, a half-loaded window, or the default theme (`doctor` would show `cssTheme: ""`) proves nothing.

## Cleanup

```sh
obs stop
```

This stops the process group `launch` started for the run and deletes the run's `vault/`, `data/`, and `run.json`. It keeps `shots/`, the report JSON files, and `obsidian.log`. It never kills by process name, so the user's own Obsidian is untouched. Delete `build/verify/<run>/` by hand when the evidence is no longer needed.

## Helpers

- `obsidian/testbed/obsidian.ts`: the only helper, outside the skill so the owner can run it through npm. Run it with node from the devshell as shown above. Type-check it with `nix develop -c npm run obsidian:check`.
- `obsidian/testbed/notes/*.md`: the notes every run starts from.
- `features/`: the verification map. Read `features/README.md` before proving a feature.
