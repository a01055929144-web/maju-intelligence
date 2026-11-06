# 09 리드 문서 공유 런타임 — 기본 OFF

기준 main 582ab2a. SQL 소유/승인은 별도 Draft #285 (71cbc9f)이며 이 구현은 운영 DB 적용·기능 활성화·배포 승인이 아니다.

## 변경과 보존

- 기존 문서 API에 prepare-share/revoke-share, 기존 record-send에 선택 shareLinkId를 추가한다. prepare는 발송 행이나 리드 액션을 만들지 않는다.
- 같은 전달의 UUID 키를 준비/발송에서 재사용한다. 준비 또는 발송 연결 응답 유실 시 같은 입력으로 재시도한다. token/publicUrl은 DB에 저장하지 않는다.
- 문서 작성기의 리드 문맥에서 게시 버전 선택 → 링크 준비/복사 → 실제 전달 확인 → 기존 발송 기록을 제공한다. 회수는 새 조회를 막으며 이미 전달된 인쇄물 삭제를 약속하지 않는다. 템플릿 ID pricing-doc-paper-v1은 재사용하는 출력 부품을 가리킨다.
- 공개 셸 /pricing-document는 fragment 토큰을 같은 출처의 /api/pricing-documents/public POST로만 전송한다. HTML/OG에 리드/회사/가격을 넣지 않는다. cache private,no-store, no-referrer, noindex. 공개 응답은 고정 게시 버전의 판매 출력 whitelist와 링크 만료 시각뿐이다.
- PricingDocPaper의 읽기 전용 출력 옵션은 기존 PageContent를 재사용한다. showPrice=false/문서 가격 만료는 price:null, 링크 하드 만료/회수/병합 리드/보관 문서/외부 quote 작성자 불일치는 전체 404다. 실패 시 이전 화면의 가격을 재사용하지 않는다.
- 회사 내부 공동 읽기 #261, 기존 문서 쓰기 권한, legacy /quote, customer /store, 05 버튼, 수락·협의 단가·회원 인증·주문 활성화는 바꾸지 않는다.

## 적용 전 의존성

1. #285의 신규 테이블·trigger 운영 승인 및 적용(기존 P1/S2와 triple UNIQUE, S2 request guard 선행). 이번 브랜치에 SQL 초안을 복사하거나 운영 migration을 만들지 않는다.
2. LEAD_DOCUMENT_SHARING_ENABLED 기본 false + 비어 있지 않은 명시적 LEAD_DOCUMENT_SHARING_COMPANY_IDS + 기존 PRICE_SHEETS_ENABLED/회사 PRICING. OFF/허용 목록 공백이면 새 테이블 조회 없음.
3. 별도 서버 전용 LEAD_DOCUMENT_LINK_SECRET 최소 32바이트. HMAC 목적 lead-document-link-v1, 요청자 HMAC 별도 목적. store 목적 토큰을 허용하지 않는다. 키 변경 시 기존 URL 자동 교체 없이 회수·재발급한다.
4. 컨트롤타워의 gateway/WAF IP별 60회/분 제한 확인. 현재 middleware matcher는 새 공개 경로를 포함하지 않아 예외 변경이 필요 없다. 코드에 임의 middleware/운영 설정 변경 없음.
5. 기존 S2 guard에서 준비 회사/작성자 10회/분, 공개 열람 회사/요청자 20회/분. 플랫폼이 관리하는 Vercel IP 헤더만 사용하며 일반 forwarded 헤더는 무시한다. 신뢰 IP를 얻지 못하면 회사별 공용 요청자 버킷으로 더 보수적으로 제한한다. body 실제 바이트 1KiB, token 200 ASCII 문자, 게시 품목 기존 300 한도. 요청 감사 보존 정책은 운영 담당 확인 대상이다.

## 검증 구성

단위 검증은 회사/작성자/리드/고정 버전, 준비·전달 분리, 동시 재시도/응답 유실 복구, 키 변경·변조·타 목적 토큰, KST 만료·가격 숨김·행사 품절, 원가/개인 정보 canary, 429/503·회수를 검사한다.

CI PG17은 #285 고정 커밋을 별도 경로에 읽기 체크아웃한다. 원본 실제 P0/P1/P2/S2 migration 호환·권한 시험을 실행한 뒤, 런타임과 같은 서비스 역할의 upsert/링크 연결/조건부 열람 업데이트·요청 한도를 추가 확인한다. 두 독립 psql 연결로 같은 준비/전달 키를 동시에 넣고 한 링크/한 발송·연결로 수렴하는지도 확인한다. 운영 DB 접속 및 전체 운영 스키마 검증이 아니다.

브라우저는 합성 데이터로 1440/390px sheet/quote 작성→게시→준비 응답 유실 재시도→복사(발송 아님)→명시적 전달 기록 응답 유실 재시도→별도 공개 열람→실패 가격 숨김→문서 가격 만료→회수 후 차단을 검사한다. 실제 카카오/메일 발송은 하지 않는다.

실제 실행 결과는 PR 본문에서 확정한다. 기능 ON·운영 SQL·다음 묶음 배포는 컨트롤타워의 별도 진행 사항이다.
