import { deliveryBlockGuide } from "../../domains/order/delivery-eligibility";
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
  if (width === 1440) await page.getByRole("button", { name: "격자형", exact: true }).click();
  await page.getByRole("button",{name:"합성 품목 수량 늘리기",exact:true}).click();
  const submit=page.getByRole("button",{name:"후결제로 주문 신청",exact:true});
  const retry=page.getByRole("button",{name:"배송 설정 다시 확인",exact:true});
  for(const blocked of ["outside_area","address_unknown","territory_unconfigured","ambiguous_area","weekdays_unconfigured","territory_link_required"]){
    reason=blocked;await retry.click();
    await expect(page.getByRole("region",{name:"배송 요일 설정 안내"})).toContainText(deliveryEligibilityMessage(blocked));
    await expect(page.getByTestId("delivery-block-headline")).toHaveText(deliveryBlockGuide(blocked).headline);
    await expect(page.getByTestId("submit-disabled-reason")).not.toContainText("배송 요일이 설정되지 않아");
    if (deliveryBlockGuide(blocked).action === "address") await expect(page.getByRole("button",{name:"내 정보에서 배송지 입력"})).toBeVisible();
    else await expect(page.getByRole("region",{name:"배송 요일 설정 안내"}).getByText(/고객사/).first()).toBeVisible();
    await expect(submit).toBeDisabled();await expect(page.getByRole("region",{name:"배송일 선택"})).toHaveCount(0);expect(attempts).toBe(0);
  }
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+3)).toBe(false);
  await page.screenshot({path:info.outputPath(`delivery-block-${width}.png`),fullPage:true});
  reason="eligible";await retry.click();
  await expect(page.getByText("배송 가능 요일: 월·수요일",{exact:true})).toBeVisible();
  await expect(page.getByRole("region",{name:"배송일 선택"})).toBeVisible();
  await expect(page.getByLabel("합성 품목 수량",{exact:true})).toHaveText("1");
  await page.screenshot({path:info.outputPath(`delivery-ready-${width}.png`),fullPage:true});
});

for (const width of [1440,390]) test('P1-6 order settings shares the delivery guide without saving at '+width+'px',async({page},info)=>{
 const company='00000000-0000-4000-8000-000000000001',territoryId='30000000-0000-4000-8000-000000000001';
 let holiday=false,writes=0;
 await page.setViewportSize({width,height:1000});
 expect((await page.request.post('/api/admin/login',{data:{email:'ci-admin@example.test',password:'ci-admin-layout-password-2026'}})).ok()).toBeTruthy();
 await page.route('**/api/pricing-order-settings*',route=>{
  if(route.request().method()!=='GET'){writes++;return route.fulfill({status:500,json:{message:'미리보기는 저장하지 않습니다.'}});}
  return route.fulfill({json:{settings:{cutoff_days_before:1,cutoff_time:'23:59',minimum_amount:0,minimum_policy:'notice',delivery_fee:0,notice:'',market_price_notice:''},
   companyWeekdays:[1,2,3,4,5,6],previewAt:'2026-11-25T13:29:00.000Z',territories:[{id:territoryId,name:'합성 배송권역',is_active:true}],
   territoryRules:[{territory_id:territoryId,delivery_weekdays:[1,2,3,4,5,6],cutoff_days_before:1,cutoff_time:'23:59',minimum_amount:0,minimum_policy:'notice',delivery_fee:0}],
   holidays:holiday?[{id:'holiday',territory_id:null,kind:'date',holiday_date:'2026-11-26',weekday:null,month:null,day:null,label:'합성 휴무'}]:[]}});
 });
 await page.goto('/revenue/pricing/order-settings?companyId='+company);
 const companySection=page.locator('section').filter({has:page.getByRole('heading',{name:'회사 기본값',exact:true})});
 const territorySection=page.locator('section').filter({has:page.getByRole('heading',{name:'권역별 배송',exact:true})});
 await expect(companySection.getByTestId('delivery-policy-preview')).toContainText('오늘 주문하면 내일 배송 (밤 11:59 마감)');
 await page.getByLabel('배송 권역',{exact:true}).selectOption(territoryId);
 await expect(territorySection.getByTestId('delivery-policy-preview')).toContainText('오늘 주문하면 내일 배송 (밤 11:59 마감)');
 const before=territorySection.getByLabel('마감일',{exact:true});
 await before.selectOption('2');
 await expect(territorySection.getByTestId('delivery-policy-preview')).toContainText('오늘 주문하면 모레 배송 (밤 11:59 마감)');
 await territorySection.getByLabel('마감 시각',{exact:true}).fill('00:00');
 await expect(territorySection.getByTestId('delivery-policy-preview')).toContainText('오늘 주문하면 11/28(토) 배송 (11/26(목) 오전 12:00 마감)');
 expect(writes).toBe(0);expect((await before.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 holiday=true;await page.reload();
 await expect(companySection.getByTestId('delivery-policy-preview')).toContainText('오늘 주문하면 모레 배송 (11/26(목) 밤 11:59 마감)');
 await page.getByLabel('배송 권역',{exact:true}).selectOption(territoryId);
 await expect(before).toHaveValue('1');await expect(territorySection.getByLabel('마감 시각',{exact:true})).toHaveValue('23:59');
 expect(writes).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+3)).toBe(false);
 await page.screenshot({path:info.outputPath('p16-delivery-settings-'+width+'.png'),fullPage:true});
});
