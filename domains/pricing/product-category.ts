/**
 * 11/5: 품목 분류(대분류 > 중분류 > 소분류).
 * KAMIS(농산물유통정보)·aT 부류(식량작물·채소류·특용작물·과일류·축산물·수산물)와 식약처 식품유형을 참고해 식자재 유통에 맞게 묶었습니다.
 * 저장은 상품 원장 product_catalog.category 한 칸에 "농산 > 채소류 > 조미채소"처럼 경로 글자로 합니다(DB 변경 없음).
 * 종합식자재는 대·중분류로, 축산·수산 전문 업체는 소분류(돈육 부위 등)까지 내려가 씁니다.
 * 매입가를 다시 올려도 카테고리는 바뀌지 않습니다(매입가 반영은 매입가만 바꿈).
 */
export const CATEGORY_SEP = " > ";

export type CategoryNode = { readonly name: string; readonly children?: readonly CategoryNode[] };
const n = (name: string, children?: readonly (string | CategoryNode)[]): CategoryNode => ({ name, children: children?.map((c) => (typeof c === "string" ? { name: c } : c)) });

export const CATEGORY_TREE: readonly CategoryNode[] = [
  n("농산", [
    n("곡류", ["쌀", "잡곡", "두류", "가루류"]),
    n("서류", ["감자", "고구마"]),
    n("채소류", ["엽채류", "근채류", "과채류", "조미채소", "양채류", "특수채소"]),
    n("버섯류"),
    n("나물·산채류"),
    n("과일류", ["과일", "열대과일", "베리류"]),
    n("견과·특용작물", ["견과류", "참깨·들깨", "인삼·약재"]),
    n("허브")
  ]),
  n("축산", [
    n("돈육", ["삼겹·오겹", "목살", "앞다리", "뒷다리", "갈비", "등심·안심", "항정·가브리", "부산물"]),
    n("우육", ["한우", "육우", "수입우", "등심·채끝", "안심", "갈비", "양지·사태", "차돌·우삼겹", "다짐육·불고기", "부산물"]),
    n("계육", ["통닭", "가슴살", "다리·정육", "날개", "부산물"]),
    n("오리·기타육"),
    n("육가공", ["햄", "소시지", "베이컨", "기타 육가공"]),
    n("알류", ["계란", "메추리알"])
  ]),
  n("수산", [
    n("어류", ["선어", "냉동어류", "횟감"]),
    n("갑각·연체류", ["새우", "게", "오징어·낙지·쭈꾸미", "문어"]),
    n("패류"),
    n("해조류", ["김", "미역·다시마", "기타 해조"]),
    n("건어물", ["멸치", "건오징어·북어", "건새우", "기타 건어물"]),
    n("수산가공", ["어묵", "맛살", "젓갈·명란", "기타 수산가공"])
  ]),
  // CC-27(11/11 대표): 큰 분류는 농산·축산·수산·공산품·비식품·기타. 가공식품·양념·유제품·일배·냉동·음료는 공산품 아래 중분류.
  n("공산품", [
    n("양념·조미료", ["장류", "소스·드레싱", "식용유지", "당·감미료", "소금·조미료", "향신료", "식초·주정", "가루·전분"]),
    n("가공식품", ["면·파스타", "통조림·병조림", "즉석·레토르트", "빵·제과", "잼·스프레드·당류", "곡물가공"]),
    n("유제품", ["우유·크림", "치즈", "버터·마가린", "요거트·발효유"]),
    n("일배식품", ["두부·묵", "콩나물·숙주", "떡", "생면", "김치·절임", "반찬"]),
    n("냉동식품", ["냉동가공식품", "냉동과일·채소", "아이스"]),
    n("음료·주류", ["음료", "커피·차", "주류", "시럽·베이스"])
  ]),
  n("비식품", [n("포장·일회용품"), n("위생·세제"), n("주방용품"), n("가스·연료")]),
  n("기타")
];

/** 대분류 이름(호환용). */
export const DEFAULT_CATEGORIES = CATEGORY_TREE.map((node) => node.name);

export function splitCategory(path: string) {
  return path.split(">").map((part) => part.trim()).filter(Boolean);
}
export function joinCategory(parts: readonly string[]) {
  return parts.map((part) => part.trim()).filter(Boolean).join(CATEGORY_SEP);
}
/** "농산 > 채소류 > 조미채소" → ["농산", "농산 > 채소류", "농산 > 채소류 > 조미채소"] */
export function categoryAncestors(path: string) {
  const parts = splitCategory(path);
  return parts.map((_, i) => joinCategory(parts.slice(0, i + 1)));
}
export function isUnder(path: string, ancestor: string) {
  const a = joinCategory(splitCategory(ancestor));
  const p = joinCategory(splitCategory(path));
  return p === a || p.startsWith(a + CATEGORY_SEP);
}

/** 표준 트리에 없는 회사 고유 분류도 편집창에서 현재 선택값으로 보존합니다. */
export function categoryLevelOptions(path: string) {
  const parts = splitCategory(path);
  const top = CATEGORY_TREE.find((node) => node.name === parts[0]);
  const middle = top?.children?.find((node) => node.name === parts[1]);
  const withCurrent = (values: readonly string[], current?: string) => Array.from(new Set([...values, ...(current ? [current] : [])]));
  return {
    large: withCurrent(CATEGORY_TREE.map((node) => node.name), parts[0]),
    medium: withCurrent((top?.children || []).map((node) => node.name), parts[1]),
    small: withCurrent((middle?.children || []).map((node) => node.name), parts[2]),
  };
}

/** 트리의 모든 경로(대·중·소). */
export function treePaths(tree: readonly CategoryNode[] = CATEGORY_TREE, prefix: readonly string[] = []): string[] {
  return tree.flatMap((node) => {
    const path = [...prefix, node.name];
    return [joinCategory(path), ...treePaths(node.children || [], path)];
  });
}

// 앞쪽 규칙이 우선입니다. 가공 냉동(돈까스·만두…)을 먼저, '냉동'이라는 말만 있으면 맨 마지막에 냉동식품으로.
const RULES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["공산품 > 냉동식품 > 냉동가공식품", ["돈까스", "돈가스", "까스", "너겟", "만두", "가라아케", "팝콘치킨", "텐더", "감자튀김", "후렌치", "프렌치후라이", "뇨끼", "전병", "핫도그"]],
  ["공산품 > 냉동식품 > 아이스", ["아이스크림"]],
  // 상품명에 고기·생선 이름이 들어 있어도 양념·조미료인 것(다시다 소고기맛, 멸치액젓, 굴소스, 갈비양념…)을 먼저.
  ["공산품 > 양념·조미료 > 소금·조미료", ["다시다", "미원", "치킨스톡", "비프스톡", "육수", "액젓", "참치액", "멸치액", "조미료"]],
  ["공산품 > 양념·조미료 > 소스·드레싱", ["소스", "갈비양념", "불고기양념", "양념장", "드레싱"]],
  ["공산품 > 가공식품 > 빵·제과", ["햄버거빵", "버거번"]],
  // 축산
  ["축산 > 육가공 > 베이컨", ["베이컨"]],
  ["축산 > 육가공 > 소시지", ["소시지", "비엔나", "후랑크", "프랑크"]],
  ["축산 > 육가공 > 햄", ["햄", "리챔", "스팸", "초리조", "모타델라", "살라미", "페퍼로니", "프로슈토"]],
  ["축산 > 알류 > 메추리알", ["메추리알"]],
  ["축산 > 알류 > 계란", ["계란", "달걀", "란(", "구운란"]],
  ["축산 > 우육 > 차돌·우삼겹", ["차돌", "우삼겹"]],
  ["축산 > 우육 > 등심·채끝", ["채끝", "소등심", "우등심", "한우등심", "척아이"]],
  ["축산 > 우육 > 양지·사태", ["양지", "사태"]],
  ["축산 > 우육 > 갈비", ["소갈비", "우갈비", "LA갈비"]],
  ["축산 > 우육 > 다짐육·불고기", ["불고기", "다짐육", "민찌"]],
  ["축산 > 우육 > 한우", ["한우"]],
  ["축산 > 우육", ["소고기", "쇠고기", "우육", "육우", "부채살", "살치", "토시살", "안창"]],
  ["축산 > 돈육 > 삼겹·오겹", ["삼겹", "오겹"]],
  ["축산 > 돈육 > 목살", ["목살", "목전지"]],
  ["축산 > 돈육 > 항정·가브리", ["항정", "가브리", "갈매기"]],
  ["축산 > 계육 > 가슴살", ["닭가슴", "가슴살"]],
  ["축산 > 계육 > 날개", ["닭날개", "닭봉", "윙"]],
  ["축산 > 계육 > 다리·정육", ["닭다리", "닭정육", "북채", "닭안심"]],
  ["축산 > 계육", ["닭", "계육"]],
  ["축산 > 오리·기타육", ["오리", "양고기", "양갈비"]],
  ["축산 > 돈육 > 앞다리", ["앞다리", "전지"]],
  ["축산 > 돈육 > 뒷다리", ["뒷다리", "후지"]],
  ["축산 > 돈육 > 갈비", ["돼지갈비", "등갈비", "쪽갈비"]],
  ["축산 > 돈육 > 부산물", ["족발", "곱창", "막창", "대창", "순대", "돼지껍데기", "머리고기"]],
  ["축산 > 돈육", ["돼지", "돈육", "돈목", "등심", "안심", "갈비"]],
  // 수산
  ["수산 > 수산가공 > 어묵", ["어묵", "오뎅"]],
  ["수산 > 수산가공 > 맛살", ["맛살", "크래미", "게맛살"]],
  ["수산 > 수산가공 > 젓갈·명란", ["젓갈", "새우젓", "명란", "창란", "오징어젓", "낙지젓"]],
  ["수산 > 건어물 > 멸치", ["멸치"]],
  ["수산 > 건어물 > 건오징어·북어", ["북어", "황태", "건오징어", "진미채", "쥐포"]],
  ["수산 > 건어물 > 건새우", ["건새우", "보리새우"]],
  ["수산 > 해조류 > 김", ["김밥김", "조미김", "파래김", "돌김", "김(", "감태"]],
  ["수산 > 해조류 > 미역·다시마", ["미역", "다시마"]],
  ["수산 > 해조류 > 기타 해조", ["파래", "톳", "매생이", "꼬시래기"]],
  ["수산 > 갑각·연체류 > 새우", ["새우", "블랙타이거", "칵테일새우"]],
  ["수산 > 갑각·연체류 > 게", ["꽃게", "대게", "킹크랩", "게살"]],
  ["수산 > 갑각·연체류 > 오징어·낙지·쭈꾸미", ["오징어", "이까", "낙지", "쭈꾸미", "주꾸미", "한치"]],
  ["수산 > 갑각·연체류 > 문어", ["문어"]],
  ["수산 > 패류", ["바지락", "홍합", "동죽", "조개", "전복", "가리비", "굴(", "생굴", "꼬막", "소라", "키조개"]],
  ["수산 > 어류 > 횟감", ["광어", "우럭", "연어", "참치회", "회(", "숙성회"]],
  ["수산 > 어류", ["고등어", "갈치", "꽁치", "명태", "동태", "코다리", "조기", "굴비", "가자미", "삼치", "임연수", "대구", "장어", "생선", "아귀", "도미"]],
  ["수산", ["해물", "수산"]],
  // 유제품
  ["공산품 > 유제품 > 치즈", ["치즈", "모짜렐라", "체다", "파마산", "부라타", "리코타", "마스카포네", "고르곤졸라", "까망베르"]],
  ["공산품 > 유제품 > 버터·마가린", ["버터", "마가린"]],
  ["공산품 > 유제품 > 요거트·발효유", ["요거트", "요구르트", "바이오플레인", "발효유"]],
  ["공산품 > 유제품 > 우유·크림", ["우유", "생크림", "휘핑", "연유", "분유", "크림"]],
  // 일배
  ["공산품 > 일배식품 > 두부·묵", ["두부", "도토리묵", "청포묵", "곤약", "유부"]],
  ["공산품 > 일배식품 > 콩나물·숙주", ["콩나물", "숙주"]],
  ["공산품 > 일배식품 > 떡", ["떡", "가래떡", "떡국떡"]],
  ["공산품 > 일배식품 > 생면", ["생면", "칼국수면", "우동면", "쫄면", "냉면사리", "생라면"]],
  ["공산품 > 일배식품 > 김치·절임", ["김치", "깍두기", "단무지", "피클", "할라피뇨", "장아찌", "절임"]],
  ["공산품 > 일배식품 > 반찬", ["반찬", "무침", "조림"]],
  // 양념·조미료
  ["공산품 > 양념·조미료 > 장류", ["간장", "된장", "고추장", "쌈장", "춘장", "청국장", "초장"]],
  ["공산품 > 양념·조미료 > 식용유지", ["식용유", "카놀라", "올리브유", "포도씨유", "참기름", "들기름", "콩기름", "해바라기유", "튀김유", "쇼트닝"]],
  ["공산품 > 양념·조미료 > 식초·주정", ["식초", "베네거", "비네거", "미림", "맛술", "주정"]],
  ["공산품 > 양념·조미료 > 당·감미료", ["설탕", "물엿", "올리고당", "조청", "꿀", "시럽", "스테비아", "흑당"]],
  ["공산품 > 양념·조미료 > 소금·조미료", ["소금", "다시다", "미원", "조미료", "육수", "치킨스톡", "부용", "액젓", "참치액", "멸치액"]],
  ["공산품 > 양념·조미료 > 향신료", ["후추", "고춧가루", "스파이스", "넛맥", "파프리카분", "스모크파프리카", "카레", "시즈닝", "커민", "강황", "오레가노", "월계수", "계피", "와사비", "겨자"]],
  ["공산품 > 양념·조미료 > 가루·전분", ["밀가루", "부침가루", "튀김가루", "빵가루", "전분", "찹쌀가루", "쌀가루", "젤라틴", "베이킹"]],
  ["공산품 > 양념·조미료 > 소스·드레싱", ["소스", "케찹", "케첩", "마요네즈", "드레싱", "머스타드", "굴소스", "스리라차", "타바스코", "짜장", "양념", "토마토홀"]],
  // 음료·주류
  ["공산품 > 음료·주류 > 주류", ["소주", "맥주", "막걸리", "와인", "사케", "청주", "위스키", "하이볼", "포토와인"]],
  ["공산품 > 음료·주류 > 커피·차", ["커피", "원두", "녹차", "홍차", "보리차", "옥수수차", "티백"]],
  ["공산품 > 음료·주류 > 시럽·베이스", ["그라나딘", "에이드베이스", "음료베이스"]],
  ["공산품 > 음료·주류 > 음료", ["콜라", "사이다", "스프라이트", "생수", "탄산수", "주스", "쥬스", "음료", "이온", "에이드"]],
  // 비식품
  ["비식품 > 위생·세제", ["세제", "유연제", "락스", "수세미", "고무장갑", "위생장갑", "물티슈", "키친타올", "행주", "소독"]],
  ["비식품 > 포장·일회용품", ["비닐", "랩", "호일", "포일", "봉투", "용기", "도시락", "젓가락", "숟가락", "냅킨", "종이컵", "빨대", "테이프", "트레이", "롤팩", "해동지", "뚜껑", "지퍼백"]],
  ["비식품 > 가스·연료", ["부탄", "가스", "숯", "연료"]],
  ["비식품 > 주방용품", ["팬(", "냄비", "브러시", "철솔", "소창", "집게", "국자", "칼(", "도마", "장갑"]],
  // 가공식품
  ["공산품 > 가공식품 > 면·파스타", ["라면", "당면", "소면", "국수", "중면", "스파게티", "파스타", "부가티니", "링귀니", "펜네", "푸실리", "라자냐", "쌀국수", "우동"]],
  ["공산품 > 가공식품 > 통조림·병조림", ["통조림", "캔(", "참치캔", "옥수수캔", "올리브", "칵테일", "황도", "백도", "골뱅이"]],
  ["공산품 > 가공식품 > 즉석·레토르트", ["햇반", "즉석", "레토르트", "볶음밥", "곰탕", "컵밥", "죽(", "누룽지", "스프", "수프"]],
  ["공산품 > 가공식품 > 빵·제과", ["빵", "바게트", "치아바타", "식빵", "모닝빵", "햄버거빵", "또띠아", "과자", "쿠키", "케이크", "믹스"]],
  ["공산품 > 가공식품 > 잼·스프레드·당류", ["잼", "누텔라", "스프레드", "젤리", "초콜릿", "초코"]],
  ["공산품 > 가공식품 > 곡물가공", ["시리얼", "그래놀라", "폴렌타", "통밀", "오트밀", "떡볶이"]],
  // 농산
  ["농산 > 채소류 > 조미채소", ["양파", "대파", "쪽파", "실파", "마늘", "생강", "고추", "청양", "꽈리"]],
  ["농산 > 채소류 > 엽채류", ["배추", "양배추", "상추", "깻잎", "시금치", "부추", "미나리", "쑥갓", "청경채", "치커리", "로메인", "양상추", "케일", "적채", "봄동", "얼갈이", "열무"]],
  ["농산 > 채소류 > 근채류", ["무우", "알타리", "당근", "우엉", "연근", "도라지", "더덕", "비트", "콜라비", "무(", "세척무"]],
  ["농산 > 채소류 > 과채류", ["오이", "애호박", "단호박", "호박", "가지", "토마토", "방울토마토", "피망", "파프리카", "옥수수"]],
  ["농산 > 채소류 > 양채류", ["브로콜리", "콜리플라워", "샐러리", "셀러리", "아스파라거스", "샐러드", "어린잎", "새싹", "루꼴라", "적근대"]],
  ["농산 > 버섯류", ["버섯", "팽이", "새송이", "느타리", "표고", "양송이", "목이", "만가닥"]],
  ["농산 > 나물·산채류", ["고사리", "시래기", "취나물", "냉이", "달래", "두릅", "나물", "건궁채", "궁채"]],
  ["농산 > 서류 > 감자", ["감자"]],
  ["농산 > 서류 > 고구마", ["고구마"]],
  ["농산 > 곡류 > 쌀", ["쌀", "현미", "찹쌀"]],
  ["농산 > 곡류 > 잡곡", ["보리", "귀리", "흑미", "수수", "조(", "기장", "퀴노아", "잡곡"]],
  ["농산 > 곡류 > 두류", ["대두", "서리태", "강낭콩", "완두", "녹두", "팥", "병아리콩", "렌틸"]],
  ["농산 > 견과·특용작물 > 견과류", ["땅콩", "호두", "아몬드", "잣", "캐슈", "피스타치오", "피칸", "밤", "생율", "마카다미아"]],
  ["농산 > 견과·특용작물 > 참깨·들깨", ["참깨", "들깨", "통깨", "깨소금"]],
  ["농산 > 견과·특용작물 > 인삼·약재", ["인삼", "수삼", "홍삼", "대추", "구기자"]],
  ["농산 > 허브", ["딜", "로즈마리", "바질", "타임", "민트", "고수", "파슬리", "이탈리안파슬리", "애플민트", "레몬그라스"]],
  ["농산 > 과일류 > 열대과일", ["바나나", "파인애플", "망고", "아보카도", "키위", "레몬", "라임", "자몽", "코코넛", "용과"]],
  ["농산 > 과일류 > 베리류", ["블루베리", "딸기", "라즈베리", "크랜베리", "베리"]],
  ["농산 > 과일류 > 과일", ["사과", "신고배", "배(과일", "귤", "감귤", "한라봉", "오렌지", "포도", "샤인머스캣", "수박", "참외", "복숭아", "자두", "감(", "홍시", "곶감", "무화과", "과일"]],
  ["농산 > 채소류", ["야채", "채소"]],
  ["공산품 > 냉동식품", ["냉동"]]
];

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, "");

/** 상품명·규격으로 카테고리 경로를 추천합니다. 못 찾으면 빈 값. */
export function suggestCategory(name: string, spec = ""): string {
  const text = normalize(`${name} ${spec}`);
  if (!text) return "";
  for (const [category, words] of RULES) {
    if (words.some((word) => text.includes(normalize(word)))) return canonicalCategory(category);
  }
  return "";
}

/** 표준 트리 경로 + 이미 쓰고 있는 카테고리(사용자가 만든 것)를 합친 선택 목록. */
export function categoryOptions(existing: readonly string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [...treePaths(), ...existing]) {
    const path = joinCategory(splitCategory(value));
    if (path && !seen.has(path)) { seen.add(path); out.push(path); }
  }
  return out;
}

export function cleanCategory(value: unknown): string | null | { error: string } {
  if (value === null) return null;
  if (typeof value !== "string") return { error: "카테고리를 확인해 주세요." };
  const parts = splitCategory(value);
  if (!parts.length) return null;
  if (parts.length > 3) return { error: "카테고리는 대·중·소 3단계까지입니다." };
  if (parts.some((part) => part.length > 30)) return { error: "카테고리 이름은 단계마다 30자까지입니다." };
  return canonicalCategory(joinCategory(parts));
}


/**
 * 예전 분류 경로 → 표준 경로(CC-27). 앞에서부터 가장 길게 맞는 규칙을 한 번만 적용한다.
 * 업로드·상품 수정·자동 분류에서 예전 경로가 들어와도 표준 경로로 저장한다(운영 데이터는 폴더 이동 RPC로 따로 옮김).
 */
const A = (from: string, to: string): readonly [readonly string[], readonly string[]] => [splitCategory(from), splitCategory(to)];
export const CATEGORY_ALIASES: ReadonlyArray<readonly [readonly string[], readonly string[]]> = [
  // 예전 공산품 하위(겹치던 폴더) → 표준 중·소분류
  A("공산품 > 조미·장류 > 소스·드레싱", "공산품 > 양념·조미료 > 소스·드레싱"),
  A("공산품 > 조미·장류 > 분말조미·시즈닝", "공산품 > 양념·조미료 > 소금·조미료"),
  A("공산품 > 조미·장류 > 장류", "공산품 > 양념·조미료 > 장류"),
  A("공산품 > 조미·장류 > 식용유·식초", "공산품 > 양념·조미료 > 식용유지"),
  A("공산품 > 조미·장류", "공산품 > 양념·조미료"),
  A("공산품 > 면·곡물가공 > 즉석밥·곡물가공", "공산품 > 가공식품 > 즉석·레토르트"),
  A("공산품 > 면·곡물가공", "공산품 > 가공식품 > 면·파스타"),
  A("공산품 > 통조림·절임 > 피클·절임", "공산품 > 일배식품 > 김치·절임"),
  A("공산품 > 통조림·절임", "공산품 > 가공식품 > 통조림·병조림"),
  A("공산품 > 즉석·간편식 > 냉동조리", "공산품 > 냉동식품 > 냉동가공식품"),
  A("공산품 > 즉석·간편식 > 반찬·안주", "공산품 > 일배식품 > 반찬"),
  A("공산품 > 즉석·간편식", "공산품 > 가공식품 > 즉석·레토르트"),
  A("공산품 > 제과·베이커리", "공산품 > 가공식품 > 빵·제과"),
  A("공산품 > 음료·차 > 커피·차", "공산품 > 음료·주류 > 커피·차"),
  A("공산품 > 음료·차", "공산품 > 음료·주류 > 음료"),
  A("공산품 > 유가공·육가공 > 치즈·유제품", "공산품 > 유제품 > 치즈"),
  A("공산품 > 유가공·육가공 > 햄·소시지", "축산 > 육가공"),
  A("공산품 > 유가공·육가공 > 기타 육가공", "축산 > 육가공 > 기타 육가공"),
  A("공산품 > 유가공·육가공", "공산품 > 유제품"),
  // 예전 최상위 대분류 → 공산품 아래 중분류
  A("양념·조미료", "공산품 > 양념·조미료"),
  A("가공식품", "공산품 > 가공식품"),
  A("유제품", "공산품 > 유제품"),
  A("일배식품", "공산품 > 일배식품"),
  A("냉동식품", "공산품 > 냉동식품"),
  A("음료·주류", "공산품 > 음료·주류"),
  A("특수채소", "농산 > 채소류 > 특수채소"),
];

/** 예전 경로면 표준 경로로, 아니면 그대로(공백·구분자 정리 포함). 단계는 최대 3단계로 유지한다. */
export function canonicalCategory(path: string): string {
  const parts = splitCategory(path);
  let best: readonly [readonly string[], readonly string[]] | null = null;
  for (const rule of CATEGORY_ALIASES) {
    if (rule[0].length <= parts.length && rule[0].every((part, i) => parts[i] === part) && (!best || rule[0].length > best[0].length)) best = rule;
  }
  if (!best) return joinCategory(parts);
  return joinCategory([...best[1], ...parts.slice(best[0].length)].slice(0, 3));
}

export type CategoryHealth = {
  /** 예전 경로 → 표준 경로로 합칠 수 있는 폴더 */
  legacy: Array<{ from: string; to: string; count: number }>;
  /** 표준 체계에 없는 대분류(자동으로 합칠 곳이 없어 사람이 고른다) */
  unknownTop: Array<{ top: string; count: number }>;
  /** 같은 소분류 이름이 서로 다른 중분류에 있는 경우(표준 체계가 일부러 겹치는 이름은 제외) */
  sameLeaf: Array<{ leaf: string; paths: Array<{ path: string; count: number }> }>;
  /** 하위 분류가 있는 폴더에 상품이 바로 붙어 있는 경우(소분류 지정 필요) */
  missingSub: Array<{ path: string; count: number }>;
};

/** 폴더 경로 → 상품 수에서 "비슷한 분류 점검" 결과를 계산한다(순수 함수). */
export function categoryHealth(counts: ReadonlyMap<string, number> | Readonly<Record<string, number>>): CategoryHealth {
  const entries = (counts instanceof Map ? Array.from(counts.entries()) : Object.entries(counts))
    .map(([path, count]) => [joinCategory(splitCategory(path)), count] as const)
    .filter(([path, count]) => path && count > 0);
  const standard = new Set(treePaths());
  const withChildren = new Set<string>();
  const walk = (nodes: readonly CategoryNode[], prefix: readonly string[]) => nodes.forEach((node) => {
    const path = [...prefix, node.name];
    if (node.children?.length) { withChildren.add(joinCategory(path)); walk(node.children, path); }
  });
  walk(CATEGORY_TREE, []);
  const leafCount = new Map<string, number>();
  for (const path of Array.from(standard)) { const parts = splitCategory(path); if (parts.length === 3) leafCount.set(parts[2], (leafCount.get(parts[2]) || 0) + 1); }

  const legacy = entries.flatMap(([path, count]) => { const to = canonicalCategory(path); return to !== path ? [{ from: path, to, count }] : []; });
  const topCounts = new Map<string, number>();
  const tops = new Set(CATEGORY_TREE.map((node) => node.name));
  for (const [path, count] of entries) {
    const top = splitCategory(canonicalCategory(path))[0];
    if (top && !tops.has(top)) topCounts.set(top, (topCounts.get(top) || 0) + count);
  }
  const byLeaf = new Map<string, Array<{ path: string; count: number }>>();
  for (const [path, count] of entries) {
    const parts = splitCategory(path);
    if (parts.length === 3 && canonicalCategory(path) === path && (leafCount.get(parts[2]) || 0) <= 1) byLeaf.set(parts[2], [...(byLeaf.get(parts[2]) || []), { path, count }]);
  }
  return {
    legacy: legacy.sort((x, y) => y.count - x.count),
    unknownTop: Array.from(topCounts, ([top, count]) => ({ top, count })).sort((x, y) => y.count - x.count),
    sameLeaf: Array.from(byLeaf, ([leaf, paths]) => ({ leaf, paths })).filter((group) => new Set(group.paths.map((item) => splitCategory(item.path).slice(0, 2).join(">"))).size > 1),
    missingSub: entries.filter(([path]) => canonicalCategory(path) === path && withChildren.has(path)).map(([path, count]) => ({ path, count })).sort((x, y) => y.count - x.count),
  };
}
