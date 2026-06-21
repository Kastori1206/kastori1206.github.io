---
title: "[TS #2] interface vs type — 언제 뭘 쓰는가"
date: 2026-06-21
draft: false
target_section: tech
series: "TypeScript 입문"
series_order: 2
tags: [typescript, interface, type, union, intersection]
description: "TypeScript에서 타입을 정의하는 두 방법 interface와 type은 비슷해 보이지만 능력이 다르다. 실무 선택 기준과 자주 쓰는 패턴을 정리한다."
wiki_source: "10-wiki/tech/typescript/02-interface-type.md"
categories: [TypeScript]
---

TypeScript를 처음 쓰면 금방 이 질문에 부딪힌다. "타입 정의할 때 `interface` 써야 해, `type` 써야 해?" 둘 다 되는 것 같고, 문서마다 다르게 쓰여 있다. 결론부터 말하면 **객체 형태는 interface, 유니온·복잡한 조합은 type**이 실무 기준이다.

---

## interface — 객체의 계약을 정의한다

```typescript
interface User {
  id: number
  name: string
  email: string
}

const user: User = {
  id: 1,
  name: '홍길동',
  email: 'hong@example.com',
}
```

Java의 `interface`와 비슷하다. 객체가 어떤 프로퍼티를 가져야 하는지 정의한다.

### 선택 프로퍼티와 읽기 전용

```typescript
interface UserProfile {
  id: number
  name: string
  bio?: string              // ? — 있어도 없어도 됨
  readonly createdAt: string // readonly — 수정 불가
}

const profile: UserProfile = { id: 1, name: '홍길동', createdAt: '2026-06-20' }
profile.createdAt = '2026-01-01' // ❌ 컴파일 오류
```

### 확장 — extends로 상속

```typescript
interface Admin extends User {
  role: 'SUPER' | 'MANAGER'
  permissions: string[]
}
```

Java의 `extends`와 동일하다.

### 함수 타입 정의

```typescript
interface Repository<T> {
  findById(id: number): Promise<T | null>
  save(entity: T): Promise<T>
  delete(id: number): Promise<void>
}
```

### 선언 합병 — interface만 가능한 기능

```typescript
// 같은 이름을 두 번 선언하면 합쳐진다
interface Window {
  myCustomProp: string
}

// 이제 window.myCustomProp 사용 가능
```

외부 라이브러리 타입에 프로퍼티를 추가할 때 유용하다. `type`으로는 불가능하다.

---

## type 별칭 — interface가 못하는 것을 한다

```typescript
// 객체 타입 — interface와 동일
type Point = {
  x: number
  y: number
}

// 유니온 타입 — interface로 불가
type Status = 'pending' | 'approved' | 'rejected'
type ID = string | number

// 인터섹션 — 두 타입을 합침
type AdminUser = User & { role: string }

// 튜플
type Coordinate = [number, number]

// 함수 시그니처 별칭
type Handler = (event: Event) => void
```

`type`의 핵심은 **유니온과 인터섹션**이다. `Status`처럼 문자열 리터럴의 유니온으로 상태값을 표현하는 것은 TypeScript에서 매우 흔한 패턴인데, 이건 `type`으로만 할 수 있다.

### 확장 — &로 합성

```typescript
type Animal = { name: string }
type Dog = Animal & { breed: string }
```

`interface`의 `extends`와 결과는 같지만 문법이 다르다.

---

## 언제 뭘 쓰는가 — 실무 기준

| 기능 | interface | type |
|------|-----------|------|
| 객체 타입 정의 | ✅ | ✅ |
| 확장 | `extends` | `&` |
| 유니온 타입 | ❌ | ✅ |
| 선언 합병 | ✅ | ❌ |
| 조건부·매핑 타입 | ❌ | ✅ |

```
interface를 쓸 때:
  - 객체 형태 정의 (DTO, Props, API 응답 구조)
  - 클래스가 구현할 계약
  - 외부 라이브러리 타입 확장 (선언 합병 필요 시)

type을 쓸 때:
  - 유니온 타입 (Status, Role, Direction 등 상태값)
  - 인터섹션으로 타입 합성
  - 조건부·매핑 타입 등 고급 패턴
  - 튜플, 함수 시그니처 별칭
```

---

## 실무 패턴 예시

실제 프로젝트에서 어떻게 나뉘는지 보면 기준이 명확해진다.

```typescript
// API 응답 구조 — interface
interface ApiResponse<T> {
  data: T
  message: string
  status: number
}

// 상태값 — type (유니온)
type OrderStatus = 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'

// React 컴포넌트 Props — interface
interface ButtonProps {
  label: string
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  onClick: () => void
}

// 기존 타입에서 파생 — type
type CreateUserRequest = Omit<User, 'id' | 'createdAt'>
type UpdateUserRequest = Partial<Omit<User, 'id'>>
```

`Omit`, `Partial` 같은 유틸리티 타입을 쓰는 파생 타입은 `type`으로 만든다. 다음 글에서 이 유틸리티 타입들을 자세히 다룬다.

---

## 동적 키 — 인덱스 시그니처

키 이름을 미리 알 수 없는 경우에 쓴다.

```typescript
interface StringMap {
  [key: string]: string
}

const map: StringMap = {
  name: '홍길동',
  city: '서울',
  // 어떤 string 키든 추가 가능
}

// Record<K, V>가 더 명확한 표현
type StringMap = Record<string, string>
```

---

## 마치며

둘 다 쓸 수 있는 상황에서는 `interface`를 기본으로 쓰고, 유니온이나 타입 조합이 필요할 때 `type`으로 전환하면 된다. 팀이 있다면 컨벤션을 하나로 통일하는 것이 중요하다.

다음 글에서는 `interface`와 `type` 모두에서 쓸 수 있는 **제네릭** — 타입을 파라미터로 받는 방법을 다룬다.
