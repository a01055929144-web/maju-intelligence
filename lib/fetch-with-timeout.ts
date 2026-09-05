// 2026-08-31 에러 처리/복원력 감사 후속: 이 앱의 fetch 호출은 대부분 try/catch로 네트워크
// 오류(요청 자체가 실패하는 경우)는 잡지만, 서버가 응답을 아예 보내지 않고 연결만 붙들고
// 있는 경우(방화벽이 요청을 조용히 드롭하거나, 서버가 무한 대기하는 등)는 fetch가 영원히
// resolve/reject 되지 않아 "저장 중" 버튼이 영구히 잠기는 등 화면이 멈춘 것처럼 보입니다.
// AbortController로 일정 시간 뒤 강제로 요청을 취소해 이 경우에도 반드시 오류로 끝나게 합니다.
//
// 기존 fetch(url, init) 호출부를 최소한으로 바꿔 쓸 수 있도록 같은 시그니처를 유지하고,
// 세 번째 인자로 타임아웃(ms)만 추가로 받습니다. AbortSignal.timeout()이 있는 최신 런타임에서는
// 그걸 그대로 쓰고, 없으면 setTimeout + AbortController로 동일하게 동작합니다.
const DEFAULT_TIMEOUT_MS = 15000;

export class FetchTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`요청이 ${Math.round(timeoutMs / 1000)}초 안에 응답하지 않았습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.`);
    this.name = "FetchTimeoutError";
  }
}

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  // 호출부가 이미 자기만의 signal을 넘겼다면(드묾) 그쪽 취소도 함께 반영합니다.
  if (init.signal) {
    init.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new FetchTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
