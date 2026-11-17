# 매장 화면 와이어프레임 파일 (2026-11-17 · Codex 작업방용)

캔버스(https://claude.ai/artifact/NfA5ZR2VGUM6St5hM2pucY)는 대표 계정 전용이라 작업방에서 열리지 않습니다. 같은 화면의 HTML 원본을 여기 둡니다. 브라우저로 열면 대략 모양이 보입니다(`support.js`가 없어 `{{accent}}` 색만 빠짐 — 기본색 #0f766e).

| 파일 | 화면 | 지시서 |
|---|---|---|
| Main · PcLink | ① 링크 열기(표 기본 · 탭: 단가표 품목 / 전체 상품 가입 후 / 문서 이미지) | CX-70 |
| PcLinkAll | ①-1 전체 상품 = 가입 후(흐린 미리보기 + 카카오 시작) | CX-70 |
| Info · PcInfo | ② 매장 정보(모바일 3단계 · 개업 준비 중 = 대표번호 전화) | CX-71 · CX-72 · CX-73 |
| Check · PcCheck | ③ 주문 조건 확인 | CX-74 |
| Order · Cart · Pc | ④⑤ 주문 · 장바구니(마감 띠 · 행사 남은 수량 · 품목 마감 · "아직 주문 전") | CX-74 · CX-75 |
| Track · PcTrack | ⑥ 주문 내역 · 받기 확인("주문이 들어갔어요") | CX-74 |
| Expired · PcExpired | ⑦ 기간 지난 단가표 | CX-70 |
| Settings · PcSettings | ⑧ 매장 설정 | CX-71 |
| PcMembers · Invite | ⑧-1 직원 초대 · 초대 받기 | CX-77 |
| CompanyStores | 고객사 — 새 매장 → 매출처 | CX-76 |
| AdminStores | MAJU 어드민 — 매장 관리 | CX-78 |
| Sheets · PcHome | ⓪ 홈 · 받은 단가표 | CX-70 |

설계: `docs/backend/11_STORE_ORDER_FLOW_SPEC.md` · 지시서: `docs/dispatch/2026-11-17-R9-codex.md`
