import {expect,test} from "@playwright/test";
import {deliveryEligibilityMessage} from "../../domains/order/delivery-eligibility";
for(const width of [1440,390])test(`server delivery eligibility blocks and recovers at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:900});
  let reason="outside_area",attempts=0;
  const productId="10000000-0000-4000-8000-000000000001";
  await page.route("**/api/storefront",route=>{
    if(route.request().method()==="PUT"){
      attempts++;return route.fulfill({status:422,json:{message:deliveryEligibilityMessage("outside_area")}});
    }
    const eligible=reason==="eligible";
    return route.fulfill({json:{store:{title:"합성 단가표",companyName:"합성 유통",customerName:"사업자번호 없는 합성 개업준비 매장",deliveryAddress:"서울특별시 강남구 합성로 1 1층",version:1,validUntil:"2099-12-31",priceAvailable:true,canOrder:eligible,
      deliveryEligibility:{eligible,reason,weekdays:eligible?[1,3]:[]},nextDeliveryDate:eligible?"2099-01-05":null,selectedDeliveryDate:"2099-01-05",notice:"",marketPriceNotice:"",
      policy:{weekdays:eligible?[1,3]:[],holidays:[],cutoffDaysBefore:1,cutoffTime:"22:00",minimumAmount:0,minimumPolicy:"notice",deliveryFee:0},
      lines:[{key:`${productId}:`,productId,promotionId:null,name:"합성 품목",category:"",brand:"",spec:"1kg",unit:"봉",badge:"",taxType:"exempt",unitPrice:1000,priceIncludesTax:false,isMarketPrice:false,remaining:null,maximumQuantity:null,recentDispatchPrice:null,recentDispatchDate:null}]},orders:[],preferences:[],historyPage:1,historyHasMore:false}});
  });
  await page.goto("/store#synthetic-token");await page.getByRole("button",{name:"주문하기",exact:true}).click();
  await page.getByRole("button",{name:"합성 품목 수량 늘리기",exact:true}).click();
  const submit=page.getByRole("button",{name:"후결제로 주문 신청",exact:true});
  const retry=page.getByRole("button",{name:"배송 설정 다시 확인",exact:true});
  for(const blocked of ["outside_area","address_unknown","territory_unconfigured","ambiguous_area","weekdays_unconfigured","territory_link_required"]){
    reason=blocked;await retry.click();
    await expect(page.getByRole("region",{name:"배송 요일 설정 안내"})).toContainText(deliveryEligibilityMessage(blocked));
    await expect(submit).toBeDisabled();await expect(page.getByLabel("배송일",{exact:true})).toBeDisabled();expect(attempts).toBe(0);
  }
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+3)).toBe(false);
  await page.screenshot({path:info.outputPath(`delivery-block-${width}.png`),fullPage:true});
  reason="eligible";await retry.click();
  await expect(page.getByText("배송 가능 요일: 월·수요일",{exact:true})).toBeVisible();
  await expect(page.getByLabel("배송일",{exact:true})).toBeEnabled();
  await expect(page.getByLabel("합성 품목 수량",{exact:true})).toHaveText("1");
  await page.screenshot({path:info.outputPath(`delivery-ready-${width}.png`),fullPage:true});
});
