# 영업 기능 로드맵 명세 (2026-10-25 확정)

작업지시서(WO-0~WO-6, 병렬 트랙 A·B·C)는 이 문서의 절 번호만 참조합니다. 필요한 절만 읽으세요.
화면 시안은 대표가 가진 Design 캔버스 "MAJU 영업 화면 시안"(번호 ①~⑪)과 같은 번호를 씁니다.

## §0 공통 규칙
- 운영 DB 스키마·데이터 변경: SQL 초안 → 대표 승인(프로젝트 fcmdvveqmcgtioelzqun, 범위 명시) → 적용. 마이그레이션 먼저, 코드 나중.
- 06:00~07:30 KST(자동 수집 시간) 운영 데이터 변경 금지.
- 보류 모듈(견적서·매입·매출·상품·전표·재고·표준품목·영업성과·AI비서·텔레그램) 노출 금지. 여기서 "견적" = 단가표 파일·링크 전달.
- 보고 숫자는 "실제 측정 / 추정" 구분. 원본 개인정보 파일 커밋 금지.
- 새 비즈니스 규칙은 domains/lead/*(순수 함수) → lib/store.ts는 호출만. lib/store.ts에 규칙을 더 얹지 않기.
- 완료 조건: tsc·lint·vitest·check:auth-boundaries·next build 통과 + 변경 요약.

## §1 영업 채널·단계 (구현 완료: maju-leads-update-2026-10-25.patch)
- 채널 순위: 010 문자 → 인스타 DM·네이버 톡톡 → 이메일·팩스 → 방문. 매장 유선(02·031·070) 콜드콜 제외(참고 표시만).
  규칙: domains/lead/contact-channels.ts (resolvePrimaryLeadContactChannel, leadContactPriorityRank, 형식 검사, 링크 생성).
- 인스타·톡톡은 발송 API 없음 → 열기 + 문구 복사 + "보냈어요" 기록. 팩스 자동 전송은 서비스 계약 후.
- 공통 단계: 신규(신규 수집) → 연락함(연락 완료) → 견적 전달(견적 발송) → 협의·재연락(재연락 예정) → 계약(전환 진행) / 보류(검토 필요) / 거절·제외(제외).
  규칙: domains/lead/lead-status.ts. 상태는 언제든 직접 변경(action_type "status", 기록 남김).
- 연락 종류 action_type: call, dm(인스타), sms, talktalk, email, fax, visit, quote, hold, exclude, status.
- 인스타 아이디 찾기: 네이버 검색 API(webkr·blog) 후보 → 사람이 확인 후 저장(자동 저장 금지). domains/lead/instagram-discovery.ts.
- 뒤로가기: 지도 ?staff=·?detail=·?panel=·?pin=(미리보기 카드), 리드 ?lead= 주소 동기화. 닫기 시 기록 한 칸 뒤로.

## §2 리드 목록 완성 (시안 ①)
- 칸: 선택 | 상호(+순위 배지) | 개업일(날짜 + N일 전, 기본 정렬 최신) | 업종 | 휴대폰 | 인스타·톡톡 | 이메일 | 팩스 | 최근 연락 | 단계(선택 상자) | 작업.
- 기본 정렬: leadContactPriorityRank → 개업일 최신. 배지 "1순위 · 문자 / 2순위 · DM·톡톡 / 3순위 · 메일·팩스 / 4순위 · 방문".
- 필터: 내 담당만, 휴대폰 있음, 연락 안 한 곳 + "필터 더 보기"(팩스·이메일·인스타·톡톡 있음, 브레이크, 업종, 지역, 임시 영업).
- 선택 작업 줄: "견적 보내기"(매장별 가능한 채널 자동) · 오늘 방문에 추가 · 더보기(담당자 지정, 단계 일괄 변경, 엑셀).
- 최근 연락 칸: leads에 last_contact_at, last_contact_channel, last_contact_summary 비정규화(연락 기록 저장 시 갱신, SQL 초안).
- 다음 행동 자동 추천: "오늘 바로 전화"(전화번호 있으면) → 010이면 "오늘 문자", 인스타·톡톡이면 "오늘 DM", 둘 다 없으면 "방문 검토".
  기존 저장값 next_action은 화면에서 새 이름으로 매핑, DB 일괄 변경은 별도 승인.
- 표: 줄바꿈 없이 가로 스크롤(이미 반영). 서버 페이지(키셋 50행), 단계별 숫자 group by 1회 + 30초 캐시.
- 담당자 겹침: 다른 직원이 7일 내 연락한 리드는 "○○ 담당" 표시, 연락 버튼 누를 때 한 번 확인.
- 계약 단계 리드: "거래처로 전환 · 배송 코스 선택"(기존 convert 재사용).

## §3 문자 순차 발송 + 문구 (시안 ⑩, 리드 상세 영업 채널) — 가장 마지막 순서
- 1차는 휴대폰에서 보내기(sms: 링크, 이미 리드 상세에 있음). PC 발송은 나중에 Solapi(이미 거래처 개별 SMS에 연동됨, lib/customer-messages.ts) 재사용 + 회사별 충전식 잔액(충전·차감·내역) 설계.
- 단체문자 금지. 선택한 010 매장을 한 곳씩: sms: 링크로 문자 앱 열기 → "보냈어요/건너뛰기" → 다음.
- 제외 자동: 010 아님, 수신 거부, 같은 채널 14일 내 발송, 담당자당 하루 50곳 초과. 21:00~08:00 시작 불가.
- 문구: company_message_templates(company_id, owner_user_id null=회사 공통, name, channel sms/dm/email/fax, body, is_default, last_used_at, archived_at).
  발송 시 선택 → 이번만 편집 → 첫 매장 미리보기. 변수 {상호} {회사명} {담당자명} {담당자 연락처} {단가표 링크} — fillLeadMessageTemplate 사용.
- "(광고)"·수신 거부 문구: 1:1 발송은 강제 안 함, 회사 설정 토글(기본 끔). 대량 SMS 연동 시 자동 적용(나중).
- 기록: lead_actions에 채널·문구 id·결과. PC에서는 "휴대폰에서 이어서 보내기".
- 결과 버튼(보낸 뒤): 아직 답장 없음(+3일, 다른 채널 제안) / 답장·관심 / 단가표 보냄 / 거절 + "대화에서 받은 사장님 번호" 입력 → 휴대폰 칸 저장.

## §4 사용자 칸 + 공통 단계 + 유통사 탭 (시안 ⑥②)
- company_lead_fields(id uuid, company_id, key 불변, label, type text|number|date|select|multi_select|checkbox, options jsonb[{id,label,order}],
  show_in_list, filterable, sort_order, archived_at, created_by, updated_at). 값: business_permit_leads.custom_values jsonb(키=field id, 선택지=option id), GIN.
  이력: lead_field_value_changes. 삭제=보관. 서버 형식 검사.
- 화면: 칸 목록(⋮⋮ 순서, 연필 수정, 휴지통 숨기기 확인 "값 N건 보관", 숨긴 칸 되살리기), 추가 패널(이름·형식·선택지·목록/필터) + 실시간 미리보기 4곳(목록 칸, 필터, 상세 입력, 휴대폰 카드).
- 판매자 업종 프리셋: domains/lead/sales-presets.ts에 정의만(업종 필터, 기본 정렬, 견적 내용, 추천 칸, 첫 문구). 이번엔 "식자재 유통", "유통사 대상" 2개. 선택 화면 없음.
- 유통사 탭(본사 회사 id 상수에서만): target_type(default 'restaurant'), 공통 칸 + 사용자 칸(등급·ERP·품목·리드소스·매장수·매칭상태·중개상태).
- 엑셀 가져오기(일반 xlsx·xls·csv + 구글시트는 xlsx 내려받아 올리기, 시안 ⑦-1~3): 브라우저에서 읽기(이미 있는 xlsx 라이브러리, Web Worker),
  시트 선택, 칸 이름 줄 자동 인식(제목·요약 줄 건너뜀), 칸 자동 맞춤(공통 칸 / 우리 회사 칸 만들기 / 연락 내역 / 가져오지 않음), 맞춤 기억,
  상태 값 → 단계 매핑, 중복 처리(빈 칸만 채우기 기본 / 건너뛰기 / 따로 추가), 500행 단위 업로드, import_batch_id, 결과 요약 + 오류 행 엑셀, 7일 되돌리기.
  기존 거래처 엑셀 업로드 화면의 칸 매핑 코드가 있으면 재사용.
- 대표 구글시트(첫 사용 데이터) 가져오기 규칙: 시트 "유통사 마스터"(기준) + "유통사 관리"(팩스·팩스 전송결과). 상호 정규화로 합치기(약 3,380곳),
  번호 분리·0 보정, 주문톡상태 → 단계(미진행→신규, 검토중→협의·재연락, 제안중→견적 전달, 데모완료→협의·재연락+미팅 기록, 계약완료→계약, 이탈→거절),
  미팅일·메모·팩스 결과 → 연락 내역. 드라이런 보고 후 승인.

## §5 휴대폰 오늘 할 일 + 홈 (시안 ⑨④)
- /mobile/sales 첫 화면: 다시 연락 / 문자·010 / DM·톡톡 / 방문 4칸, 카드마다 주 행동 1개 + 보조 + 결과, "이 N곳 동선으로", "+ 매장 직접 등록".
  결과 저장은 낙관적 반영 + 실패 시 대기열 재전송.
- /dashboard(홈): 오늘 할 일 카드(새로 연 매장, 문자 가능·미연락, 브레이크 방문 가능, 오늘 재연락, 폐업 확인 필요),
  이번 달 단계 깔때기 + 견적→계약 전환율, 채널별(문자·DM/톡톡·이메일·팩스·방문) 연락→견적 전달, 채널 확보율, 거래처 이상 신호, 배송 현황.

## §6 공용 매장 원장 + 공공데이터 확대
- 현재: syncAllCompanies*가 회사마다 같은 전국 API를 따로 호출·저장 → 호출 수 = 회사 수 × 페이지, 새 고객사는 빈 상태.
- shared_business_places(company_id 없음, service_role 전용): source, source_record_key 유니크, 상호, 주소, 행정구역, 좌표, 업종 원본·분류,
  인허가일, 폐업일, 영업상태, 공공 전화, area_m2, homepage_url, canonical_fingerprint, first_seen_at, last_seen_at.
- 수집 1회 → 회사별 리드는 원장에서 영업 지역·업종으로 걸러 생성(기존 ingestPermitLeadRows 규칙). 회사 테이블에 shared_place_id.
- 공유 금지: 상태·담당자·lead_actions·메모·직원 입력 연락처·사용자 칸.
- 공공데이터(모두 같은 계정 키 GOV_RESTAURANT_API_KEY, 새 환경변수 금지):
  - 확인된 조건(포털 상세, 2026-10-25): 이용허락범위 제한 없음(상업 이용·재제공 가능, 출처 표시 권장), 개발계정 하루 10,000회/오퍼레이션,
    데이터는 매일 갱신·2일 전 기준. 오퍼레이션 /info(현재) · /history(데이터기준일자 2026-01-01~전일 시점 조회). DAT_UPDT_SE(I/U/D)로 변경분 판별 가능한지 확인.
  - End Point 확인 완료(모두 …/info): 집단급식소 group_meal_facilities, 위탁급식영업 contract_catering, 제과점영업 bakeries.
  - 일반음식점 general_restaurants/info(사용 중), 휴게음식점 rest_cafes/info(실호출 확인, 칸 동일 — BPLC_NM, ROAD_NM_ADDR, LOTNO_ADDR, LCPMT_YMD,
    CLSBIZ_YMD, DTL_SALS_STTS_NM, TELNO, BZSTAT_SE_NM, SNTTN_BZSTAT_NM, MNG_NO, LAST_MDFCN_PNT, LCTN_AREA, FCLT_TOTAL_SCL, HPG), 집단급식소·위탁급식영업(End Point 대표 전달 예정).
  - 면적 LCTN_AREA(없으면 FCLT_TOTAL_SCL) → area_m2, HPG → homepage_url(instagram.com이면 instagram_url 비어 있을 때 채움, 출처 기록).
  - 업종: 커피숍·제과 → 카페/디저트, 일반조리판매·기타 휴게음식점 → 상호 분류, 급식 2종 → 리드 종류 "급식".
  - 국세청 상태조회: 사업자번호 있는 리드도 주 1회, 폐업이면 "폐업 확인 필요"(자동 제외 금지).
  - WO-6: 공정위 가맹점 목록·직영점 운영 정보·소상공인 우수프랜차이즈 → 리드에 "가맹점·브랜드" / "직영점" 배지(상호 포함 + 100m 이내 매칭, 정확도 보고),
    소상공인 상가(상권)정보 → 업종·지점명 보강, 인허가와 교차 폐업 의심 표시(자동 제외 금지).
  - WO-6: aT 일별 도·소매 가격 → 매일 수집·저장만(화면 노출 없음, 단가표 기능 재개 대비 시세 이력 축적).
  - 승인 완료(2026-10-25): 행안부 제과점영업(15155252, WO-1에 포함 — 같은 계열 /info 형식 예상, 첫 호출로 칸 확인),
    행안부 축산판매업(15154871)·식품소분업(15155126)·식품판매업(기타)(15155170) → WO-6에서 유통사 탭용 원장 수집(리드 종류 "유통사", 기본 목록 제외).
  - 주소 정리: 도로명주소 API는 신청하지 않음 — 이미 쓰는 카카오 로컬 주소 검색(도로명·지번·좌표 반환)으로 엑셀 가져오기 주소를 정리.
  - 제외: 공정위 통신판매사업자(개인정보 사유로 대표가 제외).
- 확인: 데이터셋별 출처 표시 조건, 카카오 로컬 API 저장·다수 고객 제공 범위. 개발계정 하루 호출 한도 대비 사용량.

## §7 병렬 작업 규칙
- WO-0은 단독으로 먼저(패치가 여러 파일을 건드림). 이후 트랙별 브랜치: A(데이터) WO-1→WO-6, B(리드 화면) WO-2→WO-4→WO-3, C(휴대폰·홈) WO-5.
- 파일 소유: A = lib/gov-*.ts, lib/shared-places*.ts, lib/public-data/*, app/api/cron/*, 수집 관련 마이그레이션 / B = components/permit-leads-view.tsx, components/lead-*.tsx,
  domains/lead/*(A는 읽기만), app/api/leads/* / C = components/mobile-*.tsx, app/mobile/*, app/dashboard/*, components/home-*.tsx.
- lib/store.ts는 세 트랙 모두 "새 파일에 구현 + store에서는 import·re-export 한두 줄"만. 기존 함수 본문 수정은 해당 트랙 하나만.
- 마이그레이션 파일명 접두: A 20261026_1xxxxx, B 20261026_2xxxxx, C 20261026_3xxxxx(충돌 방지).
- 합치는 순서: 먼저 끝난 트랙부터, 합치기 전 main 최신으로 rebase + 전체 테스트·빌드. 공통 파일 충돌은 내용 비교로 합치고 양쪽 기능 유지.
