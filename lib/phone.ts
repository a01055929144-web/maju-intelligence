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
