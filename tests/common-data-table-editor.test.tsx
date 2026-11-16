import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CommonDataTable, type CommonTableColumn } from "../components/common-data-table";
import { parseEditorNumber } from "../lib/common-data-table";

type Line = { id: string; name: string; price: number; qty: number | null };
const rows: Line[] = [{ id: "a", name: "가짜상품A", price: 1000, qty: 3 }, { id: "b", name: "가짜시가상품", price: 0, qty: 2 }];
const columns: CommonTableColumn<Line>[] = [
  { key: "name", label: "상품", value: (row) => row.name },
  { key: "price", label: "단가", value: (row) => row.price, align: "right" },
  { key: "qty", label: "수량", value: (row) => row.qty, align: "right", editor: { type: "number", ariaLabel: (row) => `${row.name} 수량`, integer: true, min: 0, onChange: () => undefined } },
  { key: "sum", label: "금액", value: (row) => (row.price > 0 ? row.price * (row.qty ?? 0) : null), align: "right", total: true, totalFormat: (total) => `${total.toLocaleString("ko-KR")}원` }
];

it("parseEditorNumber: 빈칸 · 쉼표 · 정수 · 범위 · 잘못된 글자", () => {
  expect(parseEditorNumber("")).toEqual({ ok: true, value: null });
  expect(parseEditorNumber(" 1,200 ")).toEqual({ ok: true, value: 1200 });
  expect(parseEditorNumber("2.5")).toEqual({ ok: true, value: 2.5 });
  expect(parseEditorNumber("2.5", { integer: true })).toEqual({ ok: false });
  expect(parseEditorNumber("-1", { min: 0 })).toEqual({ ok: false });
  expect(parseEditorNumber("101", { max: 100 })).toEqual({ ok: false });
  expect(parseEditorNumber("abc")).toEqual({ ok: false });
});

it("공용 표: 입력 칸 열은 줄마다 입력칸, 계산 열 합계(시가 줄 제외)와 보조 글이 합계 줄에 나온다", () => {
  const html = renderToStaticMarkup(<CommonDataTable columns={columns} rowKey={(row) => row.id} rows={rows} selectable={false} settingsKey="test:editor" totalNote="시가 1줄 제외" />);
  expect(html).toContain('aria-label="가짜상품A 수량"');
  expect(html).toContain('aria-label="가짜시가상품 수량"');
  expect(html).toContain('inputMode="numeric"');
  expect(html).toContain("3,000원");
  expect(html).toContain("시가 1줄 제외");
});

it("공용 표: totalNote는 합계 줄이 없으면 나오지 않고, editor 없는 열은 입력칸이 없다", () => {
  const plain: CommonTableColumn<Line>[] = [{ key: "name", label: "상품", value: (row) => row.name }];
  const html = renderToStaticMarkup(<CommonDataTable columns={plain} rowKey={(row) => row.id} rows={rows} selectable={false} settingsKey="test:plain" totalNote="시가 1줄 제외" />);
  expect(html).not.toContain("시가 1줄 제외");
  expect(html).not.toContain("<input");
});
