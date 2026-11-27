# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- Token source: root `DESIGN.md` in the Google DESIGN.md format (spec version alpha). Its YAML frontmatter holds the token values, and Impeccable reads the same file.
- Parser and linter: `@google/design.md`. The generator reads the parsed design system from its `lint()` API, and `design.md lint` gates the build.
- Generator: TypeScript in this repository, run on node. It renders every consumer format, including the shadcn CSS variables, from the parsed design system.
- Light/dark resolution and OKLCH-to-sRGB gamut mapping are code in this repository. DESIGN.md groups such as `colors.light` and `colors.dark` carry no mode behavior in the spec, so the generator gives them that meaning.
- Packages: npm, pinned by `package-lock.json` and built with nixpkgs `buildNpmPackage`. Not bun.
- Nix builds every output. The flake exposes tokens, fonts, and themes as packages and as home-manager or NixOS modules.

Terrazzo was set aside. A DTCG source would put token values in a second file beside DESIGN.md, and `design.md export --format dtcg` converts every color to sRGB hex and drops modes and components. Known risk: the DESIGN.md format and its CLI (0.4.0) are alpha and may change.

## Users

One person, the repository owner. They read and write notes in their Obsidian vault every day, and they publish a blog and a homepage.

The vault holds experiment and research records, paper and literature notes, code and infrastructure notes, and personal records. A single note often mixes long Korean prose with English terms, DNA and protein sequences, math, code blocks, tables, and drawings or diagrams.

Blog and homepage readers are researchers and colleagues, developers, and general readers.

## Product Purpose

Give the owner's Obsidian vault and websites one identity of their own, defined once and delivered as flake outputs. A change to a token reaches each consumer through a flake input update. Success means no consumer carries a hand-copied color, font, or size.

## Positioning

The system treats the owner's mixed notes as its base case. Korean prose with Latin terms, monospace sequences, math, code, and tables share one page, and each has to read correctly beside the others. A theme designed around English prose handles these as exceptions.

## Operating Context

Consumers, in priority order:

1. Obsidian vault at `~/Vault`. The owner looks at this most often, so it comes first. The theme replaces whatever styling the vault uses now. Delivery: a package holding `manifest.json` and `theme.css`, which home-manager's `programs.obsidian.vaults.<name>.settings.themes` accepts directly.
2. Websites: `~/git/blog` and `~/git/homepage`. Their current themes are not kept.
3. Optional: terminal, typst, and slide and spreadsheet themes (pptx, xlsx). These adopt the system only where it fits, and may get a separate concept or none. Terminal themes have readability needs and existing themes the owner already uses. Academic documents and slides often follow a prescribed format.

## Capabilities and Constraints

- Obsidian themes style the app through Obsidian's CSS variables (`--background-primary`, `--text-normal`, `--interactive-accent`, and the rest).
- A theme cannot run JavaScript, so a companion Obsidian plugin renders sequence code blocks (`fasta`, `dna`, `rna`, `protein`). It ships from the same flake as the theme. It formats sequences in the GenBank convention: 10-residue groups, up to six per line as the note column allows, a start position on each line, and styled `>` headers. Input may be one long line, fixed 60, 70, or 80 character lines, multi-FASTA, protein, or a GenBank `ORIGIN` section with its position numbers. The fence names the molecule. Each record's badge in a `dna`, `rna`, or `protein` block opens with a cell naming it (DNA, RNA, Protein), joined to the length in nt or aa. A `fasta` block names no molecule and reads the unit from the letters, as other sequence tools do. A record that holds a letter only amino acids use (E, F, I, J, L, O, P, Q, Z, or the stop `*`) says aa. A record of only A, C, G, T, U, and N says nt; alignment gaps (`-`, `.`) do not change the reading. Any other says nt/aa, because its letters read as both. The badge is the block's copy control, the same in reading view and Live Preview: a click, a tap, or Enter copies the record as the fence writes it, or the whole fence when the block holds one record.
- Web output uses shadcn CSS variable names (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--ring`, `--radius`, `--chart-1` to `--chart-5`, and the rest of the set) so shadcn components take the theme directly.
- Fonts must cover Korean and Latin.
- The system includes a monospace family for code.
- Every font has an open license that permits redistribution, such as OFL, and is packaged with Nix.
- The build produces subset woff2 webfonts.
- Font families: Source Serif 4 for Latin and MaruBuri for Hangul in one text stack, and D2Coding for code. Open-licensed Korean fonts are few, so the distinctiveness comes from the manuscript grid, not from the type.
- Open: whether each consumer gets both light and dark variants.
- Open: the contrast standard. `design.md lint` warns below WCAG AA (4.5:1) only for component background and text pairs; any wider check is generator code.

## Brand Commitments

- Independent and built from nothing. Earlier themes the owner used are not references.
- The owner does not want it to look like a common theme.

## Evidence on Hand

No tokens, fonts, or themes exist yet. The system starts from nothing and carries no earlier visual direction. The repository holds the flake, formatter configuration, the Impeccable package, and the pinned `@google/design.md` linter.

## Product Principles

1. The DESIGN.md frontmatter is the only place a token value is written. Every consumer file is generated.
2. Nix builds and delivers every output. A consumer never copies a generated file by hand.
3. Each output follows its consumer's native convention, such as Obsidian's variables and shadcn names on the web.
4. Obsidian and the websites share one identity. Optional consumers follow it only where it serves their purpose.
