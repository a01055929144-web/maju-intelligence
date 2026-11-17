# 인수인계 — Claude Code 컨트롤타워 → Codex 컨트롤 (2026-11-17 16:5x)

Claude 토큰이 거의 다 떨어져서 컨트롤타워 일을 Codex 컨트롤방이 이어받습니다. 이 문서 하나로 지금 상태를 알 수 있게 적었습니다.

## 1. 먼저 읽을 것 (순서대로)
1. `AGENTS.md` · `CLAUDE.md` 1절(작업 환경 · 승인 경계)
2. `docs/dispatch/README.md` + 현황판(최신 `*-board.md`)
3. 오늘 지시서: `docs/dispatch/2026-11-17-R6-codex.md` · `R7-codex.md` · `R8-codex.md` · `R7-claude-code.md` · `R8-claude-code.md`
4. **주문 돈 안전 점검표** `docs/work-orders/2026-11-17-order-money-safety-gate.md` — 주문 · 전표 · 원장 · 재고 PR은 이 표를 채워야 병합
5. 와이어프레임 목록 · 진행률 `docs/work-orders/2026-11-17-wireframe-index.md` (점검 근거: `2026-11-17-wireframe-audit.md`)
6. 단계 체크리스트 `docs/work-orders/2026-11-08-stage-checklist.md` ("지금 상태 15:3x")

## 2. 지금 운영 상태
| 항목 | 값 |
|---|---|
| 운영 배포(READY) | `665579c` (#1005까지) — 11/17 오후. 그 뒤 main 병합분은 **문서뿐**(#1011~#1021) |
| 직전 READY(되돌릴 곳) | `ec4876c` (#999) |
| Vercel | 프로젝트 `prj_IcltSvkqDzpywlaZYHUjwRBmfBvJ` · 팀 `team_MI9LCOMsqu2mjTlQghDmzY2D` · Git 자동 배포 꺼짐 |
| 운영 DB | `fcmdvveqmcgtioelzqun` |

### 오늘 운영 DB에 적용한 것 (모두 기록 있음 `docs/work-orders/db-approval/`)
| 시각 | 초안 | 내용 | 기록 |
|---|---|---|---|
| 12:57 | `2026-11-17-purchase-date-replace.sql` | 매입가 날짜별 바꿔 넣기(같은 날짜 새 업로드 → 옛 행 무효 · 단가 이력 보관 후 교체 · 되살리기 가능) | `2026-11-17-purchase-date-replace-applied.md` |
| 15:27 | `2026-11-17-CX-58-customer-business-identity.sql` | 매출처 사업자 상호 · 종사업장번호 | Codex 기록 (※ 두 번 적용 시도 — 내 쪽 롤백, 감사 행만 보탬) |
| 16:06 | `20261117-S-2a-account-order.sql` | 매장 직접 주문 · 장바구니 · 즐겨찾기 | `2026-11-17-S-2a-applied.md` |

### 켜 둔 기능 플래그 (제이에스리테일 `04ebb7bb-8da0-4723-8211-f2a947939344`만)
STORE_PROFILE_SETTINGS · STORE_ORDER_HISTORY · STORE_RECEIVED_DOCUMENTS_HOME · DRIVER_SALES_STOPS · ROUTE_SALES_STOPS · DRIVER_RECEIPT_WORKFLOW · ERP_ORDER_DOCUMENTS · DELIVERY_ORDER_PHOTOS

- 주의: 예전 `lib/erp-order-documents-feature.ts`는 `ERP_ORDER_DOCUMENTS` + `ERP_ORDER_DOCUMENTS_COMPANY_IDS`를 읽는데 **둘 다 비어 있어 ERP 전표 자동 생성은 사실상 꺼짐**. 테스트 주문으로 전표가 생긴다고 안내하지 말 것.

### 오늘 고친 것 (배포됨)
- 지도 멈춤: #994 · #995 (mapRef 없을 때 조용히 끝나던 것 → 감시 타이머 재시도 · 대체 화면). #987은 원인 아니었음(#992 되돌림 뒤에도 재현)
- 매입가 업로드: 날짜 뒤 "-1" 제거(#989) · 날짜별 바꿔 넣기(#990) · 매입처 자동 연결(#998) · (주)/주식회사 표기 같은 매입처로(#999)

## 3. 열린 PR (16:5x)
| PR | 내용 | 할 일 |
|---|---|---|
| #1015 | [CX-62] 접수 때 주문 · 전표를 한 트랜잭션에서 확정 (09) | **돈 안전 점검표로 검토 후 병합.** 접수 = 단일 원자 RPC · 중복 접수 막기(멱등 키) · 금액 서버 재계산 · 테넌트 확인 · 실패 시 전부 롤백 확인. DB 변경이 있으면 초안+down+PG17 → 대표 승인 문구 |
| #1016 | CC-73 매출처 · 매입처 공용 거래처 틀 첫 조각 (Claude Code) | Claude Code가 못 이어 가면 Codex 07이 이어받기. 화면만 · DB 변경 없음 |
| #1020 | [CX-57] 공공데이터 "변경 없음"도 성공 처리 | CI 초록이면 병합 |
| #1008 | [S-2a] 승인 선행 조건 기록 | S-2a는 이미 적용됨 → 문서만 맞추고 병합 또는 닫기 |

## 4. 남은 일 (우선순위)
1. **CX-62 (#1015) 검토 · 병합** — 주문은 돈이 걸림. 점검표 전 항목 통과 전에는 병합 금지.
2. **R8 Codex 진행 확인**: CX-65 기사 남은 것(01) · CX-66 출고 준비 · 인쇄 3종(06) · CX-67 주문 상세(09) · CX-68 돈 안전 시험(PG17) · CX-69 입출금 · 겸업 상계(07).
3. **R7 Codex**: CX-63 매장 PC 단가표 · 견적서 · 전체 상품 + 최근 출고가 · CX-64 매출 · 매입 전표 쉽게 삭제(주문 링크 밖 주문 포함).
4. **CC-73** 거래처 화면 통일(위 #1016).
5. 기능이 배포되면 와이어프레임 캔버스 상태(● ◐ ○)와 `wireframe-index.md`를 같이 고치기 (규칙은 그 문서 끝).
6. **11/18 08:12** 공공데이터 동기화 확인(예약 작업 있음).

## 5. 대표 결정 대기 (먼저 여쭤볼 것)
1. **매출 전표 시점** — 제안: 접수 = 작성중, 출고 확정 = 확정. CX-62 · CX-66이 여기에 걸림.
2. **매장 결제** — 지금 후불만. 선입금 · 카드 · 예치금은 결정 뒤(돈 움직이는 기능 = 대표 승인).
3. **ERP 메뉴 나누기** — 관리자 화면 ErpMap 보드가 대기 중.

## 6. 와이어프레임 (기능별 캔버스 — 앞으로 여기서만 고침)
| # | 캔버스 | 진행률 |
|---|---|---:|
| 00 | 공통 https://claude.ai/artifact/QDusJ4dAqqLE9aemquaYGZ | 83% |
| 01 | 관리자 https://claude.ai/artifact/27vx4S5C6ThBZy5Q2Z8vMf | 81% |
| 02 | 영업 https://claude.ai/artifact/7u4NPFtRfMLGCVA9ANaVnm | 100% |
| 03 | 지도 · 동선 https://claude.ai/artifact/NzGNSy1QkdMjJDfgpVivGB | 100% |
| 04 | 매입가 · 카탈로그 · 마진 · 행사 https://claude.ai/artifact/5QRfW8wKSPTCGnsEgFmmrE | 95% |
| 05 | 단가표 · 견적서 · 링크 https://claude.ai/artifact/Bqt9ye5WFzEhtBVpJGsAFD | 88% |
| 06a | 매장 https://claude.ai/artifact/NfA5ZR2VGUM6St5hM2pucY | 54% |
| 06b | 기사 https://claude.ai/artifact/1V29sWQrH9HBLo5G5VW11a | 57% |
| 07 | 주문 · 출고 · 인쇄 https://claude.ai/artifact/5yTfURXVLkvbR9r4L3kYTA | 33% |
| 08 | ERP · 거래처 · 정산 https://claude.ai/artifact/4qyaTbLQEKRoBBrBfJB8ZG | 62% |
| | 합계 104화면 (● 58 · ◐ 32 · ○ 14) | **71%** |

※ 매장 ③ 주문 조건 확인 · ⑦ 기간 지난 단가표는 코드로 확인 못 해 "◐ 확인 필요". 캔버스는 대표 계정 소유 — Codex가 직접 못 고치면 상태 변경을 문서에만 적고 대표/Claude에 넘김.

## 7. 꼭 지킬 규칙 (오늘 생긴 것 포함)
- 운영 DB 변경: 초안 + down + PG17 → **대표 승인 문구(프로젝트 id 포함)** → **현황판에 "적용 잠금" 줄 먼저** → 잠근 쪽만 적용 → 한 트랜잭션(`lock_timeout 3s`) + `admin_audit_logs` 한 줄 → 읽기 확인 → `db-approval/` 기록. (CX-58 이중 적용 뒤 생긴 규칙)
- 06:00~07:30 KST 운영 데이터 변경 금지.
- 배포는 대표 지시 때만, 병합분 모아서 한 번(장애 수정만 단독). 배포 뒤 스모크: `/login` `/dashboard` `/leads` `/revenue/pricing/*` `/revenue/products` `/store`, 회귀 시 직전 READY로.
- PR 첫 줄 `Ponytail: …`. 한 PR = 한 고객 행동. 새 기능 기본 OFF + 회사 allowlist.
- 비밀값 · 개인정보 출력 금지. 카톡 · 문자 자동 발송 금지. 테스트엔 가짜 값만. Vercel Hobby `maxDuration ≤ 60`.
- `lib/store.ts`는 03번 방 소유. 지도 · 공용 표 · 모바일 부품은 Claude Code 몫(지금은 Codex가 이어받아도 됨 — 현황판에 담당 바꿔 적기).
- 로컬 main은 갈라져 있음 → 작업은 항상 `origin/main`에서 새 worktree.
- 보고는 한국어, 끝에 진행률 표.

## 8. 진행률
| 영역 | 상태 | 진행률 |
|---|---|---:|
| 매입가 업로드 파이프라인 | 배포 완료 | 100% |
| 지도 멈춤 | 배포 완료 | 100% |
| 오늘 운영 DB 3건 | 적용 · 기록 완료 | 100% |
| 와이어프레임 기능별 정리 | 완료 | 100% |
| 화면 구현(와이어프레임 대비) | 진행 중 | 71% |
| CX-62 주문 접수 원자화 | PR 검토 대기 | 50% |
| 대표 결정 3건 | 대기 | 0% |
