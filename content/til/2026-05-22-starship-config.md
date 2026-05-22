---
title: Starship으로 터미널 프롬프트 세팅하기
date: 2026-05-22
draft: false
target_section: til
tags: [starship, terminal, prompt, zsh, macos, ghostty]
description: Ghostty + zsh 환경에서 Starship 프롬프트를 세팅한 기록. 최종 config 전체 공개 + 개발 스택별로 유용한 모듈 정리.
wiki_source: 10-wiki/tech/starship.md
categories: [개발환경]
---

터미널 프롬프트는 하루에 수백 번 보는 것이라 가독성이 중요하다. Starship은 크로스셸 프롬프트 테마인데, 설정 파일 하나(`starship.toml`)로 원하는 정보만 골라서 보여줄 수 있다. Ghostty로 터미널 환경을 새로 세팅하면서 함께 설정했고, 지금 쓰는 config와 상황별로 유용한 모듈들을 정리했다.

> 이전 글: [Ghostty로 터미널 환경 다시 세팅한 기록](/til/2026-05-21-ghostty-terminal-setup/)

---

## 설치

```bash
brew install starship
```

`~/.zshrc` 맨 마지막 줄에 추가한다. 반드시 다른 프롬프트 설정보다 뒤에 와야 한다.

```zsh
if command -v starship &>/dev/null; then
  eval "$(starship init zsh)"
fi
```

Nerd Font가 없으면 아이콘이 깨진다.

```bash
brew install --cask font-meslo-lg-nerd-font
```

---

## 프롬프트 구조

```
🔋 85%  ~/project  main [!?]  +8 -14  v24.15.0          took 3s  09:56
❯
```

- **왼쪽**: 배터리, 경로, git 상태, 수정 줄 수, 런타임 버전
- **오른쪽**: 실행 시간, 현재 시각
- **두 번째 줄**: 입력 커서 (`❯` — 성공 초록 / 실패 빨강)

---

## 최종 config (`~/.config/starship.toml`)

```toml
add_newline = true
command_timeout = 1000

format = """
$battery\
$directory\
$git_branch\
$git_commit\
$git_status\
$git_metrics\
$jobs\
$nodejs\
$python\
$java\
$package\
$aws\
$line_break\
$character"""

right_format = """
$cmd_duration\
$time"""

[directory]
truncation_length = 3
truncate_to_repo = true
style = "bold cyan"

[git_branch]
symbol = " "
style = "bold purple"

[git_commit]
commit_hash_length = 7
style = "bold white"

[git_status]
style = "bold red"

[git_metrics]
added_style = "bold green"
deleted_style = "bold red"
disabled = false

[jobs]
symbol = "✦"
style = "bold blue"
number_threshold = 1

[nodejs]
symbol = " "
format = "[$symbol($version )]($style)"
style = "bold green"

[python]
symbol = " "
format = "[$symbol($version )]($style)"
style = "bold yellow"

[java]
symbol = " "
format = "[$symbol($version )]($style)"
style = "bold red"

[package]
symbol = "📦 "
style = "bold dimmed white"
disabled = false

[aws]
symbol = "☁ "
style = "bold yellow"
format = '[$symbol(\($region\))]($style) '

[cmd_duration]
min_time = 1000
format = "took [$duration]($style) "
style = "bold yellow"

[time]
disabled = false
format = "[$time]($style)"
style = "bold dimmed white"
time_format = "%H:%M"

[character]
success_symbol = "[❯](bold green)"
error_symbol = "[❯](bold red)"

[battery]
disabled = false

[[battery.display]]
threshold = 30
style = "bold red"

[[battery.display]]
threshold = 60
style = "bold yellow"

[[battery.display]]
threshold = 100
style = "bold green"
```

---

## 모듈별 설명

### battery — 배터리

```toml
[battery]
disabled = false

[[battery.display]]
threshold = 30
style = "bold red"    # 30% 이하

[[battery.display]]
threshold = 60
style = "bold yellow" # 60% 이하

[[battery.display]]
threshold = 100
style = "bold green"  # 그 이상
```

배터리 잔량을 색상으로 구분해서 표시한다. `[[battery.display]]`를 여러 개 쌓아서 구간별 색상을 지정한다.

### directory — 현재 경로

```toml
[directory]
truncation_length = 3
truncate_to_repo = true
style = "bold cyan"
```

- `truncation_length = 3`: 경로를 최대 3단계까지만 표시. 깊은 경로도 짧게 유지된다.
- `truncate_to_repo = true`: git repo 안에서는 repo 루트 기준으로 표시. 홈 디렉토리 경로가 생략된다.

### git_branch / git_commit / git_status

```toml
[git_branch]
symbol = " "
style = "bold purple"

[git_commit]
commit_hash_length = 7
style = "bold white"

[git_status]
style = "bold red"
```

- `git_branch`: 현재 브랜치명
- `git_commit`: HEAD 커밋 해시 앞 7자리. 기본값은 detached HEAD 상태에서만 표시 (`only_detached = true`). 브랜치에서도 보이게 하려면 `only_detached = false` 추가.
- `git_status`: 변경사항 여부. `[!?]` — `!`는 수정된 파일, `?`는 추적 안 된 파일.

### git_metrics — 수정 줄 수

```toml
[git_metrics]
added_style = "bold green"
deleted_style = "bold red"
disabled = false
```

`+8 -14` 형태로 추가/삭제된 줄 수를 보여준다. `disabled = false`를 명시해야 활성화된다. 커밋 전 변경 규모를 한눈에 파악할 수 있다.

### jobs — 백그라운드 작업

```toml
[jobs]
symbol = "✦"
style = "bold blue"
number_threshold = 1
```

`Ctrl + Z` 또는 `명령어 &`로 백그라운드에 보낸 작업 수를 표시한다. 뭔가 돌아가고 있다는 걸 잊고 터미널을 닫는 실수를 방지한다.

### nodejs / python / java — 런타임 버전

해당 프로젝트 파일이 있을 때만 자동으로 나타난다.

| 모듈 | 표시 조건 |
|:--|:--|
| nodejs | `package.json` 있을 때 |
| python | `.py` 파일 또는 가상환경 있을 때 |
| java | `.java`, `pom.xml`, `build.gradle` 있을 때 |

### package — 패키지 버전

```toml
[package]
symbol = "📦 "
style = "bold dimmed white"
disabled = false
```

`package.json`, `pom.xml`, `Cargo.toml` 등에서 버전을 읽어 표시한다. 현재 작업 중인 프로젝트 버전을 바로 확인할 수 있다.

### aws — AWS 리전 / 프로필

```toml
[aws]
symbol = "☁ "
style = "bold yellow"
format = '[$symbol(\($region\))]($style) '
```

`☁ (ap-northeast-2)` 형태로 현재 AWS 리전을 표시한다. `~/.aws/config`가 있거나 `AWS_PROFILE`, `AWS_DEFAULT_REGION` 환경변수가 설정된 경우에만 나타난다. 여러 AWS 계정·리전을 오가는 경우 실수로 엉뚱한 리전에 배포하는 걸 방지할 수 있다.

### cmd_duration / time — 오른쪽 프롬프트

```toml
right_format = """
$cmd_duration\
$time"""

[cmd_duration]
min_time = 1000
format = "took [$duration]($style) "
style = "bold yellow"

[time]
disabled = false
format = "[$time]($style)"
style = "bold dimmed white"
time_format = "%H:%M"
```

`right_format`으로 오른쪽에 분리해서 왼쪽 프롬프트가 깔끔하게 유지된다.

- `cmd_duration`: 1초 이상 걸린 명령어만 실행 시간 표시. 빌드·테스트 후 얼마나 걸렸는지 확인된다.
- `time`: 현재 시각. `disabled = false`를 명시해야 활성화된다 (기본값 비활성).

### character — 입력 커서

```toml
[character]
success_symbol = "[❯](bold green)"
error_symbol = "[❯](bold red)"
```

이전 명령의 성공/실패에 따라 `❯`가 초록/빨강으로 바뀐다. exit code를 따로 확인하지 않아도 된다.

---

## 상황별 추가 모듈

내 config에는 없지만 개발 환경에 따라 유용한 모듈들이다.

### DevOps / 인프라

```toml
# Kubernetes context — 클러스터 전환 실수 방지
[kubernetes]
disabled = false

# Terraform workspace
[terraform]
disabled = false
```

여러 클러스터나 Terraform workspace를 오가는 경우 프롬프트에 context가 보이면 실수를 크게 줄일 수 있다. AWS는 위 config에 이미 포함돼 있다.

### 다른 언어 개발자

```toml
# Go
[golang]
symbol = " "
style = "bold cyan"

# Rust
[rust]
symbol = " "
style = "bold orange"

# Ruby
[ruby]
symbol = " "
style = "bold red"
```

해당 프로젝트 파일이 있을 때만 표시되는 방식은 동일하다.

### 원격 서버 / SSH

```toml
# SSH 접속 중일 때만 표시
[username]
show_always = false
style_user = "bold yellow"
format = "[$user]($style) "

[hostname]
ssh_only = true
style = "bold green"
format = "[@$hostname]($style) "
```

로컬에서는 안 보이다가 SSH 접속 중일 때만 `user@server` 형태로 나타난다.

### 시각적 구분선 (`$fill`)

```toml
right_format = """
$fill\
$cmd_duration\
$time"""

[fill]
symbol = "·"
style = "dimmed white"
```

왼쪽과 오른쪽 사이를 `·` 으로 채워서 시각적으로 구분한다. Powerlevel10k 스타일을 원한다면 추가해볼 만하다.

---

## 설정 수정 팁

```bash
# 설정 파일 열기
nvim ~/.config/starship.toml
# starship.toml은 저장하면 즉시 반영 (source 불필요)

# 특정 모듈 동작 확인
starship module git_status
starship module nodejs

# 전체 모듈 목록
starship module --list
```

---

## 마치며

Starship은 모듈을 필요한 것만 골라서 쓸 수 있다는 게 장점이다. 지금 config는 풀스택 웹 개발 환경 기준으로 git 상태·런타임 버전·배터리·실행 시간을 보여주는 구성이다. 처음엔 미니멀하게 시작해서 필요한 게 생길 때마다 추가하는 방식이 프롬프트를 복잡하게 만들지 않는 좋은 방법이다. [전체 모듈 목록](https://starship.rs/config/)은 공식 문서에서 확인할 수 있다.
