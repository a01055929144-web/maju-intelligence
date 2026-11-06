# 09 리드용 게시 문서 공유·열람 경계 — 승인 초안

> 2026-11-06 · **Draft / 신규 승인 전 운영 SQL 실행·기능 ON 금지**. 소유 09 pricing.
> 기준 main `1fee44b`(#282), 작성기 진입은 별도 PR #284. 이 문서는 설계와 SQL 초안이며 공개 URL 기능 구현 완료가 아니다.
> 운영 프로젝트 `fcmdvveqmcgtioelzqun` 대상 새 명시 승인이 필요하다. 기존 S2/record-send 승인을 확장 해석하지 않는다.

## 1. 재사용과 최소 추가

- 기존 `pricing_documents`의 sheet/quote, 불변 `pricing_document_versions`, `pricing_document_sends`, `documentOutput`/`withLivePromotions`, `PricingDocPaper`와 인쇄 CSS를 재사용한다.
- `/quote/[token]`은 legacy `sales_quotes`이고 `/store`·`storefront_links`는 기존 거래처 주문 경로다. 둘을 리드 링크로 전용하거나 customerId를 가짜로 채우지 않는다.
- 링크 준비는 전달 전에 필요하지만 `pricing_document_sends`는 실제 전달 확인 후에만 생성한다. 따라서 **문서 본문을 복제하지 않는 링크 메타데이터 테이블 하나**만 제안한다. 별도 문서 서비스·전송 사업자·주문 기능은 추가하지 않는다.
- SQL: [up](../../sql-drafts/20261106-09-lead-document-share.sql), [down](../../sql-drafts/20261106-09-lead-document-share.down.sql). migration 파일·중앙 승인표·03 수락 SQL·05 파일은 수정하지 않는다.

## 2. 05 소비 계약 — 준비와 실제 전달을 분리

아래 액션은 **승인 후 구현 제안**이다. 현재 #282의 `record-send`는 아직 `shareLinkId`를 받지 않고 `publicUrl:null`을 반환한다.

1. 인증된 기존 `/api/pricing-documents`에 `prepare-share` 추가: `{documentVersionId, leadId, idempotencyKey, ttlDays?:14}`. 이 액션은 회사 내부 조회가 아니라 **외부 공유 링크 발급**이다. 초안 정책으로 같은 회사, 작성자의 quote 또는 읽을 수 있는 sheet, 병합되지 않은 리드만 허용한다. 새 초안을 자동 저장/게시하지 않는다.
2. 준비 성공의 `result`: `{shareLinkId, sendId:null, documentId, documentVersionId, publicUrl, expiresAt, deliveryRecorded:false}`. 제안 URL은 **`/pricing-document#<token>`**이다. 링크 생성·복사·파일 저장만으로 발송 완료/리드 상태 변경을 기록하지 않는다.
3. 실제 전달을 확인한 뒤 기존 `record-send`에 선택 `shareLinkId`와 `delivered:true`를 보낸다. 기존 입력(실제 templateId/channel, 대상 leadId, documentVersionId, 동일 전달 건의 idempotencyKey)은 보존한다.
4. 연결 확인까지 성공한 `result`: **`{sendId, documentId, documentVersionId, publicUrl}`**. publicUrl은 준비한 URL이며 customer 주문 URL이 아니다. 공유 링크 없는 기존 record-send 호출은 계속 null이다.
5. 발송 행 저장 후 링크 연결이 실패하면 `503`과 같은 키 재시도 안내를 반환한다. 같은 키로 기존 sendId를 복원하고 연결을 재시도한다. 연결 확인 전 05가 전달 완료로 처리하지 않는다. 05의 lead_action 저장이 실패해도 새 전달 건/키를 만들지 않고 이미 받은 ID로 연결만 재시도한다. **05는 publicUrl/토큰 원문을 lead_actions 등 DB에 저장하지 않고 ID와 재시도 키만 보존한다.** URL이 다시 필요하면 서버가 권한을 재확인해 원래 URL을 복원한다.

준비 키와 발송 키는 같은 전달 건의 UUID를 두 기존/신규 고유 키 범위에서 재사용한다. 같은 회사·키·입력·작성자는 같은 링크/버전/sendId를 복원한다. 다른 리드·버전·TTL·작성자 또는 다른 발송 입력이면 409이며 이전 행을 덮어쓰지 않는다. 준비의 서버 생성 ID·nonce·시각은 입력 비교에서 제외하고 기존 행의 값을 재사용한다. 새 전달은 새 키로 별도 기록한다.

인증/역할/회사 플래그는 기존 문서 API 게이트를 유지하며, 행위별 권한을 구분한다.

- **회사 내부 읽기:** 병합된 [PR #261](https://github.com/a01055929144-web/maju-intelligence/pull/261)의 승인대로, 기존 문서 접근 권한이 있는 같은 회사 사용자는 다른 작성자의 sheet/quote 목록·게시 버전을 읽을 수 있다. `list`·`versions`에 작성자 필터를 추가하지 않는다. 타 회사 문서 접근은 거부한다. 과거 P1 명세·SQL의 작성자 전용 읽기 규칙으로 이 승인을 되돌리지 않는다.
- **생성·수정·발행:** 기존 `pricing_p1` RPC의 역할·작성자 제한을 유지한다. 영업직원은 자기 quote를 작성하며, sheet 작성 권한을 새로 얻지 않는다. 다른 작성자의 quote 수정·발행은 관리자도 허용하지 않는다.
- **외부 공유·발송:** 이 미승인 초안의 공개 링크 발급·전달 기록 정책으로만 작성자 제한을 둔다. 이 범위에서 관리자도 다른 작성자의 quote를 공유·발송 처리할 수 없으며, 해당 제한을 회사 내부 공동 읽기에 적용하지 않는다. 새 공유/발송 정책은 운영 활성화 전에 별도 승인을 받는다.

서버가 companyId·작성자·문서 ID·레이아웃을 결정하며 클라이언트 URL/회사/작성자 주장은 신뢰하지 않는다. 링크 준비는 실제 전달 기록이 아니며, 발송 기록은 기존 명시적 전달 확인 뒤에 남긴다. 이번 초안은 조회 필터·런타임을 변경하지 않는다.

## 3. SQL 모델과 무결성

`pricing_document_share_links`: 회사·문서·게시 버전·리드 복합 FK, 준비 키, 서버 작성자 키, nonce/토큰 SHA256, TTL/생성/만료 시각, 회수 시각, 선택 send_id. 가격·원가·문서 본문·리드 연락처·토큰 원문은 저장하지 않는다.

- `(company_id,idempotency_key)` 고유. `(company_id,send_id)` 고유이며 NULL은 준비 상태다. 초기 삽입에 send_id를 넣지 못한다.
- trigger의 quote 작성자 검사는 **새 외부 공유 링크 삽입**에만 적용하며 기존 문서 조회를 제한하지 않는다. 정확한 게시 버전, 동일 회사의 병합되지 않은 리드, 게시 유효기간도 검사한다. 선택적 보관 컬럼이 있으면 보관 문서도 거부하며 미적용 보관 컬럼을 직접 참조하지 않는다.
- 생성/만료는 DB 시각과 TTL로 계산한다. 문서·버전·대상·키·토큰·TTL·시각은 변경 불가다. 새 버전 공유는 새 링크로 발급한다.
- send_id는 같은 회사·문서·버전·리드·전달 키·작성자이고 customer_id가 없는 기존 발송 행만 한 번 연결한다. 같은 리드·버전의 예전 전달 기록을 새 링크에 끼워 넣지 못한다. 연결/회수 취소는 불가하다. 늦은 전달 기록 연결은 링크를 재활성화하지 않는다.
- RLS ON, anon/authenticated/public 직접 접근 및 trigger 함수 실행 권한 없음. service_role은 select/insert/update만 허용한다. 실제 인증은 서버 API에서 먼저 수행한다. 새 SECURITY DEFINER/RPC·기존 테이블 변경·기존 행 backfill 없음.

## 4. 토큰·공개 열람 계약

승인 후 작은 `/pricing-document` 셸과 `/api/pricing-documents/public` **열람 전용 POST**를 제안한다. 기존 `PricingDocPaper`의 판매 정보 출력과 responsive/인쇄 부품을 재사용하고 새 편집기·장바구니를 만들지 않는다. 공통 middleware의 공개 경로 예외는 컨트롤타워가 검토·반영할 의존 사항이다.

- 기존 store 토큰의 Node crypto 패턴을 재사용하되 서명 목적을 `lead-document-link-v1`로 분리한다. 별도 서버 전용 `LEAD_DOCUMENT_LINK_SECRET`(최소 32바이트 무작위 키)로 UUID + 128-bit nonce를 HMAC-SHA256 서명한다. store 토큰 검증 함수를 그대로 사용하지 않는다.
- token은 fragment에만 넣고 열람 POST body로 보낸다. raw token은 DB·콘솔·분석·referrer에 남기지 않는다. 권한 있는 준비 재시도는 저장 nonce와 같은 키로 원래 URL을 복원한다. 키 변경으로 hash가 맞지 않으면 자동 새 서명/대체 URL을 만들지 않고 회수·재발급을 요구한다.
- 요청은 기존 Origin/Host 검증을 재사용하는 same-origin JSON POST이며 wildcard CORS는 허용하지 않는다. body는 token 하나만 허용하며 companyId/leadId/versionId를 받지 않는다. 서명·토큰 hash와 링크를 검증한 뒤 해당 행의 회사에서 PRICING/새 공유 게이트·회수·만료·문서·리드 상태를 확인한다. 임의 회사 입력으로 조회하지 않는다.
- 캐시 `private,no-store`, referrer `no-referrer`, 검색 인덱싱 금지. 초기 HTML/OG에는 회사/리드/가격을 넣지 않는다. 비정상/회수/하드 만료/비허용 회사는 내용 없는 동일 404, 한도 초과는 429, 확인 실패는 503. 과거 응답/로컬 캐시로 우회하지 않는다.
- 링크 소지자는 열람할 수 있다. 링크는 리드 본인 확인이나 매장 회원 권한이 아니다. 07 인증·03 수락·주문 활성화·협의 단가 생성은 호출하지 않는다. 병합된 리드의 URL은 404로 막고 대표 리드에 새 링크를 준비한다. 원래 기록을 자동 이전하지 않는다.
- 열람 기록은 콘텐츠 응답 성공 시의 기술적 접근이다. 사람의 확인·수락·발송 사실로 해석하지 않는다. send가 연결돼 있으면 최초 viewed_at과 sent→viewed만 기록하며 accepted/cancelled 상태를 되돌리지 않는다. 05 리드 상태를 자동 변경하지 않는다.

## 5. 가격·원가·유효기간

- **가격 출처는 고정 게시 버전**이다. 현재 P0 판매가/원가, 다른 문서 최신 버전, 거래처 협의 단가를 조회하거나 섞지 않는다. 재게시해도 기존 URL은 바뀌지 않는다.
- 기존 문서 출력의 과세 포함/별도 계산과 visible/showBrand/showSpec, 행사 날짜·품절/삭제 필터를 재사용한다. 행사 현재 재고만 같은 회사에서 읽고 가격은 게시 가격을 유지한다.
- 공개 DTO는 문서 제목·발행 회사의 공개 표시·버전/게시 시각·유효기간·테마/표시 방식과 노출 품목의 이름/브랜드/규격/단위/판매가/과세/행사 표시만 명시적으로 허용한다. raw content, display.info의 임의 내부 정보, 리드 주소/전화, owner_key, 내부 상품/리드/회사 ID, 매입가·원가·마진·매입처·원가 이력은 반환하지 않는다. 내부 DTO를 spread하지 않는다.
- `showPrice=false`이면 항상 price:null. 문서 `validUntil`의 KST 날짜가 지나면 가격·가격 합계는 전부 null/비노출이고 품목 정보만 남긴다. 더 이른 링크 하드 만료/회수는 전체 내용을 차단한다. 만료된 게시본으로 새 링크를 준비하지 못한다.
- 링크 TTL 기본 14일, 1~30일. 링크 유효기간이 문서 가격 유효기간을 연장하지 않는다. 회수 후 새 조회는 막지만 이미 전달/인쇄한 내용을 원격 삭제한다고 약속하지 않는다.

## 6. 요청 한도·기본 OFF

- 준비: 회사·인증 작성자별 분당 10회. 공개 열람: 검증된 링크 회사·요청자별 분당 20회. 기존 `pricing_s2_public_request_guard`를 서비스 역할에서 재사용하며 body에는 링크 ID만 넣고 raw token/원문 IP를 넣지 않는다. raw IP 대신 신뢰 가능한 플랫폼 IP를 서버 HMAC으로 처리한다. 임의 forwarded 헤더를 신뢰하지 않는다.
- 잘못된 서명처럼 회사 확인 전의 요청도 제한하도록 컨트롤타워의 기존 gateway/WAF에 IP별 분당 60회 제한을 선행한다. 중앙 경로·한도 준비 전 공개 활성화하지 않는다. 새 rate-limit 서비스/Redis/cron은 만들지 않는다.
- 실제 읽은 body 최대 1KiB, token 최대 200 ASCII 문자, 게시 품목 최대 기존 300개. 자동 polling 없음. 검증 실패/초과는 문서 조회 전 종료한다. 기존 감사 테이블 정리·보존 정책은 운영 담당자가 승인 전에 확인한다.
- 제안 게이트: 기존 PRICE_SHEETS_ENABLED + 회사 PRICING 허용 **및** 새 LEAD_DOCUMENT_SHARING_ENABLED=true + 명시적 LEAD_DOCUMENT_SHARING_COMPANY_IDS. 새 스위치 기본 false/회사 목록 비어 있음. 이 PR은 환경변수·중앙 feature registry·middleware·운영 SQL을 변경하지 않는다.

## 7. 검증·승인·복구

- 합성 PG17: 회사/게시본/작성자/리드 경계, 준비가 발송 행을 만들지 않음, 키 고유 제약, TTL/불변 컨텍스트, 정확한 send 연결·재연결 거부, 회수 불가역, RLS/권한, 데이터가 있으면 down 거부, 빈 상태 up→down→up. 결과는 PR에서 갱신한다.
- 후속 런타임 구현 전 필수: 서명 변조/다른 목적 토큰·회사 조작·키 회전·만료 KST 경계·showPrice=false·원가 canary 비노출·행사 품절·429/503, 동시 준비/발송 연결·응답 유실 복구, PC/390px의 실제 공개 열람. **이번 SQL 검증은 이 API/화면 완료를 대신하지 않는다.**
- 대상 건수: 신규 테이블 초기 0행, 기존 행 갱신/이전 0건. 운영 현재 건수는 조회하지 않았다. 승인자는 대상 프로젝트·기존 P1/S2 스키마/권한·운영 보존 정책과 예상 회사별 발급량을 읽기 확인해야 한다.
- 운영 적용·활성화는 새 프로젝트별 승인 및 후속 runtime 검증 뒤 별도 진행한다. 중앙 승인표 갱신은 컨트롤타워 소유다. 이 초안은 DB-APPROVED를 주장하지 않는다.
- 복구 우선은 기능 OFF·코드 되돌림·필요 시 링크 회수다. down은 링크 행이 하나라도 있으면(회수됐어도) 거부한다. 데이터가 없을 때만 새 테이블/trigger 함수를 제거하며 기존 문서·버전·발송·주문·감사 이력은 건드리지 않는다.
