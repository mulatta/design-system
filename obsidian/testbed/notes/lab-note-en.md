---
created: 2026-11-24
tags:
  - cloning
  - lab-log
project: "[[pUC19-GFP]]"
---

Ran yesterday's PCR product on a 1% agarose gel. A single band came up near the expected 720 bp; the orientation of the *gfp* insert will be checked again by [[colony PCR]]. The forward primer is `ATGGTGAGCAAGGGCGAGGAG`, and its melting point came from $T_m = 81.5 + 0.41(\%GC) - 675/N$. Transformation efficiency in *Escherichia coli* DH5α was 2.3 × 10⁶ cfu/µg. #cloning

## Primers

```dna
>GFP_F forward, for the pUC19 insert
ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAAC
>GFP_R
TTACTTGTACAGCTCGTCCATGCCGAGAGTGATCCCGGCG
```

## PCR conditions

| Step | Temperature | Time | Cycles |
| --- | --- | --- | --- |
| Initial denaturation | 98 °C | 30 s | 1 |
| Denaturation | 98 °C | 10 s | 30 |
| Annealing | 62 °C | 20 s | 30 |
| Extension | 72 °C | 25 s | 30 |

> [!warning] Caution
> Lane 2 on the gel looks like primer dimer. Raise the annealing temperature to 64 °C in the next PCR.

## Analysis script

```python
# Primer Tm from GC content
def tm(seq: str) -> float:
    gc = sum(b in "GC" for b in seq)
    return 81.5 + 41 * gc / len(seq) - 675 / len(seq)
```

- [x] Check the gel
- [ ] Colony PCR
- [ ] Send for sequencing

> Sambrook & Russell, *Molecular Cloning*, 3rd ed. Formula for transformation efficiency.
