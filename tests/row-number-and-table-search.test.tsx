import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CommonDataTable, type CommonTableColumn } from "../components/common-data-table";
import { RowNumber } from "../components/ui/row-number";

type Row = { id: string; name: string };
const columns: CommonTableColumn<Row>[] = [{ key: "name", label: "상호", searchable: true, value: (row) => row.name }];
const rows: Row[] = [{ id: "a", name: "가짜상호1" }, { id: "b", name: "가짜상호2" }];
const render = (props: Record<string, unknown> = {}) => renderToStaticMarkup(<CommonDataTable columns={columns} rowKey={(row) => row.id} rows={rows} {...props} />);

it("RowNumber: 표·목록 공통 모양, 천 단위 쉼표, 추가 클래스", () => {
  const html = renderToStaticMarkup(<RowNumber className="w-6" value={1234} />);
  expect(html).toContain("text-right text-xs tabular-nums text-slate-400");
  expect(html).toContain("w-6");
  expect(html).toContain(">1,234<");
});

it("공통 표: 번호 칸이 RowNumber로 1부터 찍힌다(numbered=false면 없다)", () => {
  const html = render();
  expect(html).toMatch(/<span class="text-right text-xs tabular-nums text-slate-400">1<\/span>/);
  expect(html).toMatch(/<span class="text-right text-xs tabular-nums text-slate-400">2<\/span>/);
  expect(render({ numbered: false })).not.toContain("text-slate-400\">1</span>");
});

it("공통 표 검색칸: 공통 SearchInput(검색 입력·aria-label·단축키용 data 속성)이고 빈 값이면 × 없음", () => {
  const html = render();
  expect(html).toContain('type="search"');
  expect(html).toContain('aria-label="표 검색"');
  expect(html).toContain("data-table-search");
  expect(html).toContain("!h-9");
  expect(html).not.toContain("검색어 지우기");
});

it("검색 가능한 열이 없으면 검색칸이 없다", () => {
  expect(render({ columns: [{ ...columns[0], searchable: false }] })).not.toContain("표 검색");
});
