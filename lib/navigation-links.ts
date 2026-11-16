/**
 * Builds real turn-by-turn navigation links (start -> waypoints -> destination) for the map
 * apps our delivery staff actually use, instead of a single-place search deep link.
 *
 * Provider capabilities (see https://apis.map.kakao.com/ios_v2/docs/getting-started/urlscheme/
 * and https://guide.ncloud-docs.com/docs/maps-url-scheme for the official parameter names):
 * - Kakao Map: `kakaomap://route?sp=lat,lng&ep=lat,lng&by=car&vp=lat,lng&vp2=..&vp5=..` supports
 *   up to 5 waypoints AND has a `http://m.map.kakao.com/scheme/route?...` mobile-web fallback
 *   that works even without the app installed (redirects to the app store on mobile, renders a
 *   route page on desktop). This makes Kakao the only option that works everywhere, so it is the
 *   primary/default choice.
 * - Naver Map: `nmap://route/car?slat=&slng=&sname=&dlat=&dlng=&dname=&v1lat=&v1lng=&v1name=..
 *   v5lat/v5lng/v5name&appname=` supports up to 5 waypoints but ONLY works if the Naver Map app
 *   is installed (no documented multi-stop web fallback), so it is offered as a secondary,
 *   app-required option.
 * - Tmap: only a reliable single-destination scheme is documented
 *   (`tmap://route?rGoName=&rGoX=&rGoY=`); multi-waypoint app-scheme parameters are not publicly
 *   documented, so Tmap is offered as a single-destination, app-required option only.
 */

export type GeoPoint = { lat: number; lng: number };

export type NavigationStop = {
  name: string;
  point: GeoPoint | null;
};

export type RouteNavigationLinks = {
  /** Works with or without the Kakao Map app installed; use as the default action. */
  kakaoWebUrl: string;
  kakaoAppUrl: string;
  /** Requires the Naver Map app to be installed. */
  naverAppUrl: string | null;
  /** Requires the Tmap app to be installed; destination only, ignores waypoints. */
  tmapAppUrl: string | null;
  /** Universal fallback when no coordinates could be resolved at all (place-name search). */
  naverSearchUrl: string;
  /** True once at least one provider has real coordinates to route with. */
  hasCoordinates: boolean;
};

const APP_NAME = "maju-intelligence";
const MAX_WAYPOINTS = 5;

export function buildNaverSearchUrl(query: string) {
  return `https://map.naver.com/p/search/${encodeURIComponent(query.trim() || "매장")}`;
}

export function buildRouteNavigationLinks(
  origin: NavigationStop,
  destination: NavigationStop,
  waypoints: NavigationStop[] = []
): RouteNavigationLinks {
  const cappedWaypoints = waypoints.filter((stop) => stop.point).slice(0, MAX_WAYPOINTS);
  const searchQuery = [destination.name].filter(Boolean).join(" ");
  const naverSearchUrl = buildNaverSearchUrl(searchQuery);

  if (!origin.point || !destination.point) {
    return {
      kakaoWebUrl: naverSearchUrl,
      kakaoAppUrl: naverSearchUrl,
      naverAppUrl: null,
      tmapAppUrl: null,
      naverSearchUrl,
      hasCoordinates: false
    };
  }

  const kakaoParams = buildKakaoRouteParams(origin.point, destination.point, cappedWaypoints);
  const naverParams = buildNaverRouteParams(origin, destination, cappedWaypoints);
  const tmapParams = buildTmapRouteParams(destination);

  return {
    kakaoWebUrl: `http://m.map.kakao.com/scheme/route?${kakaoParams}`,
    kakaoAppUrl: `kakaomap://route?${kakaoParams}`,
    naverAppUrl: `nmap://route/car?${naverParams}&appname=${encodeURIComponent(APP_NAME)}`,
    tmapAppUrl: tmapParams ? `tmap://route?${tmapParams}` : null,
    naverSearchUrl,
    hasCoordinates: true
  };
}

function buildKakaoRouteParams(origin: GeoPoint, destination: GeoPoint, waypoints: NavigationStop[]) {
  const params = new URLSearchParams({
    sp: `${origin.lat},${origin.lng}`,
    ep: `${destination.lat},${destination.lng}`,
    by: "car"
  });

  waypoints.forEach((stop, index) => {
    if (!stop.point) return;
    const key = index === 0 ? "vp" : `vp${index + 1}`;
    params.set(key, `${stop.point.lat},${stop.point.lng}`);
  });

  return params.toString();
}

function buildNaverRouteParams(origin: NavigationStop, destination: NavigationStop, waypoints: NavigationStop[]) {
  if (!origin.point || !destination.point) return "";
  const params = new URLSearchParams({
    slat: String(origin.point.lat),
    slng: String(origin.point.lng),
    sname: origin.name || "출발지",
    dlat: String(destination.point.lat),
    dlng: String(destination.point.lng),
    dname: destination.name || "목적지"
  });

  waypoints.forEach((stop, index) => {
    if (!stop.point) return;
    const n = index + 1;
    params.set(`v${n}lat`, String(stop.point.lat));
    params.set(`v${n}lng`, String(stop.point.lng));
    params.set(`v${n}name`, stop.name || `경유지${n}`);
  });

  return params.toString();
}

function buildTmapRouteParams(destination: NavigationStop) {
  if (!destination.point) return "";
  const params = new URLSearchParams({
    rGoName: destination.name || "목적지",
    rGoX: String(destination.point.lng),
    rGoY: String(destination.point.lat)
  });
  return params.toString();
}

// ---- CC-54: 카카오내비 길 안내(기사 화면 CX-46a가 그대로 쓴다) ----
export type NaviDestination = { name: string; point: GeoPoint | null; address?: string };

/** `Kakao.Navi.start`에 넘길 값. 좌표가 없으면 null(내비는 좌표로만 목적지를 받는다). wgs84 = x 경도, y 위도. */
export function buildKakaoNaviStartOptions(destination: NaviDestination) {
  if (!destination.point) return null;
  return { name: destination.name || "목적지", x: destination.point.lng, y: destination.point.lat, coordType: "wgs84" as const };
}

/** 내비를 못 열 때 대신 여는 카카오맵 길찾기 링크: 좌표가 있으면 목적지 좌표, 없으면 주소·이름 검색. */
export function buildKakaoMapDestinationUrl(destination: NaviDestination) {
  if (destination.point) return `https://map.kakao.com/link/to/${encodeURIComponent(destination.name || "목적지")},${destination.point.lat},${destination.point.lng}`;
  return `https://map.kakao.com/link/search/${encodeURIComponent((destination.address || destination.name || "").trim() || "매장")}`;
}

/**
 * 카카오내비 앱을 목적지가 들어간 채 연다. 앱 키·SDK·좌표가 없거나 호출이 실패하면 카카오맵 길찾기 링크로 넘어간다.
 * 휴대폰 브라우저는 사용자가 누를 때만 앱을 열 수 있으므로 누르는 동작 안에서 부른다. 처리 결과: "navi" | "map-link".
 * 카카오 개발자 콘솔의 "카카오내비" 사용 설정이 꺼져 있으면 SDK가 던져 map-link로 대신한다.
 */
export async function startKakaoNavi(destination: NaviDestination): Promise<"navi" | "map-link"> {
  const options = buildKakaoNaviStartOptions(destination);
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  if (options && key) {
    const { loadKakaoSdk } = await import("@/lib/kakao-share");
    const kakao = await loadKakaoSdk();
    if (kakao?.Navi) {
      try {
        if (!kakao.isInitialized()) kakao.init(key);
        kakao.Navi.start(options);
        return "navi";
      } catch {
        // 아래 카카오맵 링크로 대신한다.
      }
    }
  }
  window.location.assign(buildKakaoMapDestinationUrl(destination));
  return "map-link";
}
