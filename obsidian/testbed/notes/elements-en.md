---
created: 2026-11-26
tags:
  - specimen
aliases:
  - element specimen
---

# Heading 1: manuscript specimen

A body paragraph. **Bold**, *italic*, ~~strikethrough~~, ==highlight==, `inline code`, [[missing note]], [[lab-note-en|existing note]], [external link](https://example.org), and a #specimen tag. There is a footnote too.[^1]

An editing note stays in the source %%tighten this sentence in the next draft%% and is hidden in reading view.

~~This whole sentence was deleted. It runs long on purpose, so the strike carries on to the next line unbroken and the delete loop appears once, at its very end.~~

## Heading 2

### Heading 3

#### Heading 4

1. Numbered list
   - Nested item
   - Second nested item
2. Second item

- [ ] A task
- [x] A finished task
- [ ] A very long task item that wraps onto a second line, to check how the checkbox lines up with the text once it wraps

> [!note] Note
> The default callout.

> [!tip] Tip
> A tip callout.

> [!danger] Danger
> A danger callout.

> [!quote] Quote
> A quote callout.

> [!summary] Summary
> A summary callout.

> [!todo] Todo
> A todo callout.

> [!important] Important
> An important callout.

> A plain blockquote.

---

$$
\Delta G = \Delta H - T\Delta S
$$

```nix
# Build the font subsets
{ pkgs, ... }:
{
  fonts = pkgs.callPackage ./nix/fonts { };
  dontUnpack = true;
}
```

```typescript
// GC fraction of a sequence
export function gc(seq: string): number {
  return [...seq].filter((b) => b === "G" || b === "C").length / seq.length;
}
```

```bash
nix develop -c npm run lint
```

```yaml
primer: GFP_F
tm: 62.4
```

| Column | Value | Unit |
| --- | ---: | --- |
| Concentration | 12.5 | ng/µL |
| Volume | 50 | µL |

| Step | Description | Note |
| --- | --- | --- |
| Transformation | Heat-shock the plasmid into E. coli DH5α, plate it on LB agar with ampicillin, and grow it overnight | 37 °C |
| Colony screen | Pick eight white colonies and check the insert by colony PCR | Discard blue colonies |
| Miniprep | Spin the overnight culture down and purify the plasmid with the kit, eluting in 30 µL of water | Store at −20 °C |

| Name | Sequence | Length | Tm | GC | Strand | Template | Note |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| GFP_F | ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAG | 78 | 72.1 | 58 % | Forward | pUC19-GFP | Clear band |
| GFP_R | TTACTTGTACAGCTCGTCCATGCCGAGAGTGATCC | 35 | 68.4 | 51 % | Reverse | pUC19-GFP | Retry |

[^1]: Footnote text.
