---
title: "Hugo + Stack 테마로 기술 블로그 만들기"
description: "GitHub Pages에 Hugo 블로그를 세팅하고 커스텀 도메인까지 연결한 과정. 레퍼런스 사이트를 정해 레이아웃을 맞추고, Cloudflare Workers로 조회수를 붙이기까지의 모든 삽질을 정리했다."
date: 2026-05-20T00:00:00+09:00
categories: ["Blog"]
tags: ["hugo", "github-pages", "blog", "stack-theme", "cloudflare-workers"]
draft: false
---

## 왜 Hugo인가

정적 사이트 생성기(SSG)를 고를 때 Next.js, Gatsby, Astro도 검토했다. 결국 Hugo를 선택한 이유는 단 하나다.

**개발 블로그를 만드는 데 Node.js 생태계의 복잡함이 필요하지 않다.**

`npm install` 없이 바이너리 하나로 실행되고, 글 수백 개도 수십 ms에 빌드되며, 배포는 `git push` 한 번으로 끝난다. 블로그가 아니라 블로그를 세팅하는 데 시간을 쏟는 상황을 피하고 싶었다.

## 레퍼런스: liuhouliang.com

테마만 가져다 쓰지 않고 **레이아웃 레퍼런스**를 먼저 정했다. 참고한 사이트는 [liuhouliang.com](https://liuhouliang.com/en/)이다. 같은 Stack 테마를 쓰면서도 레이아웃이 훨씬 넓고 카드 간격이 쾌적하게 느껴졌다. 직접 DevTools로 측정해서 맞춘 수치는 다음과 같다.

| 항목 | liuhouliang.com | 내 블로그 |
|------|-----------------|-----------|
| 전체 컨테이너 너비 | 1600px | 1600px |
| 좌측 사이드바 너비 비율 | ~17% | `--left-sidebar-max-width: 17%` |
| 카드 gap | 30px | 30px |

Stack 테마 기본값은 컨테이너가 1280px 이하다. `custom.scss`에서 `.container.extended`를 오버라이드해 맞췄다.

## 스택 구성

| 구성 요소 | 역할 |
|---|---|
| Hugo v0.161.1 extended | 정적 사이트 생성기 |
| Stack 테마 (git submodule) | 블로그 테마 |
| GitHub Pages | 호스팅 |
| GitHub Actions | CI/CD 자동 배포 |
| Cloudflare | DNS, 커스텀 도메인 |
| Cloudflare Workers + KV | 글별 조회수 API |
| Busuanzi | 사이트 총 방문자 수 |
| Giscus | 댓글 (GitHub Discussions 기반) |

Cloudflare Workers는 처음부터 계획한 것이 아니라 "글마다 조회수를 보여주고 싶다"는 생각에서 나중에 추가했다. 정적 사이트라 서버가 없으니 Workers + KV 조합이 유일한 선택지였다.

## 초기 세팅

### 1. Hugo 설치 (macOS)

```bash
brew install hugo
hugo version
# hugo v0.161.1+extended darwin/arm64
```

`extended` 버전이 필수다. SCSS 컴파일에 필요하다.

### 2. 새 사이트 생성 + Stack 테마 적용

```bash
hugo new site my-blog
cd my-blog
git init
git submodule add https://github.com/CaiJimmy/hugo-theme-stack themes/stack
```

테마를 git submodule로 관리하면 `git submodule update --remote`로 업데이트할 수 있다. 단, 테마 파일을 직접 수정하면 업데이트 시 충돌이 난다. Hugo의 오버라이드 시스템을 활용해야 한다 — 아래 커스터마이징 섹션 참고.

### 3. GitHub Actions 배포

`<username>.github.io` 이름으로 GitHub 레포를 만들고, Settings → Pages에서 **GitHub Actions**를 소스로 선택한다.

`.github/workflows/hugo.yml`:

```yaml
name: Deploy Hugo site to Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      HUGO_VERSION: 0.161.1
    steps:
      - name: Install Hugo CLI
        run: |
          wget -O hugo.deb https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.deb
          sudo dpkg -i hugo.deb

      - name: Checkout
        uses: actions/checkout@v4
        with:
          submodules: recursive   # 이게 없으면 테마가 빠져서 빌드 실패

      - name: Setup Pages
        id: pages
        uses: actions/configure-pages@v5

      - name: Build with Hugo
        run: hugo --minify --baseURL "${{ steps.pages.outputs.base_url }}/"

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./public

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

---

## 커스텀 도메인 연결 (Cloudflare)

### CNAME 레코드 추가

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | blog | `<username>.github.io` | DNS only (회색 구름) |

**Proxy(주황 구름) 상태로 두면 안 된다.** Cloudflare가 트래픽을 가로채면 GitHub Pages의 HTTPS 인증서 발급이 실패한다. `DNS only`로 설정해야 GitHub가 직접 TLS를 발급한다.

`static/CNAME` 파일에 커스텀 도메인을 한 줄로 적어두면 Hugo 빌드 시 `public/CNAME`으로 복사되어 GitHub Pages에 전달된다.

---

## hugo.toml 주요 설정

```toml
baseURL = "https://blog.kastori.dev/"
locale = "ko-kr"
title = "kastori"
theme = "stack"
paginate = 10
hasCJKLanguage = true        # 한국어 읽기 시간 계산에 필수

[params]
    mainSections = ["tech", "til", "log"]
    pageviewWorkerUrl = "https://pageview.<계정>.workers.dev"  # 조회수 Worker URL

    [params.sidebar]
        subtitle = "풀스택 개발자의 기술 블로그"
        avatar = "https://github.com/Kastori1206.png"

    [params.article]
        toc = true
        readingTime = true

    [params.colorScheme]
        toggle = true
        default = "auto"

    [params.homepage]
        grid = true

    [params.comments]
        enabled = true
        provider = "giscus"
```

---

## 콘텐츠 구조

Stack 테마는 `content/` 아래 디렉터리가 곧 섹션이 된다.

```text
content/
├── tech/          # 기술 포스트
│   ├── _index.md
│   └── 글.md
├── til/           # Today I Learned
├── log/           # 일상 기록
├── archives/      # 아카이브 페이지
└── search.md      # 검색 페이지
```

---

## 커스터마이징

**핵심 원칙**: 테마 파일은 절대 건드리지 않는다. 프로젝트 루트의 `layouts/`에 같은 경로로 파일을 만들면 Hugo가 테마보다 우선 적용한다.

```text
themes/stack/layouts/_partials/sidebar/left.html  ← 원본
layouts/_partials/sidebar/left.html               ← 내 오버라이드
```

CSS는 `assets/scss/custom.scss`를 생성하면 Stack이 자동으로 포함시켜준다.

### 실제로 오버라이드한 것들

**레이아웃 너비** — `.container.extended`를 `max-width: 1600px`로 확장. liuhouliang.com 기준으로 맞췄다.

**홈 그리드** — `article-list.-grid`에서 gap을 30px로, 카드 hover 시 translateY(-5px) 애니메이션 추가.

**사이드바 검색창** — 기본 Stack 사이드바엔 검색창이 없다. `left.html`을 오버라이드해서 추가했다.

**사이드바 방문자 수** — Busuanzi 서비스로 총 UV를 가져와 사이드바 하단에 눈 아이콘과 함께 표시한다.

**카드 조회수** — `article/components/details.html`을 오버라이드해서 날짜/읽기 시간과 같은 줄에 눈 아이콘 + 조회수를 표시한다. Cloudflare Workers API를 호출한다.

**macOS 코드 블록** — `.highlight:before`에 SVG base64로 신호등 버튼을 그려 넣는다.

**페이지네이션 버튼** — 기본 스타일이 `flex: 1 1 auto`라 버튼이 전체 너비로 늘어났다. `flex: 0 0 auto`로 수정.

**Sticky footer** — 글이 짧을 때 footer가 중간에 떠오르는 문제. `main.main`에 `align-self: stretch`, `> .site-footer`에 `margin-top: auto`를 적용해 항상 하단에 고정되도록 했다.

**Archives 섹션 타일** — 기본 테마엔 없다. `layouts/archives.html`을 만들어 Stack의 `article-list/tile` 파셜을 활용했고, Tech/TIL/Log 각각에 그라디언트 색상을 입혔다.

**섹션 내 카테고리 카드** — Tech 페이지 상단에 카테고리 목록을 카드로 표시. Hugo 택소노미를 순회해서 현재 섹션에 속한 카테고리만 필터링하고 포스트 수와 함께 보여준다.

---

## Cloudflare Workers로 조회수 구현

정적 사이트라 서버가 없다. 글별 조회수를 저장하려면 외부 저장소가 필요하다. Cloudflare Workers + KV 조합을 썼다.

### 구조

```
브라우저 → GET /api/pageviews?url=/tech/xxx  → Worker → KV에서 count 조회
브라우저 → POST /api/pageviews?url=/tech/xxx → Worker → KV count++ 후 반환
```

글 페이지에서는 POST(조회수 증가), 목록 페이지에서는 GET(조회수 조회)만 한다. `document.body.classList.contains('article-page')`로 구분한다.

### Worker 코드 핵심

```js
const ALLOWED_ORIGINS = ['https://blog.kastori.dev', 'http://localhost:1313'];

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
});
```

`Access-Control-Allow-Origin` 헤더는 **단일 문자열**이어야 한다. 배열을 직접 넣으면 CORS가 터진다. 요청 origin이 허용 목록에 있으면 그걸 그대로 반환하고, 없으면 기본값을 반환하는 방식으로 해결했다.

---

## Giscus 댓글 설정

GitHub Discussions 기반 댓글 시스템. 서버가 필요 없고 GitHub 계정으로 로그인한다.

1. GitHub 레포 Settings → General → Discussions 활성화
2. [Giscus 앱](https://github.com/apps/giscus) 설치
3. GitHub GraphQL API로 `repoID`와 `categoryID` 조회

```graphql
query {
  repository(owner: "Kastori1206", name: "kastori1206.github.io") {
    id
    discussionCategories(first: 10) {
      nodes { id name }
    }
  }
}
```

4. `hugo.toml`에 설정

```toml
[params.comments.giscus]
    repo = "Kastori1206/kastori1206.github.io"
    repoID = "R_..."
    category = "Announcements"
    categoryID = "DIC_..."
    mapping = "title"
    lightTheme = "light"
    darkTheme = "dark_dimmed"
```

---

## 삽질 모음

### TOML 위젯 형식 오류

```toml
# 잘못된 방법 (문자열 배열로 쓰면 Hugo가 무시한다)
widgets = ["search", "archives"]

# 올바른 방법 (객체 배열)
[[params.widgets.homepage]]
    type = "search"

[[params.widgets.homepage]]
    type = "archives"
```

### Stack 아이콘 이름

`themes/stack/assets/icons/`에 있는 SVG 파일명이 그대로 아이콘 이름이다. `code`, `pencil` 같은 이름은 없다.

사용 가능한 예: `home`, `archives`, `tag`, `hash`, `search`, `infinity`, `brand-github`

### GitHub Pages 빌드 실패

```text
Error: Unable to locate config file or config directory
```

`actions/checkout@v4`에 `submodules: recursive`가 빠지면 테마 디렉터리가 비어 있어서 발생한다.

### hasCJKLanguage 미설정

이 설정이 없으면 한국어 글의 읽기 시간이 3배 이상 부풀려진다.

```toml
hasCJKLanguage = true
```

### Cloudflare Workers CORS 오류 (status 0)

브라우저 콘솔에 `status: 0` CORS 에러가 떴다. 원인은 Worker에서 `Access-Control-Allow-Origin`에 배열을 넘기고 있었던 것.

```js
// 잘못된 코드 — 배열은 HTTP 헤더가 될 수 없다
'Access-Control-Allow-Origin': ['https://blog.kastori.dev', 'http://localhost:1313']

// 올바른 코드
'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
```

`curl -sv -H "Origin: http://localhost:1313" <Worker URL>`로 응답 헤더를 직접 확인해서 원인을 찾았다.

### Cloudflare Analytics의 localhost CORS 오류

`beacon.min.js`가 `cloudflareinsights.com`에 POST 요청을 보내는데, Cloudflare Analytics는 `http://localhost` (포트 없는 경우)만 허용한다. `http://localhost:1313`은 허용 목록에 없어서 로컬 개발 중 콘솔이 CORS 에러로 도배됐다.

해결: `custom.html`에서 스크립트 로딩 조건을 추가했다.

```html
{{- if not hugo.IsServer -}}
<script defer src='https://static.cloudflareinsights.com/beacon.min.js' ...></script>
{{- end -}}
```

`hugo.IsServer`는 `hugo server`로 실행 중일 때 `true`다. 프로덕션 빌드에서만 로드된다.

### Hugo 서버가 템플릿 변경을 반영 안 할 때

`layouts/` 파일을 수정해도 로컬 서버에 반영이 안 되는 경우가 있다. 예전에 띄운 Hugo 프로세스가 살아있어서 캐시된 템플릿을 계속 쓰는 것이다.

```bash
pkill -f "hugo server"
hugo server --disableFastRender
```

`--disableFastRender`는 매 요청마다 전체 페이지를 다시 렌더링한다. 개발 중엔 이걸 켜두는 게 낫다.

---

## 완성된 기능

- Hugo + Stack 테마 세팅
- GitHub Actions 자동 배포
- 커스텀 도메인 (Cloudflare DNS)
- Tech / TIL / Log 섹션 구조
- 2컬럼 그리드 홈 레이아웃 (1600px 컨테이너)
- Archives 페이지 — 섹션 타일 카드 (그라디언트)
- 섹션 페이지 — 카테고리 카드 목록
- macOS 스타일 코드 블록
- 좌측 사이드바 검색창
- 사이드바 총 방문자 수 (Busuanzi)
- 카드/글 페이지 조회수 (Cloudflare Workers + KV)
- Giscus 댓글
- Sticky footer

---

## 회고

### 레퍼런스를 먼저 정한 게 잘한 일이었다

테마만 골랐다면 "기본값이 이상한데..." 하면서 감각 없이 수정했을 것 같다. liuhouliang.com을 레퍼런스로 잡고 DevTools로 수치를 측정해서 맞추니 방향이 명확했다. "왜 내 블로그가 좁아 보이지?"가 아니라 "1600px로 넓혀야 한다"가 됐다.

### Hugo 오버라이드 시스템은 잘 설계되어 있다

`layouts/` 디렉터리 하나로 테마 전체를 건드리지 않고 필요한 부분만 교체할 수 있다. 테마를 업데이트해도 내 오버라이드는 그대로다. 이 덕분에 Stack 테마의 부분만 바꾸면서 전체적인 구조는 유지할 수 있었다.

### 정적 사이트에 동적 기능을 붙이는 비용

조회수 하나를 붙이는 데 Cloudflare Workers를 세팅하고, CORS를 디버깅하고, Hugo 템플릿을 오버라이드해야 했다. 동적 기능 하나가 생각보다 많은 레이어를 건드린다. 그래도 서버 없이 무료로 운영할 수 있다는 장점이 이 복잡함을 상쇄한다.

### 삽질의 패턴

이번 세팅에서 겪은 삽질의 대부분은 **암묵적인 제약을 모르고 시작한 것**들이었다. CORS 헤더는 단일 문자열이어야 한다는 것, Cloudflare Analytics는 포트 없는 localhost만 허용한다는 것, Hugo 서버는 프로세스가 살아있으면 캐시를 쓴다는 것. 문서에 있긴 한데, 직접 부딪히기 전까지는 보이지 않는 것들이다.

---

## 참고

- [Hugo 공식 문서](https://gohugo.io/documentation/)
- [Stack 테마 GitHub](https://github.com/CaiJimmy/hugo-theme-stack)
- [liuhouliang.com](https://liuhouliang.com/en/) — 레이아웃 레퍼런스
- [Giscus](https://giscus.app/)
- [Cloudflare Workers 문서](https://developers.cloudflare.com/workers/)
