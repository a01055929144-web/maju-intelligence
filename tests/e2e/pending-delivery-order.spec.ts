import { expect, test } from "@playwright/test";
for (const width of [1280,390]) test(`pending delivery intake and history at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({width,height:900});
  const productId="10000000-0000-4000-8000-000000000001";
  let saved=false; let attempts=0; let firstKey="";
  await page.route("**/api/storefront", route => {
    const body=route.request().postDataJSON();
    if (route.request().method()==="PUT") {
      attempts++; expect(body.deliveryDate).toBeNull();
      expect(body.lines).toEqual([{productId,promotionId:null,quantity:1}]);
      if (!firstKey) firstKey=body.idempotencyKey;
      expect(body.idempotencyKey).toBe(firstKey);
      if (attempts===1) return route.fulfill({status:503,json:{message:"응답을 확인하지 못했습니다. 같은 주문으로 다시 시도해 주세요."}});
      saved=true; return route.fulfill({json:{result:{id:"pending",deliveryConfirmation:"pending"}}});
    }
    return route.fulfill({json:{store:{title:"합성 미정 배송 주문",companyName:"합성 회사",customerName:"합성 매장",deliveryAddress:"합성 주소",version:1,validUntil:"2099-12-31",priceAvailable:true,canOrder:true,pendingDelivery:true,nextDeliveryDate:null,selectedDeliveryDate:"2026-11-10",notice:"",marketPriceNotice:"",
      policy:{weekdays:[],holidays:[],cutoffDaysBefore:1,cutoffTime:"22:00",minimumAmount:0,minimumPolicy:"notice",deliveryFee:0},
      lines:[{key:`${productId}:`,productId,promotionId:null,name:"합성 품목",category:"",brand:"",spec:"1kg",unit:"봉",badge:"",taxType:"exempt",unitPrice:1000,priceIncludesTax:false,isMarketPrice:false,remaining:null,maximumQuantity:null,recentDispatchPrice:null,recentDispatchDate:null}]},
      orders:saved?[{id:"pending",deliveryDate:null,deliveryConfirmation:"pending",status:"submitted",knownTotal:1000,requestMemo:"",marketPricePending:false,submittedAt:"2026-11-10T00:00:00Z",revision:1,lines:[{product_id:productId,product_name:"합성 품목",quantity:1,unit_price:1000,total_amount:1000}]}]:[],preferences:[],historyPage:1,historyHasMore:false}});
  });
  await page.goto("/store#synthetic-pending-token");
  await expect(page.getByText("주문 접수 후 배송일 확인",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"주문하기",exact:true}).click();
  await expect(page.getByLabel("배송일",{exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"합성 품목 수량 늘리기"}).click();
  const submit=page.getByRole("button",{name:"후결제로 주문 신청",exact:true});
  await expect(submit).toBeEnabled(); await submit.click();
  await expect(page.getByText("응답을 확인하지 못했습니다.",{exact:false})).toBeVisible();
  await submit.click();
  await expect(page.getByText("접수됨 · 배송일 확인 대기",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"마감 전 수정",exact:true})).toHaveCount(0);
  expect(attempts).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+3);
  await page.screenshot({path:info.outputPath(`pending-history-${width}.png`),fullPage:true});
});
