# MAJU 직원용 Android Shell

운영 웹을 그대로 여는 Capacitor 7 Android 앱의 1차 골격입니다. 위치는 사용자가 **근무 시작**을 누른 동안만 수집하고,
근무 종료·로그아웃·12시간 경과 시 네이티브 watcher를 중지합니다.

## 현재 경계

- 서버의 기기 토큰 발급 및 `/api/staff/location/batch`는 Track C 소유이며 아직 연결 전입니다.
- `location-runtime.ts`는 해당 계약을 소비하는 앱 측 구현입니다. 토큰을 URL·로그·Preferences에 별도 저장하지 않고 웹이 시작 호출 때 전달합니다.
- Android 네이티브 프로젝트는 아직 생성하지 않았습니다. 이 폴더에서 `npm run android:add`, `npm run android:sync`를 실행하면 생성됩니다.
- 기기 토큰과 위치 큐는 현재 메모리에만 둡니다. 프로세스 종료 후 오프라인 큐 복구는 Android Keystore 기반 저장소를 붙인 뒤 활성화해야 하며, 평문 Preferences에는 저장하지 않습니다.
- 원격 `server.url`에서 브리지를 사용하려면 운영 웹이 `window.MAJUNativeLocation` 계약을 감지하는 어댑터를 추가해야 합니다(Track C).

## Android 필수 설정

- 정밀 위치, 백그라운드 위치, 포그라운드 서비스, Android 13+ 알림 권한
- 알림 문구: `MAJU 근무 중 · 위치 공유`
- 배터리 최적화 예외 안내는 강제가 아니라 제조사 설정 화면으로 이동하는 도움말로 제공
- 앱 종료·로그아웃 후 watcher가 남지 않는 계측 테스트 필수

상세 체크리스트는 `docs/android-pilot-checklist.md`, 동의 문안은 `docs/location-consent-ko.md`를 봅니다.
