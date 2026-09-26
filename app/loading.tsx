import { AppStateScreen } from "@/components/app-state-screen";

export default function AppLoading() {
  return (
    <AppStateScreen
      description="데이터를 안전하게 불러오고 있습니다. 잠시만 기다려주세요."
      heading="작업 진행 중입니다"
      tone="loading"
    />
  );
}
