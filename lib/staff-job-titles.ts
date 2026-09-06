// 직원 "담당 업무" 관련 클라이언트-세이프 상수/타입만 모아둔 파일입니다.
// staff-management-panel.tsx(클라이언트 컴포넌트)가 이 값을 직접 써야 하는데, lib/store.ts는
// Supabase 호출·환경변수 등 서버 전용 코드를 담고 있어 거기서 값을 import하면 그 모듈 전체가
// 브라우저 번들에 끌려 들어가 런타임 에러가 납니다(예: "original argument must be of type
// Function"). 그래서 이 값들만 별도 파일로 분리해 lib/store.ts와 클라이언트 컴포넌트가 함께
// import합니다.

// 권한 체계(lib/workspace.ts)와 연결된 기본 4개 담당 업무입니다. 화면에서 항상 고정으로 노출되고
// 삭제할 수 없습니다. 회사가 추가한 커스텀 이름표는 company_job_titles 테이블에서 가져와 이 목록
// 뒤에 이어붙입니다.
export const DEFAULT_STAFF_JOB_TITLES: Array<{ label: string; value: string }> = [
  { label: "배송기사", value: "driver" },
  { label: "영업직원", value: "sales" },
  { label: "현장관리자", value: "manager" },
  { label: "일반직원", value: "member" }
];

export type CompanyJobTitle = {
  id: string;
  label: string;
  createdAt: string;
};
