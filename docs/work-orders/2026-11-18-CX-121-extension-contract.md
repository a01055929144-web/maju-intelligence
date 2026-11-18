# CX-121 문서 연장 연결 계약 — 06방 검토 요청 초안

상태: 화면 어댑터 준비 중. 서버 구현·CX-120 실제 값 연결 전 기능 OFF, 병합/운영 완료 아님.
기준: R16 #1106, `12_CATALOG_PRICE_FLOW.md` 3절 대표 13:44 보완.

## 파일 소유와 재사용

09는 `components/pricing-document-{sheets,extension}.tsx`, `components/pricing-documents-workspace.tsx`, 문서 페이지와 문서 클라이언트 어댑터·시험을 맡는다. 기존 편집기(품목 추가·직접 단가·삭제·순서·숨김·기간)를 그대로 사용한다. `storefront-workspace.tsx`와 #1103, 06 SQL/주문 줄기는 수정하지 않는다.

## 06방에 필요한 서버 계약

기존 문서 API의 회사/작성자/권한/보관 경계를 유지하는 다음 연결을 제안한다. 이름은 최종 서버 계약에 맞춰 어댑터에서 변경 가능하다. 현재 API는 이 동작을 지원하지 않으므로 실패하며, 기존 가격 조회·게시로 우회하지 않는다.

- `extension-review` (POST): `id`, `expected`(초안 revision), `mode`(`keep`/`latest`), `validUntil`, `stage`(`start`/`review`), 편집 뒤 `content`.
- start의 기준은 **최신 게시본 약속가**, 초안 가격을 약속가로 간주하지 않는다. `keep`은 약속가 유지, `latest`는 CX-120에서 약속가를 제외한 순서 2·3 최신가. 행사가·시가 기존 규칙 유지. 품목 추가 후보도 `extension-catalog`에서 같은 서버 규칙으로 받는다.
- 반환: `documentId`, `revision`, `mode`, 정규화 `content`, 불투명 `token`, `summary:{unchanged,changed,added,removed}`, `loweredProfitCount`, `minimumProfitRate`, 줄별 `key,name,source,promiseUntil,before,calculated,price,difference,profitRate,belowThreshold,manual`.
- `source`: 최신 계산 기준 `catalog`/`base`(행사 표시 `promotion`), `promiseUntil`은 CX-120 `promise_until`을 변환. UI가 원가·마진으로 가격·차이·이익률을 계산하지 않는다. 이익률 미확인도 null 그대로 표시한다.
- review 단계는 수신 편집 내용의 단가를 덮어쓰지 않고 최신 계산가와 비교한다. 직접 수정은 표시하되 기준 미만 경고로 게시를 차단하지 않는다. 추가·삭제·그대로·가격 변경 수는 최신 게시본의 품목/행사/단위 기준으로 서버가 계산한다.
- `extension-save`: 기존 save 권한/동시성 + mode/연장 기준 게시본을 서버에 보존. 새로고침/다른 창의 ordinary publish로 확인 절차를 우회할 수 없어야 한다. DB 추가가 필요하면 별도 SQL 초안·down·PG17·승인 절차이며 이 화면 PR에서 운영 적용하지 않는다.
- `extension-publish`: `id,expected,mode,token,idempotencyKey`. token은 회사·작성자·기준 게시본·초안 revision·편집 내용·최신가 상태에 묶어 서버 검증. 오래된 token/동시 수정은 409, 원자적으로 새 게시본 및 누가·언제·어느 방식 기록. 문서 ID/공개 링크 유지, 과거 버전 불변. 동일 키 재시도는 기존 결과 반환, 다른 내용 거부.
- 실제 가격이 없거나 권한 없음·출처 불일치·서버 계약 미적용 시 저장/게시 실패. 원가/민감정보는 공개 문서 모델에 넣지 않는다.

## 기본 OFF와 남은 검증

`PRICING_DOCUMENT_EXTENSION_ENABLED=true`와 `PRICING_DOCUMENT_EXTENSION_COMPANY_IDS`가 둘 다 맞아야 새 화면이 열린다. 시험의 합성 회사에만 켜며 운영 설정은 변경하지 않는다. 서버 게이트·회사 격리·금액·게시/기록 원자성·PG17은 06 계약과 실제 구현을 받은 뒤 별도 검증해야 한다. 합성 브라우저 응답 시험은 실제 서버 완료 근거가 아니다.
