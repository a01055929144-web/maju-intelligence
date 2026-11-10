# 공개 점주 개통과 배송 권역 원자 연결 — 운영 적용 기록

상태: 2026-11-10 대표 승인 후 운영 프로젝트에 함수 적용. 14:48 KST에 대표 회사 한정 환경 설정을 추가했다. 설정 반영 재배포와 새 매장 개통·주문 실사용 검증은 아직 하지 않았다.

적용 직전 읽기 점검에서 기존 개통 함수, 권역·주문 규칙 테이블, 필요한 `service_role` 권한이 모두 확인됐고 새 함수는 없었다. 적용 직후 함수 1개와 `service_role` 실행 권한을 확인했다. `anon`·`authenticated` 실행 권한은 없었다. 기존 데이터 변경은 없다. **이미 적용한 SQL을 재실행하지 않는다.**

| 항목 | 정확한 범위 |
|---|---|
| up | `docs/sql-drafts/20261109-09-public-owner-delivery.sql` |
| down | `docs/sql-drafts/20261109-09-public-owner-delivery.down.sql` |
| 함수 | `activate_public_store_owner_with_delivery_v1(text,uuid,text,timestamptz,text,text,timestamptz,text,uuid)` 1개 추가 |
| 기존 함수 | `activate_store_owner_v1` 본문·서명·권한 변경 없음 |
| 테이블/열/기존 데이터 | 신규 테이블·열·일괄 보정 없음. 활성화 후 새 공개 가입 트랜잭션에서 만든 거래처의 `delivery_territory_id`만 연결 |
| 접근 | SECURITY INVOKER, service_role만 EXECUTE. anon/authenticated 실행 없음, RLS 변경 없음 |
| 실행 순서 | 별도 프로젝트 승인 → 선행 객체/권한 읽기 점검 → OFF 상태에서 up 1회 → 함수/ACL 읽기 검증 → 코드 배포 → 회사별 ON 별도 승인 |

## 결함과 서버 계약

일반 거래처 등록은 기존 `assignCustomerByTerritory(companyId,address)`를 사용한다. 공개 개통 SQL은 이 경로를 거치지 않아 새 거래처 권역이 비어 있을 수 있다. 주문 RPC는 거래처별 또는 권역별 배송 요일을 요구하며 회사 주문 설정에는 기본 요일이 없다. 따라서 실제 신규 매장의 첫 주문이 막힐 수 있다.

서버는 기존 추천 함수를 그대로 재사용한다. 주소 매칭을 SQL에 복제하지 않는다. 추천된 회사 권역의 배송 규칙이 있어야 새 RPC에 서버 결정 권역 ID를 보낸다. 브라우저의 회사/권역 ID는 사용하지 않는다. 미매칭/규칙 없음은 프로필 저장·개통 전에 `delivery_area_unavailable`과 담당자 확인 안내를 반환한다.

새 함수는 미소비·미만료의 신규 공개 요청(customer_id NULL)만 잠그고 같은 회사 활성 권역과 배송 규칙을 FOR SHARE로 확인한다. 기존 개통 함수를 호출한 뒤 그 트랜잭션에서 생성한 거래처에만 권역을 연결한다. 중간 실패는 계정·회원·거래처·요청 소비와 권역 연결을 함께 롤백한다. 가격·마감·최소금액·주문자 권한·NTS·약관 검증은 유지한다. 시험 모드의 별도 요일 준비와 구분한다.

## 적용 전 확인 기록

- 대상 운영 프로젝트를 명시한 별도 적용 승인을 받았고, 선행 객체·권한을 읽기로 확인한 뒤 함수 추가 SQL을 1회 적용했다.
- P0/P1/P2/S2, 회원, 기존 공개 점주 개통 SQL과 `normalized_customers.delivery_territory_id`, `delivery_territories.is_active` 및 회사 내 권역 매핑·주문 규칙이 선행해야 한다.
- service_role의 기존 SELECT/UPDATE가 권역/권역 주문 규칙의 행 잠금에 충분한지 확인한다. 부족하면 up은 변경 없이 거부한다. 이 초안은 추가 테이블 권한을 부여하지 않는다. 필요한 권한 변경은 별도 정확한 승인 범위로 검토한다.
- up은 함수 추가와 제한된 EXECUTE 부여만 수행한다. `lock_timeout=3s`, `statement_timeout=10s`. 운영 실행 시간/경합 실측은 미실시이며 시간 상한이 무경합을 보장하지 않는다.
- 기능 ON 전에 함수 서명·invoker·ACL·기존 함수 불변·회사 권역/요일 구성을 읽기로 확인한다. 자동화/배포가 SQL을 적용하지 않는다.

## 활성화/중단/되돌리기

`STORE_PUBLIC_OWNER_DELIVERY_ENABLED=true`와 `FEATURE_STORE_PUBLIC_OWNER_DELIVERY_COMPANY_IDS`의 승인 회사가 모두 필요하다. 기본 OFF이며 기존 공개 가입·회원·주문 허용목록도 필요하다. 기존 기능을 전 회사로 여는 전역 우회를 사용하지 않는다.

실패하면 신규 진입과 이 기능의 회사 허용을 먼저 OFF로 복원한다. 기존 계정·거래처·주문은 삭제하거나 재배정하지 않는다. `public-delivery-v1:` 확인 기록이 없을 때만 down으로 새 함수 제거가 가능하다. 기록이 있으면 down은 트랜잭션을 거부하고 데이터·함수를 보존한다. 이후 복구는 별도 검토한다.

## 검증과 남은 단계

폐기 PG17에서 실제 기존 개통·주문 RPC를 사용해 다른 회사 권역/규칙 누락의 무생성·무소비, 정상 권역 연결 뒤 거래처별 시험 요일 없이 첫 주문, 빈 down/up 및 기록 존재 down 거부를 검증한다. API는 기능 OFF 무조회·기존 추천 재사용·브라우저 권역 무시·미매칭 전 중단을 확인한다.

회사별 기능 ON·실제 Kakao/NTS·신규 매장 첫 주문 E2E는 미완료다. 함수 적용과 #447/#448의 코드·CI 또는 시험 DB 검증만으로 운영 여정 완료/진행률을 올리지 않는다.
