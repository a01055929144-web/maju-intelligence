import NextLink from "next/link";
import { mapCustomerNotices } from "@/domains/route/map-customer-notice";

// 지도 왼쪽 위에 겹쳐 보이는 거래처 안내(M1). 안내할 게 없으면 아무것도 그리지 않는다.
export function MapCustomerNotice({ approximateCount = 0, customerCount, inline = false, onOpenApproximate, onOpenUnplaced, unplacedCount }: { approximateCount?: number; customerCount: number; inline?: boolean; onOpenApproximate?: () => void; onOpenUnplaced?: () => void; unplacedCount: number }) {
  // inline = 오른쪽 거래처 목록 맨 위 한 줄 안내(48-1b). 0곳이면 목록의 빈 화면이 "거래처 올리기"를 이미 안내하므로 중복으로 안 그린다.
  const notices = mapCustomerNotices(customerCount, unplacedCount, approximateCount).filter((notice) => !(inline && notice.upload && customerCount === 0));
  if (!notices.length) return null;
  return <div aria-label="거래처 안내" className={inline ? "flex flex-col gap-1 border-b border-slate-100 px-3 py-2 text-xs font-bold" : "pointer-events-none absolute left-3 top-14 z-10 flex max-w-[calc(100%-1.5rem)] flex-col gap-1 text-xs font-bold"} role="status">
    {notices.map((notice) => <p className={`${inline ? "" : "pointer-events-auto "}w-fit rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-amber-900 shadow-sm`} key={notice.text}>
      {notice.text}
      {notice.upload ? <> · <NextLink className="underline underline-offset-2" href="/">거래처 올리기</NextLink></> : null}
      {notice.unplaced && onOpenUnplaced ? <> · <button className="underline underline-offset-2" onClick={onOpenUnplaced} type="button">주소 확인</button></> : null}
      {notice.approximate && onOpenApproximate ? <> · <button className="underline underline-offset-2" onClick={onOpenApproximate} type="button">주소 확인</button></> : null}
    </p>)}
  </div>;
}
