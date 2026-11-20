import { expect, it } from "vitest";
import { completeDocumentFontCSS } from "../lib/pricing/document-export-fonts";

it("requires every Korean subset to contain embedded font bytes", () => {
  const face = (src: string, range: string) => `@font-face { font-family: Noto; src: ${src}; unicode-range: ${range}; }`;
  const embedded = face('url("data:font/woff2;base64,YWJj") format("woff2")', "U+AC00-ACFF");
  expect(completeDocumentFontCSS(embedded + embedded)).toBe(embedded + embedded);
  for (const incomplete of ["", embedded + face("url()", "U+AD00-ADFF"), embedded + face("", "U+AD00-ADFF"), face('url("/font.woff2")', "U+AC00-ACFF")])
    expect(() => completeDocumentFontCSS(incomplete)).toThrow("화면을 새로고침");
});
