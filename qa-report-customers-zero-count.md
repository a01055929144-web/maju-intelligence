# QA Report — 거래처 관리 "0건 표시" 버그

## Summary
`docs/pages/customers.md`의 KNOWN ISSUES/TODO에 미착수로 남아 있던 "거래처 0건 표시(companyId 불일치 의심)" 건을 조사했다. 실제로는 **companyId 불일치로 진짜 0행이 조회되는 것이 아니라, `/api/customers` 호출이 실패하는 여러 경로가 프런트에서 전부 "0건(빈 원장)"과 동일하게 표시되는 것**이 원인이다. 데이터 손실은 아니지만, 실제로는 데이터가 있는 회사를 사용자가 "거래처가 없다"고 오인하게 만드는 P1급 UX/신뢰성 결함이다.

## Findings

1. **admin 프리뷰 모드는 세션이 아니라 URL 쿼리 하나로만 테넌트를 구분한다.**
   `lib/auth.ts`의 `getRequestAuthScope`(104~148행)는 고객 로그인 세션이 없으면(관리자가 특정 회사를 미리보기할 때) `request.nextUrl.searchParams.get("companyId")`(또는 POST body의 companyId) 외에는 companyId를 알아낼 방법이 없다. 이 값이 없으면 `ok: false, reason: "missing_company_id"`를 반환하고, `app/api/customers/route.ts` GET(7~18행)은 이를 그대로 401로 응답한다.

2. **`GET /api/customers`에 try/catch가 없다.**
   `app/api/customers/route.ts` GET은 `getCustomerMaster(scope.companyId, ...)`를 감싸는 에러 처리가 전혀 없다. `lib/store.ts`의 `getCustomerMaster`(3740~3839행)는 select 티어를 순차 시도하다가 "컬럼 없음" 에러(`42703`)가 아닌 다른 에러(네트워크 순단, Supabase 일시 장애, 인증키 문제 등)를 만나면 그 자리에서 즉시 `throw`한다(3823~3824행). 이 예외는 라우트 핸들러 밖으로 그대로 튀어나가 Next.js가 일반 500 응답으로 변환한다.

3. **프런트가 "실패"와 "진짜 0건"을 구분하지 않는다.**
   `app/crm/timeline/page.tsx`의 거래처 목록 fetch 이펙트(232~263행):
   ```ts
   fetchWithTimeout(withCompanyQuery("/api/customers"), { cache: "no-store" }, 12000)
     .then((response) => {
       if (!response.ok) return null;      // 401/500 모두 여기서 걸러짐
       return response.json();
     })
     .then((payload) => {
       if (payload?.source !== "supabase") {
         setCustomerSource(payload?.source === "empty" ? "empty" : "error");
         setCustomers([]);                 // 실패도, 진짜 빈 값도 결과적으로 []
         ...
       }
       ...
     })
     .catch(() => {
       setCustomerSource("error");
       setCustomers([]);                   // 타임아웃(12초)·네트워크 예외도 동일하게 []
     });
   ```
   `customerSource`가 `"error"`로 설정돼도 화면에 노출되는 건 `LedgerListStatusStrip`(2234~2290행)의 작은 문구("거래처 원장 미연결")뿐이고, 페이지 전역에서 실제로 눈에 띄는 지표는 전부 `customers.length`(스탯 카드, "0/0곳" 카운터 등, 459~466행·1125행·1138행)라서 사용자에게는 진짜 empty와 구분 없이 "0건"으로 보인다.

## Root Cause
1번(401)·2번(500)·타임아웃(12초 초과) 중 어느 하나만 발생해도 3번의 클라이언트 로직 때문에 결과가 동일하게 "0건"으로 뭉개진다. 즉 단일 버그가 아니라 **"API가 200+`{source:"supabase"}` 이외의 무엇을 반환하든 화면은 항상 0건으로 수렴한다"는 구조적 결함**이다. 기존 KNOWN ISSUES에 적혀 있던 "companyId 스코프 불일치"는 이 구조적 결함이 만들어내는 겉보기 증상 중 하나(주로 1번 경로)였을 뿐, 실제 Supabase 쿼리가 잘못된 회사 데이터를 조회한 정황은 코드상 확인되지 않았다(`route.ts`가 `scope.ok===false`일 때 `getCustomerMaster` 호출 자체를 막기 때문에, 잘못된/기본 companyId로 실제 조회가 나가는 경로는 없음).

"간헐적으로 보고됨"이라는 기존 증상 설명과도 부합한다 — 고정된 링크 버그라면 항상 재현돼야 하는데, 실제로는 네트워크 순단·Supabase 일시 오류·타임아웃처럼 타이밍에 좌우되는 원인들이라 간헐적으로만 나타난다.

## Severity
**P1** (`CLAUDE.md` 3절 기준: 핵심 기능 사용 불가급은 아니지만 "거래처 데이터 오류"로 표시되는 신뢰성 문제 — 실제 데이터 손실은 없지만 사용자가 데이터 손실로 오인할 수 있음).

## Impact
- `app/crm/timeline`(거래처 관리) 페이지 자체.
- 같은 `withCompanyQuery`/`getAdminCompanyIdFromUrl` 패턴을 쓰는 다른 admin 프리뷰 페이지들(`app/dashboard`, `app/revenue/pipeline`, `app/revenue/transactions`, `app/assistant`, `app/reports/[id]`, `app/crm/summary`, `app/admin/companies`, `app/admin/uploads` 등)도 동일한 "companyId 쿼리 파라미터 하나에 테넌트 구분을 전부 의존" 구조라 원리상 같은 클래스의 문제에 노출될 수 있다(이번 조사 범위는 `docs/pages/customers.md`의 Allowed Files로 한정했으므로 다른 페이지는 코드 재검토가 필요함을 별도로 표시해둔다).
- 실제 DB 데이터 손실/오염은 아님(Data Integrity 체크리스트 관점에서 `normalized_customers` 자체는 영향 없음).

## Recommended Fix
1. `app/api/customers/route.ts` GET에 try/catch를 추가해 `getCustomerMaster` 예외를 잡고, `{ message, source: "error" }` 형태의 명확한 에러 JSON + 5xx 상태코드로 응답한다(현재처럼 처리되지 않은 예외를 Next.js 기본 500으로 흘려보내지 않는다).
2. `app/crm/timeline/page.tsx`의 fetch 핸들러에서 `response.ok`가 false이거나 `payload`가 null인 경우를 `source: "empty"`(진짜 0건)와 명확히 분리된 `"error"` 상태로 처리하고, `LedgerListStatusStrip`뿐 아니라 눈에 띄는 배너/토스트로 "불러오지 못했습니다. 다시 시도" 같은 명확한 에러 UI와 재시도 버튼을 제공한다. 스탯 카드 등 `customers.length`를 그대로 노출하는 곳들도 `customerSource==="error"`일 때는 "0곳"이 아니라 "불러오기 실패"로 표시되게 분기한다.
3. (선택, 근본 대응) admin 프리뷰 모드의 companyId를 URL 쿼리에만 의존하지 않고, `withCompanyQuery`/`getAdminCompanyIdFromUrl`이 실패했을 때(파라미터 누락) 페이지 진입 시점에 명시적으로 안내하거나 이전 화면으로 되돌리는 가드를 추가하는 것도 함께 고려할 수 있음 — 다만 이번 스코프(Allowed Files)를 넘어서므로 별도 티켓으로 분리 권장.

## Codex Task
- **Objective**: `/api/customers` 실패(401/5xx/timeout)와 진짜 0건을 화면에서 구분되게 만든다.
- **Files**: `app/api/customers/route.ts`, `app/crm/timeline/page.tsx` (모두 `docs/pages/customers.md`의 Allowed Files 안에 있음)
- **Do Not Touch**: `lib/store.ts`의 lead 전용 섹션, `auth/**`, `billing/**` (customers.md 4절 그대로 적용)
- **Required Changes**:
  - `route.ts` GET: `getCustomerMaster` 호출을 try/catch로 감싸고 실패 시 `{ message: string, source: "error" }`를 5xx로 반환.
  - `page.tsx`: 위 Recommended Fix 1·2번 반영. `customerSource` state에 이미 `"error"` 값이 있으니 이를 실제로 활용해 empty와 시각적으로 다르게(예: 빨간 배너 + 재시도 버튼) 렌더링.
- **Preserve**: `docs/pages/customers.md`의 Preserve 항목(카드 3형제 구조, 담당자/차량 드롭다운, 연락처 하이픈 포맷) 그대로 유지. 정상(200, source:"supabase") 경로의 기존 동작/레이아웃은 변경하지 않는다.
- **Test**:
  - 정상: companyId 있고 데이터 있는 회사 → 기존과 동일하게 목록 표시.
  - 진짜 0건: companyId 있고 데이터 없는 회사 → "거래처 원장 비어 있음" 유지.
  - 실패 재현: `/api/customers`가 401/500을 반환하도록 강제(예: companyId 쿼리 제거, 또는 `getCustomerMaster`에 임시로 throw 삽입)했을 때 화면이 "0건"이 아니라 명확한 에러 상태로 보이는지 확인.
- **Completion Criteria**: 위 3가지 시나리오가 시각적으로 서로 다르게 표시되고, `npx tsc --noEmit` / `npm run lint` / `npm run build` PASS.
- **Verification**: 사용자 또는 Codex가 로컬에서 개발 서버로 세 시나리오를 직접 재현해 스크린샷/로그로 확인.

## 문서 반영 안내
이번 세션은 GitHub 저장소를 별도로 클론한 임시 환경이라 `docs/pages/customers.md`의 KNOWN ISSUES/TODO 항목은 **이 클론에만** 갱신되어 있고, 실제 작업 저장소(`C:\maju-deploy` 및 OneDrive 미러)에는 반영되지 않았다. 이 보고서 내용을 그대로 옮기거나, 첨부된 `customers.md`의 변경된 KNOWN ISSUES/TODO 문단을 두 폴더 모두에 동일하게 복사해달라.
