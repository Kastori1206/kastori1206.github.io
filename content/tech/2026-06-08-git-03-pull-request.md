---
title: "PR을 잘 쓴다는 것 — 작성자와 리뷰어가 모두 편한 코드 리뷰"
date: 2026-06-08
draft: false
target_section: tech
series: "Git 팀 협업 실전"
series_order: 3
series_total: 5
tags: [git, pull-request, pr, code-review, github, collaboration]
description: "PR은 코드를 합치는 도구가 아니라 지식 공유와 품질 검증의 채널이다. 리뷰어가 빠르게 맥락을 파악하게 만드는 PR 작성법과 건강한 코드 리뷰 문화."
wiki_source: 10-wiki/tech/git/04-pull-request.md
categories: [Git]
---

## 리뷰어의 입장에서 생각하기

PR을 올리고 "리뷰 부탁드립니다"를 남긴다. 리뷰어는 맥락 없이 diff만 본다. "이게 왜 바뀐 거지?", "뭘 테스트해야 하지?", "어디서 실행해볼 수 있지?" — 이 질문들이 드는 PR은 리뷰 시간이 3배가 된다.

좋은 PR은 리뷰어의 이 질문들을 미리 답해놓은 문서다.

---

## PR 크기 — 작을수록 좋다

```
✅ 이상적인 PR
  - 변경 파일 5~10개 이하
  - 변경 라인 400줄 이하
  - 하나의 목적 (기능 1개, 버그 1개)

❌ 피해야 할 PR
  - "기능 A + 리팩터링 + 의존성 업그레이드" 한 번에
  - 1,000줄 넘는 PR → 리뷰어가 세부 사항을 놓침
```

큰 기능을 어떻게 쪼개는가: **레이어 단위**로 나눈다.

```
PR 1: Entity + Repository 추가
PR 2: Service 로직 구현
PR 3: Controller + API 엔드포인트
PR 4: 테스트 코드
```

각 PR이 독립적으로 리뷰·머지 가능하도록 설계하면 리뷰 속도가 빨라진다.

---

## PR 본문 — 리뷰어가 필요한 정보를 모두 담는다

```markdown
## 변경 사항
Google OAuth2를 통한 소셜 로그인 기능을 구현했습니다.
기존 이메일/비밀번호 로그인과 함께 사용할 수 있습니다.

## 변경 이유
회원가입 과정의 마찰을 줄이기 위해 소셜 로그인을 추가합니다.

## 주요 변경 파일
- `OAuthController.java` — OAuth2 콜백 처리
- `OAuth2UserService.java` — 사용자 정보 조회 및 저장
- `SecurityConfig.java` — OAuth2 설정 추가

## 테스트 방법
1. 로컬 실행 후 `/oauth2/authorization/google` 접속
2. Google 계정으로 로그인
3. 리다이렉트 후 JWT 토큰 발급 확인

## 관련 이슈
Closes #123
```

---

## 코드 리뷰 — 리뷰어 가이드

### 코멘트 레이블

의견의 강도를 명확히 표현하면 작성자가 우선순위를 잡을 수 있다.

```
[MUST]     → 반드시 수정 필요. 머지 전 해결.
             예: "NPE 발생 가능 [MUST]"

[SHOULD]   → 수정을 강하게 권장. 이유 설명.
             예: "이 로직은 Service로 옮기는 게 좋을 것 같습니다 [SHOULD]"

[OPINION]  → 개인 의견. 수정 강제 아님.
             예: "저라면 메서드명을 ~로 했을 것 같아요 [OPINION]"

[QUESTION] → 이해를 위한 질문. 비판 아님.
             예: "여기서 왜 synchronized를 쓰셨나요? [QUESTION]"

[PRAISE]   → 잘한 부분 칭찬.
             예: "이 패턴 깔끔하네요! [PRAISE]"
```

### 리뷰 에티켓

```
✅ 코드를 비판하지 말고 개선을 제안한다
   "이건 잘못됐어요" → "이렇게 하면 더 나을 것 같습니다"

✅ 질문형으로 작성한다
   "왜 이렇게 했나요?" → "이렇게 한 이유가 있으신가요?"

✅ 칭찬도 남긴다
   좋은 코드를 보면 [PRAISE]로 표현

✅ 24시간 이내에 리뷰한다
   리뷰가 밀리면 PR 작성자의 컨텍스트도 날아간다
```

---

## 머지 전략

GitHub에서 PR 머지 시 세 가지 방법을 제공한다.

```
Merge commit
  → 머지 커밋 생성. 브랜치 기록 보존.
  → Git Flow에 적합

Squash and merge
  → 브랜치의 모든 커밋을 하나로 합쳐서 머지
  → 커밋 히스토리 깔끔. GitHub Flow에 적합
  → WIP 커밋이 많아도 괜찮음

Rebase and merge
  → 브랜치 커밋들을 main 위로 rebase 후 머지
  → 선형 히스토리 유지
```

팀이 하나의 전략을 통일해서 쓰는 게 중요하다. 섞어 쓰면 히스토리가 일관성 없어진다.

---

## Draft PR 활용

완성되지 않았지만 피드백을 받고 싶을 때는 Draft PR로 올린다.

```
PR 생성 시 "Create draft pull request" 선택
→ 머지 불가 상태
→ 완료되면 "Ready for review"로 전환
```

"WIP:", "DO NOT MERGE" 같은 제목 접두사 대신 Draft PR을 쓰는 게 GitHub 표준이다.

다음 편에서는 PR이 머지된 후 릴리즈를 어떻게 관리하는지 다룬다.
