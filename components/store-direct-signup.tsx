import { getStoreSession } from "@/lib/auth";
import { listStoreProfiles, type StoreProfileSummary } from "@/lib/store/11-store-direct-signup";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { StoreProfileForm } from "./store-profile-form";

const STATUS_LABEL: Record<string, string> = { active: "사업자 확인됨", registration_pending: "개업 예정", closed: "폐업", suspended: "휴업" };
const FIXTURE_PROFILE: StoreProfileSummary = { id: "00000000-0000-4000-8000-0000000000f1", storeName: "합성 가입 식당", role: "owner", businessStatus: "registration_pending", baseAddress: "서울 합성구 합성로 1" };

function SignupForm() {
  return <Card>
    <CardHeader><CardTitle>매장 정보 입력</CardTitle></CardHeader>
    <CardContent className="space-y-3"><p className="text-sm text-slate-600">처음이시네요. 매장 정보를 입력하면 바로 시작할 수 있어요. 거래할 유통사는 나중에 초대코드나 받은 링크로 연결합니다.</p><StoreProfileForm /></CardContent>
  </Card>;
}

function ProfileHome({ profiles }: { profiles: StoreProfileSummary[] }) {
  return <>{profiles.map((profile) => <Card key={profile.id}>
    <CardHeader><CardTitle>{profile.storeName}</CardTitle></CardHeader>
    <CardContent className="space-y-2">
      <p className="text-sm text-slate-600">{STATUS_LABEL[profile.businessStatus] ?? profile.businessStatus}{profile.baseAddress ? ` · ${profile.baseAddress}` : ""}</p>
      <p role="status" className="text-sm">아직 연결된 유통사가 없습니다. 유통사에서 받은 초대코드나 견적서·단가표 링크로 거래를 시작하세요.</p>
    </CardContent>
  </Card>)}</>;
}

/** 카카오로 로그인했지만 연결된 유통사 매장이 아직 없는 사용자: 매장 정보 입력 → 매장 홈. 본인 프로필만 읽는다.
 *  fixture는 CI 전용(세션·DB 없이 화면만): new=입력 폼, profile=가입 직후 홈. */
export async function StoreDirectSignup({ fixture }: { fixture?: string }) {
  if (fixture === "store-direct-signup-new") return <SignupForm />;
  if (fixture === "store-direct-signup-profile") return <ProfileHome profiles={[FIXTURE_PROFILE]} />;
  const session = await getStoreSession();
  if (!session) return null;
  let profiles: StoreProfileSummary[];
  try { profiles = await listStoreProfiles(session.authUserId); }
  catch { return <Card><CardContent className="pt-4"><p role="alert">매장 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p></CardContent></Card>; }
  return profiles.length ? <ProfileHome profiles={profiles} /> : <SignupForm />;
}
