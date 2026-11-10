"use client";
import Link from "next/link";
import { useCallback,useEffect,useRef,useState } from "react";
import { Button } from "./ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "./ui/card";
import { CommonDataTable,type CommonTableColumn } from "./common-data-table";
import { kstDateTime } from "../domains/order/order-rules";

type Item={id:string;customerName:string;revision:number;submittedAt:string;knownTotal:number;lines:{name:string;quantity:number;unit:string}[]};
type Result={items:Item[];page:number;hasMore:boolean;canConfirm:boolean;message?:string};
export function PendingOrderEntry({companyId}:{companyId:string}) {
  const [notice,setNotice]=useState("");
  useEffect(()=>{let live=true; void fetch(`/api/pricing-pending-orders?${new URLSearchParams({companyId})}`,{cache:"no-store"})
    .then(async r=>{if(r.status===404)return; if(!r.ok)throw new Error(); const b:Result=await r.json();
      if(live)setNotice(b.items.length?`배송일 확인 대기 ${b.items.length}${b.hasMore?"건 이상":"건"}`:"배송일 확인 대기 주문 보기");})
    .catch(()=>{if(live)setNotice("배송일 확인 대기 주문 다시 확인");}); return()=>{live=false;};},[companyId]);
  return notice?<p role="status"><Link className="inline-flex min-h-[44px] items-center underline" href={`/revenue/pricing/pending-orders?${new URLSearchParams({companyId})}`}>{notice}</Link></p>:null;
}
export function PendingOrderInbox({companyId}:{companyId:string}) {
  const [result,setResult]=useState<Result|null>(null),[page,setPage]=useState(1),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [dates,setDates]=useState<Record<string,string>>({});
  const retry=useRef<Record<string,{date:string;key:string}>>({});
  const load=useCallback(async()=>{
    const response=await fetch(`/api/pricing-pending-orders?${new URLSearchParams({companyId,page:String(page)})}`,{cache:"no-store"});
    const body:Result=await response.json(); if(!response.ok)throw new Error(body.message||"대기 주문을 다시 조회해 주세요."); setResult(body);
  },[companyId,page]);
  useEffect(()=>{setResult(null);void load().catch(c=>setMessage(c instanceof Error?c.message:"다시 조회해 주세요."));},[load]);
  async function confirm(item:Item,action:"confirm"|"cancel"="confirm") {
    const date=action==="confirm"?dates[item.id]:null; if(action==="confirm"&&!date){setMessage("고객과 확인한 배송일을 직접 선택해 주세요.");return;}
    if(!window.confirm(action==="confirm"?`${item.customerName} 주문의 배송일을 ${date}로 확정할까요? 배차·배송 완료·ERP 처리는 자동 실행하지 않습니다.`:`${item.customerName} 미정 주문을 취소할까요? 행사 재고 예약 대상에서 제외됩니다. 실제 재고·결제는 변경하지 않습니다.`))return;
    setBusy(true);setMessage("");
    const previous=retry.current[item.id];
    const marker=action+":"+(date||"");const key=previous?.date===marker?previous.key:crypto.randomUUID();retry.current[item.id]={date:marker,key};
    try {
      const response=await fetch("/api/pricing-pending-orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId:item.id,expectedRevision:item.revision,deliveryDate:date,requestId:key,action})});
      const body=await response.json();if(!response.ok)throw new Error(body.message||"결과를 확인하지 못했습니다.");
      delete retry.current[item.id];const completed=action==="confirm"?`배송일을 ${date}로 확정했습니다.`:"주문을 취소했습니다. 행사 예약 대상에서 제외됐습니다.";setMessage(completed);
      try{await load();}catch{setMessage(`${completed} 목록을 다시 조회해 주세요.`);}
    }catch(c){setMessage(c instanceof Error?c.message:"결과를 확인하지 못했습니다.");}finally{setBusy(false);}
  }
  const columns:CommonTableColumn<Item>[]=[
    {key:"customer",label:"거래처",value:r=>r.customerName},
    {key:"submitted",label:"접수 시각",value:r=>r.submittedAt,render:r=>new Date(r.submittedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})},
    {key:"lines",label:"주문 품목",value:r=>r.lines.map(l=>`${l.name} ${l.quantity}${l.unit}`).join(", ")},
    {key:"amount",label:"확인된 합계",value:r=>r.knownTotal,render:r=>`${r.knownTotal.toLocaleString("ko-KR")}원`},
    {key:"confirm",label:"배송일 확인 대기",value:()=>"배송일 확인 대기",render:r=><div className="flex min-w-0 flex-col gap-2">
      <label className="text-sm">{r.customerName} 배송일<input aria-label={`${r.customerName} 배송일`} className="min-h-[44px] w-full rounded border p-2" type="date"
        min={kstDateTime(new Date()).date} value={dates[r.id]||""} disabled={busy||!result?.canConfirm} onChange={e=>setDates(d=>({...d,[r.id]:e.target.value}))}/></label>
      <Button className="min-h-[44px]" disabled={busy||!result?.canConfirm||!dates[r.id]} onClick={()=>void confirm(r)}>배송일 확정</Button>
      <Button variant="outline" className="min-h-[44px]" disabled={busy||!result?.canConfirm} onClick={()=>void confirm(r,"cancel")}>미정 주문 취소</Button>
    </div>}
  ];
  return <Card><CardHeader><CardTitle>배송일 확인 대기 주문</CardTitle></CardHeader><CardContent className="space-y-4">
    <p>고객과 확인한 배송일을 직접 선택한 뒤 확정해 주세요. 주문 금액은 변경하지 않으며 배차·배송 완료·결제·ERP 처리는 자동 실행하지 않습니다.</p>
    <p>미정 주문은 자동 만료되지 않아 행사 재고를 예약할 수 있습니다. 오래된 주문부터 확인하고, 받지 않을 주문은 취소해 예약을 해제해 주세요.</p>
    {message&&<p role="status">{message}</p>}
    {!result&&<p>주문을 불러오는 중이거나 조회가 필요합니다.</p>}
    {result&&!result.canConfirm&&<p>조회만 가능합니다. 회사 대표·관리자로 다시 로그인하면 배송일을 확정할 수 있습니다.</p>}
    <Button variant="outline" className="min-h-[44px]" disabled={busy} onClick={()=>void load().then(()=>setMessage("목록을 갱신했습니다.")).catch(c=>setMessage(c.message))}>목록 다시 조회</Button>
    {result&&<CommonDataTable columns={columns} rows={result.items} rowKey={r=>r.id} settingsKey={`pending-orders:${companyId}`} emptyMessage="배송일 확인 대기 주문이 없습니다."/>}
    <div className="flex gap-2"><Button variant="outline" disabled={busy||page===1} onClick={()=>setPage(p=>p-1)}>이전</Button><span>{page}페이지</span><Button variant="outline" disabled={busy||!result?.hasMore} onClick={()=>setPage(p=>p+1)}>다음</Button></div>
  </CardContent></Card>;
}
