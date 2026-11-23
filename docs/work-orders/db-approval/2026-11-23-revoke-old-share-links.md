# 2026-11-23 예전 단가표 공개 링크 5개 회수 (운영 데이터 변경 기록)

- 승인: 대표 11/23 14:21 "예전 링크 5개 회수 승인" (컨트롤타워 세션)
- 적용: 컨트롤타워 · 11/23 14:22:04 KST · 운영 `fcmdvveqmcgtioelzqun`
- 대상: `pricing_document_share_links` 중 문서 `3bcb1b56…`(11/18 만료된 예전 단가표)의 살아 있던 링크 5개 — id 앞 8자리 `ac090859` · `3c2fcece` · `203b22d5` · `25314b75` · `3176a439` (11/09~11/11 생성, 열람 0, 리드·발송 연결 없음)
- 방법: 앱의 "공개 링크 회수"와 같은 동작 — `revoked_at = now()` (행 삭제 없음, 되돌리려면 `revoked_at = null`)

```sql
update pricing_document_share_links set revoked_at = now()
where revoked_at is null and document_id::text like '3bcb1b56%'
  and left(id::text,8) in ('ac090859','3c2fcece','203b22d5','25314b75','3176a439');
-- 5행
```

- 읽기 검증: 살아 있는 링크 2개만 남음 — `f9c076c7`(11/22 20:19, 3매장 배포용) · `c905aad8`(11/22 21:36, 대표 확인 대기). 둘 다 이번 달 단가표 `fb4799ed…`.
- 후속: CX-130 링크 관리 목록(05방).
