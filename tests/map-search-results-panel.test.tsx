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

function textOf(html: string) {
  return html.replace(/<[^>]+>/g, "|").split("|").map((part) => part.trim()).filter(Boolean);
}

it("결과가 0건이면 빈 안내만 보이고 숫자 0이 따로 찍히지 않는다", () => {
  const texts = textOf(renderToStaticMarkup(<MapSearchResultsPanel {...base} message="카카오 검색 결과가 없습니다." />));
  expect(texts).toContain("카카오 검색 결과가 없습니다.");
  expect(texts).not.toContain("0");
});

it("내부 결과만 있고 미등록 결과가 없으면 안내 문구를 아래에 함께 보여 준다", () => {
  const row = { id: "c1", name: "합성 거래처", address: "합성 주소", chip: "거래처" };
  const texts = textOf(renderToStaticMarkup(<MapSearchResultsPanel {...base} customers={[row]} message="카카오 검색 결과가 없습니다." />));
  expect(texts).toContain("합성 거래처");
  expect(texts).toContain("카카오 검색 결과가 없습니다.");
});
