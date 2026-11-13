// CC-41: 금액 입력칸 공용 규칙. 원 단위(소수 없음). 입력 중에도 천 단위 쉼표, 붙여넣기는 쉼표·원·공백을 걷어 낸다.

/** "56,760원" · " 56 760 " · "56760" → 56760. 빈 값·숫자가 아닌 값은 null. 음수는 allowNegative일 때만(앞의 − 또는 -). 소수는 버린다. */
export function parseMoney(text: string, allowNegative = false): number | null {
  const compact = text.replace(/[\s,원]/g, "").replace(/^−/, "-");
  const match = allowNegative ? /^-?\d+(\.\d+)?$/.exec(compact) : /^\d+(\.\d+)?$/.exec(compact);
  if (!match) return null;
  const value = Math.trunc(Number(compact));
  return Number.isSafeInteger(value) ? value : null;
}

/** 입력 중 보여 줄 글: 숫자만 남기고 천 단위 쉼표(음수 허용 시 맨 앞 "-"만 유지). 비면 "". */
export function formatMoneyInput(text: string, allowNegative = false): string {
  const negative = allowNegative && text.trimStart().startsWith("-");
  const digits = text.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return negative ? "-" : "";
  return `${negative ? "-" : ""}${Number(digits).toLocaleString("ko-KR")}`;
}

/** 쉼표를 넣고 나서도 커서가 같은 숫자 뒤에 있도록, 커서 앞의 숫자 개수를 새 글에서의 위치로 옮긴다. */
export function caretAfterFormat(formatted: string, digitsBeforeCaret: number): number {
  if (digitsBeforeCaret <= 0) return formatted.startsWith("-") ? 1 : 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) seen += 1;
    if (seen === digitsBeforeCaret) return i + 1;
  }
  return formatted.length;
}

/** 표시용: 56760 → "56,760원". */
export const formatWon = (value: number) => `${value.toLocaleString("ko-KR")}원`;
