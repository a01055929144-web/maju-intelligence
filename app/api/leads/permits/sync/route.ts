import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 2026-08-31 빌드 오류 수정: 이 라우트가 의존하던 지방행정 인허가 데이터개방(localdata.go.kr) API는
// 2026-04-16 폐쇄되어 lib/localdata.ts와 함께 2026-08-24 제거됐는데, 이 라우트의 import는 그때
// 정리되지 않고 남아 있어 매 배포가 "Module not found: Can't resolve './localdata'"로 실패하고
// 있었습니다(빌드 로그 확인, 2026-09-01). 이 엔드포인트를 호출하는 화면이 없는 것도 확인했습니다
// (permit-leads-view.tsx는 "localdata_api"를 과거 데이터의 출처 표시 라벨로만 참조할 뿐, 이 API를
// 호출하지 않습니다). 같은 데이터는 행정안전부_식품_일반음식점 조회서비스(lib/gov-restaurant.ts,
// syncGovRestaurantLeads)로 대체되어 매일 cron으로 자동 수집되고 있어 별도 대체 없이 안전하게
// 비활성화합니다.
export async function POST() {
  return NextResponse.json(
    {
      message:
        "이 자동 수집 기능은 더 이상 사용되지 않습니다(localdata.go.kr API 서비스 종료). 같은 신규 리드는 행정안전부 조회서비스로 매일 자동 수집됩니다."
    },
    { status: 410 }
  );
}
