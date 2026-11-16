// CC-63: 지도 거래처 상세 "배송 사진" — 정류장(배송 1회)별 · 주문별로 묶는다. React·DB를 모른다.
export type StopRow = { readonly id: string; readonly routeDate: string };
export type PhotoRow = { readonly id: string; readonly stopId: string; readonly orderId: string | null; readonly sortOrder: number; readonly url: string };
export type StopPhotoGroup = { readonly stopId: string; readonly routeDate: string; readonly orders: ReadonlyArray<{ readonly orderId: string | null; readonly photos: ReadonlyArray<PhotoRow> }> };

/** 최근 배송(날짜 내림차순) 중 사진이 있는 것만, 최대 limit회. 같은 정류장의 사진은 주문별로 나눈다(주문 없는 사진은 한 묶음). */
export function groupStopPhotos(stops: ReadonlyArray<StopRow>, photos: ReadonlyArray<PhotoRow>, limit = 5): StopPhotoGroup[] {
  return [...stops].sort((a, b) => b.routeDate.localeCompare(a.routeDate)).slice(0, limit).flatMap((stop) => {
    const own = photos.filter((photo) => photo.stopId === stop.id).sort((a, b) => a.sortOrder - b.sortOrder);
    if (!own.length) return [];
    const orders = Array.from(new Set(own.map((photo) => photo.orderId)), (orderId) => ({ orderId, photos: own.filter((photo) => photo.orderId === orderId) }));
    return [{ stopId: stop.id, routeDate: stop.routeDate, orders }];
  });
}
