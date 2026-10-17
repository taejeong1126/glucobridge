<div align="center">

  <h1>GlucoBridge</h1>

  <h3>CareSens Air CGM 혈당 데이터를 AI 도구에서 간편하게 확인하세요</h3>

  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftaejeong1126%2Fglucobridge&project-name=glucobridge&repository-name=glucobridge&env=CARESENS_SESSION_B64%2CCARESENS_ROUTE_SECRET">
    <img src="https://vercel.com/button" alt="Deploy with Vercel" />
  </a>

</div>

## GlucoBridge 소개

GlucoBridge는 CareSens Air의 연속혈당측정(CGM) 데이터를 AI 도구에서 조회할 수 있도록 연결하는 오픈소스 MCP 서버입니다.

현재 혈당, 과거 측정 기록, 기간별 혈당 통계를 ChatGPT나 Claude와의 대화에서 확인할 수 있습니다.

**CareSens Connect**에서 로그인 정보를 가져와 Vercel에 서버를 배포한 뒤, 해당 서버를 AI 도구에 연결하는 방식으로 작동합니다.

## 시작하기

설치는 **CareSens 로그인 → 서버 배포 → MCP 연결** 순서로 진행합니다.

GitHub 계정과 Windows PC가 필요합니다.

### 1. CareSens 로그인

[GitHub Releases](https://github.com/taejeong1126/glucobridge/releases)에서 최신 **CareSens Connect**를 다운로드해 Windows에서 실행합니다.

1. 프로그램에서 `CareSens 로그인`을 클릭해 로그인합니다.
2. 로그인 후 표시되는 다음 두 값을 복사해 둡니다.
    - `CARESENS_SESSION_B64`
    - `CARESENS_ROUTE_SECRET`

두 값은 서버 배포 시 사용됩니다.

### 2. Vercel에 서버 배포

1. 위의 **Deploy with Vercel** 버튼을 클릭합니다.
2. GitHub 계정으로 로그인합니다. 계정이 없다면 [GitHub에서 가입](https://github.com/signup)할 수 있습니다.
3. 저장소 생성 화면에서 계정과 저장소 이름을 확인하고 `Create`를 클릭합니다.
4. 환경변수 입력 화면에 앞서 복사한 `CARESENS_SESSION_B64`와 `CARESENS_ROUTE_SECRET`을 각각 입력합니다.
5. `Deploy`를 클릭해 배포를 완료합니다.

배포가 끝나면 [Vercel 대시보드](https://vercel.com/dashboard)에서 생성한 프로젝트를 확인할 수 있습니다.

### 3. MCP 주소 확인

Vercel 대시보드에서 배포한 프로젝트를 선택하고 `Settings` → `Domains`로 이동해 도메인을 확인합니다. glucobridge-xxx.vercel.app과 같은 배포 주소를 확인할 수 있습니다.

확인한 도메인과 `CARESENS_ROUTE_SECRET`을 사용해 다음 형식으로 MCP 주소를 만듭니다.

```text
https://<배포-도메인>/<CARESENS_ROUTE_SECRET>/caresens/mcp
```

이 주소를 ChatGPT 또는 Claude에 등록하면 됩니다.

**주의:** MCP 주소에는 접근용 비밀값이 포함되어 있습니다. 주소와 환경변수는 다른 사람에게 공개하지 마세요.

### 4. AI 도구에 연결

**ChatGPT**

1. [ChatGPT](https://chatgpt.com)에서 `Plugins` → `+` → `Add custom MCP server`를 선택합니다.
2. 이름은 `GlucoBridge`, `Connection`에는 위에서 만든 MCP 주소를 입력합니다.
3. 인증 방식은 `None`을 선택합니다.
4. 안내 내용을 확인하고 `Create as a plugin`을 클릭합니다.

**Claude**

1. [Claude](https://claude.ai)에서 `Customize` → `Connectors`로 이동합니다.
2. `+` → `Add custom connector`를 선택합니다.
3. 이름은 `GlucoBridge`, URL에는 MCP 주소를 입력합니다.
4. `Add`를 클릭하고 화면의 안내에 따라 연결을 완료합니다.

### 5. 혈당 확인하기

연결이 완료되면 AI와의 대화에서 다음과 같이 요청할 수 있습니다.

- "지금 혈당 얼마야?"
- "최근 24시간 혈당 기록 보여줘."
- "지난 7일 평균 혈당 알려줘."
- "최근 30일 혈당 통계 분석해 줘."

GlucoBridge가 CareSens 서비스에서 데이터를 조회하고, AI 도구가 결과를 전달합니다.

## 개발 환경에서 실행

<details>
<summary>로컬 개발 및 실행 방법 보기</summary>

**요구사항:** Node.js 20.9 이상, Yarn 4, Windows(CareSens Connect)

**1. CareSens Connect 실행**

```bash
git clone https://github.com/taejeong1126/glucobridge.git
cd glucobridge/desktop
yarn install
yarn start
```

프로그램에서 로그인한 뒤 환경변수 값을 확인합니다.

**2. MCP 서버 실행**

새 터미널에서 저장소 루트로 이동합니다.

```bash
cd glucobridge
yarn install
```

`.env.example`을 `.env.local`로 복사하고 다음 환경변수를 입력합니다.

```env
CARESENS_SESSION_B64=
CARESENS_ROUTE_SECRET=
```

서버를 실행합니다.

```bash
yarn dev
```

로컬 서버 주소: `http://localhost:3000`

</details>

## 기여하기

GlucoBridge는 GPL-3.0 라이선스를 따르는 오픈소스 프로젝트이며, 모든 기여를 환영합니다.

버그 제보, 개선 아이디어, 기능 제안, 문서 수정, 코드 개선 등 모든 형태의 기여를 환영합니다.
GitHub Issues 또는 Pull Request를 통해 자유롭게 참여해 주세요.

개인적인 문의는 `taejeong654@gmail.com`으로 연락해 주세요.

- Issues: [GitHub Issues](https://github.com/taejeong1126/glucobridge/issues)
- Pull Requests: [GitHub Pull Requests](https://github.com/taejeong1126/glucobridge/pulls)

## 라이선스

GlucoBridge는 **GNU General Public License v3.0**에 따라 배포됩니다.

라이선스 전문은 [LICENSE](./LICENSE) 파일에서 확인할 수 있습니다.

## 면책 조항

GlucoBridge는 CareSens 서비스의 통신 방식을 분석해 개발한 **비공식 오픈소스 프로젝트**입니다. CareSens 및 관련 회사와 제휴하거나 공식 지원을 받는 프로젝트가 아닙니다.

본 프로젝트는 별도의 보증 없이 제공됩니다. 서비스 변경으로 인한 작동 중단, 데이터 오류나 누락, 계정 제한 등 사용 과정에서 발생할 수 있는 문제에 대해 개발자는 법률이 허용하는 범위 내에서 책임을 지지 않습니다. 사용자는 관련 서비스의 이용약관을 확인하고, 자신의 판단과 책임으로 사용해야 합니다.

GlucoBridge는 혈당 데이터를 확인하기 위한 보조 도구입니다. 의료적 판단이나 치료 결정은 공식 CGM 앱, 의료기기 및 의료진의 안내를 기준으로 해 주세요.
