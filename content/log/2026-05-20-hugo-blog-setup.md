---
title: "Hugo + Stack 테마로 기술 블로그 만들기"
description: "GitHub Pages에 Hugo 블로그를 세팅하고 커스텀 도메인까지 연결한 과정. 겪은 삽질과 해결책을 정리했다."
date: 2026-05-20T00:00:00+09:00
categories: ["Blog"]
tags: ["hugo", "github-pages", "blog", "stack-theme"]
draft: false
---

## 왜 Hugo인가

정적 사이트 생성기(SSG) 중에서 Hugo를 선택한 이유는 단순하다.

- **빠르다**: Go 언어 기반으로 수백 개의 글도 수십 ms 안에 빌드된다
- **배포가 쉽다**: GitHub Pages + GitHub Actions로 `git push` 한 번에 자동 배포
- **서버가 없다**: DB도, Node.js 서버도 없다. 정적 파일만 호스팅하면 된다
- **무료다**: GitHub Pages 무료 플랜으로 충분하다

## 스택 구성

| 구성 요소 | 역할 |
|---|---|
| Hugo v0.161.1 extended | 정적 사이트 생성기 |
| Stack 테마 (git submodule) | 블로그 테마 |
| GitHub Pages | 호스팅 |
| GitHub Actions | CI/CD 자동 배포 |
| Cloudflare | DNS, 커스텀 도메인 |
| Giscus | 댓글 (GitHub Discussions 기반) |

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

`hugo.toml`에 테마 등록:

```toml
theme = "stack"
```

### 3. GitHub 레포 생성 및 배포 설정

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
          submodules: recursive

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

`git push`하면 자동으로 빌드되고 배포된다.

---

## 커스텀 도메인 연결 (Cloudflare)

Cloudflare를 DNS로 사용하는 경우 설정은 간단하다.

### 1. CNAME 레코드 추가

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | blog | `<username>.github.io` | DNS only (회색) |

> **주의**: Proxy 상태(주황 구름)로 두면 GitHub Pages의 HTTPS 인증서 발급이 실패한다. 반드시 DNS only로 설정해야 한다.

### 2. static/CNAME 파일 생성

```text
blog.yourdomain.com
```

Hugo 빌드 시 이 파일이 `public/` 에 복사되어 GitHub Pages에 전달된다.

### 3. GitHub 레포 설정

Settings → Pages → Custom domain에 도메인을 입력하면 `Enforce HTTPS`가 활성화된다.

---

## hugo.toml 주요 설정

```toml
baseURL = "https://blog.yourdomain.com/"
locale = "ko-kr"
title = "블로그 제목"
theme = "stack"
paginate = 10
hasCJKLanguage = true        # 한국어 단어 수 계산에 필수

[params]
    mainSections = ["tech", "til", "log"]

    [params.sidebar]
        subtitle = "블로그 소개 문구"
        avatar = "https://github.com/<username>.png"

    [params.article]
        toc = true
        readingTime = true

    [params.colorScheme]
        toggle = true
        default = "auto"

    [params.homepage]
        grid = true          # 2컬럼 그리드 홈

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
│   ├── _index.md  # 섹션 제목/설명
│   └── 글.md
├── til/           # Today I Learned
├── log/           # 일상 기록
├── archives/      # 아카이브 페이지
└── search.md      # 검색 페이지
```

`_index.md` frontmatter:

```yaml
---
title: "Tech"
description: "기술 포스트 모음"
---
```

---

## 커스터마이징

Stack 테마의 파일을 직접 수정하면 테마 업데이트 시 덮어씌워진다. 올바른 방법은 **프로젝트 루트의 `layouts/`에 같은 경로로 복사**하는 것이다. Hugo는 프로젝트 `layouts/`를 테마보다 우선시한다.

### 예시: 홈 레이아웃 수정

```text
themes/stack/layouts/home.html  ← 원본 (건드리지 않는다)
layouts/home.html               ← 오버라이드 (여기에 수정)
```

### 커스텀 CSS

`assets/scss/custom.scss`를 생성하면 Stack이 자동으로 포함시켜준다.

```scss
/* 색상 테마 오버라이드 */
:root {
    --accent-color: #1B365D;
    --body-background: #f8f7f2;
}
```

### macOS 스타일 코드 블록

코드 블록 상단에 macOS 신호등 버튼(빨/노/초)을 추가하는 CSS:

```scss
.article-content .highlight {
    border-radius: 10px;
    overflow: hidden;
}

.article-content .highlight:before {
    content: "";
    display: block;
    height: 35px;
    background: url("data:image/svg+xml;base64,...") no-repeat 12px center;
    background-size: 52px;
}
```

---

## Giscus 댓글 설정

[GitHub Discussions](https://docs.github.com/en/discussions) 기반 댓글 시스템이다. 서버가 필요 없다.

### 1. 준비

- GitHub 레포에서 Discussions 활성화 (Settings → General → Discussions)
- [Giscus 앱](https://github.com/apps/giscus) 설치

### 2. repoID와 categoryID 조회

GitHub GraphQL API로 ID를 가져온다:

```graphql
query {
  repository(owner: "username", name: "repo-name") {
    id
    discussionCategories(first: 10) {
      nodes { id name }
    }
  }
}
```

### 3. hugo.toml 설정

```toml
[params.comments]
    enabled = true
    provider = "giscus"

[params.comments.giscus]
    repo = "username/repo-name"
    repoID = "R_..."
    category = "Announcements"
    categoryID = "DIC_..."
    mapping = "title"
    lightTheme = "light"
    darkTheme = "dark_dimmed"
```

---

## 삽질 모음

세팅하면서 겪은 문제들을 정리했다.

### TOML 위젯 형식 오류

```toml
# 잘못된 방법 (문자열 배열)
widgets = ["search", "archives"]

# 올바른 방법 (객체 배열)
[[params.widgets.homepage]]
    type = "search"

[[params.widgets.homepage]]
    type = "archives"
```

### Stack 아이콘 이름

Stack 테마에서 사용할 수 있는 아이콘은 `themes/stack/assets/icons/`에 있는 SVG 파일명이다. `code`, `pencil` 같은 이름은 없다.

사용 가능한 예시: `home`, `archives`, `tag`, `hash`, `search`, `infinity`, `brand-github`

### GitHub Pages 빌드 실패

```text
Error: Unable to locate config file or config directory
```

`git submodule update --init --recursive`가 워크플로우에 빠졌을 때 발생한다. `actions/checkout@v4`의 `submodules: recursive` 옵션을 꼭 확인하자.

### hasCJKLanguage 설정

이 설정이 없으면 한국어 글의 읽기 시간 계산이 정확하지 않다.

```toml
hasCJKLanguage = true
```

---

## 완성된 기능

- Hugo + Stack 테마 세팅
- GitHub Actions 자동 배포
- 커스텀 도메인 (Cloudflare DNS)
- Tech / TIL / Log 섹션 구조
- 2컬럼 그리드 홈 레이아웃
- macOS 스타일 코드 블록
- Giscus 댓글
- 좌측 사이드바 검색창
- Archives 페이지 섹션 카드

---

## 회고

### 테마를 그대로 쓰지 않은 이유

Stack 테마 자체는 완성도가 높다. 그런데 막상 세팅하고 보니 "내가 원하는 구조"와 맞지 않는 부분이 있었다.

기본 테마는 홈에 글 목록만 나열한다. 나는 **Tech / TIL / Log** 세 섹션을 명확히 구분해서 보여주고 싶었고, 각 섹션 안에서도 카테고리별로 탐색할 수 있게 만들고 싶었다. 레퍼런스로 삼은 [liu-houliang 블로그](https://liuhouliang.com/en/archives/)처럼 Archives 페이지에서 섹션 카드가 한눈에 보이는 구조가 필요했다.

### 직접 만든 것들

**Archives 섹션 타일**: 기본 테마엔 없다. `layouts/archives.html`을 만들어 Stack의 `article-list/tile` 파셜을 활용했고, Tech/TIL/Log 각각에 그라디언트 색상을 입혔다.

**섹션 내 카테고리 카드**: Tech 페이지에 들어갔을 때 "이 섹션 안에 어떤 카테고리가 있는지" 바로 보여주고 싶었다. Hugo 택소노미를 순회해서 현재 섹션에 속한 카테고리만 필터링하고, 포스트 수와 함께 카드로 표시했다.

**macOS 코드 블록**: 코드가 많은 기술 블로그인 만큼 코드 블록이 예뻐야 했다. SVG base64로 신호등 버튼을 만들어 `.highlight:before`에 넣었다.

**페이지네이션 버튼**: Stack 기본 스타일이 `flex: 1 1 auto`라 버튼이 전체 너비로 늘어났다. `flex: 0 0 auto`로 수정했다.

### 느낀 점

Hugo 오버라이드 시스템(`layouts/` 우선)이 깔끔하다. 테마 자체를 건드리지 않고 필요한 부분만 교체할 수 있어서 테마 업데이트와 충돌이 없다.

CSS 변수 기반 테마(`--accent-color`, `--card-background` 등)가 잘 설계되어 있어서 다크/라이트 모드 대응도 변수만 바꾸면 됐다.

Hugo 템플릿 문법이 처음엔 낯설었는데, `range`, `with`, `partial` 구조를 이해하고 나니 빠르게 원하는 레이아웃을 만들 수 있었다.

---

## 참고

- [Hugo 공식 문서](https://gohugo.io/documentation/)
- [Stack 테마 GitHub](https://github.com/CaiJimmy/hugo-theme-stack)
- [Giscus](https://giscus.app/)
