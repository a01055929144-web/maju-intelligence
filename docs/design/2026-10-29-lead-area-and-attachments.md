# 리드 매장 면적·파일 저장소 설계

## 현재 구현 경계

- 행정안전부 원천 `LCTN_AREA`, 서울 원천 `SITEAREA`를 ㎡로 읽는다.
- 빈값, 0/음수, 비숫자, 100,000㎡ 초과 값은 미확인으로 처리한다.
- DB에는 원본 단위인 `store_area_sqm`만 저장하고, 평 표시는 `㎡ / 3.3058`을 소수 첫째 자리로 반올림한다.
- `LEAD_STORE_AREA_ENABLED`와 `NEXT_PUBLIC_LEAD_STORE_AREA_ENABLED`가 모두 기본 OFF다. SQL 미적용 상태에서는 ingest payload에 컬럼을 넣지 않고 지도 규모 칩도 기존 준비 중 상태를 유지한다.
- 기존 행 일괄 백필은 포함하지 않는다. 승인 후 새 수집분으로 분포와 이상치를 확인한 뒤 별도 백필 계획을 만든다.
- 현재 지도 리드 로드는 `listPermitLeads` 기본 상한 3,000건(최대 5,000건)의 클라이언트 목록이다. 따라서 규모 칩은 전체 DB가 아니라 로드된 목록만 필터링한다. 플래그 활성화 전 API에 `store_area` 구간 파라미터와 PostgREST 서버 필터를 추가하고, total count도 같은 조건으로 계산해야 한다.

## 파일 저장소 재사용 검토

`customer-attachments` Storage 버킷은 private 업로드, MIME/50MB 제한, 경로 정규화, 짧은 signed URL 패턴을 재사용할 수 있다. 그러나 `customer_attachments.customer_id`는 필수이고 거래처 FK이므로 리드 파일 메타데이터를 그 테이블에 억지로 넣으면 소유권 모델이 깨진다.

최신 main의 기존 제안서 `docs/lead-file-storage-proposal.md`가 이미 이 결론과 전환 추적·soft delete 정책을 담고 있으므로 이를 기준안으로 재사용한다. 같은 private 버킷에 `companyId/leads/leadId/...` 경로를 사용하고, 메타데이터는 별도 `lead_attachments` 테이블에 둔다. 허용 유형은 사업자등록증·간판·매장사진·기타로 제한한다. 기존 `NEXT_PUBLIC_LEAD_NATIVE_ATTACHMENTS_ENABLED=false`를 유지하며 별도 중복 플래그는 만들지 않는다.

## 인증·보존·감사

- 업로드/목록/열람 모두 요청 본문의 회사 ID를 신뢰하지 않고 인증 세션에서 company ID를 파생한다.
- company+lead 복합 FK와 담당 리드 접근 검사를 모두 통과해야 한다.
- 사업자등록증은 기존 `sensitive_access_logs.item_type=business_registration`을 리드 ID와 함께 사용한다. 감사 플래그 ON 상태에서는 감사 저장 실패 시 signed URL을 발급하지 않는다.
- 원본 파일은 공개 URL을 만들지 않고 signed URL만 사용한다. 응답은 `Cache-Control: no-store, private`로 제한한다.
- 삭제/보존 기간은 법무·운영 승인 전 자동화하지 않는다. 리드가 거래처로 전환될 때 복사/이관/중복 보존 중 어떤 정책을 쓸지 결정이 필요하다.

## 활성화 전 검증

1. SQL 초안을 검토·승인하고 정식 migration으로 생성한다.
2. 새 컬럼의 Data API grant와 RLS/서비스 역할 경계를 확인한다.
3. 제한된 테스트 회사에서 새 수집분의 면적 빈값·최소·최대·분포를 확인한다.
4. 지도 평 표시와 다섯 구간의 경계값을 검증한다.
5. 파일 업로드, 교차 회사/비담당자 거부, path traversal 거부, 사업자등록증 감사 fail-closed를 검증한다.
6. 검증 완료 뒤에만 서버·클라이언트 플래그를 함께 켠다.
