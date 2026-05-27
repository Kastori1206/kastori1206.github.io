---
title: "[Java 객체지향 실전 #5] 주문 완료 후 해야 할 일이 자꾸 늘어난다면 — Spring 이벤트로 의존성 끊기"
date: 2026-05-25
draft: false
target_section: tech
series: "Java 객체지향 실전"
series_order: 5
tags: [java, oop, spring, design-pattern]
description: "OrderService에 주입되는 의존성이 계속 늘어나는 문제를 Spring Event와 @TransactionalEventListener로 해결하는 방법을 다룬다."
wiki_source: 10-wiki/tech/java-oop-patterns/05-spring-events.md
categories: [Java]
---

## 이런 코드 본 적 있지 않나요?

주문 완료 기능을 처음 만들 땐 단순했다. 주문 저장하고 끝.

그런데 시간이 지나면서 이렇게 변한다.

```java
public Order completeOrder(Long orderId) {
    order.complete();
    orderRepository.save(order);

    notificationService.sendOrderCompleteNotification(order);   // 기획: 알림 추가
    pointService.addPoints(order.getUserId(), order.getAmount()); // 기획: 포인트 적립
    couponService.useOrderCoupon(order.getCouponId());           // 기획: 쿠폰 처리
    inventoryService.decreaseStock(order.getItems());            // 기획: 재고 차감

    return order;
}
```

다음 주에 "배송 예약도 여기서 해주세요"라는 요청이 오면, `OrderService`를 다시 열고 한 줄 더 추가해야 한다.

`OrderService`가 알아야 할 다른 서비스들이 끝없이 늘어난다. 이게 문제다.

---

## 나쁜 코드: 강결합의 전형

```java
@Service
@RequiredArgsConstructor
@Transactional
public class OrderService {

    private final OrderRepository orderRepository;
    private final NotificationService notificationService;  // 직접 의존
    private final PointService pointService;                // 직접 의존
    private final CouponService couponService;              // 직접 의존
    private final InventoryService inventoryService;        // 직접 의존

    public Order completeOrder(Long orderId) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));

        order.complete();
        orderRepository.save(order);

        // 주문 완료 후 해야 할 일들 — 비즈니스가 커질수록 여기에 계속 추가됨
        notificationService.sendOrderCompleteNotification(order);
        pointService.addPoints(order.getUserId(), order.getAmount());
        couponService.useOrderCoupon(order.getCouponId());
        inventoryService.decreaseStock(order.getItems());

        return order;
    }
}
```

이 코드의 문제는 세 가지다.

첫째, **OCP 위반**. 새 기능이 추가될 때마다 `OrderService`를 수정해야 한다. "주문 완료"라는 개념이 변하지 않았는데도.

둘째, **테스트 어려움**. `OrderService` 단위 테스트를 작성하려면 `NotificationService`, `PointService`, `CouponService`, `InventoryService`를 전부 Mock으로 만들어야 한다.

셋째, **트랜잭션 오염**. 알림 서비스에서 예외가 나면 주문 저장까지 롤백된다. 알림 실패 때문에 주문 자체가 취소되는 황당한 상황이 생길 수 있다.

---

## Spring Event로 의존성을 역전한다

핵심 아이디어는 이렇다.

> `OrderService`는 "주문이 완료됐다"는 사실만 발행한다. 그 이후에 무슨 일이 일어나는지는 관심 없다.

### 1단계: 이벤트 클래스 정의

이벤트는 **발생한 사실**을 담는 불변 값 객체다.

```java
// Java record로 불변 이벤트 정의
public record OrderCompletedEvent(
    Long orderId,
    Long userId,
    Long amount,
    Long couponId,
    List<OrderItem> items,
    LocalDateTime completedAt
) {
    public static OrderCompletedEvent from(Order order) {
        return new OrderCompletedEvent(
            order.getId(),
            order.getUserId(),
            order.getTotalAmount(),
            order.getCouponId(),
            order.getItems(),
            order.getCompletedAt()
        );
    }
}
```

### 2단계: OrderService는 이벤트만 발행

```java
@Service
@RequiredArgsConstructor
@Transactional
public class OrderService {

    private final OrderRepository orderRepository;
    private final ApplicationEventPublisher eventPublisher;  // 유일한 의존성

    public Order completeOrder(Long orderId) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));

        order.complete();
        orderRepository.save(order);

        // 이벤트 발행 — 누가 처리할지 전혀 모름
        eventPublisher.publishEvent(OrderCompletedEvent.from(order));

        return order;
    }
}
```

`NotificationService`도 없고, `PointService`도 없다. `ApplicationEventPublisher` 하나만 주입받는다.

### 3단계: 각 서비스가 독립적으로 구독

```java
// 알림 핸들러 — OrderService를 전혀 모른다
@Component
@RequiredArgsConstructor
public class OrderNotificationHandler {

    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleOrderCompleted(OrderCompletedEvent event) {
        notificationService.sendOrderCompleteNotification(event.userId(), event.orderId());
    }
}

// 포인트 핸들러 — OrderService를 전혀 모른다
@Component
@RequiredArgsConstructor
public class PointEventHandler {

    private final PointService pointService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleOrderCompleted(OrderCompletedEvent event) {
        pointService.addPoints(event.userId(), event.amount());
    }
}

// 쿠폰 핸들러
@Component
@RequiredArgsConstructor
public class CouponEventHandler {

    private final CouponService couponService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleOrderCompleted(OrderCompletedEvent event) {
        if (event.couponId() != null) {
            couponService.markAsUsed(event.couponId());
        }
    }
}
```

이제 배송 예약 기능을 추가해야 한다면? `OrderService` 코드는 한 줄도 바꾸지 않고 `ShippingEventHandler`를 새로 만들기만 하면 된다.

---

## @EventListener vs @TransactionalEventListener

처음 이벤트를 도입할 때 가장 먼저 부딪히는 선택이다.

```java
// @EventListener: 이벤트 발행 즉시 실행
// 주문 트랜잭션이 아직 열려 있는 상태에서 핸들러가 실행됨
// → 핸들러에서 예외 발생 시 주문 트랜잭션도 함께 롤백됨
@EventListener
public void handleOrderCompleted(OrderCompletedEvent event) {
    pointService.addPoints(event.userId(), event.amount());
}

// @TransactionalEventListener: 트랜잭션 커밋 후 실행
// 주문 완료가 DB에 영구 반영된 후에 핸들러 실행
// → 핸들러 실패가 주문 트랜잭션에 영향 없음
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void handleOrderCompleted(OrderCompletedEvent event) {
    pointService.addPoints(event.userId(), event.amount());
}
```

| 구분 | @EventListener | @TransactionalEventListener |
|------|---------------|---------------------------|
| 실행 시점 | 이벤트 발행 즉시 | 트랜잭션 커밋 후 |
| 트랜잭션 참여 | 발행자 트랜잭션에 참여 | 새 트랜잭션(기본) |
| 핸들러 예외 영향 | 발행자 트랜잭션 롤백 | 발행자 트랜잭션 영향 없음 |
| 주 용도 | 같은 트랜잭션 내 처리 | 외부 연동, 알림, 통계 |

대부분의 경우 `@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)`이 정답이다. 주문이 DB에 커밋된 후에 포인트를 적립해야 의미 있다.

`TransactionPhase`는 네 가지가 있다.

```java
// AFTER_COMMIT: 커밋 성공 후 (가장 많이 사용)
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)

// AFTER_ROLLBACK: 롤백 후 (실패 알림, 보상 트랜잭션 등)
@TransactionalEventListener(phase = TransactionPhase.AFTER_ROLLBACK)

// AFTER_COMPLETION: 커밋/롤백 모두 후 (리소스 정리 등)
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMPLETION)

// BEFORE_COMMIT: 커밋 직전 (감사 로그 등)
@TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
```

---

## 알림 발송은 비동기로

알림 발송이나 외부 API 호출은 시간이 걸린다. 이런 작업을 동기로 처리하면 주문 완료 API의 응답 시간이 늘어난다. `@Async`를 조합하면 된다.

```java
// 비동기 활성화
@SpringBootApplication
@EnableAsync
public class Application { ... }

// 전용 스레드풀 설정 (기본 SimpleAsyncTaskExecutor는 프로덕션 부적합)
@Configuration
public class AsyncConfig {

    @Bean(name = "eventTaskExecutor")
    public Executor eventTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);
        executor.setMaxPoolSize(20);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("event-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }
}

// 비동기 핸들러
@Component
@RequiredArgsConstructor
@Slf4j
public class OrderNotificationHandler {

    private final NotificationService notificationService;

    @Async("eventTaskExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleOrderCompleted(OrderCompletedEvent event) {
        try {
            notificationService.sendOrderCompleteNotification(event.userId(), event.orderId());
        } catch (Exception e) {
            // @Async 사용 시 예외가 호출자에게 전파되지 않으므로 명시적 로깅 필수
            log.error("주문 완료 알림 발송 실패. orderId={}", event.orderId(), e);
        }
    }
}
```

`@Async`를 쓸 때 주의할 점이 있다. 예외가 호출 스레드로 전파되지 않기 때문에, 핸들러 내부에서 반드시 예외를 잡아 로그를 남겨야 한다. 그렇지 않으면 알림 발송 실패가 조용히 묻혀버린다.

---

## 이 구조가 동작하는 방식

```
OrderService                  Spring Event Bus
(발행자)                      (중간 브로커)
   │                               │
   │─── publishEvent(event) ──────>│
   │                               │──> OrderNotificationHandler
   │                               │──> PointEventHandler
   │                               │──> CouponEventHandler
   │                               │──> (미래에 추가될 핸들러들...)
```

`OrderService`는 `OrderCompletedEvent`만 발행하면 된다. 누가 구독하는지 알 필요가 없다.

---

## 한계: 이 방법이 맞지 않는 경우

Spring 기본 이벤트는 같은 JVM 안에서만 동작한다. 마이크로서비스 간 통신에는 Kafka나 RabbitMQ 같은 메시지 브로커가 필요하다.

그리고 이벤트 핸들러 간 실행 순서는 보장되지 않는다. 포인트 적립이 쿠폰 처리보다 반드시 먼저 돼야 한다는 순서 의존성이 있다면, 이벤트 방식보다는 다른 방법을 고려해야 한다.

---

## 마치며

Spring 이벤트의 핵심은 **발행자는 구독자를 모른다** — `OrderService`가 달라지지 않아도 새 기능을 추가할 수 있다면, 그게 진짜 OCP다.
