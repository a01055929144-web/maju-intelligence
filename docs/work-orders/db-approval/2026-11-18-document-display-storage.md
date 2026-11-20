# 문서 표시 설정 저장 — SQL 승인 검토 초안

2026-11-18. 운영 적용 미승인·미실행. 목표는 문서에서 선택한 기존 표시 설정을 저장/재열기/새 발행 때 보존하는 한 행동이다. 새 부가세 가격 의미나 신규 문서 기본값을 여기서 바꾸지 않는다.

## 확정 원인과 제안

운영 읽기 정의의 pricing_p1_clean은 display.columns/promoLayout/info만 반환한다. 앱이 보내는 productWidth/priceIncludesTax/showTaxType/autoPromos는 사라진다. 해당 정의의 MD5는 0113d9fc542f209f3cffb97a61f482dc이며, 동일 코드만 복사한 합성 PG17 fixture에서 설정 누락을 재현했다. 운영 문서/가격/식별자는 복사하지 않았다.

함수 한 개를 CREATE OR REPLACE하여 알려진4개 표시 값만 추가 화이트리스트로 보존한다. bool은 JSON true일 때만 true, 누락/잘못된 타입은 false. productWidth는 기존 앱과 동일하게45~80/기본65. 기존 columns/promoLayout/info와 품목/가격/행사 정규화·권한·수정 번호·현재300줄 상한은 유지한다. 새 업종·고객/가격 출처 필드와 비고 서식은 이 초안 범위가 아니다.

| 승인 항목 | 내용/상태 |
|---|---|
| 대상 프로젝트 | fcmdvveqmcgtioelzqun — 명시한 별도 대표 승인 필요 |
| 대상 | public.pricing_p1_clean(uuid,jsonb) 정의1개 |
| up | docs/sql-drafts/2026-11-18-document-display-storage.sql |
| down | docs/sql-drafts/2026-11-18-document-display-storage.down.sql |
| 기존 행 UPDATE/DELETE | 없음. 행사3건 정정도 포함하지 않음 |
| 현재 초안/발행본 | 자동 변경0건. 다음 명시적 저장/발행에만 적용 |
| OID/owner/ACL | 같은 함수 교체로 유지, PG17 비교 PASS |
| 함수 정의 보호 | 예상 기존/수정 정의 외에는 트랜잭션 중단 |
| 수정 정의 MD5 | 41cf8da78afe5fedb6d06108614a07f0 |
| PG17 | tests/sql/document-display-storage.pg17.test.sql PASS, CI 검증 추가 |
| 운영 적용/기능 ON/배포 | 미실행. 컨트롤타워 적용 순서와 대표 프로젝트 명시 승인 별도 |

## 검증 및 되돌리기

네트워크 차단 합성 PG17에서 누락 재현→up→저장/발행의 설정4개 보존→기존 발행본 불변→down exact definition 복원 PASS. 기본 false를 가진 기존 문서 해석, 잘못된 bool/범위, 가격1000원의 저장값 불변, 비고 줄바꿈·알 수 없는 필드 비노출, 브라우저 execute 차단/service_role execute 및 OID/owner/ACL 보존 PASS. 운영 금액이나 실문서로 시험하지 않았다.

적용 전 컨트롤타워는 기존 정의/권한과 draft 저장본을 비공개 백업하고 hash를 다시 확인한다. 승인 후 합성 시험 문서의 설정을 선택→저장→재열기→새 발행으로 확인한다. 운영 실문서 쓰기 시험은 별도 승인 범위를 따른다.

문제가 있으면 down으로 함수 정의만 복원한다. 기존/신규 발행본·초안을 일괄 되쓰지 않는다. down 뒤 다음 저장은 기존 누락 동작으로 돌아가므로 대응 UI 변경도 함께 되돌리거나 관련 기능을 OFF한 뒤 진행한다. down을 데이터 복원으로 간주하지 않는다.

1440/390·온라인/인쇄/PNG 통합은 #1148 반영 main 위 앱 후속에서 검증한다. 이 SQL 초안만으로 사용자 여정 전체 완료나 운영 적용 완료를 주장하지 않는다. #1147(오류 분류), #1149(행사 세금)은 독립 검증/순차 병합한다.
