import { Info } from "lucide-react";

const SIZE_CLASSES = {
  sm: { icon: "h-2.5 w-2.5", wrap: "h-4 w-4" },
  md: { icon: "h-3 w-3", wrap: "h-5 w-5" },
  lg: { icon: "h-3.5 w-3.5", wrap: "h-6 w-6" }
} as const;

/**
 * 항상 노출되던 긴 설명 문구를 아이콘 + 마우스오버 툴팁으로 대체하는 공통 컴포넌트입니다.
 * 페이지 헤더 부제목, 카드/섹션 헤더 설명, 목록 항목 설명 등 어디서든 재사용합니다.
 */
export function InfoTooltip({
  className = "",
  size = "md",
  text,
  tone = "slate"
}: {
  readonly className?: string;
  readonly size?: keyof typeof SIZE_CLASSES;
  readonly text: string;
  readonly tone?: "slate" | "emerald" | "amber";
}) {
  const toneClassName =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-400";
  const { icon, wrap } = SIZE_CLASSES[size];

  return (
    <span className={`grid shrink-0 place-items-center rounded-full ${wrap} ${toneClassName} ${className}`} title={text}>
      <Info className={icon} />
    </span>
  );
}
