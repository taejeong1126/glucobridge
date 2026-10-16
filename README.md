<div align="center">

  <h1>GlucoBridge</h1>

  <h3>CareSens 혈당 데이터를 AI 도구에서<br/>간편하게 확인하세요</h3>

  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftaejeong1126%2Fglucobridge&project-name=glucobridge&repository-name=glucobridge&env=CARESENS_SESSION_B64%2CCARESENS_ROUTE_SECRET">
    <img src="https://vercel.com/button" alt="Deploy with Vercel" />
  </a>

</div>

## GlucoBridge 소개

GlucoBridge는 CareSens 계정의 연속혈당측정(CGM) 데이터를 MCP를 지원하는 AI 도구에서 확인할 수 있도록 만든 서버입니다.

현재 혈당값, 지난 측정 기록, 기간별 혈당 통계를 조회할 수 있습니다. Windows용 **CareSens Connect**에서 로그인한 뒤 Vercel에 서버를 배포해 사용합니다.

## 시작하기

GitHub 계정이 없다면 [GitHub 회원가입](https://github.com/signup)에서 먼저 가입해 주세요. Vercel은 배포 과정에서 GitHub 계정으로 로그인할 수 있습니다.

1. [GitHub Releases](https://github.com/taejeong1126/glucobridge/releases)에서 최신 **CareSens Connect** 실행 파일을 다운로드해 Windows에서 실행합니다. `CareSens 로그인`을 눌러 로그인한 뒤 화면에 표시되는 `CARESENS_SESSION_B64`와 `CARESENS_ROUTE_SECRET`을 각각 복사해 둡니다.
2. 문서 상단 **Deploy** 버튼을 클릭합니다. 로그인 화면이 나오면 `Continue with GitHub`를 선택하고, GitHub 연결 권한을 요청하면 승인합니다.
3. GitHub 저장소 생성 화면에서 사용할 계정과 저장소 이름을 확인한 뒤 `Create`를 클릭합니다. 환경변수 입력 화면이 나타나면 `CARESENS_SESSION_B64`와 `CARESENS_ROUTE_SECRET`에 앞서 복사한 값을 넣고 `Deploy`를 클릭합니다.
4. 배포가 완료되면 [Vercel 대시보드](https://vercel.com/dashboard)에서 `glucobridge` 프로젝트를 엽니다. `Settings` → `Domains`에서 `glucobridge-xxx.vercel.app`과 같은 배포 주소를 확인할 수 있습니다.
5. 아래 형식으로 MCP 주소를 만들어 사용하는 AI 도구에 등록합니다.

```text
https://<배포한-도메인>/<CARESENS_ROUTE_SECRET>/caresens/mcp
```

`<배포한-도메인>`에는 Vercel에서 확인한 주소를, `<CARESENS_ROUTE_SECRET>`에는 CareSens Connect에서 복사한 값을 입력합니다. 환경변수와 MCP 주소는 다른 사람에게 공개하지 마세요.

## MCP 연결

### ChatGPT

1. [ChatGPT](https://chatgpt.com)에 로그인한 뒤 `Plugins` → `+` → `Add custom MCP server`를 선택합니다.
2. 이름에 `GlucoBridge`를 입력하고 `Connection`에 위 MCP 주소를 붙여넣습니다. 별도 인증이 필요한 서버가 아니므로 인증 방식은 `None`을 선택합니다.
3. 안내 내용을 확인하고 동의 항목을 체크한 뒤 `Create as a plugin`을 클릭합니다. 연결 후 채팅에서 GlucoBridge 플러그인을 사용할 수 있습니다.

### Claude

1. [Claude](https://claude.ai)에 로그인한 뒤 `Customize` → `Connectors`로 이동합니다.
2. `+` → `Add custom connector`를 선택하고 이름에 `GlucoBridge`, URL에 위 MCP 주소를 입력합니다.
3. `Add`를 클릭해 등록합니다. 연결 및 인증 확인 화면이 표시되면 안내에 따라 완료합니다.

<details>
<summary>개발 환경에서 실행</summary>

**요구사항**: Node.js ≥ 20.9, Yarn 4, Windows (CareSens Connect)

저장소를 받은 뒤 CareSens Connect를 실행합니다.

```sh
git clone https://github.com/taejeong1126/glucobridge.git
cd glucobridge/desktop
yarn install
yarn start
```

CareSens Connect에서 로그인한 뒤, 다른 터미널에서 저장소 루트로 이동해 서버를 준비합니다.

```sh
cd glucobridge
yarn install
cp .env.example .env.local
```

`.env.local`에 `CARESENS_SESSION_B64`와 `CARESENS_ROUTE_SECRET`을 입력한 뒤 `yarn dev`를 실행합니다.

서버는 [http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다.

</details>

## 기여하기

GlucoBridge는 GPL-3.0 라이선스를 따르는 오픈소스 프로젝트이며, 모든 기여를 환영합니다.

버그 제보, 개선 아이디어, 기능 제안, 문서 수정, 코드 개선 등 모든 형태의 기여를 환영합니다.
GitHub Issues 또는 Pull Request를 통해 자유롭게 참여해 주세요.

개인적인 문의는 `taejeong654@gmail.com`으로 연락해 주세요.

- Issues: [GitHub Issues](https://github.com/taejeong1126/glucobridge/issues)
- Pull Requests: [GitHub Pull Requests](https://github.com/taejeong1126/glucobridge/pulls)

## 라이선스

GlucoLabs Plus는 **GNU General Public License v3.0**에 따라 배포됩니다.

라이선스 전문은 [LICENSE](./LICENSE) 파일에서 확인할 수 있습니다.

## 면책 조항

GlucoBridge는 CareSens 서비스의 통신 방식을 분석해 개발한 비공식 오픈소스 프로젝트입니다. CareSens 및 관련 회사와 제휴하거나 공식 지원을 받는 프로젝트가 아닙니다.

본 프로젝트는 별도의 보증 없이 제공됩니다. 서비스 변경으로 인한 작동 중단, 데이터 오류나 누락, 계정 제한 등 사용 과정에서 발생할 수 있는 문제에 대해 개발자는 법률이 허용하는 범위 내에서 책임을 지지 않습니다. 사용자는 관련 서비스의 이용약관을 확인하고, 자신의 판단과 책임으로 사용해야 합니다.

GlucoBridge는 혈당 데이터를 확인하기 위한 보조 도구입니다. 의료적 판단이나 치료 결정은 공식 CGM 앱, 의료기기 및 의료진의 안내를 기준으로 해 주세요.
