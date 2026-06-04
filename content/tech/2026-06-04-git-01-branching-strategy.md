---
title: "팀 Git의 시작 — 브랜칭 전략, Git Flow vs GitHub Flow 언제 뭘 쓰나"
date: 2026-06-04
draft: false
target_section: tech
series: "Git 팀 협업 실전"
series_order: 1
series_total: 5
tags: [git, branching, git-flow, github-flow, team]
description: "혼자 쓰는 Git과 팀에서 쓰는 Git은 다르다. Git Flow, GitHub Flow, Trunk-based 세 가지 전략의 차이와 상황에 따른 선택 기준을 정리한다."
wiki_source: 10-wiki/tech/git/02-branching-strategy.md
categories: [Git]
---

## 브랜치 전략이 없으면 생기는 일

main에 직접 push하다가 배포 직전에 미완성 코드가 섞인다. 두 사람이 같은 파일을 수정해서 충돌이 쏟아진다. 버그를 고쳤는데 어디서 배포된 건지 모른다.

브랜칭 전략은 이런 혼돈을 막는 **팀이 동의한 브랜치 운영 규칙**이다.

---

## 브랜치 역할 이해

어떤 전략이든 기본 개념은 같다.

```
main
  → 항상 배포 가능한 상태. 직접 push 금지.

feature/xxx
  → 기능 하나를 개발하는 브랜치
  → 완료 후 PR로 main 또는 develop에 머지

hotfix/xxx
  → 운영 중 긴급 버그 수정
  → main에서 바로 생성, 수정 후 즉시 배포
```

---

## Git Flow — 체계적인 릴리즈 관리

Vincent Driessen이 제안한 전략. 브랜치 종류가 많고 릴리즈 사이클이 명확하다.

```
main ─────────────────────────────── 배포 완료 버전
        ↑ merge              ↑ merge
     release/1.2          hotfix/1.1.1
        ↑
develop ─────────────────────────── 다음 릴리즈 통합
    ↑ merge     ↑ merge
feature/login  feature/payment
```

### 흐름

```bash
# 기능 개발
git checkout develop
git checkout -b feature/user-auth
# ... 개발 ...
git checkout develop
git merge --no-ff feature/user-auth  # 머지 커밋 강제 생성
git branch -d feature/user-auth

# 릴리즈 준비
git checkout -b release/1.2.0 develop
# 버전 번호 변경, QA 수정
git checkout main && git merge --no-ff release/1.2.0
git tag -a v1.2.0 -m "Release 1.2.0"
git checkout develop && git merge --no-ff release/1.2.0
```

### 적합한 상황

```
✅ 릴리즈 주기가 정해진 서비스 (앱 스토어, 패키지 배포)
✅ QA 기간이 별도로 필요한 경우
✅ 여러 버전을 동시에 유지해야 하는 경우
❌ 매일 배포하는 웹 서비스 → 브랜치가 너무 복잡
```

---

## GitHub Flow — 단순하고 빠른 배포

main 하나 + feature 브랜치. 머지 즉시 배포.

```
main ─────────────────────────── 항상 배포됨
  ↑ PR merge    ↑ PR merge
feature/login  feature/cart
```

### 흐름

```bash
# main에서 바로 feature 브랜치 생성
git checkout main && git pull
git checkout -b feature/add-comment

# 개발 후 PR 생성 → 리뷰 → 머지
# 머지 즉시 main으로 배포
```

### 적합한 상황

```
✅ 웹 서비스, SaaS — 지속적 배포(CD) 환경
✅ 소규모 팀
✅ 빠른 피드백과 반복이 중요한 경우
❌ 릴리즈 관리가 복잡한 경우
```

---

## Trunk-based Development — 최소한의 브랜치

모든 개발자가 main(trunk)에 직접 또는 짧은 수명의 브랜치로 자주 통합.

```
main ────────────────── 모든 것이 여기로
  ↑      ↑      ↑
feature feature feature
(1~2일 이내 수명)
```

Feature Flag로 미완성 기능을 숨겨두고 main에 merge한다.

```java
if (featureFlags.isEnabled("new-payment")) {
    // 새 결제 로직
} else {
    // 기존 로직
}
```

```
✅ CI/CD가 완벽히 갖춰진 팀
✅ 테스트 커버리지가 높은 경우
❌ 테스트 없이 쓰면 main이 자주 깨짐
```

---

## 전략 선택 기준

| | Git Flow | GitHub Flow | Trunk-based |
|--|---------|------------|-------------|
| 배포 주기 | 주기적 릴리즈 | 수시 배포 | 하루 여러 번 |
| 팀 규모 | 중~대규모 | 소~중규모 | 성숙한 팀 |
| CI/CD | 선택 | 권장 | 필수 |
| 복잡도 | 높음 | 낮음 | 낮음 |

**현실적인 조언**: 처음 팀에 합류하면 GitHub Flow부터 익히자. 대부분의 스타트업과 웹 서비스 팀이 쓴다. Git Flow는 배포 주기가 정해진 팀에서 만나게 된다.

---

## 브랜치 네이밍 컨벤션

어떤 전략이든 이름 규칙은 통일하는 게 좋다.

```
feature/PROJ-42-add-login    ← 기능 추가
bugfix/PROJ-37-fix-jwt       ← 버그 수정
hotfix/PROJ-61-null-pointer  ← 긴급 수정
refactor/PROJ-55-split-svc   ← 리팩터링
chore/PROJ-70-update-deps    ← 의존성 등
```

이슈 키를 브랜치명에 포함하면 Jira와 자동 연동된다. 다음 편에서는 커밋 메시지 컨벤션을 다룬다.
