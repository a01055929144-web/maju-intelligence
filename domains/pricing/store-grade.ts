// CC-32c: 매장 등급(회사가 직접 만드는 분류: VIP·일반·신규 …). 카탈로그(margin_templates)·매출 등급 A/B/C와 별개.
export const STORE_GRADE_COLORS = ["slate", "teal", "blue", "amber", "rose", "violet", "emerald"] as const;
export type StoreGradeColor = (typeof STORE_GRADE_COLORS)[number];

/** 이름은 앞뒤 공백을 지운 1~40자. 비교는 대소문자·앞뒤 공백 무시(DB 유일 규칙과 같음). */
export const normalizeGradeName = (name: unknown) => (typeof name === "string" ? name.trim() : "");
export const gradeNameKey = (name: string) => name.trim().toLowerCase();

export function parseGradeInput(input: { name?: unknown; color?: unknown; sortOrder?: unknown }): { name: string; color: StoreGradeColor; sortOrder: number } | null {
  const name = normalizeGradeName(input.name);
  const color = (input.color ?? "slate") as StoreGradeColor;
  const sortOrder = input.sortOrder === undefined ? 0 : Number(input.sortOrder);
  if (name.length < 1 || name.length > 40 || !STORE_GRADE_COLORS.includes(color) || !Number.isInteger(sortOrder) || sortOrder < -1000 || sortOrder > 100000) return null;
  return { name, color, sortOrder };
}

/** 칩 색 클래스(화면 공용). */
export const gradeChipClass: Record<StoreGradeColor, string> = {
  slate: "bg-slate-100 text-slate-800", teal: "bg-teal-100 text-teal-900", blue: "bg-blue-100 text-blue-900", amber: "bg-amber-100 text-amber-900",
  rose: "bg-rose-100 text-rose-900", violet: "bg-violet-100 text-violet-900", emerald: "bg-emerald-100 text-emerald-900",
};
