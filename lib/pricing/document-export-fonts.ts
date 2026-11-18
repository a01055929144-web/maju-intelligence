/** Missing font subsets must fail visibly instead of producing a partly unreadable PNG. */
export function completeDocumentFontCSS(css: string): string {
  const faces = Array.from(css.matchAll(/@font-face\s*\{([^}]*)\}/g));
  if (!faces.length || faces.some(face => !/src:\s*url\(["']?data:[^;]+;base64,[A-Za-z0-9+/=]+/.test(face[1])))
    throw new Error("이미지 글꼴을 모두 불러오지 못했습니다. 화면을 새로고침한 뒤 다시 저장해 주세요.");
  return css;
}
