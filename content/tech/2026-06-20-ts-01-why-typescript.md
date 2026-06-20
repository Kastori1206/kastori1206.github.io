---
title: "[TS #1] TypeScript를 왜 쓰는가 — Java와 비교하며 이해하기"
date: 2026-06-20
draft: false
target_section: tech
series: "TypeScript 입문"
series_order: 1
tags: [typescript, javascript, type-system, java]
description: "Java와 TypeScript를 함께 쓰는 풀스택 개발자 시각으로 TypeScript를 정리한다. '이미 아는 개념인데 왜 다르게 동작하지?'를 해소한다. 구조적 타이핑, 특수 타입, 타입 추론까지 Java와 비교하며 정리한다."
wiki_source: "10-wiki/tech/typescript/01-overview.md"
categories: [TypeScript]
---

풀스택으로 일하다 보면 백엔드는 Java, 프론트엔드는 TypeScript를 같이 쓰게 된다. 두 언어 모두 정적 타입이라 개념은 익숙한데, 막상 코드를 쓰다 보면 미묘하게 다르게 동작해서 헷갈리는 순간이 생긴다. "Java도 타입 있는데 굳이 TS가 다른 건 뭐지?" — 비교해보면 빠르게 정리된다.

---

## JavaScript의 문제, TypeScript의 해결

JavaScript로만 개발하면 이런 상황이 생긴다.

```js
function greet(user) {
  return user.name.toUpperCase() // user가 null이면 런타임 에러
}

greet(null) // TypeError: Cannot read properties of null
```

배포 나가고 나서야 터진다. TypeScript를 쓰면 이 문제를 **컴파일 타임**에 잡는다.

```typescript
function greet(user: { name: string } | null) {
  return user?.name.toUpperCase() // null 처리 강제 — 안 하면 컴파일 오류
}
```

TypeScript가 해결하는 세 가지:
- **컴파일 타임 오류 탐지** — 배포 전에 타입 오류를 잡는다
- **IDE 자동완성** — 객체 프로퍼티, 함수 시그니처까지 정확하게 제안
- **리팩터링 안전성** — 타입 변경 시 영향 범위를 컴파일러가 추적

---

## TypeScript는 JS로 트랜스파일된다

TypeScript 파일(`.ts`)은 직접 실행되지 않는다.

```
.ts 파일
   ↓ tsc (TypeScript Compiler)
.js 파일  ← 브라우저/Node.js가 실행
```

타입 정보는 컴파일 시 모두 제거된다. 런타임에는 순수 JavaScript만 남는다. Java의 `.java` → `.class` 컴파일과 비슷한 흐름이지만, 결과물이 JS이기 때문에 JVM 없이 브라우저에서 바로 돈다.

---

## 기본 타입 — Java와 뭐가 다른가

Java에서 온 개발자가 헷갈리는 차이들이 있다.

```typescript
// TS는 int/double/float 구분 없이 number 하나
const age: number = 30
const price: number = 9.99

// 배열 — 두 가지 문법이 동일
const names: string[] = ['김', '이', '박']
const names: Array<string> = ['김', '이', '박']

// 타입 추론 — 명시 안 해도 됨
const greeting = '안녕하세요' // TypeScript가 string으로 추론
const count = 0               // number로 추론

// 함수 파라미터는 항상 명시 (추론 불가)
function add(a: number, b: number): number {
  return a + b
}
```

Java처럼 엄격하게 타입을 명시해도 되고, 추론에 맡겨도 된다. 실무에서는 변수는 추론, 함수 파라미터/반환 타입은 명시하는 편이다.

---

## Java에 없는 특수 타입들

### any — 타입 검사를 포기한다

```typescript
let value: any = '문자열'
value = 42        // OK
value.foo()       // OK — 런타임에 터져도 컴파일 통과

// ❌ any는 TypeScript를 쓰는 의미를 없앤다
```

`any`는 TypeScript에게 "이 값은 신경 쓰지 마"라고 선언하는 것이다. 가능하면 쓰지 않는다.

### unknown — 타입 안전한 any

```typescript
let value: unknown = fetchSomething()

// ❌ 타입 확인 전 사용 불가
value.toUpperCase() // 컴파일 오류

// ✅ 타입 확인 후 사용 가능
if (typeof value === 'string') {
  value.toUpperCase() // OK
}
```

외부 API 응답이나 `JSON.parse()` 결과처럼 **타입을 모를 때**는 `any` 대신 `unknown`을 쓴다. 사용 전 반드시 타입을 확인해야 하므로 런타임 오류를 예방한다.

### never — 절대 도달할 수 없는 타입

```typescript
function throwError(msg: string): never {
  throw new Error(msg) // 절대 정상 반환 안 함
}

// Exhaustive check — 모든 케이스를 처리했는지 컴파일러가 확인
type Shape = 'circle' | 'square' | 'triangle'

function getArea(shape: Shape): number {
  switch (shape) {
    case 'circle':   return Math.PI
    case 'square':   return 1
    case 'triangle': return 0.5
    default:
      const _check: never = shape // Shape에 새 케이스 추가 시 여기서 컴파일 오류
      throw new Error(`Unknown shape: ${_check}`)
  }
}
```

`never`는 "여기까지 오면 안 된다"는 표식이다. 유니온 타입이 늘어날 때 switch 분기를 빠뜨리면 컴파일러가 잡아준다.

---

## Java vs TypeScript: 타입 시스템의 근본적 차이

가장 중요한 차이는 **명목적 타입(Java) vs 구조적 타입(TypeScript)** 이다.

| | Java (명목적) | TypeScript (구조적) |
|--|---|---|
| 타입 판단 기준 | 클래스 이름 | 객체의 구조(프로퍼티 형태) |
| 예시 | `Dog`는 `extends Animal` 명시 필요 | `{ name: string }`은 같은 구조면 같은 타입 |

```typescript
interface Point { x: number; y: number }

function printPoint(p: Point) {
  console.log(p.x, p.y)
}

// Point를 implements하지 않아도 OK — 구조가 맞으면 됨
const myPoint = { x: 10, y: 20, z: 30 }
printPoint(myPoint) // OK — x, y가 있으니까
```

Java라면 `myPoint`가 `Point`를 implements해야 한다. TypeScript는 구조만 맞으면 통과다. 처음엔 어색하지만 익숙해지면 훨씬 유연하다.

---

## 마치며

TypeScript는 JavaScript에 Java식 타입 안전성을 더한 언어다. 개념은 이미 알고 있다 — 타입 시스템, 컴파일 타임 검사, 인터페이스. 차이는 구조적 타이핑과 트랜스파일 방식이다.

다음 글에서는 TypeScript에서 타입을 정의하는 두 가지 방법 — `interface`와 `type` 별칭 — 을 언제 어떻게 쓰는지 살펴본다.
