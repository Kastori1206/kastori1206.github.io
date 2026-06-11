---
title: "알아두면 구하는 Git 명령어 — rebase, squash, cherry-pick, stash, revert"
date: 2026-06-11
draft: false
target_section: tech
series: "Git 팀 협업 실전"
series_order: 5
series_total: 5
tags: [git, rebase, squash, cherry-pick, stash, revert, reflog, advanced]
description: "PR 전에 WIP 커밋을 정리하는 squash, main 변경사항을 깔끔하게 반영하는 rebase, 특정 커밋만 가져오는 cherry-pick, 공유 브랜치에서 안전하게 되돌리는 revert. 실무에서 자주 마주치는 상황별 명령어."
wiki_source: 10-wiki/tech/git/06-advanced-git.md
categories: [Git]
---

## 언제 이 명령어들이 필요한가

```
"PR 전에 WIP 커밋 5개를 하나로 합치고 싶다"          → squash
"main이 업데이트됐는데 내 브랜치에 깔끔하게 반영하고 싶다" → rebase
"hotfix 커밋을 다른 브랜치에도 적용하고 싶다"         → cherry-pick
"작업 중인데 급하게 다른 브랜치로 가야 한다"           → stash
"push한 커밋을 이력을 남기며 취소하고 싶다"            → revert
"실수로 커밋을 날렸다"                               → reflog
```

---

## rebase — 커밋 히스토리 재배치

### merge vs rebase

```
상황: main에 새 커밋이 생긴 동안 feature 브랜치에서 작업

merge 결과 (머지 커밋 생성):
  main:    A → B → C → M
                     ↗
  feature:     D → E

rebase 결과 (feature를 main 위로 재배치):
  main:    A → B → C → D' → E'
```

rebase는 히스토리가 선형으로 유지된다. PR 전에 main의 최신 상태를 반영할 때 유용하다.

```bash
git checkout feature/login-api
git rebase main

# 충돌 발생 시
# 1. 충돌 파일 수정
# 2. git add <파일>
# 3. git rebase --continue
# 취소: git rebase --abort
```

> **주의**: rebase는 커밋 해시가 바뀐다. 팀원과 공유 중인 브랜치에는 절대 쓰지 않는다. 자신의 feature 브랜치에서만.

---

## Interactive Rebase — 커밋 편집

`git rebase -i`로 과거 커밋을 합치거나 편집한다.

```bash
# 최근 3개 커밋 편집
git rebase -i HEAD~3
```

에디터가 열리면:

```
pick a1b2c3 WIP: 로그인 API 작업 중
pick d4e5f6 WIP: 유효성 검증 추가
pick g7h8i9 feat(auth): 로그인 API 완성

# 명령어:
# pick   → 그대로 유지
# squash → 이전 커밋과 합치기 (커밋 메시지 편집 가능)
# fixup  → 이전 커밋과 합치기 (메시지는 이전 것 유지)
# drop   → 커밋 삭제
# reword → 커밋 메시지만 수정
```

WIP 커밋들을 squash로 정리:

```
pick a1b2c3 WIP: 로그인 API 작업 중
squash d4e5f6 WIP: 유효성 검증 추가
squash g7h8i9 feat(auth): 로그인 API 완성
```

저장하면 세 커밋이 하나로 합쳐지고 메시지를 새로 작성할 수 있다.

---

## cherry-pick — 특정 커밋만 가져오기

```bash
# 커밋 해시 확인
git log --oneline feature/payment
# a1b2c3 feat(payment): 카드 결제 핵심 로직

# 해당 커밋만 현재 브랜치로 가져오기
git cherry-pick a1b2c3
```

**주로 쓰는 상황:**

```
hotfix를 main에 적용했는데 develop에도 반영해야 할 때
특정 기능 커밋만 다른 브랜치에 선별 적용할 때
```

```bash
# 여러 커밋 한 번에
git cherry-pick a1b2c3 d4e5f6

# 범위로
git cherry-pick a1b2c3..g7h8i9
```

> cherry-pick은 커밋을 **복사**하는 것. 원본 브랜치에도 커밋이 그대로 남는다.

---

## stash — 작업 중간에 브랜치 전환

커밋하기엔 이르고 전환은 해야 할 때.

```bash
# 현재 변경사항 임시 저장
git stash

# 다른 브랜치 작업 후 돌아와서
git stash pop      # 꺼내고 목록에서 삭제
git stash apply    # 꺼내되 목록에 유지

# stash 목록 확인
git stash list
# stash@{0}: WIP on feature/login: ...
# stash@{1}: WIP on feature/payment: ...

# 특정 stash 적용
git stash apply stash@{1}
```

---

## reflog — 실수 복구의 안전망

```bash
# 실수로 커밋을 날렸다
git reset --hard HEAD~3  # 최근 3개 커밋 삭제

# reflog로 삭제 전 상태 찾기
git reflog
# a1b2c3 HEAD@{0}: reset: moving to HEAD~3
# d4e5f6 HEAD@{1}: commit: feat: 주문 API 추가  ← 이걸 살려야 함
# g7h8i9 HEAD@{2}: commit: feat: 상품 조회 API

# 복구
git reset --hard d4e5f6
```

`reflog`는 로컬 Git의 모든 HEAD 이동 기록이다. `git push`한 후가 아니라면 대부분의 실수를 복구할 수 있다.

---

## reset 정리

```bash
git reset --soft HEAD~1
  → 커밋만 취소. 변경사항은 staged 상태로 남음.
  → 커밋 메시지만 고치고 싶을 때.

git reset --mixed HEAD~1  (기본값)
  → 커밋 취소. 변경사항은 unstaged 상태.
  → 파일은 남아있음.

git reset --hard HEAD~1
  → 커밋 취소 + 변경사항 완전 삭제.
  → 되돌릴 수 없음. 신중하게.
```

---

## revert — 이력을 남기며 되돌리기

`reset`은 커밋을 삭제하지만 `revert`는 **되돌리는 새 커밋을 만든다**. 이미 push한 브랜치에서는 revert가 안전하다.

```bash
# 특정 커밋 되돌리기
git revert a1b2c3

# 여러 커밋 되돌리기
git revert a1b2c3 d4e5f6

# 커밋 메시지 편집 없이 바로
git revert --no-edit a1b2c3
```

**reset vs revert 선택 기준:**

```
reset  → 로컬에서만 작업 중, 아직 push 안 함
         커밋 자체를 없애고 싶다

revert → 이미 push했거나 팀과 공유 중인 브랜치
         "이 커밋을 취소했다"는 이력을 남겨야 한다
```

```bash
# 예시: 배포 후 문제가 생긴 커밋 롤백
git log --oneline
# f1a2b3 feat: 결제 모듈 배포  ← 이게 문제

git revert f1a2b3
# → "Revert 'feat: 결제 모듈 배포'" 커밋 생성
git push origin main
```

이력에 revert 커밋이 남기 때문에 "언제 왜 롤백했는지"가 추적된다.

---

## 마치며

이 시리즈에서 다룬 것들:

```
#1 브랜칭 전략  → 팀이 브랜치를 어떻게 운영할지
#2 커밋 컨벤션  → 변경 이력을 어떻게 기록할지
#3 PR & 코드리뷰 → 변경을 어떻게 검토하고 합칠지
#4 릴리즈 관리  → 버전을 어떻게 관리하고 배포할지
#5 고급 명령어  → 실무에서 마주치는 상황별 도구
```

혼자 프로젝트를 할 때도 이 흐름을 연습해두면, 팀에 합류했을 때 코드보다 협업 방식을 배우는 데 시간을 쓰지 않아도 된다.
