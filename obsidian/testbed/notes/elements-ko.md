---
created: 2026-11-26
tags:
  - 견본
aliases:
  - element specimen
---

# 제목 1: 원고지 견본

본문 문단이다. **굵게**, *기울임*, ~~취소선~~, ==강조==, `인라인 코드`, [[없는 노트]], [[lab-note-ko|있는 노트]], [외부 링크](https://example.org), #견본 태그. 각주도 있다.[^1]

편집 메모는 %%다음 판에서 이 문장을 줄일 것%% 원문 안에 남기고, 읽기 보기에서는 숨는다.

~~이 문장은 통째로 지웠다. 지운 줄이 다음 줄까지 끊기지 않고 이어지는지, 교정 고리가 문장 끝에만 한 번 붙는지 보려고 일부러 두 줄이 넘게 길게 썼다.~~

## 제목 2

### 제목 3

#### 제목 4

1. 번호 목록
   - 중첩 항목
   - 두 번째 중첩
2. 두 번째 항목

- [ ] 할 일
- [x] 끝난 일
- [ ] 아주 긴 할 일 항목은 줄을 넘겨서 두 줄로 감싸질 때 체크박스와 글자가 어떻게 정렬되는지 확인하는 용도다

> [!note] 메모
> 기본 콜아웃.

> [!tip] 팁
> 팁 콜아웃.

> [!danger] 위험
> 위험 콜아웃.

> [!quote] 인용
> 인용 콜아웃.

> [!summary] 요약
> 요약 콜아웃.

> [!todo] 할 일
> 할 일 콜아웃.

> [!important] 중요
> 중요 콜아웃.

> 일반 인용문.

---

$$
\Delta G = \Delta H - T\Delta S
$$

```nix
# 폰트 서브셋 빌드
{ pkgs, ... }:
{
  fonts = pkgs.callPackage ./nix/fonts { };
  dontUnpack = true;
}
```

```typescript
// 한글 주석: 두 칸 폭
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

| 열 | 값 | 단위 |
| --- | ---: | --- |
| 농도 | 12.5 | ng/µL |
| 부피 | 50 | µL |

[^1]: 각주 내용.
