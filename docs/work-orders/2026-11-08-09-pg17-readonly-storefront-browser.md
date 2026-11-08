# 09 격리 PG17 → 실제 /store 열람 UI 검증

운영 실행이 아닌 CI 전용 테스트다. 제품 API/화면/인증/RPC와 기능 설정은 변경하지 않는다.

- 기존 scripts/test-pricing-p2-browser.mjs의 loopback SQL bridge와 Next 서버 실행 흐름을 재사용한다.
- P2_READONLY_PG17_SMOKE=true인 경우 정확한 readonly_storefront_browser_test DB와 PG17만 허용한다. 기본 PG16 전체 주문 테스트 경로는 유지한다.
- 합성 회사 1, 거래처 1, 게시 견적 버전 1, 품목 18, can_order=false 링크 1을 격리 DB에 준비한다. 운영 문서/고객/링크를 복사하거나 읽지 않는다.
- 브라우저의 /api/storefront 응답을 가로채지 않는다. 실제 Next API → 기존 supabaseRequest → loopback REST 호환 bridge → service_role SQL → 실제 PG17 행을 읽는다.
- PC1440/390에서 18품목·판매가/시세·규격·단위·주문 불가·원가 비노출·넘침 없음과 회수 후 404를 확인한다. DB 주문/요청/품목/선호 설정은 모두 0건이어야 한다. 허용된 열람 기록만 발생한다.
- 서버/브라우저 외부 요청은 차단하며, 새 열람 전용 발급 설정·회원 설정은 테스트 자식 프로세스에서도 OFF다. 비밀/토큰/전체 URL은 결과 JSON·로그에 기록하지 않는다.
- 캡처와 비식별 결과는 CI test-results/readonly-pg17에 보존한다. 운영 가칭 고객 생성은 자동 TMS 후보/감사 흔적 위험 때문에 계속 중단 상태다.
- #368의 SQL/API opt-in 검증과 별개이며, 이 테스트는 운영 SQL 승인이나 기능 ON의 근거로 대체할 수 없다.
