import type { RelationProduct } from "@/lib/store/07-store-relation-home";

// CX-141: 외식업 확인 전 매장 홈 — 가격 없이 상품 목록과 안내만(주문 불가). 가격·원가는 이 컴포넌트에 전달되지 않는다.
export function StoreRelationPreview({ companyName, products }: { companyName?: string; products: RelationProduct[] }) {
  return <section aria-label="전체 상품 미리보기" className="mx-auto w-full max-w-6xl space-y-3 px-5 py-4">
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950" role="status">
      가격은 {companyName || "거래처"}가 매장 확인 후 공개됩니다(보통 당일). 확인 전에는 상품 목록만 볼 수 있고 주문은 확인 뒤에 가능합니다.</p>
    {products.length ? <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product, index) => <li className="rounded-xl border border-slate-200 bg-white p-3" key={`${product.name}-${index}`}>
        <p className="break-words text-sm font-black text-slate-950">{product.name}</p>
        <p className="mt-1 text-xs font-semibold text-slate-600">{[product.category, product.spec, product.unit].filter(Boolean).join(" · ")}</p>
      </li>)}
    </ul> : <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-600">아직 보여 드릴 상품이 없습니다.</p>}
  </section>;
}
