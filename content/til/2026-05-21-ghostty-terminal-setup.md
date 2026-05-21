---
title: Ghostty로 터미널 환경 다시 세팅한 기록
date: 2026-05-21
draft: false
target_section: til
tags: [ghostty, zsh, terminal, oh-my-zsh, starship, fzf, git-delta, zoxide, mise, macos]
description: macOS에서 Warp를 버리고 Ghostty로 갈아타면서 zsh 환경을 새로 정리했다. 플러그인 순서 실수, find alias 함정 등 직접 삽질한 것들을 포함해서 기록한다.
wiki_source: 10-wiki/tech/ghostty-terminal-setup.md
categories: [개발환경]
---

더 가벼운 터미널이 필요했다. 기존 터미널이 점점 무겁게 느껴졌고, 기능보다는 속도와 단순함을 원했다. Ghostty는 GPU 렌더링 기반이라 반응이 빠르고, 설정이 단순하며, 표준 zsh 환경을 그대로 쓸 수 있다는 게 선택 이유였다. 갈아타면서 zsh 환경을 처음부터 다시 정리했다. 이 글은 그 과정에서 헤맨 것들을 포함한 실제 세팅 기록이다.

> 이 글의 환경: macOS + Homebrew. Linux에서는 Ghostty 설정 파일 경로나 일부 brew 패키지가 다를 수 있다.

---

## 최종 구성

```
Ghostty (터미널 에뮬레이터)
  └─ zsh
      ├─ Oh My Zsh
      ├─ Starship (프롬프트)
      ├─ fzf-tab → zsh-autosuggestions → zsh-syntax-highlighting
      ├─ fzf + fd + ripgrep
      ├─ lsd / bat
      ├─ git-delta
      ├─ zoxide
      ├─ mise
      └─ lazygit
```

---

## 1. 설치

Nerd Font는 Ghostty config에서 `font-family`로 지정하기 전에 먼저 설치해야 한다. 아이콘이 깨지는 이유의 대부분이 이거다.

```bash
brew install --cask font-meslo-lg-nerd-font
```

다른 Nerd Font를 원하면 `brew search font-` 또는 [nerdfonts.com](https://www.nerdfonts.com)에서 골라도 된다. config의 `font-family` 값만 일치시키면 된다.

CLI 도구 한 번에:

```bash
brew install lsd fzf fd ripgrep bat neovim
brew install git-delta btop dust duf fastfetch
brew install zoxide mise lazygit starship
```

Oh My Zsh:

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

Oh My Zsh 플러그인:

```bash
git clone https://github.com/zsh-users/zsh-autosuggestions \
  ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions

git clone https://github.com/zsh-users/zsh-syntax-highlighting.git \
  ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting

git clone https://github.com/Aloxaf/fzf-tab \
  ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/fzf-tab
```

fzf 키 바인딩은 설치만으로는 활성화가 안 된다. 따로 실행해야 한다:

```bash
$(brew --prefix)/opt/fzf/install
```

질문에 모두 `y`로 답하면 `~/.fzf.zsh`가 생성된다.

---

## 2. 삽질 기록

### fzf-tab 플러그인 순서

처음 `.zshrc`를 이렇게 설정했다:

```zsh
plugins=(
  git
  zsh-autosuggestions
  fzf-tab              # ← 뒤에 뒀더니 Tab UI가 안 나옴
  zsh-syntax-highlighting
)
```

`Tab`을 눌러도 fzf로 보여줘야 할 UI가 나오질 않았다. fzf-tab GitHub 문서를 읽고서야 이유를 알았다.

**fzf-tab은 zsh의 completion widget을 가로채서 fzf UI로 교체한다.** zsh-autosuggestions가 먼저 로드되면 completion widget을 먼저 wrap해버리기 때문에 fzf-tab이 끼어들 자리가 없어진다.

올바른 순서:

```zsh
plugins=(
  git
  fzf-tab               # ← 반드시 zsh-autosuggestions 앞
  zsh-autosuggestions
  zsh-syntax-highlighting
)
```

이것 때문에 꽤 오래 헤맸다.

### `alias find='fd'` 하면 안 된다

`lsd`, `bat`, `rg` alias는 잘 쓰면서 fd도 똑같이 하려 했다. 근데 이건 위험하다.

fd는 find와 **문법이 다르다**. POSIX find의 `-name`, `-exec`, `-type` 같은 옵션을 그대로 지원하지 않는다. 기존에 작성된 스크립트나 외부 툴이 내부적으로 `find`를 쓴다면 전부 깨진다.

```bash
# find 원래 문법 — fd에서 동작 안 함
find . -name "*.java" -exec grep -l "TODO" {} \;

# fd는 따로 쓴다
fd -e java
```

fd는 그냥 `fd`로 직접 실행하는 게 맞다.

---

## 3. `.zshrc` 설정

### Oh My Zsh + 플러그인

```zsh
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME=""  # Starship 쓰면 빈 문자열로

plugins=(
  git
  fzf-tab
  zsh-autosuggestions
  zsh-syntax-highlighting
)

source "$ZSH/oh-my-zsh.sh"
```

### History

```zsh
HISTFILE="$HOME/.zsh_history"
HISTSIZE=10000
SAVEHIST=10000

setopt SHARE_HISTORY
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_SPACE
setopt HIST_REDUCE_BLANKS
setopt AUTO_CD
```

`SHARE_HISTORY`를 쓰면 여러 터미널 창에서 히스토리가 실시간으로 공유된다.

### Completion

```zsh
mkdir -p "$HOME/.zsh/cache"
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*' use-cache on
zstyle ':completion:*' cache-path "$HOME/.zsh/cache"
```

`cache-path` 디렉토리가 없으면 조용히 캐시가 안 된다. `mkdir -p`로 미리 만들어놔야 한다.

### fzf

```zsh
[ -f "$HOME/.fzf.zsh" ] && source "$HOME/.fzf.zsh"

export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git'
```

| 단축키 | 기능 |
|:--|:--|
| `Ctrl + R` | 이전 명령어 퍼지 검색 |
| `Ctrl + T` | 파일 검색 후 커맨드라인에 삽입 |
| `Option(⌥) + C` | 디렉토리 검색 후 이동 |

> `Option + C`가 동작하려면 Ghostty config에 `macos-option-as-alt = true`가 설정되어 있어야 한다. 이 옵션이 없으면 macOS에서 Option 키가 특수문자 입력으로 처리돼서 fzf 바인딩이 안 잡힌다.

### Alias

```zsh
alias zshconfig='nvim ~/.zshrc'
alias reload='source ~/.zshrc'

alias ls='lsd'
alias ll='lsd -alhF'
alias la='lsd -a'
alias lt='lsd --tree --depth 2'

alias top='btop'
alias vim='nvim'
alias vi='nvim'
alias vimdiff='nvim -d'

alias cat='bat'
alias grep='rg'

alias gs='git status'
alias gl='git log'
alias gd='git diff'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gpl='git pull'
alias gco='git checkout'
alias gb='git branch'
alias lg='lazygit'

alias cdp='cd ~/Workspace'
```

### PATH

```zsh
export PATH="$HOME/.local/bin:$PATH"
export PATH="/opt/homebrew/opt/mysql-client/bin:$PATH"

export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

export PATH="$HOME/.pub-cache/bin:$PATH"
alias ff='fvm flutter'
alias fdart='fvm dart'

export PATH="$PATH:$HOME/.lmstudio/bin"
```

### 런타임 도구 초기화 (맨 마지막)

```zsh
if command -v zoxide &>/dev/null; then
  eval "$(zoxide init zsh)"
fi

if command -v mise &>/dev/null; then
  eval "$(mise activate zsh)"
fi

if command -v starship &>/dev/null; then
  eval "$(starship init zsh)"
fi
```

`command -v ... &>/dev/null` 가드를 쓰면 도구가 없는 환경에서도 에러 없이 넘어간다. Starship은 프롬프트를 바꾸기 때문에 **맨 마지막에** 초기화해야 한다.

---

## 4. git-delta 설정

```bash
git config --global core.pager delta
git config --global interactive.diffFilter "delta --color-only"
git config --global delta.navigate true
git config --global delta.side-by-side true
git config --global delta.line-numbers true
git config --global merge.conflictStyle zdiff3
```

`side-by-side = true` 하나만으로 git diff 가독성이 확 달라진다. `merge.conflictStyle zdiff3`는 3-way diff를 보여줘서 충돌 해결이 훨씬 쉬워진다 (Git 2.35+ 필요).

---

## 5. Ghostty 설정

`~/.config/ghostty/config`:

```ini
# macOS
macos-option-as-alt = true    # Option 키를 Alt로 인식 — fzf의 Option+C 바인딩에 필수
macos-titlebar-style = native

# Font
font-family = MesloLGS NF
font-size = 14

# Window
window-padding-x = 12
window-padding-y = 12

# Cursor
cursor-style = block
cursor-style-blink = false

# Shell
shell-integration = zsh

# Scrollback
scrollback-limit = 100000

# Mouse
copy-on-select = false

# Behavior
confirm-close-surface = false
```

`font-family`는 Nerd Font 계열이면 어떤 걸 써도 된다. 나는 `MesloLGS NF`를 쓰고 있다. 설치는:

```bash
brew install --cask font-meslo-lg-nerd-font
```

---

## 마치며

Warp만큼 화려하진 않지만, 표준 zsh 환경 그대로 쓸 수 있다는 게 오히려 편하다. 한 번 세팅해두면 어디서든 `.zshrc` 하나로 동일한 환경을 재현할 수 있다. 다음에는 Starship 프롬프트 커스터마이징이나 neovim 설정을 정리해볼 것 같다.
