/**
 * 카카오톡 공유(카카오 JavaScript SDK). 지도와 같은 JavaScript 키를 씁니다.
 * 키가 없거나 SDK를 못 불러오면 false를 돌려주고, 호출한 쪽이 공유창·복사로 대신합니다.
 */
type KakaoSdk = { init: (key: string) => void; isInitialized: () => boolean; Share: { sendDefault: (options: Record<string, unknown>) => void } };
declare global { interface Window { Kakao?: KakaoSdk } }

const SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
let loading: Promise<KakaoSdk | null> | null = null;

function loadSdk(): Promise<KakaoSdk | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.Kakao) return Promise.resolve(window.Kakao);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve(window.Kakao || null);
    script.onerror = () => { loading = null; resolve(null); };
    document.head.appendChild(script);
  });
  return loading;
}

export async function shareToKakao(input: { title: string; description: string; url: string; buttonTitle?: string; imageUrl?: string }): Promise<boolean> {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  if (!key) return false;
  const kakao = await loadSdk();
  if (!kakao) return false;
  try {
    if (!kakao.isInitialized()) kakao.init(key);
    // 11/4: 글자만 있는 카드 대신 이미지 카드(feed)로 보냅니다.
    const link = { mobileWebUrl: input.url, webUrl: input.url };
    kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: input.title,
        description: input.description,
        imageUrl: input.imageUrl || `${window.location.origin}/mobile/join/opengraph-image`,
        imageWidth: 1200,
        imageHeight: 630,
        link
      },
      buttons: [{ title: input.buttonTitle || "초대 열기", link }]
    });
    return true;
  } catch {
    return false;
  }
}
