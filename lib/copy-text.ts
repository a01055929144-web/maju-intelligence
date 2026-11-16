// 공용 복사 함수: 클립보드 권한이 없거나 지원하지 않으면 false (호출한 쪽이 안내 문구를 정한다).
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
