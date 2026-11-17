# CX-71 · 매장 정보 입력/수정 + S-3a 초안

상태: 앱 구현 완료 · SQL 초안/PG17 완료 · 운영 DB 미적용 · 기능 OFF

## 구현 계약

- 모바일은 사업자 정보 → 배송 정보 → 보관 정보 3단계, PC는 세 영역을 한 화면에 표시한다.
- 기존 `AddressPicker`와 `/api/address-search`를 재사용한다. 사업자번호는 기존 계속사업자 확인 결과를 읽기 전용으로 유지한다.
- 계산서 이메일, 받는 방법, 받을 수 있는 시간, 냉장·냉동·실온 사진과 새벽 출입 비밀번호를 점주만 수정한다.
- 비밀번호 원문은 일반 GET, 회사 알림, 감사 변경값, RPC 응답에 포함하지 않는다. 저장 여부만 `access_password_updated_at`으로 표시한다.
- 사진은 기존 비공개 `customer-attachments` 버킷에 저장하고 `store_profile_attachments`에는 경로와 종류만 둔다.
- `STORE_PROFILE_DELIVERY`와 회사 allowlist가 기본 OFF다. S-3a 운영 승인·적용 전에는 새 컬럼/RPC/첨부 테이블을 조회하지 않는다.

## 운영 전 남은 일

1. `docs/sql-drafts/20261117-CX-71-store-profile-delivery.sql` 별도 DB 승인.
2. 운영 1회 적용 뒤 컬럼·제약·함수 권한·RLS 읽기 검증.
3. 전용 합성 매장에서 PC/390px 저장·사진 업로드 확인.
4. 마지막에만 대표 회사 allowlist ON과 재배포를 별도 승인.

비밀번호 전용 조회 권한과 기사 화면 공개는 CX-73/S-3e 소유이며 이번 작업에 포함하지 않았다.
