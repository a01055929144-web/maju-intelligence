# 비고 서식 — 별도 SQL/기능 승인 검토 초안

#1150의 대표 승인 요청 범위는 표시 설정4개로 고정한다. 이 후속의 비고 글자 크기/굵기는 그 승인에 포함하지 않는다. 운영 적용·ON·데이터 정정은 미실행.

| 항목 | 범위/상태 |
|---|---|
| 대상 프로젝트 | fcmdvveqmcgtioelzqun, 별도 명시 승인 필요 |
| 선행 | #1150 up 적용 후 function MD5 41cf8da78afe5fedb6d06108614a07f0 |
| 새 칸/테이블 | 없음. 기존 JSON display.footerFontSize/footerBold만 허용 |
| 함수 | pricing_p1_clean(uuid,jsonb)1개만 CREATE OR REPLACE |
| up | docs/sql-drafts/2026-11-19-document-footer-format.sql |
| down | docs/sql-drafts/2026-11-19-document-footer-format.down.sql |
| 새 정의 MD5 | aca7d3ecf0d5739246e4c1626ab3b35c |
| 예상 외 정의 | 트랜잭션 중단. #1150 미적용 시에도 중단 |
| 입력 | 글자 크기12/14/16 숫자만, 굵게는 JSON true만; 그 외 생략 |
| 과거 문서 | 서식값 없으면 기존 기본 크기/굵기 유지, 일괄 UPDATE0 |
| 발행본 | 기존 snapshot 수정0, 명시적으로 새 발행할 때만 새 서식 |
| 가격/주문/회사/역할 | 변경 없음, OID/owner/ACL 유지 |
| 기본 OFF | PRICING_DOCUMENT_FOOTER_FORMAT_ENABLED + PRICING_DOCUMENT_FOOTER_FORMAT_COMPANY_IDS |
| 운영 설정 | 등록/ON하지 않음. CI 합성 회사에만 활성화 |

## 앱 변경

기존 하단 안내 textarea의 줄바꿈을 그대로 사용한다. 기존 편집기에 기본/12·14·16px 선택과 공통 굵게 버튼만 추가한다. 스위치는 서식 편집 입구를 제어하며 이미 저장된 발행본의 서식은 OFF여도 유지한다. 저장된 값은 기존 문서 API/JSON 경로를 쓴다. 새 저장 API/가격 엔진은 없다.

온라인/A4/PNG/PDF가 쓰는 공통 PageContent의 비고 p에 같은 typography를 적용한다. #1148 인쇄 수정 위에서 큰 글자·굵기에 필요한 비고 높이만 추가 예약한다. 스타일 없는 기존 문서는 같은60자/16px 높이 계산을 유지한다. 회사 정보 줄·QR·쪽수의 크기는 바꾸지 않는다.

## 검증/되돌리기

네트워크 차단 PG17 PASS: #1150 기준에서 서식 소실 재현,12/14/16·bold·줄바꿈 저장/발행, 잘못된 타입/알 수 없는 필드 제외, 기존 표시4개/단가/발행본/OID/owner/ACL 보존, down exact hash 복원. 합성 fixture는 함수 코드만 복사했으며 운영 행/가격/식별자를 복사하지 않았다.

앱 단위·1440/390은 현재 CI 대기. E2E는96품목,12·14·16px와1·2·3열, 저장/재열기/새 발행·기존 발행본 불변, 실제 PNG 다운로드와 PDF·A4 넘침 검증을 포함한다. CI 전에는 완료로 보고하지 않는다.

문제가 있으면 편집 입구 OFF 후 down으로 #1150의 네 설정 보존 정의로 돌아간다. 기존/신규 문서 행을 되쓰지 않는다. down 이후 새 서식 저장은 지원되지 않으므로 앱 설정을 먼저 OFF한다. #1150 down을 대신 실행하거나 행사3건을 수정하는 승인은 아니다.
