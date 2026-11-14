// CC-47-2a 순번 모양 하나: 공통 표 번호 칸과 지도 목록(거래처·신규·영업)이 같이 쓴다. 셀·sticky 자리는 쓰는 쪽 책임.
export function RowNumber({ className = "", value }: { readonly value: number; readonly className?: string }) {
  return <span className={`text-right text-xs tabular-nums text-slate-400 ${className}`.trim()}>{value.toLocaleString("ko-KR")}</span>;
}
