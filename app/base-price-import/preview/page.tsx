import { notFound } from "next/navigation";
import { BasePriceImportMappingPreview } from "@/components/base-price-import-mapping-preview";
import { isCiLayoutFixturesEnabled } from "@/lib/ci-layout-fixtures";

const rows = [
  { 기준일: "2026-11-03", 품목코드: "ERP-001", 품명: "깐양파 10kg", 참고매입가: "18,500", 참고매출가: "22,000" },
  { 기준일: "2026-11-03", 품목코드: "ERP-002", 품명: "냉동 대파 1kg", 참고매입가: "3,200", 참고매출가: "4,500" },
  { 기준일: "2026-11-04", 품목코드: "ERP-003", 품명: "국산 감자 20kg", 참고매입가: "31,000", 참고매출가: "38,000" },
];

export default function BasePriceImportPreviewPage() {
  if (!isCiLayoutFixturesEnabled()) notFound();
  return <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-8 sm:py-12"><div className="mx-auto max-w-6xl"><BasePriceImportMappingPreview headers={Object.keys(rows[0])} rows={rows} /></div></main>;
}
