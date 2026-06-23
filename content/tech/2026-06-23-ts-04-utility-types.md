---
title: "[TS #4] 유틸리티 타입 — Partial, Pick, Omit, Record 실전 활용"
date: 2026-06-23
draft: false
target_section: tech
series: "TypeScript 입문"
series_order: 4
tags: [typescript, utility-types, partial, pick, omit, record]
description: "TypeScript 내장 유틸리티 타입은 API 요청/응답 타입을 만들 때 매번 새로 정의하지 않아도 되게 해준다. Partial, Pick, Omit, Record, ReturnType — 실무 패턴 중심으로 정리한다."
wiki_source: "10-wiki/tech/typescript/04-utility-types.md"
categories: [TypeScript]
---

REST API를 TypeScript로 타이핑하다 보면 비슷한 타입을 계속 만들게 된다. `User`는 있는데, 생성 요청에는 `id`가 없고, 수정 요청에는 일부 필드만 있고, 목록 조회에는 몇 개 필드만 필요하다. 이걸 매번 새 타입으로 만들면 `User`가 바뀔 때 다 같이 바꿔야 한다.

TypeScript는 이 문제를 **유틸리티 타입**으로 해결한다. 기존 타입을 변환해서 새 타입을 만드는 내장 헬퍼들이다.

---

## Partial\<T\> — 모든 프로퍼티를 선택적으로

PATCH 요청처럼 일부 필드만 전송하는 경우에 쓴다.

```typescript
interface User {
  id: number
  name: string
  email: string
  age: number
}

type UserUpdate = Partial<User>
// = { id?: number; name?: string; email?: string; age?: number }

async function updateUser(id: number, data: Partial<User>) {
  // data에는 바꾸려는 필드만 있으면 됨
}

updateUser(1, { name: '새 이름' })          // OK
updateUser(1, { name: '이름', age: 25 })    // OK
```

---

## Required\<T\> — 모든 프로퍼티를 필수로

선택적 프로퍼티를 전부 필수로 바꿔야 할 때 쓴다.

```typescript
interface Config {
  host?: string
  port?: number
  debug?: boolean
}

type StrictConfig = Required<Config>
// = { host: string; port: number; debug: boolean }
```

---

## Readonly\<T\> — 읽기 전용으로 고정

불변 객체가 필요할 때 쓴다.

```typescript
interface Cart {
  items: CartItem[]
  total: number
}

type FrozenCart = Readonly<Cart>

const cart: FrozenCart = { items: [], total: 0 }
cart.total = 100 // ❌ 컴파일 오류
```

---

## Pick\<T, K\> — 필요한 프로퍼티만 선택

```typescript
interface User {
  id: number
  name: string
  email: string
  password: string
  createdAt: string
}

// 목록 조회 — id, name만 필요
type UserSummary = Pick<User, 'id' | 'name'>
// = { id: number; name: string }

// 프로필 카드 — id, name, email
type UserCard = Pick<User, 'id' | 'name' | 'email'>
```

---

## Omit\<T, K\> — 불필요한 프로퍼티를 제외

```typescript
// 생성 요청 — id, createdAt은 서버가 자동 생성
type CreateUserRequest = Omit<User, 'id' | 'createdAt'>
// = { name: string; email: string; password: string }

// 수정 요청 — id는 URL에 있고, 나머지는 선택적
type UpdateUserRequest = Partial<Omit<User, 'id' | 'createdAt'>>
// = { name?: string; email?: string; password?: string }
```

> **Pick vs Omit 선택 기준**: 남길 필드가 적으면 `Pick`, 제거할 필드가 적으면 `Omit`. 필드가 10개인데 9개 필요하면 `Omit`이 훨씬 간결하다.

---

## Record\<K, V\> — 키-값 맵

```typescript
// string 키에 number 값
type ScoreBoard = Record<string, number>
const scores: ScoreBoard = { alice: 100, bob: 85 }

// 유니온 키 — 모든 키가 반드시 있어야 함
type OrderStatus = 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'

type StatusLabel = Record<OrderStatus, string>
const labels: StatusLabel = {
  PENDING:   '결제 대기',
  PAID:      '결제 완료',
  SHIPPED:   '배송 중',
  DELIVERED: '배송 완료',
  CANCELLED: '취소됨',
  // 하나라도 빠지면 컴파일 오류
}
```

유니온을 키로 쓰면 모든 케이스를 커버했는지 컴파일러가 확인해준다. 새 상태가 추가되면 `labels`도 함께 채워야 한다.

---

## Exclude / Extract — 유니온 필터링

```typescript
type AllRoles = 'admin' | 'user' | 'guest' | 'moderator'

// Exclude — 제거
type NonAdminRoles = Exclude<AllRoles, 'admin'>
// = 'user' | 'guest' | 'moderator'

// Extract — 추출
type StaffRoles = Extract<AllRoles, 'admin' | 'moderator'>
// = 'admin' | 'moderator'

// NonNullable — null, undefined 제거
type SafeString = NonNullable<string | null | undefined>
// = string
```

---

## ReturnType / Parameters — 함수 타입 추출

함수 시그니처를 직접 타이핑하지 않고 타입을 추출할 수 있다.

```typescript
function fetchUser(id: number): Promise<User> {
  return fetch(`/api/users/${id}`).then(r => r.json())
}

type FetchReturn = ReturnType<typeof fetchUser>
// = Promise<User>

type FetchParams = Parameters<typeof fetchUser>
// = [id: number]

// Awaited — Promise를 풀어서 내부 타입 추출
type UserType = Awaited<ReturnType<typeof fetchUser>>
// = User
```

라이브러리 함수의 반환 타입을 재활용할 때 유용하다. 함수 시그니처가 바뀌면 `ReturnType`도 자동으로 따라간다.

---

## 실무 조합 패턴

위 유틸리티 타입들을 조합하면 `Article` 하나에서 여러 용도의 타입을 파생시킬 수 있다.

```typescript
interface Article {
  id: number
  title: string
  content: string
  authorId: number
  tags: string[]
  published: boolean
  createdAt: string
  updatedAt: string
}

// 목록 API 응답
type ArticleListItem = Pick<Article, 'id' | 'title' | 'authorId' | 'tags' | 'createdAt'>

// 생성 요청
type CreateArticleDto = Pick<Article, 'title' | 'content' | 'tags'>

// 수정 요청 — 제목, 내용, 태그만 수정 가능, 모두 선택적
type UpdateArticleDto = Partial<Pick<Article, 'title' | 'content' | 'tags'>>

// 임시 저장 — id, 타임스탬프 없는 상태
type ArticleDraft = Omit<Article, 'id' | 'createdAt' | 'updatedAt'>
```

`Article` 인터페이스만 수정하면 나머지는 자동으로 따라간다.

---

## 마치며

유틸리티 타입은 "기존 타입에서 파생"한다는 발상이다. 처음부터 모든 타입을 손으로 만들지 않아도 된다. `Partial`, `Pick`, `Omit`만 익혀도 API 타이핑의 80%는 해결된다.

다음 글에서는 유니온 타입을 런타임에 안전하게 처리하는 **타입 가드**와, 상태 관리에서 자주 쓰이는 **Discriminated Union** 패턴을 다룬다.
