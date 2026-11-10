import { expect,test } from "@playwright/test";
for(const width of [1280,390])test(`company explicitly confirms and cancels pending orders at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:900});
  const date=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
  let items=[{id:"order-1",revision:1,submittedAt:"2026-11-10T00:00:00Z",knownTotal:1000,customerName:"합성 대기 매장",lines:[{name:"합성 품목",quantity:1,unit:"봉"}]}];
  let action="",writes=0,key="",fail=true;
  await page.route("**/api/pricing-pending-orders**",route=>{
    if(route.request().method()==="GET")return route.fulfill({json:{items,page:1,hasMore:false,canConfirm:true}});
    const b=route.request().postDataJSON();writes++;action=b.action;
    if(b.action==="confirm"){
      expect(b.deliveryDate).toBe(date);if(!key)key=b.requestId;expect(b.requestId).toBe(key);
      if(fail){fail=false;return route.fulfill({status:409,json:{message:"결과를 확인하지 못했습니다. 같은 날짜로 다시 시도해 주세요."}});}
    }else expect(b.deliveryDate).toBeNull();
    items=[];return route.fulfill({json:{result:{id:b.orderId,deliveryDate:b.deliveryDate,revision:2,action:b.action}}});
  });
  await page.goto("/revenue/pricing/pending-orders?fixture=pending-orders");
  const confirm=page.getByRole("button",{name:"배송일 확정",exact:true});await expect(confirm).toBeDisabled();expect(writes).toBe(0);
  await page.getByLabel("합성 대기 매장 배송일",{exact:true}).fill(date);
  page.once("dialog",d=>d.dismiss());await confirm.click();expect(writes).toBe(0);
  page.on("dialog",d=>d.accept());await confirm.click();
  await expect(page.getByRole("status").filter({hasText:"결과를 확인하지 못했습니다"})).toBeVisible();await confirm.click();
  await expect(page.getByRole("status").filter({hasText:`배송일을 ${date}로 확정했습니다.`})).toBeVisible();expect(action).toBe("confirm");
  items=[{id:"order-2",revision:1,submittedAt:"2026-11-10T00:00:00Z",knownTotal:1000,customerName:"합성 취소 매장",lines:[]}];
  await page.getByRole("button",{name:"목록 다시 조회",exact:true}).click();await page.getByRole("button",{name:"미정 주문 취소",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"행사 예약 대상에서 제외됐습니다"})).toBeVisible();expect(action).toBe("cancel");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+3);
  await page.screenshot({path:info.outputPath(`company-pending-${width}.png`),fullPage:true});
});
