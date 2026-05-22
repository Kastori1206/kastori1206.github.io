---
title: vim 대신 Neovim + LazyVim 세팅한 기록
date: 2026-05-22
draft: false
target_section: til
tags: [neovim, lazyvim, vim, terminal, macos, ghostty]
description: 터미널 환경 세팅하면서 vim 자리에 Neovim + LazyVim을 넣었다. 기본 vim 사용법부터 LazyVim 단축키, 플러그인 추가 방법까지 정리했다.
wiki_source: 10-wiki/tech/lazyvim.md
categories: [개발환경]
---

터미널을 새로 세팅하면서 `vim` 자리에 Neovim을 넣었다. 서버에 접속하거나 터미널에서 파일을 열어야 할 때, 그냥 `vim`을 쓰면 되는데 어차피 쓸 거 제대로 세팅해두는 게 낫겠다 싶었다. LazyVim은 Neovim 위에 올라가는 사전 구성 세팅인데, 처음부터 LSP·자동완성·파일 검색이 다 들어있어서 설정 없이 바로 쓸 수 있다.

> 이전 글: [Ghostty로 터미널 환경 다시 세팅한 기록](/til/2026-05-21-ghostty-terminal-setup/)

---

## 설치

```bash
brew install neovim

# LazyVim 스타터 템플릿
git clone https://github.com/LazyVim/starter ~/.config/nvim
rm -rf ~/.config/nvim/.git

# nvim 실행 — 첫 실행 시 플러그인 자동 설치
nvim
```

`~/.zshrc`에 alias 추가해두면 `vim`, `vi` 입력해도 Neovim이 실행된다:

```zsh
alias vim='nvim'
alias vi='nvim'
alias vimdiff='nvim -d'
```

---

## Vim 기본 모드

Neovim은 Vim 기반이라 **모드** 개념이 있다. 처음엔 낯설지만 이게 핵심이다.

| 모드 | 진입 | 역할 |
|:--|:--|:--|
| Normal | `Esc` | 기본 모드. 이동·복사·삭제 명령 |
| Insert | `i` | 텍스트 직접 입력 |
| Visual | `v` | 범위 선택 |
| Command | `:` | 저장·종료·치환 |

처음 쓸 때 가장 많이 막히는 게 "어떻게 닫아?" 인데, 이것만 기억하면 된다:

```text
파일 열림 (Normal 모드)
  → i 눌러서 편집
  → Esc로 Normal 복귀
  → :w 저장
  → :q 종료
```

---

## 자주 쓰는 키맵

### 저장 / 종료

| 키 | 동작 |
|:--|:--|
| `:w` | 저장 |
| `:q` | 종료 |
| `:wq` | 저장 후 종료 |
| `ZZ` | 저장 후 종료 (단축) |
| `:q!` | 저장 없이 강제 종료 |

### 이동

| 키            | 동작               |
| :----------- | :--------------- |
| `h j k l`    | 좌 하 상 우          |
| `w` / `b`    | 단어 앞으로 / 뒤로      |
| `0` / `$`    | 줄 맨 앞 / 맨 끝      |
| `gg` / `G`   | 파일 맨 위 / 맨 아래    |
| `Ctrl + d/u` | 반 페이지 아래 / 위 스크롤 |

### 편집

| 키 | 동작 |
|:--|:--|
| `i` | 커서 앞에서 입력 시작 |
| `a` | 커서 뒤에서 입력 시작 |
| `o` | 아래 줄 새로 열고 입력 |
| `dd` | 현재 줄 삭제 |
| `yy` | 현재 줄 복사 |
| `p` | 붙여넣기 |
| `u` | 실행 취소 |
| `Ctrl + r` | 다시 실행 |
| `cw` | 단어 지우고 입력 모드 진입 |

### 검색

| 키 | 동작 |
|:--|:--|
| `/검색어` | 검색 |
| `n` / `N` | 다음 / 이전 결과 |
| `:%s/old/new/g` | 파일 전체 치환 |

---

## LazyVim 단축키

LazyVim은 `<Space>`를 리더 키로 쓴다. `<Space>`를 누르면 사용 가능한 키 목록이 팝업으로 뜬다.

### 파일 찾기 / 검색

| 키 | 동작 |
|:--|:--|
| `<Space><Space>` | 최근 파일 목록 |
| `<Space>ff` | 파일 이름으로 검색 (Telescope) |
| `<Space>fg` | 파일 내용으로 검색 (ripgrep) |
| `<Space>fb` | 열린 버퍼 목록 |
| `<Space>e` | 파일 탐색기 열기 |

파일을 이름으로 빠르게 찾거나, 특정 텍스트가 어느 파일에 있는지 검색할 때 `<Space>ff`, `<Space>fg`를 제일 많이 쓰게 된다.

### Git

| 키 | 동작 |
|:--|:--|
| `<Space>gg` | LazyGit 열기 |
| `<Space>gd` | Git diff |

### 코드 탐색 (LSP)

| 키 | 동작 |
|:--|:--|
| `gd` | 정의로 이동 |
| `gr` | 참조 목록 |
| `K` | hover 문서 |
| `<Space>ca` | 코드 액션 |
| `<Space>rn` | 이름 변경 (rename) |

### 창 분할 / 버퍼

| 키 | 동작 |
|:--|:--|
| `<Space>\|` | 수직 분할 |
| `<Space>-` | 수평 분할 |
| `Ctrl + h/j/k/l` | 분할된 창 사이 이동 |
| `<Space>bd` | 현재 버퍼 닫기 |

---

## 알아두면 편한 키맵

### 전체 선택 / 복사

```text
ggVG   전체 선택 (Visual 모드)
ggyG   전체 복사
```

`gg`로 맨 위, `V`로 줄 단위 선택, `G`로 맨 아래까지. 선택 후 `y`로 복사, `d`로 삭제.

### 텍스트 오브젝트 — 가장 강력한 기능

vim에서 "단어 안", "괄호 안" 같은 범위를 지정해서 한 번에 편집할 수 있다.

| 키 | 동작 |
|:--|:--|
| `ciw` | 단어 지우고 입력 모드 (Change Inner Word) |
| `diw` | 단어 삭제 |
| `yi"` | 큰따옴표 안 내용 복사 |
| `di"` | 큰따옴표 안 내용 삭제 |
| `ci(` | 괄호 안 내용 지우고 입력 |
| `da(` | 괄호 포함해서 삭제 |
| `yip` | 현재 단락 복사 |

`c` = 지우고 입력, `d` = 삭제, `y` = 복사  
`i` = 안쪽만, `a` = 감싸는 것 포함

### 기타 유용한 것들

| 키 | 동작 |
|:--|:--|
| `*` | 커서 위 단어 검색 |
| `%` | 매칭 괄호로 이동 |
| `>>` / `<<` | 들여쓰기 / 내어쓰기 |
| `Ctrl + o` | 이전 위치로 (뒤로 가기) |
| `Ctrl + i` | 다음 위치로 (앞으로 가기) |
| `.` | 마지막 명령 반복 |
| `~` | 대소문자 전환 |

`.`(점)은 처음엔 잘 모르고 지나치는데 실제로 꽤 자주 쓰게 된다. 예를 들어 `ciw`로 단어 바꾼 다음 다른 단어에서 `.`을 누르면 같은 동작이 반복된다.

---

## macOS 클립보드 연동

Neovim에서 `yy`로 복사한 내용이 `Cmd+V`로 붙여넣기가 안 될 때가 있다. Neovim 내부 클립보드와 macOS 클립보드가 분리돼 있기 때문이다.

LazyVim은 기본으로 연동이 되어 있지만, 안 된다면 `~/.config/nvim/lua/config/options.lua`에 추가:

```lua
vim.opt.clipboard = "unnamedplus"
```

이걸 설정하면 `yy`로 복사한 내용을 바로 `Cmd+V`로 다른 앱에 붙여넣을 수 있다.

---

## 플러그인 추가

`~/.config/nvim/lua/plugins/` 안에 `.lua` 파일을 만들면 된다. LazyVim이 자동으로 인식해서 설치한다.

예시로 Markdown Preview 플러그인을 추가했다. `.md` 파일 편집 중에 브라우저로 미리보기를 띄워주는 플러그인이다:

```lua
-- ~/.config/nvim/lua/plugins/markdown-preview.lua
return {
  {
    "iamcco/markdown-preview.nvim",
    ft = { "markdown" },
    build = "cd app && yarn install",
    init = function()
      vim.g.mkdp_filetypes = { "markdown" }
      vim.g.mkdp_auto_start = 0
      vim.g.mkdp_auto_close = 1
    end,
    keys = {
      { "<leader>mp", "<cmd>MarkdownPreviewToggle<cr>", desc = "Markdown Preview" },
    },
  },
}
```

저장하고 nvim 재시작하면 자동으로 설치된다. `<Space>mp`로 토글.

파일 구조:
```text
~/.config/nvim/
  └─ lua/
      └─ plugins/
          ├─ example.lua         # LazyVim 기본 예제
          └─ markdown-preview.lua  # 추가한 플러그인
```

---

## 마치며

vim 쓸 일이 생길 때마다 `:q` 를 어떻게 치는지 검색했던 기억이 있다. LazyVim을 세팅해두니까 그냥 `vi 파일명` 하나로 열고, `<Space>ff`로 파일 찾고, 편집 후 `:wq`로 나오는 흐름이 자연스러워졌다. 모드 개념만 한 번 이해하면 나머지는 쓰다 보면 손에 익는다.
