# CX-121 문서 연장 연결 계약 — 06방 확정안

상태: 2026-11-20 대표 전달 승인에 따라 06방 가격·게시 경계를 확정했다. 서버 구현·CX-120 실제 값 연결 전 기능 OFF, 병합/운영 완료 아님.
기준: R16 #1106, `12_CATALOG_PRICE_FLOW.md` 3절 대표 13:44 보완.

## 파일 소유와 재사용

09는 `components/pricing-document-{sheets,extension}.tsx`, `components/pricing-documents-workspace.tsx`, 문서 페이지와 문서 클라이언트 어댑터·시험을 맡는다. 기존 편집기(품목 추가·직접 단가·삭제·순서·숨김·기간)를 그대로 사용한다. `storefront-workspace.tsx`와 #1103, 06 SQL/주문 줄기는 수정하지 않는다.

## 06방 서버 계약

기존 문서 API의 회사/작성자/권한/보관 경계를 유지한다. 현재 API는 이 동작을 지원하지 않으므로 실패하며, 기존 가격 조회·게시로 우회하지 않는다.

- `extension-review` (POST): `id`, `expected`(초안 revision), `mode`(`keep`/`latest`), `validUntil`, `stage`(`start`/`review`), 편집 뒤 `content`.
- start의 기준은 **최신 게시본 약속가**, 초안 가격을 약속가로 간주하지 않는다. `keep`은 약속가 유지, `latest`는 CX-120에 `exclude_promise=true`를 주어 순서 2·3 최신가만 받는다. 행사가·시가 기존 규칙 유지. 품목 추가 후보도 `extension-catalog`에서 같은 서버 규칙으로 받는다.
- 반환: `documentId`, `revision`, `mode`, 정규화 `content`, 불투명 `token`, `summary:{unchanged,changed,added,removed}`, `loweredProfitCount`, `minimumProfitRate`, 줄별 `key,name,source,promiseUntil,before,calculated,price,difference,profitRate,belowThreshold,manual`.
- `source`는 CX-120 결과를 공개 안전 값 `catalog`/`base`로 변환하고, 활성 행사는 `promotion`으로 표시한다. `promiseUntil`은 최신 게시본 약속 종료일이다. 최신가 계산에서 약속가를 제외했더라도 비교 근거로 반환한다.
- `before`는 최신 게시본 약속가, `calculated`는 약속가를 제외한 서버 최신가, `price`는 이번 게시 후보 단가다. `difference = price - calculated`, `manual = price != calculated`이며 금액은 모두 정수 원이다. 시가는 가격을 만들지 않고 해당 줄의 가격 검토를 실패시킨다.
- `profitRate`는 이번 게시 후보 `price`와 서버 원가로 계산한 매출총이익률 퍼센트이고, 원가는 반환하지 않는다. `loweredProfitCount`는 최신 게시본 단가의 현재 이익률보다 후보 이익률이 낮아진 줄 수, `belowThreshold`는 회사 최저 이익률 미만 여부다. `minimumProfitRate`는 확인 가능한 줄의 최솟값이며 하나도 확인할 수 없으면 null이다. UI가 원가·마진으로 가격·차이·이익률을 계산하지 않는다.
- `key`는 `productId + promotionId(null 포함) + 판매 단위`의 서버 정규화 키다. `summary`는 이 키로 최신 게시본과 게시 후보를 비교한다. 같은 키에서 가격만 달라지면 `changed`, 새 키는 `added`, 사라진 키는 `removed`, 나머지는 `unchanged`다. 숨긴 줄은 게시 후보에서 제거된 것으로 센다.
- review 단계는 수신 편집 내용의 단가를 덮어쓰지 않고 최신 계산가와 비교한다. 직접 수정은 표시하되 기준 미만 경고로 게시를 차단하지 않는다. 추가·삭제·그대로·가격 변경 수는 최신 게시본의 품목/행사/단위 기준으로 서버가 계산한다.
- `extension-save`: 기존 save 권한/동시성 + mode/연장 기준 게시본을 서버에 보존. 새로고침/다른 창의 ordinary publish로 확인 절차를 우회할 수 없어야 한다. DB 추가가 필요하면 별도 SQL 초안·down·PG17·승인 절차이며 이 화면 PR에서 운영 적용하지 않는다.
- `extension-publish`: `id,expected,mode,token,idempotencyKey`. token은 회사·작성자·기준 게시본·초안 revision·편집 내용·CX-120 가격 결과의 지문에 묶어 서버 검증한다. 오래된 token/동시 수정은 409, 원자적으로 새 게시본 및 누가·언제·어느 방식 기록. 문서 ID/공개 링크 유지, 과거 버전 불변. 동일 키·동일 지문 재시도는 기존 결과 반환, 동일 키·다른 지문은 409다.
- 실제 가격이 없거나 권한 없음·출처 불일치·서버 계약 미적용 시 저장/게시 실패. 원가/민감정보는 공개 문서 모델에 넣지 않는다.

## 같은 링크와 주문 동시성

- 현재 `storefront_links.document_version_id`는 주문의 복합 외래키에 포함되므로 재게시 때 기존 행을 UPDATE하지 않는다. 기존 행 갱신은 과거 주문 무결성을 깨뜨릴 수 있다.
- 공개 주소는 문서별 안정적인 link head를 가리키고, head만 현재 게시 버전을 가리킨다. 게시 버전과 과거 링크 발행 이력은 불변으로 남긴다. 필요한 스키마는 06방 별도 SQL 초안·down·PG17·운영 승인 대상이다.
- 주문은 시작 시 head의 `documentVersionId`를 요청 지문에 고정한다. 같은 주문 멱등키는 그 버전으로만 재생하고, 재게시 뒤 다른 버전으로 재해석하지 않는다. 재게시와 주문이 동시에 들어오면 잠금 시점에 보인 한 버전만 사용한다.
- 재게시 멱등 기록은 주문 기록과 분리한다. 최소 필드는 `company_id, document_id, idempotency_key, request_fingerprint, base_version_id, result_version_id, mode, actor_key, created_at`이며 `(company_id, document_id, idempotency_key)`가 유일하다. 주문은 기존 주문 멱등 기록을 그대로 사용한다.
- 게시 트랜잭션 순서는 `문서 잠금 → 멱등 재생/충돌 확인 → token·revision·가격 지문 확인 → 새 불변 버전 INSERT → link head 교체 → 멱등 결과 INSERT`다. 어느 단계든 실패하면 전부 롤백한다.

## 09 연결용 처리 경계

- 09는 `extension-review` 응답을 표시하고 사용자가 고친 `content`를 다시 review에 보낼 뿐, 가격·차이·이익률·요약을 계산하지 않는다.
- 09는 게시 실패 시 같은 `token`, `expected`, `idempotencyKey`로 재시도한다. 새 review를 받았거나 사용자가 내용을 다시 고쳤을 때만 새 멱등키를 만든다.
- 06은 CX-120 가격 선택, 원가 기반 이익률, 문서/링크 잠금, 버전 생성, 멱등 재생을 소유한다. 주문 생성은 기존 주문 RPC 소유를 유지한다.

## 기본 OFF와 남은 검증

`PRICING_DOCUMENT_EXTENSION_ENABLED=true`와 `PRICING_DOCUMENT_EXTENSION_COMPANY_IDS`가 둘 다 맞아야 새 화면이 열린다. 시험의 합성 회사에만 켜며 운영 설정은 변경하지 않는다. 서버 게이트·회사 격리·금액·게시/기록 원자성·PG17은 06 계약과 실제 구현을 받은 뒤 별도 검증해야 한다. 합성 브라우저 응답 시험은 실제 서버 완료 근거가 아니다.
