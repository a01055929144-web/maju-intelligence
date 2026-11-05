# 09 — 견적서·단가표 인쇄/보관/템플릿 안내/주문 QR

Ponytail: 사용함. Owner pricing/document, related order. 회사 정보·메뉴·상품 카테고리/매입가 화면은 수정하지 않는다. 운영 데이터 쓰기·SQL 적용·env 변경·배포 없음.

## 요청별 변경과 보존

| 요청 | 확인한 원인/구조 | 변경 |
|---|---|---|
| 1 규격 잘림/단가 붙음 | 편집 종이의 truncate, 좁은 고정 규격 열, 출력 표의 불명확한 열 폭 | 규격을 줄바꿈하고 규격/단가 열과 안쪽 여백을 분리. 모바일 편집 표는 1열, A4는 지정 열 유지. 확대 글자·QR 추가 시 페이지 용량을 줄여 인쇄 영역 확보 |
| 2 삭제 | 문서→버전은 CASCADE, 링크/주문→버전은 NO ACTION FK. 물리 삭제는 기록 유실 또는 참조 오류 위험 | 목록에서 보관/복원. 발행 스냅샷·링크·주문 유지, 기존 링크 주문도 유지한다는 확인 안내. 보관 중 편집/새 발행은 SQL 초안의 trigger로 거부. 기능 기본 OFF |
| 6 템플릿/마진 그룹 | pricing_product_sets에는 product_ids 순서만, margin_groups에는 margin_bp/rounding; pricing_items와 category 연결이 가격에 반영 | 품목 템플릿과 문서 모양 추천을 구분하고 저장 단가·마진·모양을 포함하지 않는다고 안내. 현재 마진 규칙으로 불러옴. 데이터/계산식 변경 없음 |
| 8 QR | 기존 주문 링크 발급/재사용 RPC는 있지만 QR 인코더 없음 | 게시 버전 미리보기에서 거래처 선택→QR 생성→인쇄/PNG에 넣기 또는 QR PNG 저장. 기존 거래처별 링크 API/RPC 재사용 |

운영 information_schema에서 pricing_product_sets의 product_ids(uuid 배열)/kind/shared/revision, margin_groups의 margin_bp(integer)/rounding(integer), pricing_items의 group_id/direct_price/applied_* 구조를 읽기 전용 확인했다. 실제 행·개인정보는 조회하지 않았다. pricing_documents에는 archived_at이 아직 없으므로 승인·적용 전 보관 기능을 켜면 안 된다.

QR은 qrcode 라이브러리를 필요할 때만 브라우저에 불러와 로컬 생성한다. 외부 QR 서비스에 토큰을 보내지 않는다. HTTPS /store와 fragment가 있는 링크만 받으며 query 인증·다른 경로는 거부한다. 선택한 거래처와 게시 버전에 고정하고 전체 회사 공용 QR로 오인시키지 않는다. QR 삽입은 이번 인쇄/PNG 출력에만 적용하며 immutable 게시 JSON은 바꾸지 않는다. 다른 거래처를 선택하면 기존 QR 삽입을 해제한다. QR이 불필요하면 문서에서 빼되 발급 링크는 유지한다.

## SQL 승인 경계

[승인표](db-approval/20261106-pricing-document-archive-09.md), up/down은 docs/sql-drafts/20261106-pricing-document-archive{,.down}.sql. PRICING_DOCUMENT_ARCHIVE_ENABLED 기본 OFF. OFF에서는 archived_at 조회/필터와 새 RPC 호출이 없다. 보관은 링크 회수/주문 취소가 아니며 필요할 때 기존 링크 관리에서 별도로 처리한다. 삭제 기능의 안전한 대체인 보관이므로 영구 삭제는 제공하지 않는다.

## 검증

- PG17 폐기용 DB: 회사/작성자/단가표 manager/수정 버전, 보관 중 편집·발행 차단, 발행본·링크·주문 보존, 복원, up/down/up.
- 단위: 기본 OFF·명시 boolean·회사/actor 위조 무시·보관 목록 필터·실제 QR PNG 생성·잘못된 링크 거부·페이지별 품목 보존.
- PC1440/390px × 견적/단가표: 긴 규격·3열 편집/출력·130% 글자·A4 높이·QR 생성/삽입/다운로드·보관 오류 후 재시도/복원. 합성 PNG/PDF는 CI 산출물이며 실데이터를 넣지 않는다.
- 기존 전체 unit/lint/타입 검사/build/인증 경계/브라우저 회귀를 실행한다. 로컬 .next EPERM/포트 제약은 기존 환경 문서에 따라 production build와 화면 검증을 CI에서 수행한다.

미완료로 남는 운영 항목은 보관 SQL 명시 승인·적용·기능 활성화다. 이 PR에서 자동으로 진행하지 않는다. Superpowers·Security Audit 미설치. React checklist로 신규 조건부 훅/렌더 중 요청 없음, QR 지연 로드·공통 Button·입력 레이블·busy/오류·44px 동작을 확인한다.
