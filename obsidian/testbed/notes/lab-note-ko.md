---
created: 2026-11-24
tags:
  - cloning
  - 실험기록
project: "[[pUC19-GFP]]"
---

어제 만든 PCR 산물을 1% 아가로스 겔에서 확인했다. 예상 크기 약 720 bp에서 단일 밴드가 나왔고, *gfp* 삽입 방향은 [[콜로니 PCR]]로 다시 확인할 예정이다. 정방향 프라이머는 `ATGGTGAGCAAGGGCGAGGAG`이고 $T_m = 81.5 + 0.41(\%GC) - 675/N$으로 계산했다. *Escherichia coli* DH5α 형질전환 효율은 2.3 × 10⁶ cfu/µg이었다. #cloning

## 프라이머

```dna
>GFP_F pUC19 삽입용 정방향
ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAAC
>GFP_R
TTACTTGTACAGCTCGTCCATGCCGAGAGTGATCCCGGCG
```

## PCR 조건

| 단계 | 온도 | 시간 | 반복 |
| --- | --- | --- | --- |
| 초기 변성 | 98 °C | 30 s | 1 |
| 변성 | 98 °C | 10 s | 30 |
| 결합 | 62 °C | 20 s | 30 |
| 신장 | 72 °C | 25 s | 30 |

> [!warning] 주의
> 겔 사진의 2번 레인은 프라이머 다이머로 보인다. 다음 PCR에서 결합 온도를 64 °C로 올린다.

## 분석 스크립트

```python
# 프라이머 Tm 계산: GC 비율 기반
def tm(seq: str) -> float:
    gc = sum(b in "GC" for b in seq)
    return 81.5 + 41 * gc / len(seq) - 675 / len(seq)
```

- [x] 겔 확인
- [ ] 콜로니 PCR
- [ ] 시퀀싱 의뢰

> Sambrook & Russell, *Molecular Cloning*, 3rd ed. 형질전환 효율 계산식.
