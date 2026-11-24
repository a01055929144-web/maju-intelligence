# CX-137 조회수 — 운영 적용 기록 (2026-11-24)

- 대표 승인(11/24 14:35, 질문 응답): "승인, 지금 적용·배포"
- 적용자: 컨트롤타워(클라우드 Claude), `fcmdvveqmcgtioelzqun`. 초안 `docs/sql-drafts/2026-11-24-CX-137-document-view-count.sql`(sha256 앞 16 `2dd2138549b8685a`) 1회 적용.
- 사전 대조: `resolve_pricing_document_short_link_v1` 운영 본문과 초안이 조회수 블록(view_count·view 이벤트) 제거 외 동일. 접속 제한 가드·반환값 그대로.
- 읽기 검증: 짧은 주소 해석 함수에 view_count 없음, `record_pricing_document_view_v1` 생성·실행 권한 service_role(+소유자)만, share_events requester_hash null 허용 확인.
- 배포: #1385 병합 → `71d4865` 14:49 KST READY. 스모크 12곳 200, 공개 문서 잘못된 토큰 404, 오류 0.
- 결과: 짧은 주소·긴 주소 모두 공개 문서 읽기 한 곳에서 1회(같은 방문자 10분 중복 제외, 미리보기 봇 제외). 기존 조회수·이벤트는 그대로.
- 되돌리기: `.down.sql`(짧은 주소 집계 복원 + 새 함수 삭제).
