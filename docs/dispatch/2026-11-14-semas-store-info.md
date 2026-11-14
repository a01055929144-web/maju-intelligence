# CC-46-5 소상공인 상가(상권)정보로 리드 업종·좌표 채우기 — 지시서 (2026-11-14 컨트롤타워)

> 근거: `docs/strategy/2026-11-14-lead-info-sources.md` 2절·6절 3번(대표 11/14: 저장할 값은 공공데이터로). 0순위 CC-46의 일부.
> **한 PR = 한 단계.** S1(읽기만)은 DB 변경 없음. S2(쓰기)는 SQL 초안 + 대표 승인 문구 후. 기능 PR은 현황판·체크리스트 수정 금지.

## 0. 왜

- 리드 업종이 '기타'인 비율: 제이에스리테일 23% · 비브 63.7%. 좌표 없는 리드 28%(제이에스리테일 기준 좌표 71.6%).
- 소상공인시장진흥공단 상가(상권)정보 = **영업 중인 전국 상가업소**(상호·업종코드·업종명·지번/도로명주소·경도·위도). 이용허락범위 **제한 없음** → 저장·가공 가능(출처 표시). 업종 체계 대 10 · 중 75 · 소 247. **전화번호는 없음**.
- 카카오·네이버와 달리 약관상 저장 제한이 없어 "저장해야 하는 값(업종·좌표)"을 채우는 정답 경로.

## 1. 데이터 경로 (S1에서 하나로 확정)

| 경로 | 주소 | 장단점 |
| --- | --- | --- |
| **API(권장 시작)** | 공공데이터포털 15012005 · `https://apis.data.go.kr/B553077/api/open/sdsc2/` (`storeListInDong` 행정동별 · `storeListInRadius` 반경) · 키 `DATA_GO_KR_SERVICE_KEY`(운영에 이름 있음) | 리드가 있는 행정동만 받음. **활용신청 여부 대표 확인 필요**(미신청이면 `SERVICE_ACCESS_DENIED_ERROR`/Forbidden). 일일 호출 한도 확인 필요 |
| 파일(분기 CSV) | 공공데이터포털 15083033 | 전국 약 277만 행 — Supabase 무료 500MB(현재 약 125MB)에 원본 적재 금지. 쓰려면 리드 행정동만 걸러 매칭 결과만 저장 |

- 응답 필드(사용): `bizesId`(상가업소번호) · `bizesNm`(상호) · `brchNm`(지점명) · `indsLclsCd/Nm`·`indsMclsCd/Nm`·`indsSclsCd/Nm`(업종 대·중·소) · `rdnmAdr`(도로명) · `lnoAdr`(지번) · `lon`·`lat` · `flrNo`(층).
- 호출 구현은 `lib/gov-restaurant.ts`(행안부 일반음식점) 패턴 재사용: 타임아웃·`resultCode !== "00"` 처리·키 값 로그 금지.

## 2. 매칭 규칙 (domain 함수 — `domains/lead/semas-match.ts`, 단위 테스트 필수)

1. 대상: 회사 리드 중 `industry_primary`가 비었거나 '기타' **또는** 좌표 없음. **폐업 리드 제외**(`isClosedLead` 재사용).
2. 후보: 리드 주소의 행정동(또는 좌표 반경 100m) 상가.
3. 점수: 상호 정규화(`kakaoNameVariants`·`placeNameScore` 재사용 — 괄호·법인 표기·끝 '점'·띄어쓰기) + 주소(도로명 본번까지 같음 / 좌표 있으면 거리 ≤ 50m).
4. 결과 코드(46-2⓪와 같은 체계): `filled`(값 채움) · `already_complete` · `not_found` · `rejected`(+`reject_reason`: `name_low`·`address_mismatch`·`ambiguous`(1·2위 점수 차 < 0.1)·`too_far`) · `error`.
5. **덮어쓰기 금지**: 인허가에서 온 값이 있으면 그대로. 비어 있거나 '기타'인 칸만 채움. 좌표는 없을 때만.

## 3. 단계

### S1 — dry-run(읽기만, DB 변경 없음) · 스위치 `LEAD_SEMAS_ENRICH`(기본 OFF, 회사 allowlist)
- 관리자 전용 `GET /api/admin/leads/semas-dry-run?companyId=…&limit=…`(비관리자 404, `naver-debug`와 같은 방식).
- 응답: 대상 수 · 결과 코드별 수 · 채워질 칸별 수(업종 대/중/소·좌표) · `reject_reason`별 수 · API 상태(설정 여부·상태 코드·호출 수). **상호·주소 원문은 응답에 넣지 않음**(개인정보 원칙, 숫자만).
- 테스트: 가짜 상호·가짜 응답만. 매칭 함수 단위 테스트(정규화·모호·거리·폐업 제외·덮어쓰기 금지).
- 완료 기준: 컨트롤타워가 운영에서 dry-run 숫자를 읽고 대표에게 보고(목표: 업종 '기타' 절반 이상 채움 · 좌표 없는 곳 절반 이상 채움).

### S2 — 적용(쓰기) · SQL 초안 + down + PG17 테스트 → 대표 승인 문구 → 컨트롤타워 적용
- `lead_contact_field_sources.source_type` CHECK에 `'semas'` 추가(지금은 `kakao·permit·manual·upload·naver_homepage·google·other`). `source_reference` = `bizesId`.
- 업종 코드 보관 칸이 필요하면(대·중·소 코드) 같은 초안에서. 기존 `industry_primary`에는 소분류명 또는 매핑 결과.
- 쓰기 경로: 크론(하루 상한, 06:00~07:30 KST 제외) 또는 관리자 버튼(상한 있음). 바꾼 칸마다 출처 기록.

### S3 — 화면·주기
- 리드 상세에 "출처: 소상공인시장진흥공단 상가(상권)정보" 표시(출처 표시 원칙).
- 분기 갱신(데이터 주기 분기) — 이미 채운 리드는 폐업·이전만 확인.

## 4. 하지 않는 것

- 전국 파일 원본 적재 · 상가정보로 인허가 값을 덮어쓰기 · 전화번호 수집(원본에 없음) · 공통 리드(46-A) 합치기(별도 단계).

## 5. 대표 확인 필요

1. 공공데이터포털에서 `DATA_GO_KR_SERVICE_KEY`(같은 계정 키)로 **15012005 상가(상권)정보 API 활용신청**이 돼 있는지. 안 돼 있으면 신청(자동 승인인 경우가 많음).
2. S1 dry-run 숫자를 본 뒤 S2 진행 여부.

## Done

- S1: dry-run API·매칭 단위 테스트·스위치 OFF 병합 → 운영 dry-run 숫자 보고.
- S2: 승인 후 적용 기록 `docs/work-orders/db-approval/applied-*-semas.md`.
- S3: 화면 출처 표시·분기 갱신.
