# CX-89 매입 이력 줄 정정·삭제·수동 추가 승인표

상태: **운영 미적용 · 대표 승인 대기**. 대상 프로젝트 `fcmdvveqmcgtioelzqun`.

- 변경: 기존 `purchase_receipt_line_overrides`에 수량·논리삭제 2열, 기존 감사 이벤트 재사용, 단일 RPC 추가.
- 보존: 원본 `purchase_receipt_lines`는 수정·삭제하지 않으며 기존 데이터 자동 정리 없음.
- 돈 안전: 정정 줄이 해당 품목의 최신 날짜일 때만 남은 이력에서 현재 매입가를 다시 고르고 판매가 재계산. 남은 이력이 없거나 과거 날짜 정정이면 현재가·판매가 유지.
- 격리: 회사 잠금·회사별 상품 확인, service role만 실행, 사유 5~500자·revision 충돌 검사.
- 시험: PostgreSQL 17에서 합성 1,369행, 과거/최신 정정, 논리삭제, 수동 추가, 감사 4건, 원본 보존 확인.
- 적용: `docs/sql-drafts/2026-11-18-cx89-purchase-history-edits.sql`
- 롤백: `docs/sql-drafts/2026-11-18-cx89-purchase-history-edits.down.sql` (새 감사 기록 존재 여부를 먼저 확인).

승인 문구: `fcmdvveqmcgtioelzqun CX-89 매입 이력 편집 SQL 적용 승인`
