import type { StopPhotoGroup } from "@/domains/delivery/stop-photo-groups";

// CC-63: 정류장(배송 1회)별 · 주문별 배송 사진. 서명 주소는 짧게 살아 있으므로 새 탭으로 열어 본다.
export function StopPhotoList({ groups }: { readonly groups: ReadonlyArray<StopPhotoGroup> }) {
  return (
    <ul aria-label="배송별 사진" className="space-y-3">
      {groups.map((group) => (
        <li key={group.stopId}>
          <p className="text-xs font-black text-slate-700">{group.routeDate} 배송</p>
          {group.orders.map((order, index) => (
            <div className="mt-1" key={order.orderId ?? "none"}>
              {group.orders.length > 1 ? <p className="text-[11px] font-bold text-slate-500">{order.orderId ? `주문 ${index + 1}` : "주문 연결 없음"}</p> : null}
              <div className="flex flex-wrap gap-2">
                {order.photos.map((photo, photoIndex) => (
                  <a aria-label={`${group.routeDate} 배송 사진 ${photoIndex + 1}`} className="block h-16 w-16 overflow-hidden rounded-md border border-slate-200 bg-slate-100" href={photo.url} key={photo.id} rel="noreferrer" target="_blank">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 짧은 서명 주소라 next/image 최적화를 쓰지 않는다 */}
                    <img alt="" className="h-full w-full object-cover" loading="lazy" src={photo.url} />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}
