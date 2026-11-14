import NextLink from "next/link";
import { mapCustomerNotices } from "@/domains/route/map-customer-notice";

// 지도 왼쪽 위에 겹쳐 보이는 거래처 안내(M1). 안내할 게 없으면 아무것도 그리지 않는다.
export function MapCustomerNotice({ customerCount, unplacedCount }: { customerCount: number; unplacedCount: number }) {
  const notices = mapCustomerNotices(customerCount, unplacedCount);
  if (!notices.length) return null;
  return <div aria-label="거래처 안내" className="pointer-events-none absolute left-3 top-14 z-10 flex max-w-[calc(100%-1.5rem)] flex-col gap-1 text-xs font-bold" role="status">
    {notices.map((notice) => <p className="pointer-events-auto w-fit rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-amber-900 shadow-sm" key={notice.text}>
      {notice.text}
      {notice.upload ? <> · <NextLink className="underline underline-offset-2" href="/">거래처 올리기</NextLink></> : null}
    </p>)}
  </div>;
}
