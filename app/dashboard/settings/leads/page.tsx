import { redirect } from "next/navigation";

/** 11/3: 리드 관리 설정은 설정 > 영업 정보 탭으로 합쳤습니다. */
export default function LeadWorkspaceSettingsPage() {
  redirect("/dashboard/settings/sales");
}
