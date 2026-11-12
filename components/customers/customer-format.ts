// 거래처(매출처) 화면에서 쓰는 순수 서식·라벨 함수. app/crm/timeline/page.tsx에서 옮김(동작 변경 없음).

export function buildPlaceSearchLinks(customerName: string, address?: string) {
  const fullQuery = [customerName, address].map((value) => value?.trim()).filter(Boolean).join(" ") || "거래처";
  const encodedFullQuery = encodeURIComponent(fullQuery);
  // 네이버 지도는 상호명+상세주소(동/호수·층수 포함)로 검색하면 네이버 DB 주소 표기와 조금만 달라도
  // 결과가 없거나 다른 곳으로 연결되는 경우가 많아, 상호명 단독 검색이 훨씬 안정적으로 매칭됩니다.
  const encodedNaverQuery = encodeURIComponent(customerName?.trim() || fullQuery);
  return [
    { href: `https://map.naver.com/p/search/${encodedNaverQuery}`, label: "네이버 지도" },
    { href: `https://section.blog.naver.com/Search/Post.naver?keyword=${encodedFullQuery}`, label: "네이버 블로그" },
    { href: `https://map.kakao.com/?q=${encodedFullQuery}`, label: "카카오맵" },
    { href: `https://www.google.com/maps/search/${encodedFullQuery}`, label: "구글맵" }
  ];
}

export function attachmentLabel(type: string, title: string) {
  if (type === "business_license") return "사업자등록증";
  if (type === "identity_document") return "신분증";
  if (type === "bank_account") return "통장사본";
  if (type === "loading_position") return "배송 적재위치 사진/영상";
  if (type === "delivery_proof") return "배송완료 증빙";
  return title || "첨부자료";
}

export function noteTypeLabel(type: string) {
  if (type === "delivery") return "배송";
  if (type === "sales") return "상담";
  if (type === "settlement") return "정산";
  return "메모";
}

export function attachmentTitleFromType(type: string) {
  if (type === "business_license") return "사업자등록증";
  if (type === "identity_document") return "신분증";
  if (type === "bank_account") return "통장사본";
  if (type === "loading_position") return "배송 적재위치 사진/영상";
  if (type === "delivery_proof") return "배송완료 증빙";
  return "기타 첨부자료";
}

export function guessMimeType(url: string) {
  const normalized = url.toLowerCase().split("?")[0];
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".mp4")) return "video/mp4";
  if (normalized.endsWith(".mov")) return "video/quicktime";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

export function gradeClassName(grade: string) {
  if (grade === "A") return "bg-emerald-100 text-emerald-800";
  if (grade === "B") return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-700";
}

export function normalizeBusinessRegistrationNumber(value: string) {
  return value.replace(/[^0-9]/g, "");
}

export function formatBusinessRegistrationNumber(value: string) {
  const digits = normalizeBusinessRegistrationNumber(value).slice(0, 10);
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

// 입력 중에도 자동으로 하이픈이 붙도록 하는 실시간 포맷터입니다 (10자리 미만이어도 동작).
export function formatBusinessNumberInput(value: string) {
  const digits = normalizeBusinessRegistrationNumber(value).slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

// 휴대폰(010 등, 3-4-4)과 서울/지역 번호(02는 2자리, 그 외는 3자리 지역번호)를
// 입력 자릿수에 맞춰 실시간으로 하이픈을 붙여줍니다.
export function formatPhoneNumberInput(value: string) {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (!digits) return "";

  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

export function isValidBusinessRegistrationNumber(value: string) {
  const digits = normalizeBusinessRegistrationNumber(value);
  if (!/^[0-9]{10}$/.test(digits)) return false;

  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0) + Math.floor((Number(digits[8]) * 5) / 10);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(digits[9]);
}

export function extractRegion(address: string) {
  const parts = address.split(/\s+/).filter(Boolean);
  return parts.find((part) => /(구|군|시|동|읍|면)$/.test(part)) || parts[1] || parts[0] || "";
}
