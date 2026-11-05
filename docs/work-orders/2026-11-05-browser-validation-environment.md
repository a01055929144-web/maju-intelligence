# OneDrive 개발 브라우저 검증 경로

Owner: development infrastructure. 앱 기능 변경 없음.

## 결론

Windows OneDrive 작업트리에서 Playwright를 안정화하기 위한 저장소 변경은 하지 않는다. 공식 브라우저 검증 경로는 GitHub Actions의 Linux Playwright 작업이다. 이 작업은 production build 뒤 격리 Chromium으로 데스크톱과 390px 흐름을 실행하고 보고서·trace를 artifact로 남긴다.

## 재현한 원인

- 새 Git worktree는 `node_modules`를 공유하지 않는다. 로컬 패키지가 없는 상태의 bare `npx playwright`는 온라인 설치를 시도해 멈출 수 있다.
- OneDrive 작업트리의 production build는 통과했지만 약 5분이 걸렸고, 뒤이은 Playwright web server 실행은 포트가 열리지 않은 채 종료되지 않았다.
- sandbox 임시 경로의 `node_modules` junction은 Windows `EPERM`으로 거부됐다.
- 임시 경로의 cold build는 sandbox DNS 차단으로 Google Fonts를 받지 못했다.
- npm offline 설치는 캐시에 없는 패키지 때문에 `ENOTCACHED`로 실패했다.
- `NODE_PATH`로 원본 의존성을 읽기 전용 재사용하는 실험도 Next/ESM 실행 전에 실패했다. 불안정한 우회로는 저장소에 남기지 않는다.

## 검증 순서

1. 일반 로컬 경로에서는 worktree마다 `npm ci`를 먼저 실행한다.
2. 온라인 설치를 숨기지 않도록 `npx --no-install playwright --version`으로 로컬 설치를 확인한다.
3. `.next`가 정상 빌드된 경우에만 `npx --no-install playwright test <spec>`을 시도한다.
4. OneDrive `EPERM`, 서버 무응답, 브라우저 미설치가 발생하면 반복 설치나 사용자 브라우저 조작을 하지 않는다.
5. PR을 push하고 `build` 체크의 `Responsive layout and route smoke checks`를 공식 결과로 사용한다. 실패하면 `responsive-layout-report` artifact의 report, screenshot, trace를 확인한다.

CI는 tracked checkout과 `npm ci`로 시작하므로 `.env` 같은 로컬 비밀 파일을 가져가지 않는다. 운영 사이트나 사용자 브라우저를 열지 않으며 fixture 환경에서만 실행한다.
