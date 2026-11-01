import { notFound } from "next/navigation";
import { ImportRowEditor } from "@/components/import-row-editor";
import { isCiLayoutFixturesEnabled } from "@/lib/ci-layout-fixtures";

const fields = [
  { key: "name", label: "상품명" },
  { key: "spec", label: "규격" },
  { key: "purchasePrice", label: "확정 원가" },
  { key: "salesPrice", label: "판매가" },
];

const values = [
  { name: "깐양파", spec: "10kg", purchasePrice: "18,500", salesPrice: "22,000" },
  { name: "냉동 대파", spec: "1kg", purchasePrice: "3,200", salesPrice: "4,500" },
  { name: "국산 감자", spec: "20kg", purchasePrice: "31,000", salesPrice: "38,000" },
  { name: "참기름", spec: "1.8L", purchasePrice: "19,800", salesPrice: "24,000" },
];

export default function ImportRowEditorPreviewPage() {
  if (!isCiLayoutFixturesEnabled()) notFound();
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <ImportRowEditor
          fields={fields}
          initialRows={values.map((row, index) => ({
            id: `preview-${index + 1}`,
            sourceRowNumber: index + 2,
            originalValues: row,
            values: index === 1 ? { ...row, spec: "2kg" } : row,
          }))}
        />
      </div>
    </main>
  );
}
