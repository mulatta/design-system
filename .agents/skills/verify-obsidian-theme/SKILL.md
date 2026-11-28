---
name: verify-obsidian-theme
description: Launch the devshell's Obsidian against a disposable vault with this repository's working-tree Wongoji theme (generated from DESIGN.md and obsidian/theme/src, plus the nix-built fonts) and capture screenshots of reading view, editing view, app chrome, and mobile, in light and dark, and compare component geometry part by part with stock Obsidian at 2x. Can also install the repository's sequence plugin (fasta, dna, rna, protein blocks) into the vault. Use to prove any change to the Obsidian theme or the sequence plugin, or to compare the theme with another stylesheet in the real app. This is the repository's own harness for driving Obsidian: a one-off probe of the live app runs through its `drive` command, not through a second driver.
---

# Verify the Obsidian theme

The surface is Obsidian's desktop app, an Electron window. The thing under test is the theme as the working tree generates it: `obsidian/theme/build.ts` reads the tokens in `DESIGN.md`, writes them as `--wg-*` variables, and appends the rule files in `obsidian/theme/src/`; the harness puts the embedded fonts from `nix build .#fonts` in front. `nix build .#obsidian-theme` builds the same file as the package a vault installs. A theme change is proven only by captures from this skill.

Every command runs from the repository root inside the devshell, so `obsidian`, `node`, and `playwright-core` are the flake's own:

```sh
nix develop -c node obsidian/testbed/obsidian.ts <launch|doctor|shot|drive|compare|layers|joins|editcheck|pairs|seqcheck|sync|stop> [options]
```

Below, `obs` stands for that whole command. The same harness backs the owner's npm scripts (`npm run obsidian`, `obsidian:doctor`, `obsidian:shot`, `obsidian:compare`, `obsidian:layers`, `obsidian:sync`, `obsidian:stop`), so a run the owner started by hand is the same kind of run. `npm run obsidian` is `launch --run main --foreground`: it stays in the terminal, streams Obsidian's log there and into `obsidian.log`, and tears the run down on Ctrl+C, hangup, or when Obsidian quits. Agents use plain `launch`, which detaches and returns after `READY`, and leave the run `main` to the owner.

## Launch

```sh
obs launch
```

- Writes a fresh vault and Electron user-data directory under `build/verify/<run>/`, copies the notes from `obsidian/testbed/notes/` with their folders, and, unless `--theme none`, builds `.#fonts` into `build/fonts` and installs the theme as `Wongoji`. Then it starts `obsidian --remote-debugging-port=<free port> --user-data-dir=build/verify/<run>/data`.
- Ready means the line `READY run=<run> pid=<pid> port=<port> vault=<path>`. It prints only after Obsidian's workspace reports `layoutReady`, so the vault is open and the theme is applied. If CDP or the layout never comes up, `launch` tears the run down and exits non-zero, so a failed launch leaves no process behind.
- Electron has no headless mode, so a plain `launch` makes its windows invisible instead: opacity 0, click-through, never focusable, always on top, on every Space. The window still paints, so captures work, and it never takes the owner's focus. Do not use `app.hide()` or move the window off screen: macOS stops painting a hidden or occluded window and the capture times out, and it clamps off-screen positions back on screen.
- The window flashes on screen for a moment at launch, before it turns invisible, and again when `--open settings` opens the settings window. Every other step stays invisible.
- `--visible` keeps a plain `launch` on screen. `--foreground` (the owner's `npm run obsidian`) is always visible.
- Options:
  - `--theme wongoji|none`: `none` launches stock Obsidian.
  - `--snippet <file.css>`: repeatable, copied and enabled as a CSS snippet.
  - `--plugin <flake-attr>`: repeatable. Builds `nix build .#<attr> -o build/plugins/<attr>`, reads the plugin id from the build's `manifest.json`, copies the build output into `.obsidian/plugins/<id>/`, and after `layoutReady` turns off restricted mode and enables the plugin. `READY` prints only once every plugin has loaded; a plugin that fails to load tears the run down like any failed launch. The repository's plugin is `--plugin obsidian-sequence-plugin` (id `sequence-blocks`).
  - `--cssclass <class>`: added to every note's `cssclasses`.
  - `--scheme light|dark`: the scheme at start.
  - `--notes <dir>`: replaces the fixture notes.
- After editing `DESIGN.md`, a file in `obsidian/theme/src/`, a `--snippet` file, `nix/fonts/`, or the source of a `--plugin` (for the sequence plugin, `obsidian/sequence-plugin/`), run `obs sync`. It rewrites the theme and snippets into the live vault, waits until Obsidian has loaded the new CSS, rebuilds and recopies each plugin, disables and re-enables it, waits until it has loaded again, and prints `SYNCED`. A run with only a theme, only snippets, or only plugins syncs what it has. No relaunch is needed. Notes are not synced; relaunch to pick up edited fixture notes.
- The disposable Obsidian config sets `updateDisabled`, so the app makes no update request.
- Runs are isolated by name. `--run a` and `--run b` can be live side by side. `launch` refuses a name whose recorded process is still alive.
- Every command defaults to `--run agent`, `stop` included. Pass `--run` only for a second run, which needs its own name.
- The owner may have run `main` live from `npm run obsidian`, on screen. Leave it alone: do not drive or stop it. Run `obs doctor` first; if it reports ok, reuse that invisible run instead of launching again, and leave it live for the next proof unless the task is over. Stop only runs you launched.

## Doctor

```sh
obs doctor
```

This changes nothing in the run and prints JSON. For a run with plugins it runs `nix build` for each, which is quick when the plugin source has not changed. `"ok": true` requires all of these:
- The recorded process is alive.
- The CDP endpoint answers with an `obsidian/<version>` user agent.
- The workspace layout is ready.
- `vaultPath` is this run's disposable vault. A different path means you are attached to the wrong Obsidian; stop.
- `cssTheme` is `Wongoji` when launched with the theme. A stock run reports `""`.
- Every `--plugin` id is in `enabledPlugins`, the plugins Obsidian has loaded.
- `installCurrent` is true: the theme in the live vault contains what `buildTheme()` makes from the working tree now, each snippet starts with its source file, and each plugin's files in the vault equal what `nix build .#<attr>` makes from the working tree now. False means an edit has not been synced; run `obs sync`.
- `pageErrors` is empty. The harness records, in the page, every uncaught exception, unhandled promise rejection, and `console.error` call since `launch` or the last `sync`, each with its stack, and keeps the record across the reload that phone emulation makes. Obsidian catches an error a plugin throws while rendering and logs it this way, so a block can look right in a capture while its code failed. The record starts when a command first connects, so an error thrown before `launch` connects is missed, and so is one in the settings window, which is a second page.

It also lists the open vault's notes, the enabled snippets, and the loaded plugins. Run it first whenever a shot looks wrong, and after the last drive of a proof.

## Drive

Every command in this section sets the window to 1440x900, or to 390x844 under phone emulation with `--mobile`. `shot`, `compare`, `seqcheck`, and `drive` take `--size <width>x<height>` to set another size. `layers`, `joins`, `editcheck`, and `pairs` hide the right sidebar while they measure.

`joins`, `editcheck`, `pairs`, and `seqcheck` print their result lines, then `REPORT <path>`, and last `<NAME> ok` or `<NAME> fail <count>`, where `<NAME>` is the command in capitals. They exit 1 on any failure. Every command in this section also prints a `PAGE ERROR <first line>` for each error the page recorded while the command ran, and then exits 1.

`editcheck`, `pairs`, and `drive` record the vault's files before they start and put them back after, deleting any file a check created, because clicking in a note can toggle a task or create the note behind an unresolved link, and Obsidian has no setting that stops either. Each prints a `VAULT removed <file>` or `VAULT restored <file>` line for a file it put back, so a check that edits the vault shows at first look.

```sh
obs shot --note "<basename or path>" --view reading|live|source --scheme light|dark \
  [--size <width>x<height>] [--scroll <px>] [--open none|palette|settings|search] [--mobile] [--hide-right] [--out <file.png>]
```

Defaults: `--view reading`, `--scheme light` (this overrides the scheme `launch` started with), `--scroll 0`, `--open none`. A value outside these lists, or a malformed size or scroll, fails before anything is captured.

Each `shot` call does the following, in order:
1. Connects over CDP and sets the viewport.
2. Toggles mobile emulation if `--mobile` differs from the current state. This reloads the window, and the helper waits for the reload.
3. Presses Escape, and on desktop brings the file explorer back to the front of the left sidebar, or on mobile closes both drawers, so a panel an earlier shot opened does not carry over.
4. Opens the note in the active leaf. `reading` is preview, `live` is Live Preview, `source` is source mode.
5. Switches the color scheme through Obsidian's own `app.changeTheme`.
6. Hides the right sidebar with `--hide-right`, and shows it again without.
7. Scrolls the view's own scroller (`.markdown-preview-view` for reading, `.cm-scroller` for live and source) to `--scroll`, 0 included, retrying until the position holds for three polls. A note reopened in the same leaf keeps its old position otherwise. If the note is too short it prints a warning and captures anyway.
8. Opens the palette, settings, or search through Obsidian commands, after the scroll so the scroll targets the note. For the palette and search it waits until the panel has stayed on screen for half a second, runs the command again up to three times if it has not, and fails if it never does.
9. Waits for fonts to finish loading, then captures the window and presses Escape. With `--open settings` it captures Obsidian's separate settings window instead, after clearing its search box and setting `--size` on it, then closes that window.

`--note` is the note's basename without `.md`, or its vault path (`protocols/pcr-protocol`). Without `--note` it opens the first note by path.

Fixture notes, in `obsidian/testbed/notes/`. The lab and element notes come in a Korean (`-ko`) and an English (`-en`) version with the same structure, so a change to Latin text or to Hangul can be checked on its own:
- `lab-note-ko`, `lab-note-en`: a mixed lab note with prose, gene names in italics, an inline primer, math, a `dna` block of two primers, a table, a warning callout, a python block, tasks, and a quote.
- `elements-ko`, `elements-en`: headings 1 to 4, inline marks, an editing note (`%%`), a strikethrough long enough to wrap, resolved and unresolved links, a tag, a footnote, nested lists, tasks including a two-line one, note, tip, danger, quote, summary, todo, and important callouts, a blockquote, a horizontal rule, block math, nix/typescript/bash/yaml code, and three tables: a short right-aligned one, one of long sentences that fills the column, and one with a primer sequence too wide for any column, which scrolls.
- `pairs`: one or more of every device `pairs` compares, among them headings 1 to 6, a quote nested in a blockquote, an embedded note, and code in typescript, python, bash, yaml, and nix. Its last line is empty, so the caret has a place outside every mark.
- `long-note`: 30 H2 sections of plain paragraphs, for anything that must still hold after Obsidian unloads off-screen sections.
- `protocols/pcr-protocol`: a note inside a folder, so the file tree shows a folder row and a nested file.
- `sequences`: one sequence block per input shape the sequence plugin accepts: a `fasta` record on one 174 nt line, `fasta` wrapped at 70 and at 80, a multi-FASTA block of 42, 60, and 132 nt records, a `dna` block without a header, a 214 aa `protein` block, a 60 nt guide in an `rna` block, a 96 aa protein and a 24-residue degenerate primer in `fasta` blocks, a GenBank `ORIGIN` paste of 150 nt with its position numbers and `//` line in a `dna` block, and an inline primer in prose. It renders as plain code unless the run has `--plugin obsidian-sequence-plugin`. All sequences are synthetic.

### Compare with stock Obsidian

```sh
obs launch --run stock --theme none
obs compare --base stock --scheme light|dark [--view reading|live] [--mobile] [--part <id>]... [--size <width>x<height>]
```

`compare` puts both runs in the same state, captures named parts of the window at 2x, and prints each part's box differences in CSS px against the base run. `--view` opens each part's note in reading view (the default) or Live Preview. Each run of `compare` empties `build/verify/compare/<view>[-mobile]/<scheme>/` and writes `<part>.<run>.png`, `metrics.json`, and `index.html` there, plus `compare.png`, one sheet with every pair, when `IMPECCABLE_BROWSER` is set (the devshell sets it). Copy the directory away before a second `compare` in the same place and scheme if you need both. The parts and what each must show are in `features/stock-geometry.md`; the part list lives in the `parts` table in `obsidian/testbed/obsidian.ts`. A row's `root` is one selector for app chrome, measured in any view, or a selector per view (`inNote` builds the same selector for both); `on` lists the layouts it runs on, desktop when absent. A view or layout a row does not name skips that row. Add a row there when a new component needs a geometry check.

### Measure tonal layers

```sh
obs layers --scheme light|dark [--view reading|live] [--mobile] [--note lab-note-ko] [--threshold 0.025]
```

`layers` measures in reading view or, with `--view live`, in Live Preview. It reads each named region's painted background, its OKLCH lightness, and its visible borders and shadow, then prints the lightness difference at each boundary and flags those below the threshold. The regions and boundaries are the `regions` and `boundaries` tables in `obsidian/testbed/obsidian.ts`; a region names its selector and layouts the way a `compare` part does, and a boundary prints only where both of its regions apply. What each must show is in `features/tonal-layers.md`. Output JSON goes to `build/verify/layers/<run>-<view>[-mobile]-<scheme>.json`.

### Check joins

```sh
obs joins --scheme light|dark [--view reading|live] [--mobile]
```

`joins` measures where two pieces the theme paints apart must meet: a stroke and the mark it runs into. These marks are pseudo-elements, gradients, and masks with no box, so `joins` reads painted pixels. For every instance of each row in each of the row's notes, it captures a crop around the join at scale 2, decodes it in the page with a canvas, and finds the pixel rows painted in the instance's colour at a sample before the join and one after it. A `mark` row names its colour, a CSS colour such as `var(--wg-proof)` resolved on the element in the current scheme. A `cut` row reads it from the frame. A `mark` row compares the whole band, so the strike line and the loop's foot must share both edges. A `cut` row, a straight rule running into the 45° cut, compares only the top edge, after shifting the diagonal back by its slope. Bands more than 0.5 CSS px apart fail. The rows are the `joins` table in `obsidian/testbed/obsidian.ts`; a row names its notes, its selector per view, and its layouts the way a `compare` part does. A `mark` row's selector names its instances. A `cut` row's selector is only the scope: it finds its frames by kind, as every element in the scope, or its `::before` or `::after`, whose computed `background-image` has a `linear-gradient(225deg, …)` layer, the way the theme draws every cut. The colour is that gradient's first opaque stop and the cut's size its layer's `background-size`, so a new frame cut at 45° is measured without a new row. A hand list of frames named the title, callouts, code blocks, and the tab, and missed the sequence block. A row finds every instance in its notes by scrolling through each note, not only the first instance.

- `delete-loop` (`mark`, reading view and Live Preview): the strike line of each `del`, or of each `.cm-strikethrough` that carries a loop, and the foot of the delete loop after it, in `elements-ko` and `elements-en`, the wrapped strikethrough included. A row whose notes show no mark at all fails.
- `cut` (`cut`, reading view and Live Preview): the top rule and the diagonal of every frame cut at 45° in the window, in `lab-note-ko`, `elements-ko`, `long-note` (the title without properties), and `sequences`. That is the active tab on desktop, the title rule (the title's `::after`), and every sequence block, which a run reaches only with `--plugin obsidian-sequence-plugin`. Each line names the element by tag and classes, with the pseudo-element when the cut is drawn on one. A note with no such frame fails.

Each line names one instance, with both bands in CSS px from the top of the element's line or box and their difference. The report and each instance's crop go to `build/verify/joins/<run>-<view>[-mobile]-<scheme>/`, which each run empties first.

### Check editing states

```sh
obs editcheck [--scheme light|dark] [--mobile] [--note lab-note-ko]
```

`editcheck` puts the window in states a plain `shot` never reaches, because `shot` clears focus and never places the cursor, and measures one invariant in each. The checks are the `editChecks` table in `obsidian/testbed/obsidian.ts`; a row's `on` lists the layouts it runs on, desktop when absent. Add a row there when a bug shows up in a state no check reaches. A row finds its targets in the DOM by kind, as `text-focus` takes every editing root, never from a list of selectors for the instances already seen: a hand list proved only the instance a user had reported, and the next instance of the same kind was found by the user again.

- `text-focus`: with the search panel open, it clicks every visible editing root in the window, a read-write element whose parent is not read-write, (the search field, the tab title, the inline title, each property's name and value, and each editor) at a point on plain text, not on a link or widget. Each click must put focus on read-write text and change neither its nor any ancestor's outline, box-shadow, or background from before the click; the caret already shows where focus is. The pointer moves off the window before the measurement, so a hover style does not count. A target that a re-render removes before its click, or that another element covers at every point tried, is skipped and counted in the result. On the phone the search drawer covers the note, so this check reaches only the search field there.
- `note-text-focus` (phone only): the same check with no panel open, so it reaches the inline title, each property's name and value, and the editor under phone emulation.
- `property-select`: for every property row, it hovers the name and the empty part of the value cell, then presses and releases there, which selects the row itself. Before each measurement it waits until the window marks the row hovered or pressed. The invisible window sits on top of the screen, so the owner's real pointer moving over it sends the page its own mouse events and clears the row's hover and press; the check waits for the pointer to rest, measures again when a mouse event it did not send arrives, and after five disturbed tries fails the row as unmeasured, never as a tint. Hovering may change neither the row's ring nor the background of the row or its name; the row stays untinted while the button is held, and after release it is selected, has no ring, and has a changed background.
- `raised-surfaces`: with the command palette open, every visible prompt, modal, menu, suggestion list, and popover paints the theme's paper, shadow, and 1px rule, and it and everything inside it that draws a border or background has square corners. On the phone Obsidian makes the palette translucent, gives it its own shadow, and rounds its input; this row catches each.
- `control-focus` (desktop only): the first control that `Tab` reaches outside a text field shows an outline, so keyboard focus stays visible.
- `pane-rules` (desktop only): it shows the right sidebar while it measures and finds every horizontal rule a pane draws outside its scrolling content, a border or an unblurred shadow on an element at least nine tenths as wide as its tab group. Two rules of different panes that end within 4px of each other must end at the same height, within 0.1px, so the rule under the note's view header continues the one under the sidebar's pane header. A rule painted as a background is not measured.
- `reading-table`, `live-table`: every table in the note is as wide as its content needs, up to the note column, and wider only when a word cannot break, within 1px, in reading view and in Live Preview's table widget; a table wider than the column scrolls inside a box no wider than the column. The check scrolls through the note, measures each table it meets on a hidden copy at max-content and min-content, and keeps the column width from the last paragraph it saw, since a short phone screen near the note's end may show none.
- `reading-column`, `live-column`: it scrolls the note from top to bottom, in reading view and in Live Preview, and measures every element in the note column that paints (a background, a border, a shadow, or a replaced element such as a task checkbox or an image) and every run of text, clipped by any ancestor that clips overflow. None may start more than 0.5px left of the column's content edge. A mark drawn by a pseudo-element has no box, so the H2 square, which hangs in the margin on desktop by design, is outside this check, and so is Obsidian's fold handle, which shows in the margin while the pointer is over a heading or list item. It names each element left of the edge with its offset, and its capture is the worst one, or the first task checkbox when none is.
- `floating-header` (phone only): every view header fixed over the note draws no border and no shadow, on itself or on its `::before` and `::after`.
- `code-active-line`: with the cursor on the first line inside the note's first fenced code block, that line keeps the background of the block's other lines.
- `toggle-states` (desktop only; the phone opens settings on its tab list, with no toggle on screen): it opens the settings window, measures every enabled toggle on its open tab in both states on a copy beside it, and closes the window. The on and off tracks must differ by at least 0.1 in OKLCH lightness, the thumb must reach 3:1 contrast (WCAG 1.4.11) on the on track, and differ from the off track by at least 0.1. WCAG's 3:1 holds only for the thumb on the on track because stock Obsidian misses it elsewhere: on 2026-11-27 stock measured 2.45:1 (light) and 2.47:1 (dark) between its tracks, and 1.40:1 for its white thumb on the light off track. The 0.1 step sits under stock's weakest pair, that thumb at 0.112; stock's tracks differ by 0.235. The crop is the first toggle in the settings window.
- `embed-hover`: it scrolls Live Preview from top to bottom and, for every embed widget (`.cm-embed-block`: a callout, a math block, a table), forces `:hover` on the widget and on its edit button with CDP `CSS.forcePseudoState`, for the reason under Evidence. The widget and every element down to its frame, the first element inside it that paints a background or a top border, may draw no outline and no box-shadow. The edit button, where the widget has one, must lie inside the frame and start below the frame's top rule, and on a frame cut at 45° its gaps from the frame's top and right edges must add up to the cut's size or more, which keeps it off the diagonal. The capture is the first failing widget, or else the first with an edit button, still hovered.

A row with `open: "settings"` runs against the settings window, Obsidian's separate page on desktop or its modal under phone emulation, and `editcheck` closes that window after the row.

Each line names one check with its measurement. The report goes to `build/verify/<run>/editcheck-<scheme>[-mobile].json`, and a 2x capture of each check's element to `build/verify/<run>/shots/editcheck-<scheme>[-mobile]-<check>.png`.

### Check that the two views match

```sh
obs pairs [--scheme light|dark] [--mobile] [--note pairs]
```

`pairs` holds the theme to one rule: a device looks the same in reading view and in Live Preview while the caret is outside it. It opens the note in reading view and then in Live Preview, puts the caret on the note's empty last line, makes the window tall enough that each view renders the whole note, and reads every device's computed style in both.

The rows are the `pairs` table in `obsidian/testbed/obsidian.ts`. A row names one part of a device, a selector for it in each view, and the properties that carry its design: the text colour and font, the background, each border side, the text decoration, the clip path, and offsets measured from the note column: `x` and `right` for a box, `text-x` for where its text starts, and `wrap-x` for where a wrapped line starts. A row finds every instance of its kind in the DOM and pairs the instances of the two views in document order. It fails when the counts differ or the note has no instance. CodeMirror splits some devices into several elements: a tag is two spans and a block is a run of lines. A row's `more` joins those elements into one instance, whose left edge comes from the first element and whose right edge comes from the last. A computed length must match within 0.01 px and a measured one within 0.5 px.

The rows cover the paragraph, headings 1 to 6 and the H2 marker, bold, italic, strikethrough and its delete loop, highlight, inline code, internal, unresolved, and external links, the tag, the footnote reference, list items, bullets, and numbers, open and done tasks, the blockquote and a quote nested in it, the divider, the code block and its text, the table with its head and cells, the callout, and the embed.

Code tokens are compared character by character. The check pairs the code blocks of the two views in order and, for each character, takes the colour, weight, and slant of the token that holds it. It prints one line per pair of token classes, such as `typescript keyword as keyword "export"`, so a class that one highlighter has and the other lacks shows up by name.

A difference the editor needs is declared in the `pairDiffs` table with its reason. It prints as a `diff` line with both values and the reason, so no difference passes without a line. `DESIGN.md` lists the same differences under "Reading and editing"; a row added to one goes into the other.

Each line is `ok`, `diff`, or `FAIL` for a group of instances with the same outcome, with the group's size and its first instance's text. The report goes to `build/verify/<run>/pairs-<scheme>[-mobile].json`.

### Check sequence blocks

```sh
obs seqcheck [--note sequences] [--view reading|live] [--scheme light|dark] \
  [--size <width>x<height>] [--mobile] [--hide-right]
```

`seqcheck` needs a run launched with `--plugin obsidian-sequence-plugin`. It prepares the window as `shot` does, reads the note from the run's vault, and finds each `fasta`, `dna`, `rna`, and `protein` fence in it. For each fence it scrolls the rendered block into view, because reading view and CodeMirror drop off-screen blocks from the DOM. Then it forces the block and each of its ancestors up to the view's scroller into the hover state with CDP `CSS.forcePseudoState`, as a pointer over the block would, measures it, and checks nineteen invariants, plus `badge-overlap` in a block of two or more records and `live-source` and `copy-command` in Live Preview. The run emulates `prefers-reduced-motion: reduce`. The copy control is each record's length badge, in both views. Every press goes through a `writeText` recorder that the check puts in place for the press and removes afterwards, so the system clipboard is never written, and the check removes the notices the press shows.

- `not-clipped`: no ancestor up to the view's scroller whose overflow is not `visible` cuts the block's left or right edge, and the block's left edge is not left of the scroller's.
- `fits`: the block has no horizontal scroll (`scrollWidth <= clientWidth + 1`), on desktop and with `--mobile`.
- `in-column`: the block's left and right edges each lie within 1px of the note column's content edges: `.markdown-preview-sizer` in reading view, `.cm-content` in Live Preview.
- `one-cut`: no ancestor of the block up to the note column draws a border, an outline, or a box-shadow around the frame, as Live Preview's embed does on hover, and no control within the frame's top-right cut square, hovered on its own, paints a background over the 45° cut, as Obsidian's edit button does in Live Preview.
- `badge-clear`: each record's length badge (`.seq-badge` on its head row) overlaps no `.seq-group` and no header text. The header text box comes from a Range over the header's text, not the full-width header div.
- `badge-column`: every record's badge in the block has the same width and the same right edge, within 0.5px, so the badges stand in one column.
- `badge-edge`: every badge in the note has its right edge within 1px of the right edge of the last cell of a full line, a short block's badges included. A full line is a `.seq-line` that is not its record's last, so the plugin wrapped after it, and every full line in the note must hold as many residues as the others and end its last cell within 1px of theirs. A note in which no record runs past one line has no known full line and fails. A cell's edge is the last `.seq-group` of its line, less the right inset of its `clip-path`. The check compares x positions only, so blocks measured at different scroll positions compare.
- `badge-height`: each badge is one cell (a `.seq-group`'s height) plus its 2px border tall, within 0.5px.
- `badge-kind`: in a `dna`, `rna`, or `protein` block each badge holds a molecule cell (`.seq-badge-kind`) reading `DNA`, `RNA`, or `Protein`. The cell sits against the frame's inner left, top, and bottom edges within 0.5px, its right border has the frame's width, style, and colour, and the length starts at or after that line. A `fasta` block's badges hold no molecule cell. The molecule comes from the fence's language, not from the plugin's output.
- `badge-width`: a block's badges are as wide as those of the first block whose longest record has the same number of digits, whose widest unit has as many letters (`nt` and `aa` two, `nt/aa` five), and whose molecule name has as many letters (none in `fasta`, three for DNA and RNA, seven for Protein), within 0.5px. The digit count, the units, and the molecule come from the fence's text and language, not from the plugin's output.
- `badge-label`: each record's badge has the `aria-label` that Obsidian's `setTooltip` shows as its tooltip: `Copy · ` and then the length and unit spelled out. A `dna`, `rna`, or `protein` record names its molecule first: `DNA, 96 nucleotides`, `RNA, 60 nucleotides`, `Protein, 214 amino acids`. A `fasta` record reads its unit from the letters: `aa` when it holds E, F, I, J, L, O, P, Q, Z, or `*`, `nt` when it holds only A, C, G, T, U, and N, and `nt/aa` otherwise, with the alignment gaps `-` and `.` left out of that reading. Its label says so: `174 nucleotides, read from the letters. Use a dna or rna block to say which.`, `96 amino acids, read from the letters. Use a protein block to say so.`, or `24 residues, nucleotides or amino acids. Use a dna, rna or protein block to say which.` A length of 1 takes the singular. The expected labels come from the fence's text, not from the plugin's output.
- `badge-unit`: each badge's unit part is as wide as the widest unit text in its block, within 0.5px, so a block of `nt` or `aa` badges keeps no empty unit space.
- `badge-target`: hit-testing every half pixel within 24px of each badge finds the area a click or tap reaches it. That area is at least 24px each way, within the half-pixel step, and its box covers no header text and no group. The badge is drawn smaller; the plugin's styles give it an invisible `::before` that makes up the area.
- `copy-failure`: with `writeText` replaced by one that rejects, a click at the first badge's centre shows one Obsidian notice, `Could not copy the sequence. Select the block and press ⌘C.` on macOS, the same with `Ctrl+C` on other desktops, and `Could not copy the sequence. Select the block and choose Copy.` with `--mobile`, and leaves the badge without `is-copied` and the live region empty.
- `badge-key`: the first badge, focused with `focus()`, takes an Enter keypress and passes the expected text, as `badge-copy` defines it, to the `writeText` recorder. In Live Preview the cursor first sits on the nearest line above the fence that is outside every fence, and the note's text must be unchanged after the keypress, so an Enter that reached the editor fails.
- `badge-repeat`: with the first badge focused, Enter held down through three key repeats passes one text to the `writeText` recorder, and in Live Preview leaves the note's text unchanged.
- `badge-copy`: a mouse click at each badge's centre passes exactly one text to the `writeText` recorder: the fence's text for a one-record block, and for a multi-FASTA block the record's own lines as the fence writes them, from its `>` header line to the line before the next header, without the blank lines after it. The expected text is built from the fence's text, not from the plugin's output.
- `badge-held`: a quarter second after each click, with the pointer still on the badge, the badge has `is-copied`, its background is `var(--wg-rule)` and its text `var(--wg-paper)`, a molecule cell's divider is `var(--wg-paper)`, the block's one `aria-live` region says `Copied <length> <unit>` for that record, and one notice says the same. The colours are resolved on a probe element in the block, and the label is built from the fence's text. 1.25 seconds after the click, with the pointer off the window, `is-copied` is gone and the region is empty.
- `badge-overlap` (blocks of two or more records): the first badge is clicked, then the second about 0.6 seconds later. 0.75 seconds after the second click, past the first click's 1 second, the second badge still has `is-copied`, the block's `aria-live` region says `Copied <length> <unit>` for the second record, and the first badge has lost `is-copied`.
- `live-source` (Live Preview only): before each badge click the editor has focus and its cursor sits on the nearest line above the fence that is outside every fence. After the click the block is still rendered, the editor still has focus, the cursor is on the same line, and the note's text is unchanged.
- `copy-command` (Live Preview only): with the editor cursor on the fence's first residue line, the command `sequence-blocks:copy-sequence-block` is available, `app.commands.executeCommandById` passes exactly the fence's text to the `writeText` recorder, and one notice starting `Copied` shows. With the cursor on the nearest line above the fence that is outside every fence, the command's `checkCallback(true)` returns false and running it writes nothing. `executeCommandById` returns true whether or not the command ran, so the check reads availability from `checkCallback`. The check removes the notices and leaves the cursor on that line.
- `copy-selection`: with the whole block selected, a `copy` event carrying a fresh `DataTransfer` yields FASTA text. Each record gives its `>` header line, when it has one, then its residues without whitespace or digits, and records are joined by newlines. A line that starts with `ORIGIN` or is `//` adds nothing. The expected text is built from the fence's text, not from the plugin's output.

It prints the report as JSON before its lines, and one `FAIL block <n> <language>: <invariant>: <reason>` line per failure. The report goes to `build/verify/<run>/seqcheck-<view>-<scheme>-<size>[-mobile].json`, and a capture of each hovered block to `build/verify/<run>/shots/seqcheck-<view>-<scheme>-<size>[-mobile]-<index>.png`. A fence with no rendered block fails as `rendered`.

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

This sends SIGTERM to the process group `launch` started, from the pid in `run.json`, and sends SIGKILL to the same group after 10 s. Then it deletes the run's `vault/`, `data/`, and `run.json`. It keeps `shots/`, the report JSON files, and `obsidian.log`. It never kills by process name, so the user's own Obsidian is untouched. Delete `build/verify/<run>/` by hand when the evidence is no longer needed.

## Helpers

- `obsidian/testbed/obsidian.ts`: the only helper, outside the skill so the owner can run it through npm. Run it with node from the devshell as shown above. Type-check it with `nix develop -c npm run obsidian:check`.
- `obsidian/testbed/notes/*.md`: the notes every run starts from.
- `features/`: the verification map. Read `features/README.md` before proving a feature.
