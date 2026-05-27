---
title: "[Java 객체지향 실전 #6] 이 코드, 어느 계층에 있어야 할까? — Spring 계층별 책임 분리"
date: 2026-05-27
draft: false
target_section: tech
series: "Java 객체지향 실전"
series_order: 6
tags: [java, oop, spring, design-pattern]
description: "Controller, Service, Domain, Repository 각 계층이 무엇을 해야 하고 무엇을 하지 말아야 하는지, 흔한 위반 패턴과 해결책을 정리한다."
wiki_source: 10-wiki/tech/java-oop-patterns/06-layer-responsibility.md
categories: [Java]
---

## 이런 코드 본 적 있지 않나요?

코드 리뷰를 하다 보면 자주 마주치는 장면이 있다.

`OrderController`에 잔액 검증 로직이 있고, `OrderService`에 JPQL 쿼리가 직접 박혀있고, `Order` 엔티티는 `@Getter @Setter`만 있는 데이터 덩어리다.

각각 따로 보면 "뭐, 작동은 하잖아"라고 넘어갈 수 있다. 그런데 프로젝트가 6개월, 1년 지나면 이 결정들의 대가를 치르게 된다. 할인 로직을 바꾸려는데 Controller 3개를 열어야 하고, Service 테스트를 짜려는데 Mock이 5개 필요하다.

---

## 계층별 책임 한눈에 보기

Spring의 레이어드 아키텍처에서 각 계층이 가져야 할 책임과 가지면 안 되는 것들이 있다.

```
┌───────────────────────────────────────────────────────┐
│  Controller  │  요청/응답 직렬화, 인증/인가 확인       │
│              │  ❌ 비즈니스 로직 절대 금지              │
├───────────────────────────────────────────────────────┤
│  Service     │  유스케이스 조율, 트랜잭션 경계          │
│              │  ❌ DB 쿼리 직접 작성 금지               │
├───────────────────────────────────────────────────────┤
│  Domain      │  핵심 비즈니스 규칙, 상태 변경, 불변식  │
│  (Entity)    │  ❌ 인프라/외부 의존 절대 금지           │
├───────────────────────────────────────────────────────┤
│  Repository  │  영속성 관심사만                        │
│              │  ❌ 비즈니스 로직 금지                   │
└───────────────────────────────────────────────────────┘
```

하나씩 살펴보자.

---

## Controller 계층

### 책임

- HTTP 요청을 도메인 객체/커맨드로 변환
- 서비스 호출 결과를 HTTP 응답으로 직렬화
- `@PreAuthorize` 등으로 인증/인가 확인
- 입력값 기본 검증 (`@Valid`)

### 나쁜 코드: 비즈니스 로직이 Controller에 있다

```java
@RestController
@RequiredArgsConstructor
public class OrderController {

    private final OrderRepository orderRepository;  // ❌ Repository 직접 접근
    private final UserRepository userRepository;

    @PostMapping("/orders")
    public ResponseEntity<OrderResponse> createOrder(
        @RequestBody OrderCreateRequest request,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        User user = userRepository.findById(principal.getId()).orElseThrow();

        // ❌ 비즈니스 로직이 Controller에 있음
        if (user.getBalance() < request.getTotalAmount()) {
            throw new InsufficientBalanceException("잔액 부족");
        }

        Order order = new Order(user, request.getItems(), request.getTotalAmount());
        orderRepository.save(order);

        user.setBalance(user.getBalance() - request.getTotalAmount()); // ❌ 잔액 차감 로직
        userRepository.save(user);

        return ResponseEntity.ok(OrderResponse.from(order));
    }
}
```

이 잔액 검증 로직을 나중에 모바일 API에서도 써야 한다면? 복사해야 한다. 검증 기준이 바뀌면 두 곳을 찾아야 한다.

### 좋은 코드: Controller는 변환과 위임만

```java
@RestController
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    @PostMapping("/orders")
    @PreAuthorize("isAuthenticated()")  // 인가는 Controller 책임
    public ResponseEntity<OrderResponse> createOrder(
        @RequestBody @Valid OrderCreateRequest request,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        // 요청 역직렬화 → 서비스 호출 → 응답 직렬화만 담당
        OrderCreateCommand command = request.toCommand(principal.getId());
        Order order = orderService.createOrder(command);
        return ResponseEntity.ok(OrderResponse.from(order));
    }
}
```

DTO에 변환 책임을 주면 Controller 코드가 더 간결해진다.

```java
public record OrderCreateRequest(
    @NotNull Long productId,
    @Min(1) Integer quantity,
    Long couponId
) {
    // DTO → Command 변환 책임을 DTO 자체에 위임
    public OrderCreateCommand toCommand(Long userId) {
        return new OrderCreateCommand(userId, productId, quantity, couponId);
    }
}

public record OrderResponse(
    Long orderId,
    String status,
    Long totalAmount,
    LocalDateTime createdAt
) {
    public static OrderResponse from(Order order) {
        return new OrderResponse(
            order.getId(),
            order.getStatus().name(),
            order.getTotalAmount(),
            order.getCreatedAt()
        );
    }
}
```

---

## Service 계층

### 책임

- 유스케이스 조율: 도메인 객체와 Repository를 조합해 비즈니스 흐름 구성
- 트랜잭션 경계 선언 (`@Transactional`)
- 이벤트 발행

### 나쁜 코드: SQL 로직이 Service에 있다

```java
@Service
@RequiredArgsConstructor
@Transactional
public class OrderService {

    private final EntityManager em;

    public List<Order> getRecentOrders(Long userId) {
        // ❌ JPQL 쿼리가 Service에 직접 있음
        return em.createQuery(
            "SELECT o FROM Order o WHERE o.userId = :userId " +
            "AND o.createdAt >= :since " +
            "ORDER BY o.createdAt DESC",
            Order.class
        )
        .setParameter("userId", userId)
        .setParameter("since", LocalDateTime.now().minusDays(30))
        .getResultList();
    }

    public void completeOrder(Long orderId) {
        Order order = em.find(Order.class, orderId);

        // ❌ 비즈니스 규칙이 Service에 있음 (도메인 객체가 처리해야 함)
        if (!order.getStatus().equals(OrderStatus.PAYMENT_COMPLETED)) {
            throw new InvalidOrderStatusException("결제 완료 상태에서만 주문 확정 가능");
        }
        order.setStatus(OrderStatus.CONFIRMED);
        order.setConfirmedAt(LocalDateTime.now());
    }
}
```

### 좋은 코드: Service는 흐름만 조율한다

```java
@Service
@RequiredArgsConstructor
@Transactional
public class OrderService {

    private final OrderRepository orderRepository;
    private final UserRepository userRepository;
    private final ApplicationEventPublisher eventPublisher;

    // 유스케이스: 주문 생성 흐름 조율
    public Order createOrder(OrderCreateCommand command) {
        User user = userRepository.findById(command.userId())
            .orElseThrow(() -> new UserNotFoundException(command.userId()));

        Product product = productRepository.findById(command.productId())
            .orElseThrow(() -> new ProductNotFoundException(command.productId()));

        // 비즈니스 로직은 도메인 객체에게 위임
        Order order = Order.create(user, product, command.quantity());

        orderRepository.save(order);

        eventPublisher.publishEvent(OrderCreatedEvent.from(order));

        return order;
    }

    // 유스케이스: 주문 확정
    public Order confirmOrder(Long orderId) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));

        // 상태 전이 규칙은 도메인 객체가 안다
        order.confirm();

        return order;  // JPA dirty checking으로 자동 저장
    }

    // 쿼리는 Repository에 위임
    @Transactional(readOnly = true)
    public List<Order> getRecentOrders(Long userId) {
        return orderRepository.findRecentByUserId(userId, LocalDateTime.now().minusDays(30));
    }
}
```

---

## Domain/Entity 계층

### 책임

- 핵심 비즈니스 규칙 ("주문은 결제 완료 상태에서만 확정 가능하다")
- 불변식 유지 (도메인 객체가 항상 유효한 상태임을 보장)
- 값 계산 (총 금액, 할인 금액 등)

### 나쁜 코드: 엔티티가 데이터 덩어리에 불과하다

```java
@Entity
@Getter
@Setter  // ❌ setter 전부 공개 — 불변식 보장 불가
public class Order {
    @Id @GeneratedValue
    private Long id;
    private Long userId;
    private OrderStatus status;
    private Long totalAmount;
    // ❌ 비즈니스 메서드 없음 — 로직이 Service로 흘러나감
}
```

이 엔티티는 상태를 바꾸는 규칙을 하나도 모른다. `setStatus(OrderStatus.CONFIRMED)`를 결제 전에 호출해도 막을 방법이 없다.

### 좋은 코드: 도메인 객체가 규칙을 수행한다

```java
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)  // JPA용 기본 생성자만 허용
public class Order {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    private Long totalAmount;
    private LocalDateTime confirmedAt;

    // 팩토리 메서드: 유효한 초기 상태 보장
    public static Order create(User user, Product product, int quantity) {
        product.validateStock(quantity);  // 재고 확인도 도메인 규칙

        Order order = new Order();
        order.status = OrderStatus.CREATED;
        order.totalAmount = product.calculatePrice(quantity);
        return order;
    }

    // 상태 전이: 비즈니스 규칙을 도메인 객체가 직접 수행
    public void confirm() {
        validateStatusIs(OrderStatus.PAYMENT_COMPLETED, "결제 완료 상태에서만 주문 확정 가능");
        this.status = OrderStatus.CONFIRMED;
        this.confirmedAt = LocalDateTime.now();
    }

    public void cancel() {
        if (this.status == OrderStatus.SHIPPED || this.status == OrderStatus.DELIVERED) {
            throw new OrderCancellationException("배송 후에는 취소 불가");
        }
        this.status = OrderStatus.CANCELLED;
    }

    // 값 계산: 도메인 객체 내부에서 처리
    public long calculateDiscountedAmount(Coupon coupon) {
        return coupon.apply(this.totalAmount);
    }

    private void validateStatusIs(OrderStatus expected, String message) {
        if (this.status != expected) {
            throw new InvalidOrderStatusException(message + " (현재: " + this.status + ")");
        }
    }
}
```

`order.confirm()`을 호출하면, 상태가 맞지 않으면 스스로 예외를 던진다. Service가 알 필요 없다.

---

## Repository 계층

### 책임

- 영속성 관심사만 (DB 저장/조회/삭제)
- 복잡한 쿼리를 메서드 뒤로 캡슐화
- 도메인 언어로 메서드 이름 표현

### 나쁜 코드: 비즈니스 판단이 Repository에 있다

```java
@Repository
public class OrderRepository {

    // ❌ 배송 자격 비즈니스 규칙이 Repository에 하드코딩
    public List<Order> findOrdersEligibleForShipping() {
        return em.createQuery(
            "SELECT o FROM Order o WHERE o.status = 'CONFIRMED' " +
            "AND o.totalAmount >= 50000 " +  // 무료배송 기준이 Repository에 있음
            "AND o.user.grade = 'VIP'",      // VIP 조건이 Repository에 있음
            Order.class
        ).getResultList();
    }
}
```

무료배송 기준이 50,000원에서 30,000원으로 바뀌면 Repository를 찾아가야 한다. 비즈니스 기준이 왜 DB 접근 코드 안에 있는 걸까?

### 좋은 코드: Repository는 조회만, 기준값은 파라미터로

```java
public interface OrderRepository extends JpaRepository<Order, Long> {

    List<Order> findByUserIdAndStatus(Long userId, OrderStatus status);

    // 비즈니스 기준값은 파라미터로 받음 — 기준 결정은 Service/Domain 책임
    @Query("SELECT o FROM Order o WHERE o.userId = :userId AND o.createdAt >= :since")
    List<Order> findRecentByUserId(
        @Param("userId") Long userId,
        @Param("since") LocalDateTime since
    );

    Page<Order> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);
}

// 복잡한 동적 쿼리는 QueryDSL로 분리
@Repository
@RequiredArgsConstructor
public class OrderQueryRepository {

    private final JPAQueryFactory queryFactory;

    public List<Order> findOrdersForShipping(OrderShippingCondition condition) {
        // 배송 대상 조건은 Service가 결정해서 파라미터로 전달
        return queryFactory
            .selectFrom(order)
            .where(
                order.status.eq(OrderStatus.CONFIRMED),
                condition.getMinAmount() != null
                    ? order.totalAmount.goe(condition.getMinAmount())
                    : null
            )
            .fetch();
    }
}
```

---

## "이 코드 어디에 넣어야 하지?" 판단 기준

코드를 작성할 때 이 질문을 순서대로 던져보면 계층이 명확해진다.

```
1. HTTP, JSON과 관련 있는가?
   → YES: Controller

2. 도메인 규칙인가? (불변식, 상태 전이, 값 계산)
   "이 규칙이 DB나 프레임워크 없이도 성립하는가?"
   → YES: Domain/Entity

3. DB에 저장하거나 조회하는 코드인가?
   → YES: Repository

4. 여러 도메인 객체/Repository를 조합하는 흐름인가?
   → YES: Service
```

| 질문 | 속하는 계층 |
|------|------------|
| 이 사용자가 이 요청을 할 수 있나? | Controller |
| 주문 총 금액은 어떻게 계산하나? | Domain |
| 결제 완료된 주문만 확정 가능하다 | Domain |
| 최근 30일 주문을 가져온다 | Repository |
| 주문 생성 시 포인트를 적립한다 | Service |
| 트랜잭션 경계를 어디에 둘까? | Service |

---

## 흔한 계층 위반 패턴 세 가지

**안티패턴 1: Fat Controller — 비즈니스 로직이 Controller에**

```java
// ❌ 할인 조건이 Controller에
@PostMapping("/discount")
public ResponseEntity<OrderResponse> applyDiscount(...) {
    if (order.getTotalAmount() > 100000) {
        order.setDiscountAmount(order.getTotalAmount() * 0.1);
    }
}

// ✅ Domain 메서드로 이동
order.applyVolumeDiscount();
```

**안티패턴 2: Anemic Domain Model — 엔티티가 setter만 가진 데이터 구조체**

```java
// ❌ 상태 변경 규칙이 없음
order.setStatus(OrderStatus.CONFIRMED);
order.setConfirmedAt(LocalDateTime.now());

// ✅ 도메인 메서드로 상태 전이
order.confirm();
```

**안티패턴 3: Smart Repository — 비즈니스 규칙이 Repository에**

```java
// ❌ 비즈니스 기준이 Repository에
List<Order> eligibleOrders = orderRepository.findEligibleForVipDiscount();

// ✅ Service에서 조건 결정, Repository는 조회만
List<Order> confirmedOrders = orderRepository.findByStatus(OrderStatus.CONFIRMED);
List<Order> eligibleOrders = confirmedOrders.stream()
    .filter(Order::isEligibleForVipDiscount)  // 도메인 메서드
    .collect(toList());
```

---

## 언제부터 리팩토링해야 할까?

계층 책임 분리는 처음엔 "이 정도 프로젝트에 이게 필요한가?" 싶을 수 있다. 하지만 징후가 보이기 시작하면 미루면 안 된다.

- Service 메서드가 100줄을 넘기 시작하면 → Domain 계층으로 로직을 내려야 한다는 신호
- Controller에서 여러 Repository를 직접 접근하면 → Service 계층으로 올려야 한다는 신호
- 단위 테스트에 Mock이 5개 이상 필요하면 → 계층 분리가 안 된 것

계층 책임 분리가 없는 코드베이스는 프로젝트가 커질수록 변경 비용이 기하급수적으로 늘어난다. 이 규칙은 "좋은 코드를 위해" 지키는 게 아니라, "미래의 내가 편하게 일하기 위해" 지키는 것이다.

---

## 마치며

계층 분리의 핵심은 단 하나 — **각 계층이 자신의 관심사만 가질 때, 변경이 한 곳에만 영향을 준다.**
