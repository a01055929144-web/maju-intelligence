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
| `LEAD_DOCUMENT_LINK_SECRET` | Vercel Production (Sensitive) | 2026-11-08 12:00 KST · Codex | Vercel › Settings › Environment Variables에서 새 값으로 교체 | 재배포 → 기존 리드 문서 공유 링크 다시 발급 |
| `LEAD_DOCUMENT_SHARING_ENABLED` · `LEAD_DOCUMENT_SHARING_COMPANY_IDS` | Vercel Production | 2026-11-08 12:04 KST · Codex, 전역 OFF·대표 회사만 지정 | Vercel › Settings › Environment Variables에서 전역 스위치·허용 회사 수정 | 재배포 후 비허용 회사 404 확인 |
| `FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS` | Vercel Production | 2026-11-08 01:54 KST | Vercel › Settings › Environment Variables에서 허용 회사 목록을 수정하고 Production 재배포 | 새 설정은 다음 Production 배포부터 적용 |
| `PUBLIC_DOCUMENT_ORDER_ENTRY_ENABLED` · `STORE_PUBLIC_OWNER_ONBOARDING_ENABLED` · `STORE_MEMBER_SESSION_ENABLED` | Vercel Production | 2026-11-09 15:35 KST · 대표 회사 시험용 이름 등록 | Vercel › Settings › Environment Variables에서 각 전역 스위치 수정 | 재배포 후 OFF 404와 대상 경로 확인 |
| `FEATURE_STORE_PUBLIC_OWNER_ONBOARDING_COMPANY_IDS` · `FEATURE_STORE_MEMBER_SESSION_COMPANY_IDS` | Vercel Production | 2026-11-09 15:35 KST · 대표 회사 시험용 이름 등록 | Vercel › Settings › Environment Variables에서 허용 회사 목록 수정·비우면 대상 기능 OFF | 재배포 후 허용·비허용 회사 경계 확인 |
| `STORE_OWNER_ONBOARDING_SECRET` | Vercel Production (Sensitive) | 2026-11-09 15:35 KST · 대표 회사 시험용 이름 등록 | Vercel › Settings › Environment Variables에서 새 무작위 값으로 교체 | 재배포 → 기존 가입 의도 폐기 후 원 문서에서 다시 시작 |
| `STORE_PREOPENING_ENABLED` · `FEATURE_PREOPENING_COMPANY_IDS` | Vercel Production (Sensitive) | 2026-11-10 18:04 KST · 대표 회사 가입만 ON | Vercel에서 전역 스위치 또는 허용 회사 목록 수정 | 재배포 → 사업자번호 없는 가입 확인. 주문은 별도 주소·권역 검증 통과 뒤에만 가능 |
| `STORE_PUBLIC_OWNER_DELIVERY_ENABLED` · `FEATURE_STORE_PUBLIC_OWNER_DELIVERY_COMPANY_IDS` | Vercel Production | 2026-11-10 15:18 KST 전역 스위치 OFF · 대표 회사 목록 유지 | 주문 권역·요일 설정 뒤 Vercel에서 전역 스위치 변경 | 재배포 → 기존 사업자번호 보유 점주 가입·첫 주문 확인 |
| `STORE_PUBLIC_OWNER_BASE_ADDRESS_ENABLED` · `FEATURE_STORE_PUBLIC_OWNER_BASE_ADDRESS_COMPANY_IDS` | Vercel Production (Sensitive) | 2026-11-10 18:04 KST · 대표 회사만 ON | Vercel에서 전역 스위치 또는 허용 회사 목록 수정 | 재배포 → 카카오 기본주소·상세주소 분리 저장 확인 |
| `STORE_ORDER_ADDRESS_VERIFICATION_ENABLED` · `FEATURE_STORE_ORDER_ADDRESS_VERIFICATION_COMPANY_IDS` | Vercel Production (Sensitive) | 2026-11-10 18:04 KST · 대표 회사만 ON | Vercel에서 전역 스위치 또는 허용 회사 목록 수정 | 재배포 → 권역·요일 없는 주문 차단, 설정 뒤 권역 안 주문 확인 |

| `DATA_GO_KR_SERVICE_KEY` · `NAVER_SEARCHAD_API_KEY` · `NAVER_SEARCHAD_SECRET` · `NAVER_SEARCHAD_CUSTOMER_ID` | Vercel Production (Sensitive) | 2026-11-02 22:46 · 대표 직접 | 공공데이터포털 마이페이지 · 네이버 검색광고 › 도구 › API 사용 관리에서 재발급 → Vercel 값 수정 | 재배포 |

## 대표 확인 (개발은 기본값으로 진행 중)

| 항목 | 지금 쓰는 기본값 | 상태 |
|---|---|---|
| 천년경영 참고 단가 칸 이름 | 화면 이름 `기준 단가` | 보류 |
| 2% 수수료 수금 방식 | 귀속 · 계산만 | 보류 |

## 대표 승인이 꼭 필요한 것 (임시 진행 불가)

- 운영 DB 변경: `db-approval-queue.md` 1~3번(P0 · P1 · P2 store-ordering) — **2026-11-02 적용 완료, 재실행 금지**
