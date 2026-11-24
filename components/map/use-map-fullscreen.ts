import { useEffect, useRef, useState } from "react";

// 지도 작업공간 전체 화면 상태·리스너·토글 묶음입니다(D-6 ⑤-4, 동작 변화 0).
export function useMapFullscreen(onEnter: () => void) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => null);
      return;
    }
    onEnter();
    await workspaceRef.current?.requestFullscreen().catch(() => null);
  }

  return { isFullscreen, toggleFullscreen, workspaceRef };
}
