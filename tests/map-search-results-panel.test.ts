import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MapSearchResultsPanel } from "../components/map/map-search-results-panel";

const noop = () => undefined;
const base = {
  bulkBusy: false,
  bulkMessage: "",
  customers: [],
  loading: false,
  message: "",
  newLeads: [],
  onClose: noop,
  onOpenCustomer: noop,
  onOpenLead: noop,
  onRegister: noop,
  onRegisterSelected: noop,
  onToggle: noop,
  onToggleAll: noop,
  query: "가짜상호",
  salesLeads: [],
  selectedIds: new Set<string>(),
  unregistered: [],
};

function textsOf(props: Partial<typeof base> & Record<string, unknown>) {
  const html = renderToStaticMarkup(createElement(MapSearchResultsPanel, { ...base, ...props }));
  return html.replace(/<[^>]+>/g, "|").split("|").map((part) => part.trim()).filter(Boolean);
}

it("결과가 0건이면 빈 안내만 보이고 숫자 0이 따로 찍히지 않는다", () => {
  const texts = textsOf({ message: "카카오 검색 결과가 없습니다." });
  expect(texts).toContain("카카오 검색 결과가 없습니다.");
  expect(texts).not.toContain("0");
});

it("내부 결과만 있고 미등록 결과가 없으면 안내 문구를 아래에 함께 보여 준다", () => {
  const row = { id: "c1", name: "합성 거래처", address: "합성 주소", chip: "거래처" };
  const texts = textsOf({ customers: [row], message: "카카오 검색 결과가 없습니다." });
  expect(texts).toContain("합성 거래처");
  expect(texts).toContain("카카오 검색 결과가 없습니다.");
});

it("줄 번호(지도 번호 핀)와 `결과 전체 보기` 버튼을 보여 준다", () => {
  const html = renderToStaticMarkup(createElement(MapSearchResultsPanel, {
    ...base,
    customers: [{ id: "c1", name: "합성 거래처", address: "합성 주소", chip: "거래처", pin: 1 }],
    unregistered: [{ id: "u1", name: "합성 미등록", address: "합성 주소 2", chip: "카카오 미등록", pin: 2 }],
    onFitAll: noop,
  }));
  expect(html).toContain('aria-label="지도 번호 1"');
  expect(html).toContain('aria-label="지도 번호 2"');
  expect(html).toContain("결과 전체 보기");
});

it("onFitAll이 없거나 결과가 0건이면 `결과 전체 보기`를 숨긴다", () => {
  expect(textsOf({ onFitAll: noop })).not.toContain("결과 전체 보기");
  const row = { id: "c1", name: "합성 거래처", address: "합성 주소", chip: "거래처", pin: 1 };
  expect(textsOf({ customers: [row] })).not.toContain("결과 전체 보기");
});
