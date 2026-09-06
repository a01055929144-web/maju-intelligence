// 저장된 전화번호(숫자만 있거나 이미 하이픈이 섞여 있어도)를 화면 표시용으로
// 보기 편한 하이픈 형식(010-1234-5678, 02-1234-5678 등)으로 바꿔줍니다.
// components/sales-route-map-workspace.tsx의 formatPhoneNumberInput(입력 중 실시간 포맷)과
// 같은 자릿수 규칙을 쓰되, 이 함수는 이미 저장된 값을 그대로 표시할 때 씁니다.
export function formatPhoneNumber(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (!digits) return value;

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

// 초대받은 직원이 카카오 로그인 전에 "이 초대가 나에게 온 것이 맞는지" 확인할 때 씁니다.
// 연락처는 개인정보라 전체를 화면에 보여주지 않고, 가운데 자리만 별표로 가려서 본인만
// 알아볼 수 있는 수준으로만 노출합니다(예: 010-1234-5678 -> 010-****-5678).
export function maskPhoneNumber(value: string | null | undefined): string {
  const formatted = formatPhoneNumber(value);
  if (!formatted) return "";
  const parts = formatted.split("-");
  if (parts.length < 2) return formatted;
  const maskedMiddleParts = parts.map((part, index) => (index === 0 || index === parts.length - 1 ? part : "*".repeat(part.length)));
  return maskedMiddleParts.join("-");
}
