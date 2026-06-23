---
title: "[TS #5] 타입 가드와 Discriminated Union — 런타임 타입 안전 처리"
date: 2026-06-24
draft: false
target_section: tech
series: "TypeScript 입문"
series_order: 5
tags: [typescript, type-guard, discriminated-union, narrowing]
description: "유니온 타입을 런타임에 안전하게 처리하는 타입 가드 4가지와, 상태 분기를 깔끔하게 처리하는 Discriminated Union 패턴을 정리한다. API 응답 처리와 결제 상태 관리 예시 포함."
wiki_source: "10-wiki/tech/typescript/05-type-guards.md"
categories: [TypeScript]
---

TypeScript는 컴파일 타임에 타입을 검사하지만, 실제 데이터는 런타임에 온다. 외부 API 응답, 이벤트 핸들러, 사용자 입력 — 이것들이 `unknown`이나 유니온 타입으로 들어올 때 TypeScript는 "이 값이 뭔지 확인하고 써라"고 강제한다. 그 확인하는 방법이 **타입 가드**다.

---

## 타입 가드 4가지

### 1. typeof — 원시 타입 분기

```typescript
function process(value: string | number) {
  if (typeof value === 'string') {
    value.toUpperCase() // 여기서 value는 string
  } else {
    value.toFixed(2)    // 여기서 value는 number
  }
}
```

`typeof`는 `string`, `number`, `boolean`, `function`, `object` 등 원시 타입에서만 쓴다.

### 2. instanceof — 클래스 인스턴스 분기

```typescript
class NetworkError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
  }
}

function handleError(err: Error) {
  if (err instanceof NetworkError) {
    console.log(err.statusCode) // NetworkError로 좁혀짐
  } else {
    console.log(err.message)
  }
}
```

### 3. in — 프로퍼티 존재 여부로 분기

```typescript
interface Cat { meow(): void }
interface Dog { bark(): void }

function makeSound(animal: Cat | Dog) {
  if ('meow' in animal) {
    animal.meow() // Cat
  } else {
    animal.bark() // Dog
  }
}
```

### 4. 사용자 정의 타입 가드 — `is` 반환 타입

가장 강력하다. 직접 타입 가드 함수를 만들어서 `unknown` 데이터를 안전하게 처리한다.

```typescript
function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value
  )
}

// API 응답 검증
const data: unknown = await fetchJson('/api/user')
if (isUser(data)) {
  console.log(data.name) // 타입 안전하게 User로 사용
}
```

`value is User`가 반환 타입이다. 함수가 `true`를 반환하면 TypeScript가 그 블록 안에서 `value`를 `User` 타입으로 좁힌다.

---

## Discriminated Union — 가장 강력한 상태 분기 패턴

공통 리터럴 필드(`status`, `type` 등)로 유니온을 구분하는 패턴이다. 상태 관리, API 응답 처리에서 자주 쓰인다.

### 결제 상태 처리

```typescript
type PaymentState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'success'; approvalNo: string; amount: number }
  | { status: 'fail'; errorCode: string; message: string }

function renderPayment(state: PaymentState) {
  switch (state.status) {
    case 'idle':
      return '결제 전'
    case 'pending':
      return '처리 중...'
    case 'success':
      return `승인번호: ${state.approvalNo}` // approvalNo 타입 보장
    case 'fail':
      return `오류: ${state.message}`         // message 타입 보장
  }
}
```

`status === 'success'`인 브랜치에서는 `approvalNo`와 `amount`가 보장된다. `status === 'fail'`에서는 `errorCode`와 `message`가 보장된다. 각 상태마다 필요한 데이터를 타입 수준에서 강제한다.

### API 응답 처리

```typescript
type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: number }

async function getUser(id: number): Promise<ApiResult<User>> {
  try {
    const user = await fetchUser(id)
    return { success: true, data: user }
  } catch {
    return { success: false, error: '조회 실패', code: 404 }
  }
}

const result = await getUser(1)
if (result.success) {
  console.log(result.data.name)  // User 타입 보장
} else {
  console.log(result.error)      // string 보장
}
```

`result.success`가 `true`면 `data`가 있고, `false`면 `error`와 `code`가 있다. try/catch 없이도 타입 수준에서 에러 케이스를 처리할 수 있다.

---

## 실무 패턴 — null 안전 처리

```typescript
// 옵셔널 체이닝 (?.)
const city = user?.address?.city          // user나 address가 null이면 undefined

// Nullish 병합 (??)
const name = user?.name ?? '이름 없음'    // null/undefined이면 기본값

// null 단언 (!) — 확실할 때만
const name = user!.name                   // ⚠️ 실제로 null이면 런타임 오류
```

### enum vs const 객체 vs 유니온

```typescript
// enum — 런타임에 JS 객체로 남음 (번들에 포함)
enum Direction { UP = 'UP', DOWN = 'DOWN' }

// const 객체 — 값+타입 동시 활용, tree-shaking 가능
const Direction = { UP: 'UP', DOWN: 'DOWN' } as const
type Direction = typeof Direction[keyof typeof Direction] // 'UP' | 'DOWN'

// 유니온 — 가장 단순, 컴파일 후 사라짐
type Direction = 'UP' | 'DOWN'
```

단순한 상수값이면 유니온, 값을 변수처럼 참조해야 하면 `const` 객체를 쓴다. `enum`은 런타임에 JS 객체로 남아 번들에 포함되므로 신중하게 선택한다.

---

## tsconfig strict 모드

타입 가드가 빛을 발하려면 `strict: true`가 필수다.

```json
{
  "compilerOptions": {
    "strict": true,              // null 체크, any 추론 금지 등 전체 활성화
    "noImplicitAny": true,       // any로 추론되는 것 오류 처리
    "strictNullChecks": true,    // null/undefined를 별도 타입으로 처리
    "noUnusedLocals": true       // 안 쓰는 변수 오류
  }
}
```

`strictNullChecks`가 꺼져 있으면 `null`이 어디서든 들어갈 수 있어서 타입 가드의 효과가 절반으로 줄어든다.

---

## 마치며

타입 가드는 "컴파일러를 설득하는 방법"이다. TypeScript가 모르는 타입 정보를 런타임 조건으로 증명하면, 컴파일러가 그 블록 안에서 안전하게 타입을 좁혀준다.

이번 시리즈에서 TypeScript의 핵심을 Java와 비교하며 살펴봤다. 타입 시스템, interface/type, 제네릭, 유틸리티 타입, 타입 가드 — 이 다섯 가지를 이해하면 풀스택 프로젝트에서 Java와 TypeScript를 함께 다루는 데 충분한 기반이 된다.
