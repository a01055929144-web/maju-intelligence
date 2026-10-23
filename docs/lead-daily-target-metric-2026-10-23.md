# 일일 실제 영업 대상 고정 지표

`lead_sync_runs.metadata.dailySalesTarget`에 크론 성공 후 회사 합계와 적용 영업 지역별 합계를 기록한다.

고정 정의(`sales-target-v1`): 회사 영업 지역 안에서 최근 30 KST 달력일의 개업일 또는 인허가일을
가진 리드 중 `is_active=true`, `is_target_industry=true`, `is_duplicate=false`, 거래처 미연결,
`merged_into_lead_id is null`인 대표 리드 수다.

과거 보고 숫자는 같은 이름 아래 계산 기준이 달랐다.

- 214: 강남구 835건 표본에서 출처 중복·폐업·대상 외·기거래를 순차 제외한 최초 분석값
- 256: 업종 규칙 확대 후 집계했으나 고정된 30일 날짜·병합 대표 조건 적용 전 값
- 198: 현재 고정 기준에 맞춘 재계산 중 세 업태 재분류 적용 전 값
- 205: 같은 고정 기준에서 `패밀리레스트랑·푸드트럭·출장조리` 재분류 후 값

향후 비교 기준은 `sales-target-v1`만 사용한다.
