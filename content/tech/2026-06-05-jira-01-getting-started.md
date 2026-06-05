---
title: "Jira, 혼자 써도 되나요? — 1인 개발자의 이슈 트래커 시작하기"
date: 2026-06-05
draft: false
target_section: tech
series: "Jira + Git + Slack 개발 환경"
series_order: 1
series_total: 3
tags: [jira, project-management, kanban, issue-tracker]
description: "팀 없이 혼자 써도 Jira가 유용한 이유, 무료 플랜으로 할 수 있는 것, 칸반 프로젝트 설정과 이슈 관리 습관까지 정리한다."
wiki_source: 10-wiki/tech/jira.md
categories: [DevTools]
---

## "Jira는 팀이 있어야 쓰는 거 아닌가요?"

나도 처음엔 그렇게 생각했다. 스탠드업 미팅, 스프린트 플래닝, 번다운 차트 — 이런 것들이 Jira의 이미지였다.

그런데 막상 쓰기 시작하니 혼자일 때도 충분히 유용했다. 이유는 단순하다. **할 일을 머릿속에서 꺼내는 것**, 그리고 **내가 뭘 했는지 이력을 남기는 것** — 이 두 가지는 팀이 없어도 필요하다.

---

## 무료 플랜으로 충분하다

Jira Free 플랜:
- **10명 이하 무료** (혼자면 당연히 무료)
- 프로젝트 수 제한 없음
- 칸반·스크럼 보드 모두 사용 가능
- 스토리지 2GB

가입은 [atlassian.com/software/jira/free](https://www.atlassian.com/software/jira/free)에서 구글 계정으로 바로 된다.

---

## 핵심 개념만 알면 된다

처음에 Epic, Story, Task, Bug, Subtask... 이게 다 뭔지 몰라 막혔다. 혼자 쓸 때는 두 가지만 써도 충분하다.

```
Task  → 할 일 단위
Bug   → 버그 수정
```

나머지는 팀에서 쓸 때 배우면 된다.

**이슈 키**는 나중에 Git 연동에서 핵심이 된다.

```
프로젝트 키를 "BLOG"로 설정하면
→ 이슈들: BLOG-1, BLOG-2, BLOG-3 ...
```

짧고 의미 있는 키를 설정하자. 브랜치명과 커밋 메시지에 계속 들어간다.

---

## 스크럼 말고 칸반으로 시작하자

스크럼은 1~2주 단위 스프린트를 계획하고 회고하는 방식이다. 팀에서 리듬을 맞출 때 좋다.

혼자라면 **칸반**이 맞다. 스프린트 없이 할 일이 생기면 추가하고, 끝나면 Done으로 옮기는 흐름이다.

```
[ To Do ] → [ In Progress ] → [ Done ]
```

단순하지만 이게 전부다.

---

## 이슈 생성 습관

뭔가 하려고 할 때마다 이슈를 먼저 만드는 것이 핵심이다.

```
제목 규칙:
  [Feature] 댓글 API 구현
  [Bug] 로그아웃 후 토큰 만료 안 되는 문제
  [Refactor] OrderService 트랜잭션 분리
  [Docs] README 업데이트
```

설명에는 "왜 이 작업이 필요한가"를 한 줄이라도 적어두면, 나중에 git log나 Jira에서 "이게 왜 있지?" 를 답할 수 있다.

---

## 상태 관리 습관

```
작업 시작할 때 → To Do → In Progress
작업 끝났을 때 → In Progress → Done
```

이것만 지켜도 Jira를 쓰는 이유가 생긴다. 한 달 후에 "5월에 뭐 했지?" 를 Jira에서 Done 필터로 바로 볼 수 있다.

---

## 혼자 Jira를 쓰는 진짜 이유

```
지금: 작업 이력 추적 + 할 일 관리
나중: 팀 합류 시 "Jira 써봤어요" 경험 있음

그리고 브랜치명에 이슈 키를 넣으면
→ "이 코드 왜 만들었지?" 를 Git에서도 추적 가능
```

다음 편에서는 Git 브랜치와 커밋에 이슈 키를 연결하는 방법을 다룬다.
