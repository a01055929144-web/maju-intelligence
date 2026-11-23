# CX-121 문서 연장 서버 계약 — DB 승인표

상태: 검토 초안. 운영 적용·기능 ON·배포 금지. 선행 적용 순서는 CX-126 → CX-120 → CX-121이며 각 단계에 별도 대표 승인이 필요하다.

## 변경 범위

- 연장 중인 문서의 기준 게시본·방법·초안 revision을 보존한다.
- 15분짜리 검토 토큰은 해시만 저장하며 회사·작성자·기준 게시본·초안·가격 지문에 묶는다.
- 게시 멱등 기록은 `(company_id, document_id, idempotency_key)`로 유일하다.
- 문서별 링크 머리만 새 게시본으로 옮긴다. 기존 게시본·공유 발행 행·주문 `document_version_id`는 수정하지 않는다.
- 공개 스키마의 새 테이블은 RLS를 켜고 브라우저 역할 권한을 회수한다. 전용 함수는 `service_role`만 실행한다.

## 돈·격리·동시성

- 최신 가격은 CX-120 `self_order_price_v2(..., false)`만 사용한다. 시가·가격 없음·타사 품목은 실패한다.
- 게시 트랜잭션은 문서 잠금 → 멱등 확인 → 토큰·revision·내용·가격 지문 확인 → 새 불변 버전 → 링크 머리 → 멱등 기록 순서다.
- 직접 단가는 정수 원만 기존 문서 정규화가 허용하며, 원가는 응답에 포함하지 않는다.
- 합성 PG17 시험은 최신가/기본가 출처, 저장 revision, 새 게시본, 동일 키 재생·다른 지문 충돌, 타사 차단, 과거 게시본·주문 불변, ACL, down을 확인한다.

## 운영 관문

- [ ] CX-126 운영 적용 및 확인
- [ ] CX-120 운영 적용 및 함수/ACL 확인
- [ ] 본 SQL 별도 대표 승인 문구
- [ ] 적용 전 백업·락 대기·객체 충돌 확인
- [ ] 기능 OFF 상태 합성 회사 allowlist 검증
- [ ] 공개 링크와 주문 동시성 실측
- [ ] 이상 시 기능 OFF, 신규 연장 중단. 게시 데이터가 생긴 뒤 down은 거부하므로 보존형 수정 SQL 사용

## 승인 준비 완료 기록 (2026-11-22 · Claude Code · 운영 읽기 전용)

- 기준 main `09b13f3`. SQL·down·PG17은 #1211·#1215 이후 변경 없음.
- SQL 파일 sha256(앞 16자): up `51bd3b140eab8538` · down `9d0673be00478ac8`.
- 운영 관문 확인: CX-126 11/21 적용 완료 ✓ · CX-120 `self_order_price_v2` 존재 ✓ · CX-123 11/22 적용 완료 ✓. 적용 순서는 **CX-122 → CX-121**(대표 지시).
- 적용 전 읽기(PG 17.6): `pricing_document_extension_*` 테이블·함수, `pricing_document_link_heads`, `pricing_document_share_link_heads`, `resolve_pricing_document_link_head_v*` 모두 **없음**(객체 충돌 0). `pricing_document_versions`·`pricing_documents`·`pricing_document_share_links`·`store_orders.document_version_id` 존재.
- 이 SQL은 기존 테이블을 바꾸지 않고 새 테이블 5개·함수를 추가한다(RLS 켜짐, 브라우저 역할 권한 없음). 기존 게시본·공유 링크·주문 행은 수정하지 않는다.
- PG17: CI의 `2026-11-20-CX-121-document-extension.pg17.test.sql` 단계와 `tests/pricing-document-extension-api-pg17.test.ts`(실제 API 핸들러) 단계가 main CI에 포함돼 초록(`16aaba9`). 적용 직전 최신 main CI를 한 번 더 확인한다.
- 남은 관문 중 사람이 판단할 것: 기능 OFF 상태 합성 회사 allowlist 검증, 공개 링크·주문 동시성 실측은 **적용 뒤 ON 전**에 한다.

**대표 승인 문구(그대로 답해 주세요):**

```text
fcmdvveqmcgtioelzqun CX-121 문서 연장 서버 계약 SQL 승인
```

CX-122 적용·읽기 검증 완료 뒤에 이 문구를 처리한다. 적용은 1회, audit 기록은 같은 트랜잭션, 재실행 금지.
