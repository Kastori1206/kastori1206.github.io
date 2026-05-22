---
title: "[Spring 완전 정복 #12] Spring @Async — 비동기 처리와 CompletableFuture 병렬 실행"
date: 2026-05-19T03:00:00+09:00
draft: false
series: "Spring 완전 정복"
series_order: 12
series_total: 14
categories: ["Spring"]
tags: [spring, async, completablefuture, threadpool, java, backend]
description: "@Async의 AOP 프록시 동작 원리, ThreadPoolTaskExecutor 설정, CompletableFuture 병렬 실행, 자기 호출·예외·ThreadLocal 전파 문제까지 실전 코드로 정리한다."
wiki_source: 10-wiki/tech/spring/10-spring-async.md
---

## 이메일 발송을 기다려야 할까?

주문 완료 후 이메일 알림을 보내는 상황을 생각해보자. 이메일 발송 API가 외부 서비스를 호출하고 2초가 걸린다면, 사용자는 주문 완료 응답을 받기까지 2초를 기다려야 할까?

주문 저장과 이메일 발송은 독립적인 작업이다. 이메일이 성공했는지 실패했는지를 주문 API 응답에 포함할 필요가 없다면 비동기로 처리하는 것이 맞다.

`@Async`는 메서드를 **별도 스레드 풀에서 비동기 실행**한다. 호출자는 메서드 완료를 기다리지 않고 즉시 반환받는다.

---

## 기본 설정

```java
@Configuration
@EnableAsync  // @Async 활성화
public class AsyncConfig {

    @Bean(name = "mailExecutor")
    public TaskExecutor mailExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);     // 항상 유지할 스레드 수
        executor.setMaxPoolSize(20);     // 최대 스레드 수
        executor.setQueueCapacity(100);  // 큐 대기 용량
        executor.setThreadNamePrefix("mail-async-");
        executor.setRejectedExecutionHandler(
            new ThreadPoolExecutor.CallerRunsPolicy()); // 큐 꽉 차면 호출 스레드가 직접 실행
        executor.initialize();
        return executor;
    }
}
```

스레드 풀 동작 방식:

```text
1. 스레드 수 < CorePoolSize → 새 스레드 생성
2. 스레드 수 >= CorePoolSize → 큐에 대기
3. 큐가 꽉 참 → MaxPoolSize까지 스레드 추가 생성
4. MaxPoolSize도 꽉 참 → RejectedExecutionHandler 실행
```

---

## @Async 기본 사용

```java
@Service
@RequiredArgsConstructor
public class NotificationService {

    @Async("mailExecutor")  // 지정한 스레드 풀 사용
    public void sendWelcomeEmail(String email) {
        // 이 메서드는 별도 스레드에서 실행
        // 호출자는 즉시 반환받음
        emailClient.send(email, "환영합니다!");
    }
}

@Service
public class UserService {

    public void registerUser(UserRequest request) {
        User user = userRepository.save(new User(request));
        notificationService.sendWelcomeEmail(user.getEmail()); // 기다리지 않음
        return; // 이메일 발송 완료 안 돼도 여기 도달
    }
}
```

---

## CompletableFuture — 비동기 결과 조합

대시보드처럼 여러 데이터를 합쳐서 보여줘야 할 때, 각 조회를 병렬로 실행하면 시간을 줄일 수 있다.

```java
@Service
public class DashboardService {

    @Async
    public CompletableFuture<OrderStats> getOrderStats(Long userId) {
        return CompletableFuture.completedFuture(orderService.getStats(userId));
    }

    @Async
    public CompletableFuture<PaymentStats> getPaymentStats(Long userId) {
        return CompletableFuture.completedFuture(paymentService.getStats(userId));
    }

    public DashboardDto getDashboard(Long userId) throws Exception {
        CompletableFuture<OrderStats> orderFuture = getOrderStats(userId);
        CompletableFuture<PaymentStats> paymentFuture = getPaymentStats(userId);

        // 둘 다 완료될 때까지 대기
        CompletableFuture.allOf(orderFuture, paymentFuture).join();

        return DashboardDto.of(orderFuture.get(), paymentFuture.get());
        // 두 조회가 각각 1초씩 걸린다면: 순차 2초 → 병렬 ~1초
    }
}
```

---

## 주의사항 3가지

### 1. 자기 호출 — @Transactional과 같은 함정

`@Async`도 AOP 프록시로 동작한다. 같은 클래스 안에서 직접 호출하면 프록시를 거치지 않아 동기로 실행된다.

```java
@Service
public class OrderService {

    public void createOrder(OrderRequest request) {
        sendNotification(request); // ❌ this.sendNotification() → 동기 실행
    }

    @Async
    public void sendNotification(OrderRequest request) { ... }
}
```

해결책은 `sendNotification()`을 별도 Bean(`NotificationService`)으로 분리하는 것이다.

### 2. 예외 처리 — 호출자에게 전파 안 됨

반환값이 없는 `@Async` 메서드에서 예외가 발생해도 호출자에게 전파되지 않는다. `AsyncUncaughtExceptionHandler`로 처리해야 한다.

```java
@Configuration
@EnableAsync
public class AsyncConfig implements AsyncConfigurer {

    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return (ex, method, params) -> {
            log.error("@Async 예외: method={}", method.getName(), ex);
            alertService.sendAlert("비동기 작업 실패: " + method.getName());
        };
    }
}
```

### 3. ThreadLocal 전파 안 됨

메인 스레드의 `SecurityContext`나 `ThreadLocal` 값이 `@Async` 스레드에 자동으로 전파되지 않는다.

```java
@Async
public void asyncMethod() {
    SecurityContextHolder.getContext().getAuthentication(); // null 가능
}
```

보안 컨텍스트가 필요하다면 스레드 풀에 `DelegatingSecurityContextTaskDecorator`를 설정해야 한다.

---

## 언제 쓸까

```text
✅ 적합한 경우
  - 이메일/SMS/푸시 알림 발송
  - 감사 로그 기록
  - 캐시 비동기 갱신
  - 외부 API 호출 (응답 즉시 반환 불필요)

❌ 적합하지 않은 경우
  - 결과를 즉시 응답에 포함해야 할 때
  - 트랜잭션을 호출자와 공유해야 할 때
  - 실패 시 호출자가 반드시 알아야 할 때
```

`@Async`와 `@Transactional`을 같이 쓰면 비동기 스레드는 호출자의 트랜잭션을 이어받지 않는다. 새로운 독립 트랜잭션으로 실행된다.

---

## 마치며

`@Async`는 "결과를 기다릴 필요 없는 부가 작업"에 적합하다. 동작 원리는 AOP 프록시이므로 `@Transactional`과 같은 자기 호출 함정이 있다. 예외는 `AsyncUncaughtExceptionHandler`로 처리하고, ThreadLocal 전파가 필요하면 별도 설정이 필요하다.

다음 편에서는 Spring Cache — `@Cacheable`과 Redis 캐시 전략을 정리한다.
