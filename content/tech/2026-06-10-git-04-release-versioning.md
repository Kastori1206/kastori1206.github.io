---
title: "버전 번호가 약속인 이유 — SemVer, Git Tag, CHANGELOG 관리"
date: 2026-06-10
draft: false
target_section: tech
series: "Git 팀 협업 실전"
series_order: 4
series_total: 5
tags: [git, release, semver, tag, changelog, versioning]
description: "1.2.3이라는 숫자 하나로 무엇이 바뀌었는지, 기존 코드를 수정해야 하는지 전달하는 SemVer. Git Tag로 버전을 찍고 CHANGELOG를 자동 생성하는 방법."
wiki_source: 10-wiki/tech/git/05-release-versioning.md
categories: [Git]
---

## 버전 번호는 사용자와의 약속이다

`spring-boot-3.2.1`을 쓰고 있다가 `3.2.2`로 올릴 때와 `4.0.0`으로 올릴 때 대응이 다르다. `3.2.2`는 버그 수정이니 그냥 올려도 되지만, `4.0.0`은 Breaking Change가 있을 수 있으니 마이그레이션 가이드를 먼저 읽어야 한다.

이 약속이 **Semantic Versioning(SemVer)**이다.

---

## Semantic Versioning

형식: `MAJOR.MINOR.PATCH` — 예: `1.4.2`

```
MAJOR → 하위 호환 안 되는 변경 (Breaking Change)
         API 응답 형식 변경, 파라미터 제거
         사용자가 코드를 수정해야 함
         예: 1.4.2 → 2.0.0

MINOR → 하위 호환되는 새 기능 추가
         기존 코드 수정 없이 새 기능 사용 가능
         예: 1.4.2 → 1.5.0

PATCH → 하위 호환되는 버그 수정
         예: 1.4.2 → 1.4.3
```

### Conventional Commits와 연결

커밋 타입이 버전에 자동으로 영향을 준다.

```
feat:              → MINOR 업 (1.4.2 → 1.5.0)
fix:, perf:        → PATCH 업 (1.4.2 → 1.4.3)
docs:, style: 등   → 변화 없음
feat!: 또는
BREAKING CHANGE:   → MAJOR 업 (1.4.2 → 2.0.0)
```

### 초기 개발 (0.x.x)

```
0.1.0 → 아직 안정적이지 않음. 언제든 Breaking Change 가능.
1.0.0 → 공개 API 확정. 이후부터 SemVer 약속 적용.
```

---

## Git Tag — 버전 번호를 커밋에 붙이기

```bash
# 태그 생성 (annotated tag 권장)
git tag -a v1.2.0 -m "Release v1.2.0"

# 원격에 푸시 (태그는 git push에 포함 안 됨)
git push origin v1.2.0

# 모든 태그 한 번에 푸시
git push origin --tags

# 태그 목록 확인
git tag

# 특정 태그로 체크아웃
git checkout v1.2.0
```

### lightweight vs annotated tag

```
lightweight tag: git tag v1.2.0
  → 단순 포인터. 커밋 해시에 별칭을 붙이는 것.

annotated tag: git tag -a v1.2.0 -m "메시지"
  → 태그 작성자, 날짜, 메시지, GPG 서명 포함
  → 릴리즈에는 annotated tag 권장
```

---

## CHANGELOG — 릴리즈 이력 문서화

변경 이력을 사람이 읽을 수 있는 형태로 정리한 문서.

### Keep a Changelog 형식

```markdown
# CHANGELOG

## [Unreleased]

## [1.3.0] - 2026-06-04

### Added
- Google OAuth2 소셜 로그인 추가 (#123)
- 주문 취소 API 추가 (#124)

### Fixed
- 로그아웃 후 토큰 무효화 안 되는 버그 수정 (#125)

### Changed
- 회원 API 응답 형식 userId → id 변경

## [1.2.1] - 2026-05-20

### Fixed
- 주문 목록 페이징 오류 수정
```

### 자동 생성

Conventional Commits를 지켰다면 CHANGELOG를 자동으로 생성할 수 있다.

```bash
npm install -g conventional-changelog-cli
conventional-changelog -p angular -i CHANGELOG.md -s
```

---

## 릴리즈 프로세스 (GitHub Flow 기준)

```bash
# 1. 릴리즈할 main이 준비됐는지 확인
git checkout main && git pull

# 2. 버전 번호 결정 (커밋 내역 기반)
# feat 있으면 MINOR, fix만 있으면 PATCH

# 3. CHANGELOG 업데이트
conventional-changelog -p angular -i CHANGELOG.md -s
git add CHANGELOG.md
git commit -m "chore: v1.3.0 릴리즈 노트 업데이트"

# 4. 태그 생성 및 푸시
git tag -a v1.3.0 -m "Release v1.3.0"
git push origin main --tags

# 5. GitHub Release 생성 (UI 또는 gh CLI)
gh release create v1.3.0 --notes-from-tag
```

---

## 마치며

버전 관리는 "배포했다"를 기록하는 것이 아니라 **"무엇이 어떻게 바뀌었는가"를 약속하는 것**이다. SemVer + Conventional Commits + CHANGELOG 세 가지가 맞물리면 릴리즈마다 노트를 수동으로 작성할 필요도 없다.

다음 편에서는 rebase, squash, cherry-pick 같은 실무 고급 명령어를 다룬다.
