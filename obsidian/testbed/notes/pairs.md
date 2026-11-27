---
created: 2026-11-27
tags:
  - 견본
---

# 제목 1

본문 문단이다. **굵게**, *기울임*, ~~취소선~~, ==강조==, `인라인 코드`, [[없는 노트]], [[lab-note-ko|있는 노트]], [외부 링크](https://example.org), #견본 태그. 각주도 있다.[^1]

## 제목 2

### 제목 3

#### 제목 4

##### 제목 5

###### 제목 6

1. 번호 목록
   - 중첩 항목
2. 두 번째 항목

- 글머리 목록
- 두 번째 글머리

- [ ] 할 일
- [x] 끝난 일

> 일반 인용문은 왼쪽 괘선 하나와 본문 색으로 쓰고, 줄이 넘어가도 둘째 줄이 첫 줄의 글자 아래에서 시작하는지 보려고 일부러 길게 썼다.
>
> > 겹친 인용문도 같은 괘선을 한 번 더 긋고, 긴 문장이 줄을 넘길 때 둘째 줄이 첫 줄의 글자 아래에서 시작해야 한다.

---

> [!note] 메모
> 기본 콜아웃.

![[pcr-protocol]]

```typescript
// 한글 주석: 두 칸 폭
export function gc(seq: string): number {
  const strict = true;
  const hits = [...seq].filter((b) => b === "G" || b === "C").length;
  return strict && hits / seq.length > 0.5 ? 1 : 0;
}
```

```python
# 주석
def gc(seq: str) -> float:
    return sum(b in "GC" for b in seq) / len(seq)
```

```bash
# 주석
nix develop -c npm run lint && echo "done"
```

```yaml
# 주석
primer: GFP_F
tm: 62.4
ready: true
```

```nix
# 폰트 서브셋 빌드
{ pkgs, ... }:
{
  fonts = pkgs.callPackage ./nix/fonts { };
  dontUnpack = true;
}
```

| 열 | 값 | 단위 |
| --- | ---: | --- |
| 농도 | 12.5 | ng/µL |
| 부피 | 50 | µL |

| 단계 | 설명 | 비고 |
| --- | --- | --- |
| 형질전환 | 대장균 DH5α에 플라스미드를 열충격으로 넣고 LB 한천배지에 앰피실린과 함께 깔아 하룻밤 키운다 | 37 °C |
| 미니프렙 | 하룻밤 키운 배양액을 원심분리하고 키트로 플라스미드를 정제해 물 30 µL에 녹인다 | −20 °C 보관 |

| 이름 | 서열 | 길이 | Tm | GC | 방향 | 주형 | 비고 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| GFP_F | ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAG | 78 | 72.1 | 58 % | 정방향 | pUC19-GFP | 밴드 선명 |

[^1]: 각주 내용.

커서를 두는 마지막 문단이다.
