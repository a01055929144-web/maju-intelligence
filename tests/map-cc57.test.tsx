import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MapListRow } from "../components/map/map-list-row";
import { PlaceLinkBadges } from "../components/place-link-badges";

it("지도 링크 배지: 순서 K → N → G, 목록·상세가 같은 부품", () => {
  const html = renderToStaticMarkup(<PlaceLinkBadges places={{ google: "https://g.test", kakao: "https://k.test", naver: "https://n.test" }} />);
  expect(html.indexOf(">K<")).toBeLessThan(html.indexOf(">N<"));
  expect(html.indexOf(">N<")).toBeLessThan(html.indexOf(">G<"));
  expect(readFileSync("components/permit-leads-view.tsx", "utf8")).toContain("<PlaceLinkBadges");
  expect(readFileSync("components/map-lead-channel-icons.tsx", "utf8")).toContain("<PlaceLinkBadges");
});

it("목록 행: 둘째 줄은 배지 → 아이콘 → 부가 글(아이콘이 오른쪽 끝에 몰리지 않음), 연필은 덮어 그리지 않고 첫 줄 끝 칸", () => {
  const html = renderToStaticMarkup(<MapListRow badges={<i>BADGE</i>} editLabel="상세 열기" icons={<i>ICONS</i>} index={0} name="가짜식당" onEdit={() => undefined} onSelect={() => undefined} selected={false} stage={<i>STAGE</i>} subText="부가 글" total={3} />);
  const at = (text: string) => html.indexOf(text);
  expect(at("BADGE")).toBeLessThan(at("ICONS"));
  expect(at("ICONS")).toBeLessThan(at("부가 글"));
  expect(at("STAGE")).toBeLessThan(at('aria-label="상세 열기"'));
  expect(at('aria-label="상세 열기"')).toBeLessThan(at("BADGE"));
  expect(html).not.toContain("absolute right-1 top-0.5");
});

it("지도 작업 화면: 목록·마커 선택은 열린 상세도 바꾸고, 상세 ← →는 왼쪽 목록 순서로 연결", () => {
  const source = readFileSync("components/sales-route-map-workspace.tsx", "utf8");
  expect(source).toContain("setDetailLeadId((current) => (current ? leadId : current))");
  expect(source).toContain("onSelectLead={selectLeadFromList}");
  expect(source).toContain("hasNext={Boolean(detailNextId)}");
  expect(source).toContain("hasPrevious={Boolean(detailPreviousId)}");
  expect(source).toContain("leadsForRightPanel[detailLeadIndex + 1]");
});
