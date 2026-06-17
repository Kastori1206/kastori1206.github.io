---
title: "Java 동시성 — synchronized, volatile, ThreadLocal, 그리고 Spring과의 관계"
date: 2026-06-17
draft: false
target_section: tech
series: "Java 핵심 개념"
series_order: 6
series_total: 7
tags: [java, concurrency, thread, synchronized, volatile, threadlocal, atomic, spring]
description: "Spring은 멀티스레드 환경이다. Singleton Bean이 모든 요청에서 공유된다는 게 무슨 의미인지, 동시성 문제가 어떻게 생기고 어떻게 막는지 실제 코드로 정리한다."
wiki_source: 10-wiki/tech/java/03-concurrency.md
categories: [Java]
---

## Spring은 멀티스레드 환경이다

Tomcat은 HTTP 요청이 올 때마다 스레드를 할당한다. 기본 설정에서 200개의 스레드가 동시에 돌 수 있다. 그 말은 `OrderService` 하나가 200개의 스레드에서 동시에 호출될 수 있다는 뜻이다.

이게 왜 문제가 되는지, 어떻게 안전하게 만드는지 살펴보자.

---

## 동시성 문제 3가지

### 1. 경쟁 조건 (Race Condition)

```java
public class Counter {
    private int count = 0;

    public void increment() {
        count++; // 사실 3단계: 읽기 → 더하기 → 쓰기
    }
}
```

두 스레드가 동시에 `count = 0`을 읽으면, 둘 다 `count = 1`을 쓴다. 결과는 2가 아닌 1이 된다.

### 2. 가시성 문제 (Visibility)

각 스레드는 성능을 위해 값을 CPU 캐시에 저장한다. Thread B가 변경한 값이 Thread A의 캐시에 바로 반영되지 않을 수 있다.

```java
boolean running = true;

// Thread A — 캐시의 running을 계속 읽으면 변경을 감지 못할 수 있다
while (running) { ... }

// Thread B
running = false; // 메인 메모리에 썼지만 Thread A 캐시엔 아직 true
```

### 3. 데드락

두 스레드가 서로의 락을 기다려 영원히 멈추는 상황이다.

```java
// Thread A: lock1 획득 → lock2 대기
// Thread B: lock2 획득 → lock1 대기
// → 영원히 대기
```

**예방법**: 락 획득 순서를 항상 일관되게 유지한다.

---

## synchronized — 한 번에 하나씩

`synchronized`는 블록에 한 번에 하나의 스레드만 진입하게 막는다.

```java
public class SafeCounter {
    private int count = 0;

    public synchronized void increment() { // this를 락으로 사용
        count++;
    }
}
```

락이 필요한 부분만 동기화하면 성능이 낫다.

```java
public class SafeCounter {
    private int count = 0;
    private final Object lock = new Object();

    public void increment() {
        synchronized (lock) {
            count++;
        }
        // 나머지 코드는 동시 실행 가능
    }
}
```

`synchronized`의 한계: 락을 얻기 위해 다른 스레드는 **블로킹**된다. 동시성이 높은 환경에서는 병목이 생길 수 있다.

---

## volatile — 가시성 보장

`volatile` 변수는 항상 메인 메모리에서 읽고 쓴다. CPU 캐시를 거치지 않는다.

```java
volatile boolean running = true;

// Thread A — 항상 메인 메모리에서 읽으므로 변경을 바로 감지
while (running) { ... }

// Thread B
running = false; // 메인 메모리에 즉시 반영 → Thread A가 감지
```

하지만 `volatile`은 **가시성만** 보장한다. 원자성은 보장하지 않는다.

```java
volatile int count = 0;
count++; // 읽기 → 더하기 → 쓰기가 원자적이지 않음 → 여전히 Race Condition
```

`count++`를 안전하게 하려면 `synchronized` 또는 `AtomicInteger`가 필요하다.

---

## AtomicInteger — 락 없는 원자적 연산

`java.util.concurrent.atomic` 패키지는 락 없이 원자적 연산을 제공한다.

```java
AtomicInteger count = new AtomicInteger(0);

count.incrementAndGet(); // 원자적 ++ 
count.addAndGet(5);      // 원자적 += 5
count.compareAndSet(10, 20); // 현재 값이 10이면 20으로 변경 (CAS)
```

내부적으로 **CAS(Compare-And-Swap)** 하드웨어 명령어를 사용해서 락 없이 원자성을 보장한다. `synchronized`보다 성능이 좋다.

---

## ThreadLocal — 스레드마다 독립적인 저장소

`ThreadLocal`은 같은 변수지만 스레드마다 다른 값을 가진다.

```java
public class RequestContext {
    private static final ThreadLocal<String> userId = new ThreadLocal<>();

    public static void set(String id) { userId.set(id); }
    public static String get() { return userId.get(); }
    public static void clear() { userId.remove(); } // 반드시 호출
}

// Thread A에서: RequestContext.set("user1");
// Thread B에서: RequestContext.set("user2");
// 각 스레드에서 RequestContext.get() → 자기 스레드의 값만 반환
```

Spring이 내부적으로 `ThreadLocal`을 많이 쓴다.

- **Spring Security** `SecurityContextHolder`: HTTP 요청 스레드에 인증 정보 저장
- **Spring Transaction**: 트랜잭션 정보를 스레드에 바인딩

### ThreadLocal 메모리 누수 주의

Tomcat은 스레드 풀로 스레드를 재사용한다. 요청 처리 후 `remove()`를 하지 않으면 다음 요청에서 이전 데이터가 남아있다.

```java
// Filter 또는 Interceptor에서
try {
    RequestContext.set(extractUserId(request));
    chain.doFilter(request, response);
} finally {
    RequestContext.clear(); // finally에서 반드시 제거
}
```

---

## Singleton Bean의 스레드 안전성

Spring의 Singleton Bean은 여러 스레드가 공유한다. 인스턴스 변수에 상태를 저장하면 위험하다.

```java
@Service
public class OrderService {
    // ❌ 스레드 안전하지 않음 — 여러 스레드가 동시에 수정
    private int requestCount = 0;

    // ✅ 지역변수는 각 스레드의 Stack에 있어 안전
    public void process(Order order) {
        int localCount = 0; // 안전
        ...
    }

    // ✅ final 불변 값은 안전
    private final String serviceName = "OrderService";
}
```

Bean을 스레드 안전하게 만드는 방법:

```
1. 무상태(stateless) 설계 — 인스턴스 변수에 상태 저장하지 않음 (가장 권장)
2. ThreadLocal 사용 — 스레드별 독립 저장
3. AtomicInteger / synchronized — 공유 상태가 불가피할 때
```

---

## CompletableFuture — 비동기 작업 체이닝

Spring `@Async`와 함께 자주 쓰이는 패턴이다.

```java
CompletableFuture.supplyAsync(() -> fetchUser(userId))
    .thenApply(user -> enrichWithOrders(user))
    .thenAccept(result -> saveToCache(result))
    .exceptionally(ex -> { log.error("실패", ex); return null; });
```

`@Async` 어노테이션은 내부적으로 AOP 프록시로 동작한다. 같은 클래스 내 자기 호출은 동작하지 않는다는 점을 주의해야 한다.

---

## 마치며

동시성 문제는 "발생하면 재현하기 어려운" 버그 중 하나다. 예방이 최선이다.

핵심 원칙 하나만 기억하면 된다: **Bean은 무상태로 설계한다.** 상태가 없으면 동기화 고민도 없다.

다음 편에서는 "코드를 왜 이렇게 짰나요?"에 대한 언어인 **OOP와 SOLID 원칙**으로 시리즈를 마무리한다.
