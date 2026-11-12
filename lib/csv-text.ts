/**
 * CSV 파일 바이트 → 글자. UTF-8(BOM 있든 없든)을 먼저 엄격하게 해석하고, 깨지면 cp949(EUC-KR, 엑셀 한글 CSV)로 다시 읽는다.
 * 구글시트 CSV는 BOM이 없어서 SheetJS에 바이트로 주면 1252로 읽어 한글이 깨진다 — 글자로 풀어서 넘긴다.
 */
export function decodeCsvText(buffer: ArrayBuffer): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^﻿/, ""); }
  catch { return new TextDecoder("euc-kr").decode(buffer); }
}
