---
title: "[Spring 완전 정복 #5] @Transactional 완전 정복 — 동작 원리, 전파속성, 격리수준"
date: 2026-05-19T10:00:00+09:00
draft: false
series: "Spring 완전 정복"
series_order: 5
series_total: 14
categories: ["Spring"]
tags: [spring, transaction, transactional, propagation, isolation, java, backend]
description: "@Transactional이 AOP 프록시로 동작하는 원리부터, REQUIRED vs REQUIRES_NEW 차이, 격리수준 4단계, 자기 호출 함정까지 실전 코드로 정리한다."
wiki_source: 10-wiki/tech/spring/05-spring-transaction.md
---

## @Transactional을 붙이면 어떻게 트랜잭션이 걸리나

```java
@Transactional
public void createOrder(OrderRequest request) {
    orderRepository.save(new Order(request));
    paymentRepository.save(new Payment(request));
}
```

이 어노테이션 하나로 두 save가 하나의 트랜잭션으로 묶인다. 하나라도 실패하면 둘 다 롤백된다. 어떻게?

답은 **AOP 프록시**다. `@Transactional`이 붙은 Bean에는 실제 Bean 대신 CGLIB 프록시가 주입된다. 프록시가 메서드 호출을 가로채 트랜잭션 시작/커밋/롤백을 처리하고, 실제 메서드는 비즈니스 로직만 담는다.

```text
호출자 → [CGLIB 프록시]
              ↓
         트랜잭션 begin (Connection.setAutoCommit(false))
              ↓
         실제 메서드 실행
              ↓
         성공 → commit  /  RuntimeException → rollback
```

---

## 롤백 기본 규칙 — 체크 예외 함정

롤백 기본 규칙은 직관에서 벗어나는 경우가 있다.

```text
RuntimeException (unchecked) → 자동 롤백  ✅
Error                        → 자동 롤백  ✅
CheckedException (checked)   → 롤백 안 함 ❌ ← 주의
```

`IOException`, `SQLException` 같은 체크 예외는 기본적으로 롤백되지 않는다. 초기 설계에서 체크 예외를 "복구 가능한 예외"로 간주했기 때문이다.

실무에서는 명시적으로 지정하거나 런타임 예외로 전환하는 경우가 많다.

```java
// 모든 예외에서 롤백
@Transactional(rollbackFor = Exception.class)

// 특정 예외는 롤백 제외
@Transactional(noRollbackFor = IllegalArgumentException.class)
```

---

## readOnly — 조회 성능을 높이는 간단한 방법

```java
@Transactional(readOnly = true)
public List<Order> getOrders() { ... }
```

읽기 전용 트랜잭션을 선언하면 두 가지 이점이 있다.

**JPA Dirty Checking 비활성화** — 일반 트랜잭션에서 JPA는 조회한 엔티티의 초기 상태를 스냅샷으로 저장하고, 트랜잭션 종료 시 변경 여부를 비교한다. `readOnly = true`면 이 스냅샷 저장 단계가 생략된다.

**읽기 전용 커넥션 라우팅** — DB 리플리케이션 환경에서 읽기 전용 커넥션을 replica로 라우팅할 수 있다.

조회 메서드에는 습관적으로 `readOnly = true`를 붙이는 것이 좋다.

---

## 전파속성 — 트랜잭션을 어떻게 이어갈까

전파속성은 `@Transactional` 메서드가 **이미 진행 중인 트랜잭션을 어떻게 처리할지** 결정한다.

| 전파속성 | 기존 트랜잭션 있을 때 | 기존 트랜잭션 없을 때 |
|---|---|---|
| **REQUIRED** (기본) | 기존 트랜잭션에 합류 | 새 트랜잭션 생성 |
| **REQUIRES_NEW** | 기존 일시 중단, 새 트랜잭션 생성 | 새 트랜잭션 생성 |
| **NESTED** | 중첩 트랜잭션 (savepoint) | 새 트랜잭션 생성 |

### REQUIRED vs REQUIRES_NEW — 언제 쓸까

가장 중요한 비교다.

```java
@Service
public class OrderService {

    @Transactional  // REQUIRED (기본)
    public void createOrder() {
        orderRepository.save(...);
        notificationService.sendEmail(); // 여기서 예외 → order도 롤백
    }
}

@Service
public class NotificationService {

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void sendEmail() {
        // 독립 트랜잭션 — 여기서 예외가 나도 createOrder는 영향 없음
        emailLogRepository.save(...);
    }
}
```

**REQUIRED**: 하나의 트랜잭션으로 묶인다. 어디서 예외가 나든 전체 롤백. "주문 저장 + 이메일 전송이 함께 성공해야 할 때" 사용.

**REQUIRES_NEW**: 완전히 독립된 트랜잭션. "이메일 전송 실패해도 주문은 저장되어야 할 때" 사용.

### NESTED vs REQUIRES_NEW

둘 다 "부분 롤백"처럼 보이지만 차이가 있다.

**REQUIRES_NEW**: 부모 트랜잭션과 완전히 독립. 부모가 롤백돼도 이미 커밋된 자식은 유지된다.

**NESTED**: 부모 트랜잭션 안에서 savepoint를 생성. 자식만 롤백 가능하지만, 부모가 롤백되면 자식도 같이 롤백된다.

---

## 격리수준 — 동시성 문제를 얼마나 막을까

여러 트랜잭션이 동시에 실행될 때 생기는 문제가 세 가지 있다.

| 문제 | 설명 |
|---|---|
| **Dirty Read** | 커밋되지 않은 다른 트랜잭션의 데이터를 읽음 |
| **Non-repeatable Read** | 같은 행을 두 번 조회했는데 값이 다름 (중간에 UPDATE 발생) |
| **Phantom Read** | 같은 조건으로 두 번 조회했는데 행 수가 다름 (중간에 INSERT/DELETE 발생) |

격리수준을 높일수록 이 문제를 방지하지만, 잠금이 늘어나 성능이 떨어진다.

| 격리수준 | Dirty Read | Non-repeatable Read | Phantom Read | 성능 |
|---|---|---|---|---|
| **READ_UNCOMMITTED** | 발생 | 발생 | 발생 | 가장 빠름 |
| **READ_COMMITTED** | 방지 | 발생 | 발생 | 빠름 |
| **REPEATABLE_READ** | 방지 | 방지 | 발생 | 보통 |
| **SERIALIZABLE** | 방지 | 방지 | 방지 | 가장 느림 |

실무 기본값:
- **MySQL InnoDB**: `REPEATABLE_READ` (MVCC로 Phantom Read도 어느 정도 방지)
- **PostgreSQL**: `READ_COMMITTED`

```java
@Transactional(isolation = Isolation.READ_COMMITTED)
```

---

## 흔한 함정 3가지

### 1. 자기 호출 — 가장 자주 빠지는 함정

```java
@Service
public class OrderService {

    public void process() {
        createOrder(); // this.createOrder() — 프록시를 거치지 않음!
    }

    @Transactional
    public void createOrder() { ... }
}
```

`process()`에서 `createOrder()`를 직접 호출하면 프록시를 건너뛴다. `@Transactional`이 무시된다.

**해결책**: `createOrder()`를 별도 클래스로 분리하거나, `@Transactional`을 `process()`에 붙인다.

### 2. private 메서드에는 동작 안 함

```java
@Transactional
private void doSomething() { ... } // 동작 안 함
```

CGLIB 프록시는 클래스를 상속해서 메서드를 오버라이드한다. `private` 메서드는 오버라이드할 수 없으니 프록시가 개입할 수 없다.

### 3. 전파 함정 — UnexpectedRollbackException

```java
@Transactional  // REQUIRED — 새 트랜잭션 생성
public void parent() {
    try {
        child(); // 예외 catch해도 이미 늦음
    } catch (Exception e) {
        // 여기서 잡아도 트랜잭션은 rollback-only 상태
    }
    // → UnexpectedRollbackException 발생
}

@Transactional  // REQUIRED — 부모에 합류
public void child() {
    throw new RuntimeException(); // 부모 트랜잭션을 rollback-only로 마킹
}
```

`child()`의 예외가 트랜잭션을 rollback-only로 마킹하고 나면, `parent()`에서 catch해도 커밋이 불가능하다. `child()`를 `REQUIRES_NEW`로 분리하거나, 예외 처리 전략을 명확히 해야 한다.

---

## 마치며

`@Transactional`을 제대로 쓰려면 세 가지를 이해해야 한다.

- **동작 원리**: AOP 프록시. 외부 호출만 가로채므로 자기 호출, private 메서드에는 동작 안 함.
- **전파속성**: REQUIRED는 운명 공동체, REQUIRES_NEW는 완전 독립. 이메일/알림처럼 부가 작업은 REQUIRES_NEW 고려.
- **격리수준**: 높을수록 안전하지만 성능 저하. DB 기본값(MySQL → REPEATABLE_READ, PostgreSQL → READ_COMMITTED)을 먼저 이해하고 필요할 때만 변경.

다음 편에서는 Spring Data JPA — 영속성 컨텍스트와 N+1 문제를 정리한다.
