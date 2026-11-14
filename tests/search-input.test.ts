import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SearchInput } from "../components/ui/search-input";

const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(SearchInput, { onChange: () => undefined, value: "", ...props }));

it("값이 없으면 ×가 없고, 있으면 aria-label '검색어 지우기' 버튼이 생긴다", () => {
  expect(render({ value: "" })).not.toContain("검색어 지우기");
  expect(render({ value: "가짜상호" })).toContain('aria-label="검색어 지우기"');
});

it("검색 입력칸·크기·브라우저 기본 ×를 숨기는 클래스·자리표시자", () => {
  const html = render({ placeholder: "상호·주소·전화", size: "sm", "aria-label": "표 검색" });
  expect(html).toContain('type="search"');
  expect(html).toContain('aria-label="표 검색"');
  expect(html).toContain("!h-9");
  expect(html).toContain("::-webkit-search-cancel-button");
  expect(render({})).not.toContain("!h-9");
});

it("children(최근 검색어 자리)과 data-* 속성이 그대로 들어간다", () => {
  const html = render({ children: createElement("p", null, "최근 검색어"), inputProps: { "data-table-search": "" } });
  expect(html).toContain("최근 검색어");
  expect(html).toContain("data-table-search");
});
