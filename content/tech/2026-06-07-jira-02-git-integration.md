---
title: "Git + Jira — 브랜치·커밋·PR에 이슈 키 연결하기"
date: 2026-06-07
draft: false
target_section: tech
series: "Jira + Git + Slack 개발 환경"
series_order: 2
series_total: 3
tags: [jira, git, github, branch, commit, pr]
description: "브랜치명에 이슈 키를 넣고, 커밋 메시지에 연결하고, PR에서 자동으로 이슈를 닫는 방법. GitHub for Jira 앱 연동까지."
wiki_source: 10-wiki/tech/git/08-jira-integration.md
categories: [DevTools]
---

## 코드 변경에 이유를 남기는 방법

6개월 전에 작성한 코드를 보면서 "이게 왜 있지?"를 되묻는 경험이 있다면, 이 글이 그 문제를 해결해 준다.

Git 커밋 메시지와 Jira 이슈를 연결하면 코드 한 줄이 어떤 맥락에서 생겼는지 항상 추적할 수 있다.

---

## 연동의 핵심: 이슈 키

모든 것은 이슈 키 하나로 연결된다.

```
이슈 키 형식: {프로젝트 키}-{번호}
예) BLOG-42
```

이 키를 브랜치명, 커밋 메시지, PR 어디에든 넣으면 Jira가 자동으로 해당 이슈와 연결한다.

---

## 브랜치 네이밍

```bash
git switch -c feature/BLOG-42-add-comment-api
```

```
패턴: {type}/{이슈키}-{설명}

feature/BLOG-42-add-comment-api   ← 기능 추가
bugfix/BLOG-37-fix-jwt-expiry     ← 버그 수정
refactor/BLOG-55-split-service    ← 리팩터링
```

이슈 키가 앞에 있으면 브랜치 목록에서 어떤 이슈와 연결됐는지 바로 보인다.

---

## 커밋 메시지

```bash
git commit -m "feat(comment): 댓글 생성 API 구현 BLOG-42"
```

커밋 끝에 이슈 키를 붙이는 것만으로 Jira가 연결을 감지한다.

조금 더 자세히 쓰고 싶다면:

```bash
git commit -m "feat(comment): 댓글 생성 API 구현

- POST /api/comments 엔드포인트 추가
- 댓글 내용 500자 유효성 검증

BLOG-42"
```

**Smart Commits** — 커밋 메시지로 Jira 이슈 상태를 자동으로 바꿀 수도 있다.

```bash
# 작업 시작 시 이슈를 In Progress로
git commit -m "feat: 댓글 API 작업 시작 BLOG-42 #in-progress"

# 완료 시 Done으로
git commit -m "feat: 댓글 API 완료 BLOG-42 #done"
```

---

## PR 작성

```
제목: [BLOG-42] feat(comment): 댓글 생성 API 구현
```

PR 본문에는 이슈 링크를 추가한다:

```markdown
## 관련 이슈
- Jira: [BLOG-42](https://your-domain.atlassian.net/browse/BLOG-42)
- Closes BLOG-42

## 변경 내용
- POST /api/comments 엔드포인트 추가
- 댓글 내용 500자 유효성 검증

## 테스트
- [ ] 댓글 생성 정상 응답
- [ ] 빈 내용 검증
```

`Closes BLOG-42`를 적으면 PR이 머지될 때 이슈가 자동으로 Done 처리된다.

---

## GitHub for Jira 앱 연동

브랜치·커밋·PR이 Jira 이슈 페이지에서 바로 보이려면 앱 연동이 필요하다.

```
1. Jira → Apps → 앱 탐색
   → "GitHub for Atlassian" (by Atlassian) 설치

2. GitHub 계정 연결
   → Jira와 다른 구글 계정이어도 무관
   → OAuth 토큰 기반이라 계정 종류 상관없음

3. 연결할 레포 선택 → 승인
```

연동 후 Jira 이슈 페이지:

```
Development 패널:
  ├── Branches (1)  : feature/BLOG-42-add-comment-api
  ├── Commits (3)   : 관련 커밋 목록
  └── Pull Requests : [Open] 댓글 생성 API
```

이슈 하나에서 관련 코드 변경 전체를 볼 수 있다.

---

## 실전 워크플로우 요약

```
1. Jira에서 이슈 생성 → BLOG-42
2. 브랜치 생성 → feature/BLOG-42-add-comment-api
3. 커밋 → "feat: 구현 BLOG-42"
4. PR → [BLOG-42] feat: 댓글 API / Closes BLOG-42
5. 머지 → 이슈 자동 Done
```

혼자 쓸 때는 이 흐름을 다 지키기보다 **브랜치명 + 커밋에 이슈 키**만 챙겨도 충분하다. 나중에 `git log`에서 이슈 키로 검색하면 그 작업의 전체 맥락을 찾을 수 있다.

다음 편에서는 Slack과 연동해서 Jira + GitHub 알림을 한 곳에 모으는 방법을 다룬다.
