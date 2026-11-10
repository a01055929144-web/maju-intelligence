type Territory={id:string;name:string;areas:string[]};
const aliases:Record<string,string>={서울:"서울특별시",부산:"부산광역시",대구:"대구광역시",인천:"인천광역시",광주:"광주광역시",대전:"대전광역시",울산:"울산광역시",세종:"세종특별자치시",경기:"경기도",강원:"강원특별자치도",충북:"충청북도",충남:"충청남도",전북:"전북특별자치도",전남:"전라남도",경북:"경상북도",경남:"경상남도",제주:"제주특별자치도"};
export function orderAddressArea(base:string,knownAreas:Record<string,readonly string[]>,generalGu:Record<string,readonly string[]>={}) {
  const parts=base.trim().split(/\s+/);const province=aliases[parts[0]]||parts[0];
  const city=province==="세종특별자치시"?"세종시":parts[1];
  if(!knownAreas[province]?.includes(city))return null;
  const parent=`${province} ${city}`,gu=generalGu[parent];
  if(gu && parts[2]?.endsWith("구") && !gu.includes(parts[2]))return null;
  return gu?.includes(parts[2])?`${parent} ${parts[2]}`:parent;
}
export function matchOrderDeliveryArea(base:string,territories:Territory[],knownAreas:Record<string,readonly string[]>,generalGu:Record<string,readonly string[]>={}) {
  const area=orderAddressArea(base,knownAreas,generalGu);
  if(!area)return {eligible:false as const,reason:"address_unknown"};
  // Configuration must be an exact administrative key, not a road/detail prefix.
  const configured=territories.map(t=>({...t,areas:t.areas.map(a=>{
    const key=orderAddressArea(a,knownAreas,generalGu);
    const parts=a.trim().split(/\s+/);parts[0]=aliases[parts[0]]||parts[0];
    return key===parts.join(" ")?key:null;
  })}));
  // An invalid area in a different locality cannot disable every store in the company.
  // An invalid key sharing this city may hide an overlap, so keep that locality closed.
  const parent=area.split(" ").slice(0,2).join(" ");
  if(territories.some(t=>t.areas.some(a=>{
    const parts=a.trim().split(/\s+/);parts[0]=aliases[parts[0]]||parts[0];
    return parts.slice(0,2).join(" ")===parent && orderAddressArea(a,knownAreas,generalGu)!==parts.join(" ");
  })))return {eligible:false as const,reason:"verification_unavailable"};
  // City-wide and district-specific territories both count; no arbitrary priority.
  const matches=configured.filter(t=>t.areas.some(a=>a!==null&&(a===area||area.startsWith(`${a} `))));
  if(matches.length!==1)return {eligible:false as const,reason:matches.length?"ambiguous_area":territories.some(t=>t.areas.length)?"outside_area":"territory_unconfigured"};
  return {eligible:true as const,reason:"eligible",territory:matches[0]};
}
export function deliveryEligibilityMessage(reason:string) {
  switch(reason){
    case "eligible":return "등록한 매장 주소로 배송할 수 있습니다.";
    case "address_unknown":return "분리 등록된 기본주소·상세주소가 없거나 시·도와 시·군·구를 확인할 수 없습니다. 카카오 주소 검색으로 주소를 등록하고 담당자에게 확인해 주세요.";
    case "territory_unconfigured":return "발행 회사의 배송 권역이 설정되지 않았습니다. 담당자에게 배송 권역 설정을 요청해 주세요.";
    case "outside_area":return "등록한 매장 주소는 이 회사의 배송 권역 밖입니다. 담당자에게 배송 가능 여부를 문의해 주세요.";
    case "ambiguous_area":return "주소가 여러 배송 권역과 겹칩니다. 담당자에게 권역 설정 확인을 요청해 주세요.";
    case "weekdays_unconfigured":return "배송 권역의 가능 요일이 설정되지 않았습니다. 담당자에게 요일 설정을 요청해 주세요.";
    case "territory_link_required":return "주소에 맞는 배송 권역은 있지만 매장의 권역 연결이 완료되지 않았습니다. 담당자에게 매장 권역 연결을 요청해 주세요.";
    default:return "배송 가능 여부를 확인하지 못했습니다. 다시 확인하거나 담당자에게 문의해 주세요.";
  }
}
