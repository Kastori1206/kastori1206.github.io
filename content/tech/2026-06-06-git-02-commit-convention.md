---
title: "커밋 메시지를 잘 쓴다는 것 — Conventional Commits 실전 가이드"
date: 2026-06-06
draft: false
target_section: tech
series: "Git 팀 협업 실전"
series_order: 2
series_total: 5
tags: [git, commit, convention, conventional-commits, changelog]
description: "6개월 전 커밋을 보며 '이게 왜 바뀌었지?'를 답할 수 있는 커밋 메시지 작성법. Conventional Commits 형식과 실무 적용 팁."
wiki_source: 10-wiki/tech/git/03-commit-convention.md
categories: [Git]
---

## git log에 남는 것들

```bash
git log --oneline

a3f21c9 수정
b12e8f1 fix
c94d3a2 asdf
d77f0e1 작업 완료
e23b1c7 ㅁㄴㅇ
```

6개월 전 내가 쓴 커밋들이다. 뭘 고쳤는지, 왜 고쳤는지 전혀 알 수 없다. 커밋 메시지는 코드의 히스토리이고, 미래의 나(또는 동료)에게 보내는 메모다.

---

## Conventional Commits 형식

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

```bash
# 실제 예시
feat(auth): Google OAuth2 소셜 로그인 추가

기존 이메일/비밀번호 로그인과 병행 사용 가능.
Google Cloud Console에서 OAuth 앱 등록 필요.

Closes #123
```

---

## type 종류

| type | 언제 쓰나 | 버전 영향 |
|------|---------|---------|
| `feat` | 새 기능 추가 | Minor ↑ |
| `fix` | 버그 수정 | Patch ↑ |
| `refactor` | 리팩터링 (기능 변화 없음) | 없음 |
| `test` | 테스트 추가/수정 | 없음 |
| `docs` | 문서 변경 | 없음 |
| `style` | 코드 포맷팅 (로직 무변화) | 없음 |
| `chore` | 빌드, 패키지, CI 설정 | 없음 |
| `perf` | 성능 개선 | Patch ↑ |

---

## 좋은 커밋 메시지의 조건

### 제목은 50자 이하, 명령형으로

```bash
# ✅ 좋음
feat(order): 주문 취소 API 추가
fix(auth): 로그아웃 후 토큰 무효화 안 되는 버그 수정

# ❌ 나쁨
feat(order): 주문 취소 기능을 구현했습니다 (과거형, 너무 김)
fixed bug  (type 없음, 뭘 고쳤는지 모름)
```

### body는 "왜"를 설명한다

```bash
refactor(payment): 결제 전략 패턴으로 분리

기존 PaymentService에 if/else로 결제 수단이 추가될 때마다
코드 수정이 필요했음. 전략 패턴 도입으로 OCP 달성.
새 결제 수단 추가 시 PaymentStrategy 구현체만 추가하면 됨.
```

what(무엇을 바꿨는가)은 코드 diff를 보면 안다. body에는 **why(왜 바꿨는가)**를 쓴다.

---

## Breaking Change

하위 호환성이 깨지는 변경은 반드시 명시한다.

```bash
feat!: 사용자 API 응답 형식 변경

BREAKING CHANGE: userId 필드가 id로 변경됨.
기존 클라이언트는 필드명 수정 필요.
```

`feat!`의 `!`가 Breaking Change를 의미한다. SemVer에서 Major 버전 업 트리거.

---

## 커밋 단위 원칙

**하나의 커밋 = 하나의 목적**

```bash
# ✅ 좋음 — 목적이 명확한 단위
git commit -m "feat(user): 회원가입 엔티티 추가"
git commit -m "feat(user): 회원가입 서비스 로직 구현"
git commit -m "feat(user): 회원가입 API 엔드포인트 추가"
git commit -m "test(user): 회원가입 서비스 단위 테스트"

# ❌ 나쁨 — 여러 목적이 섞임
git commit -m "회원가입 기능 구현 및 버그 수정 및 테스트"
```

---

## WIP 커밋 처리

작업 중간에 저장해야 할 때는 WIP 커밋을 만들고, PR 전에 정리한다.

```bash
# 작업 중 임시 저장
git commit -m "WIP: 결제 API 작업 중"

# PR 전에 squash로 깔끔하게 정리
git rebase -i HEAD~3
# WIP 커밋들을 squash해서 하나로 합치기
```

squash는 이 시리즈 마지막 편(고급 명령어)에서 다룬다.

---

## CHANGELOG 자동 생성

Conventional Commits 형식을 지키면 CHANGELOG를 자동 생성할 수 있다.

```bash
# conventional-changelog 설치
npm install -g conventional-changelog-cli

# CHANGELOG.md 생성
conventional-changelog -p angular -i CHANGELOG.md -s
```

```markdown
# CHANGELOG

## [1.3.0] - 2026-06-04

### Features
- **auth**: Google OAuth2 소셜 로그인 추가 (#123)
- **order**: 주문 취소 API 추가 (#124)

### Bug Fixes
- **auth**: 로그아웃 후 토큰 무효화 버그 수정 (#125)
```

커밋 메시지 하나하나가 릴리즈 노트가 된다. 다음 편에서는 이 커밋들을 담는 PR을 잘 쓰는 법을 다룬다.
