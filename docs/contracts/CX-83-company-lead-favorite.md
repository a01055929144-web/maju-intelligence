# CX-83 회사 공유 리드 즐겨찾기 계약

상태: 서버·DB 검토 초안. 운영 DB 적용 및 기능 활성화 금지.

## API

`PUT /api/leads/{leadId}/favorite`

요청 본문은 `{ "starred": boolean, "companyId"?: uuid }`이다. 고객 세션은 본문의 `companyId`를 신뢰하지 않고 인증된 회사로 고정한다. 관리자 세션만 기존 중앙 인증 규칙에 따라 명시 회사를 선택할 수 있다.

성공 응답은 다음 공유 상태를 반환한다.

```json
{
  "favorite": {
    "leadId": "uuid",
    "starred": true,
    "starredAt": "2026-11-17T00:00:00Z",
    "starredByName": "담당자 이름",
    "starredByUserId": "uuid-or-null"
  }
}
```

- `FEATURE_LEAD_FAVORITES=true`와 `FEATURE_LEAD_FAVORITES_COMPANY_IDS` 회사 허용 목록이 모두 일치해야 한다. 기본값은 OFF다.
- 같은 회사·리드에 `starred=true`를 반복하면 최초 표시자와 최초 표시 시각을 보존한다.
- `starred=false`를 반복해도 성공하며 상태는 계속 해제다.
- 다른 회사의 리드 ID는 `404`로 처리한다.
- 익명 요청은 `401`, 비활성 회사는 기능 존재를 감추기 위해 `404`다.
- 인증됐지만 `manage_customers` 권한이 없으면 `403`이다.

`GET /api/leads/favorites?leadId={uuid}&leadId={uuid}`는 목록·표·상세가 한 번에 최대 100개 리드의 현재 즐겨찾기를 읽는 경로다. 응답에는 즐겨찾기인 행만 들어가며, 빠진 리드는 `starred=false`로 해석한다. 고객 세션의 회사는 인증값으로 고정되고 다른 회사 행은 반환하지 않는다.

## 저장·권한

`company_lead_favorites`의 기본 키는 `(company_id, lead_id)`이며 리드의 동일 복합 키를 참조한다. RLS를 켜고 `anon`, `authenticated` 직접 권한을 제거한다. 서버의 `service_role`만 테이블과 `set_company_lead_favorite_v1` 함수를 사용할 수 있다.

## UI 의존성

이 변경에는 목록·표·상세의 별 버튼과 `★만` 필터가 포함되지 않는다. 후속 UI는 위 GET으로 현재 상태를 읽고 PUT 성공 응답으로 해당 행을 갱신한다. 해당 UI는 CX-79/80 리드 지도 UI 병합 뒤 소유권을 조정한 후 별도 변경으로 연결한다.
