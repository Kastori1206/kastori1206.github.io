---
title: "GitHub + Jira + Slack — 개발 알림을 한 곳에 모으기"
date: 2026-06-09
draft: false
target_section: tech
series: "Jira + Git + Slack 개발 환경"
series_order: 3
series_total: 3
tags: [slack, jira, github, notification, devtools]
description: "Jira 이슈 상태 변경과 GitHub PR/머지 알림을 Slack 하나로 받는 연동 방법. 혼자 써도 유용한 이유와 채널 구성 팁까지."
wiki_source: 10-wiki/tech/git/08-jira-integration.md
categories: [DevTools]
---

## 알림이 흩어지면 놓친다

작업하다 보면 이런 일이 생긴다. GitHub Actions가 실패했는데 한참 후에야 알아챈다. Jira 이슈를 Done으로 바꾸는 걸 잊는다. PR을 올려놓고 머지했는지 까먹는다.

Jira, GitHub, 그리고 Slack 세 가지를 연동하면 이 모든 이벤트가 **한 곳**으로 모인다.

---

## 왜 혼자도 유용한가

팀이 없으면 알림이 필요 없을 것 같지만, 혼자일 때도 의미 있는 알림이 있다.

```
✅ GitHub Actions 실패
   → 배포가 깨졌는데 모르고 있는 상황 방지

✅ Jira 이슈 상태 변경
   → 작업 흐름이 Slack에 타임라인으로 쌓임
   → "이번 주에 뭐 했지?" 를 Slack에서 확인 가능

✅ PR 머지
   → 배포 전 최종 확인
```

그리고 팀에 합류했을 때 "Slack + Jira + GitHub 연동 경험 있습니다"를 자연스럽게 말할 수 있다.

---

## 채널 구성

먼저 Slack에서 채널 두 개면 충분하다.

```
#notifications  ← 자동 알림 전용 (봇 메시지)
나 자신에게 DM  ← 메모, 아이디어, 링크 (내가 직접 치는 것들)
```

알림과 메모를 섞으면 둘 다 묻힌다. 이 분리가 핵심이다.

---

## Jira → Slack 연동

Atlassian 공식 앱은 Jira 마켓플레이스가 아닌 **Slack App Directory**에 있다.

```
1. Slack → 앱 추가 → "Jira Cloud" 검색
   → by Atlassian → 추가

2. /jira connect 입력 → Atlassian 계정 로그인

3. 채널 알림 설정:
   Jira 프로젝트 → 상단 탭 "Slack integration"
   → #notifications 채널 선택
   → 이벤트 종류 선택
     ✅ Issue created
     ✅ Issue updated
     ✅ Status is transitioned to
```

이후 Jira 이슈 상태가 바뀔 때마다 `#notifications` 로 알림이 온다.

```
Slack에서 직접 이슈 생성도 가능:
/jira create → 제목, 타입 입력 → Jira에 바로 등록
```

---

## GitHub → Slack 연동

```
1. Slack → 앱 추가 → "GitHub" 검색
   → by GitHub → 추가

2. #notifications 채널에서:
   /github signin → GitHub 계정 연결

3. 레포 구독:
   /github subscribe kastori1206/my-project
```

**알림이 너무 많으면** push 알림만 끄면 된다:

```
/github unsubscribe kastori1206/my-project pushes
```

---

## 연동 후 실제로 오는 알림

```
[Jira]   BLOG-42 상태 변경: To Do → In Progress
[Jira]   BLOG-43 "로그인 버그" 새 이슈 생성됨
[GitHub] PR #15 "feat: 댓글 API" opened → main
[GitHub] PR #15 merged ✅
[GitHub] ✅ Build succeeded / ❌ Build failed
```

---

## GitHub Actions 실패 알림 설정

CI/CD 실패 알림은 Slack GitHub 앱 구독 외에 레포 설정에서도 켤 수 있다.

```
GitHub 레포 → Settings → Notifications
→ Actions → Email 또는 Slack webhook 추가
```

간단하게는 Slack 앱 구독 상태에서 Actions 알림이 기본으로 포함된다.

---

## Dependabot 보안 알림

사용 중인 라이브러리에 취약점이 발견되면 알림을 받는다.

```
GitHub 레포 → Settings → Security
→ Dependabot alerts → Enable
→ 이메일로 자동 발송
```

---

## 시리즈를 마치며

```
Jira   → 할 일을 이슈로 만들고 이력을 남긴다
Git    → 브랜치·커밋에 이슈 키를 연결한다
Slack  → 모든 이벤트가 한 곳에 모인다
```

세 가지가 연결되면 "이 코드는 왜 만들었는가", "언제 배포됐는가", "어떤 이슈가 해결됐는가" 를 언제든 추적할 수 있다. 혼자 쓰더라도, 팀에 합류했을 때도 이 흐름은 그대로 쓸 수 있다.
