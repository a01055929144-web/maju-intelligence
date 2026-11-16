# CX-44 짧은 공유 링크 DB 승인 요청

## 승인 요청

- 대상: `docs/sql-drafts/2026-11-16-CX-44-short-share-links.sql`
- 되돌리기: `docs/sql-drafts/2026-11-16-CX-44-short-share-links.down.sql`
- 검증: `docs/sql-drafts/2026-11-16-CX-44-short-share-links.pg17.test.sql`
- 요청 사항: 대표 승인 후 관제탑이 운영 DB에 적용해 주세요.
- 현재 상태: **초안과 검증만 준비했으며 운영 DB에는 적용하지 않았습니다.**

## 변경 범위

- 단가표 공유 링크에 `/d/<10자>`용 `short_code`와 발송 채널·발송자·조회 집계를 추가합니다.
- 매장 링크에 `/s/<10자>`용 `short_code`와 발송 채널을 추가합니다.
- 기존 긴 링크는 그대로 유지하며 기존 행의 `short_code`는 `null`입니다.
- 단가표 링크에는 조회·주문 시작·가입·첫 주문 이벤트를 별도 저장합니다.
- 매장 링크의 기존 이벤트에는 주문 시작·가입·첫 주문 유형만 확장합니다.
- 원문 IP나 원문 기기값은 저장하지 않고, 64자리 해시와 정규화된 기기 분류만 받습니다.
- 미리보기 봇은 조회 집계에서 제외합니다.

## 안전장치

- 짧은 코드는 혼동 문자를 제외한 영문 대소문자·숫자 10자리이며 링크당 한 번만 발급됩니다.
- 만료·회수·회사 불일치·없는 코드는 모두 같은 `unavailable` 응답입니다.
- 공개 조회는 기존 `pricing_s2_public_request_guard`를 재사용합니다.
- 새 RPC는 `service_role`만 실행할 수 있고 `search_path`를 고정합니다.
- 되돌리기는 짧은 코드나 추적 증거가 하나라도 있으면 중단됩니다.
- 앱 전환 스위치 `SHORT_SHARE_LINKS`는 기본 OFF이며, DB 적용 승인 뒤 별도 앱 변경에서 켭니다.

## 적용 전 확인

```sql
select count(*) from public.pricing_document_share_links;
select count(*) from public.storefront_links;
select to_regprocedure('public.pricing_s2_public_request_guard(uuid,text,text,jsonb,integer)');
```

## 적용 후 확인

```sql
select count(*) from public.pricing_document_share_links where short_code is not null;
select count(*) from public.storefront_links where short_code is not null;
select to_regprocedure('public.assign_pricing_document_short_code_v1(uuid,uuid,text,uuid)');
select to_regprocedure('public.resolve_pricing_document_short_link_v1(text,text,text,boolean,uuid)');
select to_regprocedure('public.assign_storefront_short_code_v1(uuid,uuid,text)');
select to_regprocedure('public.resolve_storefront_short_link_v1(text,text,text,boolean,uuid)');
```

첫 두 결과는 적용 직후 모두 `0`이어야 합니다.

## 되돌리기 조건

`short_code`가 발급됐거나 새 추적 이벤트가 생긴 뒤에는 자동 되돌리기를 허용하지 않습니다. 이 경우 호출자를 먼저 끄고 보존·이관 방안을 별도로 승인받아야 합니다.
