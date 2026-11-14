// CC-42a-2(M1): 지도 위 거래처 안내. 거래처가 0~1곳이면 올리라고 알려 주고, 주소를 좌표로 못 바꾼 거래처 수를 보여 준다.
export type MapCustomerNotice = { text: string; upload: boolean; unplaced: boolean };

export function mapCustomerNotices(customerCount: number, unplacedCount: number): MapCustomerNotice[] {
  const notices: MapCustomerNotice[] = [];
  if (customerCount <= 1) notices.push({ text: `거래처가 ${customerCount}곳입니다`, upload: true, unplaced: false });
  if (unplacedCount > 0) notices.push({ text: `좌표 못 찾은 거래처 ${unplacedCount}`, upload: false, unplaced: true });
  return notices;
}
