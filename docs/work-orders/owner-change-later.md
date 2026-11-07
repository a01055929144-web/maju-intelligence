# 대표가 나중에 바꿀 것 · 확인할 것 (값은 쓰지 않는다)

AGENTS.md 0-0-2에 따라 개발을 멈추지 않으려고 임시로 넣은 항목을 기록한다. **값은 절대 적지 않는다.**

## 임시로 넣은 설정 · 비밀값

| 이름 | 어디 | 넣은 시각 · 누가 | 바꾸는 방법 | 바꾼 뒤 할 일 |
|---|---|---|---|---|
| `STORE_LINK_SECRET` | Vercel Production (Sensitive) | 2026-11-02 12:11 KST · Codex | Vercel › Settings › Environment Variables에서 값 수정 | 재배포 → 이미 보낸 매장 링크 다시 발급 |
| `STORE_PUBLIC_BASE_URL` | Vercel Production | 2026-11-02 12:11 KST · Codex | 같은 곳 | 재배포 |
| `PRICE_SHEETS_ENABLED` · `STORE_ORDERING_ENABLED` | Vercel Production | 2026-11-02 12:11 KST · Codex | `false`로 바꾸면 전체 꺼짐 | 재배포 |
| `FEATURE_PRICING_COMPANY_IDS` · `FEATURE_STORE_ORDERING_COMPANY_IDS` | Vercel Production | 2026-11-02 12:11 KST · Codex | 회사 ID를 쉼표로 추가 · 비우면 꺼짐 | 재배포 |
| `PURCHASE_RECEIPT_CORRECTIONS_COMPANY_IDS` | Vercel Production | 미설정 · 기본 OFF | 정정 SQL 승인·적용·검증 뒤 허용할 회사 ID만 지정 | 재배포 후 정정 화면 확인 |
| `FEATURE_PURCHASE_COST_BATCH_COMPANY_IDS` | Vercel Production | 2026-11-07 20:15 KST · 대표 회사만 지정 | Vercel Production에서 허용 회사 ID 목록 수정 후 재배포 | 저장·복구 RPC 운영 확인 완료, 파일 전체 흐름 확인 대기 |
| `FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS` | Vercel Production | 2026-11-08 01:54 KST | Vercel › Settings › Environment Variables에서 허용 회사 목록을 수정하고 Production 재배포 | 새 설정은 다음 Production 배포부터 적용 |

| `DATA_GO_KR_SERVICE_KEY` · `NAVER_SEARCHAD_API_KEY` · `NAVER_SEARCHAD_SECRET` · `NAVER_SEARCHAD_CUSTOMER_ID` | Vercel Production (Sensitive) | 2026-11-02 22:46 · 대표 직접 | 공공데이터포털 마이페이지 · 네이버 검색광고 › 도구 › API 사용 관리에서 재발급 → Vercel 값 수정 | 재배포 |

## 대표 확인 (개발은 기본값으로 진행 중)

| 항목 | 지금 쓰는 기본값 | 상태 |
|---|---|---|
| 천년경영 참고 단가 칸 이름 | 화면 이름 `기준 단가` | 보류 |
| 2% 수수료 수금 방식 | 귀속 · 계산만 | 보류 |

## 대표 승인이 꼭 필요한 것 (임시 진행 불가)

- 운영 DB 변경: `db-approval-queue.md` 1~3번(P0 · P1 · P2 store-ordering) — **2026-11-02 적용 완료, 재실행 금지**
