# CX-118 공공데이터 일반음식점 수집 막힘 (2026-11-18 11:3x · 컨트롤타워) · **P1**

대표 지시(11:27). Owner Domain: lead · 공유 파일 `lib/store.ts` 수정 포함 → **시작 전 현황판에서 lib/store.ts 잠금**.

## 현상 (운영 DB 읽기, 11/18 아침)
| 종류 | 11/18 결과 | 마지막으로 읽은 날 |
|---|---|---|
| 빵집 | 5/5곳 정상 | 11/18 |
| 휴게음식점·카페 | 1/5곳, 4곳 이월 | 11/18 (일부) |
| **일반음식점** | **0/5곳, 전부 이월** | **11/10 (8일째 0건)** |

## 원인
1. 첫 지역 요청이 20초(`GOV_REQUEST_TIMEOUT_MS`)에서 시간 초과(`elapsedMs 20004`). 재시도(50행)는 `Date.now()+20초 > 마감` 검사에 걸려 `GovBudgetDeferredError` → **"이월"로 기록**.
2. 그래서 `timeoutCounts`가 계속 `{}` → 다음 실행에서 **작은 페이지(20행) · 단독 실행(solo)이 한 번도 켜지지 않음** (`loadGovAreaWithTimeoutRetry`, `splitGovTasksByTimeouts`는 `timeoutCounts>=2`일 때만 동작). ← **핵심 버그**
3. 하루 1번 실행이라 같은 첫 지역에서 매일 다시 막힘.

## 할 것
| # | 변경 | 파일 |
|---|---|---|
| 1 | 시간 초과 후 재시도가 예산 부족으로 이월돼도 **그 지역의 timeoutCount를 +1** 기록(이월 ≠ 정상). 성공하면 0으로 | `lib/gov-area-fanout.ts`, `lib/store.ts`(gov 수집 메타 기록부) |
| 2 | 일반음식점(`general_restaurants`)은 **처음부터 20행**, 시간 초과 1번이면 바로 단독 실행 | `lib/gov-area-fanout.ts` |
| 3 | 이월된 첫 지역이 2번 연속 막히면 **다음 실행은 다른 지역부터**(뒤로 보냄) — 한 곳 때문에 나머지 4곳이 못 도는 일 없게 | `prioritizeGovAreaCodes` |
| 4 | 메타에 지역별 `attempts:[{pageSize, ms, result: timeout/deferred/success}]` 남김(다음 진단용) | `lib/store.ts` |

## 하지 말 것
- 함수 시간 한도 60초(Hobby) · 수집 예산 40초 변경 금지. Vercel 정기 실행 시간 변경 금지.
- 15분 수집 워크플로(`.github/workflows/gov-sync-schedule.yml`)와 비밀값은 건드리지 않음 — 켤지는 대표 결정(별건).
- 빵집 · 카페 동작은 그대로(회귀 테스트).

## 검증
- 단위 테스트(가짜 시계): ① 20초 초과 → 이월 + timeoutCount 1 ② 다음 실행 20행 · 단독 ③ 2번 막힌 지역은 뒤로 ④ 성공 시 0 초기화 ⑤ 빵집 · 카페 기존 결과 동일
- `npx tsc --noEmit` · lint · test · build · `check:auth-boundaries`
- 완료 기준: 배포 다음 날 06:13 실행에서 일반음식점 `scannedPages ≥ 1`. 못 하면 attempts 기록으로 원인 보고.
- DB 변경 없음 · 배포는 컨트롤타워.
