# CX-128 A QR 표시 저장 선행 SQL (승인 초안)

Ponytail: 사용함

A는 기존 pricing_documents.content.display.qr에 두 enum만 저장한다. 가격·게시 버전·링크·QR 이미지는 쓰지 않는다. 그런데 현재 pricing_p1_clean은 display를 화이트리스트로 재작성하므로 QR 키가 다음 일반 저장 때 빠진다. 이 선행을 제외한 일시적 PATCH를 영속 저장 완료로 보지 않는다.

## 최소 변경

- 현재 cleaner 정의를 pricing_p1_clean_before_qr_display_v1로 복사하고, 원래 pricing_p1_clean OID·owner·ACL을 유지한 얇은 wrapper로 교체한다.
- 기존 cleaner의 반환값을 그대로 쓴 뒤 유효한 QR 위치/크기 두 값만 display에 붙인다. QR이 없는 기존 요청 결과는 완전히 같다. 단가·세금·행사 정리는 기존 cleaner 그대로다.
- capability RPC pricing_document_qr_display_contract_v1()는 wrapper가 실제 연결돼 있을 때만 1을 반환한다. service_role만 실행.
- 앱의 QR 읽기·저장은 기본 OFF+인증 회사 목록, capability=1을 모두 요구한다. SQL 미적용/교체 시 503으로 차단하며 저장된 척하지 않는다.
- SQL up은 기존 문서/버전/링크 행을 전혀 수정하지 않는다. 새 테이블·컬럼 없음. 현재 함수 정의에 표시/하단 글꼴 선행이 없거나 백업 이름 충돌/브라우저 실행 권한이 있으면 거절한다. 적용 직전 실제 함수·의존·owner/ACL 대조는 운영 담당자의 별도 승인 관문이다.

## down

미사용 상태에서 원래 cleaner 정의를 같은 OID에 정확히 복원하고 추가 함수만 제거한다. 저장된 QR 설정이 draft/version에 한 건이라도 있으면 down을 거절해 설정을 지우지 않는다. 먼저 회사 기능 OFF, 사용 중 설정의 보존·전환 계획은 별도 승인으로 정한다. 부모 VAT/표시 SQL down보다 이 계약을 먼저 검토해야 한다.

## PG17

전용 workflow가 이름 고정 일회용 document_qr_display_test에서 기존 실제 VAT/footer fixture를 재사용한다. 12조합·기존 cleaner 결과 대비 QR 외 필드 동일·일반 pricing_p1 save 뒤 보존·기존 발행본 불변/새 게시 0·권한·OID/owner/ACL·미사용 exact down·사용 중 down 거절을 검증한다. 운영 키/데이터 없음. 결과는 PR CI에 기록한다.

## 운영 경계

SQL 초안+down+PG17까지만. 운영 프로젝트 쓰기·SQL 실행·환경 등록·기능 ON·배포 없음. 코드/SQL 검토 병합과 운영 적용은 다르다. FEATURE_DOCUMENT_QR_DISPLAY_COMPANY_IDS는 비어 있는 상태를 유지하며 대표 운영 승인 전에는 켜지 않는다. C는 대표 최신 직접 지시대로 제외.
