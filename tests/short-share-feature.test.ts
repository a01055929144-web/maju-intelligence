import { afterEach, expect, it } from "vitest";
import { isSharePreviewBot, isShortShareCode, shortShareDevice, shortShareLinksEnabled } from "../lib/pricing/short-share-feature";

const company = "00000000-0000-4000-8000-000000000001";
const previous = { enabled: process.env.SHORT_SHARE_LINKS, companies: process.env.SHORT_SHARE_LINKS_COMPANY_IDS };

afterEach(() => {
  if (previous.enabled === undefined) delete process.env.SHORT_SHARE_LINKS;
  else process.env.SHORT_SHARE_LINKS = previous.enabled;
  if (previous.companies === undefined) delete process.env.SHORT_SHARE_LINKS_COMPANY_IDS;
  else process.env.SHORT_SHARE_LINKS_COMPANY_IDS = previous.companies;
});

it("requires both the default-off switch and representative-company allowlist", () => {
  process.env.SHORT_SHARE_LINKS_COMPANY_IDS = company;
  delete process.env.SHORT_SHARE_LINKS;
  expect(shortShareLinksEnabled(company)).toBe(false);
  process.env.SHORT_SHARE_LINKS = "true";
  expect(shortShareLinksEnabled(company)).toBe(true);
  expect(shortShareLinksEnabled("00000000-0000-4000-8000-000000000002")).toBe(false);
});

it("accepts only the unambiguous ten-character alphabet", () => {
  expect(isShortShareCode("Ab3xK9pQ2z")).toBe(true);
  expect(isShortShareCode("Ab3xK9pQ20")).toBe(false);
  expect(isShortShareCode("short")).toBe(false);
});

it("separates preview bots from real mobile and desktop views", () => {
  expect(isSharePreviewBot("KAKAOTALK-SCRAP/1.0")).toBe(true);
  expect(isSharePreviewBot("Mozilla/5.0 iPhone")).toBe(false);
  expect(shortShareDevice("Mozilla/5.0 iPhone Mobile")).toBe("mobile");
  expect(shortShareDevice("Mozilla/5.0 Windows NT 10.0")).toBe("desktop");
});
