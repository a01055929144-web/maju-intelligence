# 비브 유통사 가져오기 묶음 되돌리기 — 2026-11-12 14:24 KST 적용

- 승인 문구(대표, 원문): `fcmdvveqmcgtioelzqun 비브 유통사 가져오기 묶음 c2a42d22 되돌리기 승인`
- 적용: 컨트롤타워, 단일 트랜잭션(`lock_timeout 3s`), `admin_audit_logs` action=`lead_import_batch_undone` 같은 트랜잭션.
- 이유: CC-21 유통사 저장(`/api/leads/import-distributors`)이 표준 칸만 저장하고 나머지 약 20칸(리드소스·최근접촉일·미팅수·1~5차·미팅메모·다음액션내용·매칭/중개 상태·매장수·메모류)을 버림. 원본 줄(raw_payload)도 없어 복구 불가 → 수정 후 재업로드.
- 사전 점검: 묶음 리드 3,622건에 연결된 연락 기록·문서 발송·필드 변경·연락 금지·병합·출처 기록 모두 0건.
- 내용: 화면 되돌리기(DELETE)와 같은 동작 — `lead_import_batch_items` 3,622 삭제 · `business_permit_leads`(import_batch_id=c2a42d22…, target_type=distributor) 3,622 삭제(건수 불일치 시 중단) · `lead_import_batches.undone_at` 기록.
- 유지: 비브 기존 리드 4,894건, 커스텀 칸 설정 3개(취급 품목·사용 ERP·다음 연락일).
- 사후 읽기: 비브 유통사 0 · 비브 전체 리드 4,894 · 묶음 항목 0 · undone_at 14:24:31 · audit removed_leads=3622.
- 재업로드: CC-21 가져오기 수정(나머지 칸 커스텀 저장·별칭·CSV 인코딩·되돌리기 목록) 배포 후, 대표가 같은 파일로.
