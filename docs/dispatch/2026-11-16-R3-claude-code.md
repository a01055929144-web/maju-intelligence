# R3 작업지시 — Claude Code (2026-11-16 15:3x)

"이어서 작업해" 규칙(받으면 할 일 · 멈출 때 · 하지 않는 것 · 보고)은 [R2 Claude Code](2026-11-15-R2-claude-code.md) **0·1·3·4·5절 그대로**. 이 문서는 **대기열만** 바꾼다(R2 대기열은 48-5만 남고 끝).

## 대기열 (위에서부터, 한 번에 한 PR)

| 순서 | 작업 | 할 것 | DB | 완료 기준 |
| --- | --- | --- | --- | --- |
| 1 | **CC-51 stage-a를 PR에서도 돌리기** | `.github/workflows/stage-a-integration.yml`: `on.pull_request`에 `paths`(`app/**` `components/**` `domains/**` `lib/**` `tests/integration/**` `scripts/setup-stage-a-integration.mjs` `supabase/migrations/**`) 추가 + job `if`에 `github.event_name == 'pull_request'` 포함. 필수 체크로 만들지 않음(경로 필터라 필수면 영원히 대기). 이유: 11/15 #851(공용 검색칸 전환)이 main 전용 stage-a를 12번 연속 30분 초과로 깼는데 PR에서는 건너뛰어 못 잡음 | 없음 | 코드 PR 하나에서 stage-a가 실제로 도는 것 확인(이 PR 자체가 `scripts`·워크플로를 바꾸므로 첫 확인), 문서 PR에서는 안 돎 |
| 2 | **CC-47-9 지도·리드 화면 공용 부품 마무리** | 지도·리드 소유 파일의 남은 직접 구현만: `window.confirm` → `useConfirm`, `navigator.clipboard` → `CopyTextButton`/공용 복사 함수. 대상(11/16 main 재집계): `map/quote-drawer.tsx`(확인 2·복사 2) · `map/vehicle-layer.tsx`(확인 1) · `mobile-sales-workspace.tsx`(확인 1) · `permit-leads-view.tsx`(확인 2·복사 5) · `map-lead-channel-icons.tsx`(복사 1) · `map/map-place-detail.tsx`(복사 1) · `sales-route-map-workspace.tsx`(복사 2). 바꾸지 않을 이유가 있으면 그 줄에 `// shared-ui-exception: <이유>` 주석(아래 공통 규칙) | 없음 | 위 파일에서 grep 0 또는 예외 주석만, 동작 변화 없음, 삭제 확인 창 e2e 1개 |
| 3 | **CC-50b 거절 흐름 화면 시험** | CC-50(#870)에서 빠진 e2e: 목록에서 단계 "거절" → 사유 → 기본 목록에서 사라짐 → 지도 필터 "거절함"에 보임 / "제외"는 숨김 보기에만. 1440·390, 가짜 API | 없음 | 시험 통과 |
| 4 | **48-7ⓐ 배송 완료 사진 보기** | [CC-48](2026-11-15-map-feedback.md) 48-7ⓐ: 지도 상세에서 그 거래처의 `delivery_proof` 첨부를 날짜순으로(썸네일 + 크게 보기, 올린 날짜 `formatKstDate`). 기존 첨부 API·서명 링크 재사용, 새 테이블·칸 없음. 사진 0장이면 `EmptyState` | 없음 | 가짜 API e2e: 사진 2장 날짜순 표시 · 0장 빈 상태 · 다른 회사 첨부 안 보임(기존 API 회사 범위 시험 재사용) |
| 5 | **48-5 좌표 저장·사용** | R2 그대로 — **좌표 SQL 운영 적용 완료(11/16 17:15, [적용 기록](../work-orders/db-approval/2026-11-15-customer-coordinates.md))** → 시작 가능 | 필요(승인) | R2 기준 |

## 이번 차수 주의

- **`lib/store.ts`**: Codex 03방이 CX-34(분리 1단계)를 하는 동안 손대지 않는다. 48-5가 `convertPermitLeadToCustomer`(전환 때 좌표 복사)를 고쳐야 하면, 그때 열린 CX-34 PR이 있는지 보고 있으면 그 병합 뒤 시작.
- 공통 규칙 — **예외 주석**: 공용 부품으로 바꾸지 않는 곳은 그 줄 바로 위에 `// shared-ui-exception: <짧은 이유>`. 마지막 점검(grep)은 이 주석이 붙은 줄을 뺀다. Codex와 같은 규칙.
