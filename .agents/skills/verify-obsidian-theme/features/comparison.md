# Comparison

Comparison captures the same fixture notes under another stylesheet, such as the CSS snippet the owner's vault uses now, so a design decision rests on two real captures instead of a reading of CSS.

## Sub-features

- `compare-snippet` runs stock Obsidian plus a snippet, with a cssclass the snippet keys on.
- `compare-theme` runs the Wongoji theme on the same notes, side by side under a different run name.

## How to get to it (user POV)

- A user enables a snippet under Settings → Appearance → CSS snippets, and a theme under Settings → Appearance → Themes.

## Driving it with obsidian.ts

Preconditions:

- The other stylesheet exists as a file. Reading it is fine; `launch` copies it into the disposable vault and never writes to the source.

- **Snippet run.** Run `obs launch --run vault --theme none --snippet ~/Vault/.obsidian/snippets/fieldnotes.css --cssclass fieldnotes-paper`, then `obs doctor --run vault`. Doctor lists `fieldnotes` under `enabledSnippets` and `cssTheme: ""`.
- **Theme run.** Run `obs launch`, then `obs doctor`. Give it the same `--cssclass` when the comparison is about note styling, so both runs carry the same frontmatter.
- **Pairs.** For each view to compare, run the same `obs shot` options against `--run vault` and `--run agent`. Each run keeps its shots in its own `build/verify/<run>/shots/`.
- **Geometry.** `obs compare --base vault` measures the parts of the two stylesheets against each other.
- **After editing the snippet.** `obs sync --run vault` copies it again; no relaunch.
- **Proof.** Present the pairs together and name what differs, with capture paths.
- **Cleanup.** `obs stop --run vault`, and `obs stop` if you launched it for this.

## Gotchas

- `compare` empties and rewrites `build/verify/compare/<view>[-mobile]/<scheme>/` every time; copy a stock-versus-theme result aside before comparing against the snippet run.
- Two snippets with the same file name overwrite each other in the disposable vault.
- A snippet that names host fonts (for example Pretendard) renders with whatever this machine has installed; say so when the comparison depends on those fonts.
- `--cssclass` is added to every fixture note; a snippet that keys on a class shows nothing without it.
