import { getStoreSession } from "@/lib/auth";
import { listStoreProfiles } from "@/lib/store/11-store-direct-signup";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { StoreProfileForm } from "./store-profile-form";

const STATUS_LABEL: Record<string, string> = { active: "사업자 확인됨", registration_pending: "개업 예정", closed: "폐업", suspended: "휴업" };

/** 카카오로 로그인했지만 연결된 유통사 매장이 아직 없는 사용자: 매장 정보 입력 → 매장 홈. 본인 프로필만 읽는다. */
export async function StoreDirectSignup() {
  const session = await getStoreSession();
  if (!session) return null;
  let profiles: Awaited<ReturnType<typeof listStoreProfiles>>;
  try { profiles = await listStoreProfiles(session.authUserId); }
  catch { return <Card><CardContent className="pt-4"><p role="alert">매장 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p></CardContent></Card>; }

  if (!profiles.length) return <Card>
    <CardHeader><CardTitle>매장 정보 입력</CardTitle></CardHeader>
    <CardContent className="space-y-3"><p className="text-sm text-slate-600">처음이시네요. 매장 정보를 입력하면 바로 시작할 수 있어요. 거래할 유통사는 나중에 초대코드나 받은 링크로 연결합니다.</p><StoreProfileForm /></CardContent>
  </Card>;

  return <>{profiles.map((profile) => <Card key={profile.id}>
    <CardHeader><CardTitle>{profile.storeName}</CardTitle></CardHeader>
    <CardContent className="space-y-2">
      <p className="text-sm text-slate-600">{STATUS_LABEL[profile.businessStatus] ?? profile.businessStatus}{profile.baseAddress ? ` · ${profile.baseAddress}` : ""}</p>
      <p role="status" className="text-sm">아직 연결된 유통사가 없습니다. 유통사에서 받은 초대코드나 견적서·단가표 링크로 거래를 시작하세요.</p>
    </CardContent>
  </Card>)}</>;
}
