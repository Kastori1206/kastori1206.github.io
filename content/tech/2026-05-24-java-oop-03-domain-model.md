---
title: "엔티티에 setter가 있다면 — 빈약한 도메인 모델을 풍부하게 만드는 법"
date: 2026-05-24
draft: false
target_section: tech
series: "Java 객체지향 실전"
series_order: 3
tags: [java, oop, spring, design-pattern]
description: "비즈니스 로직이 Service에 흩어지는 빈약한 도메인 모델의 문제를 짚고, 엔티티가 스스로 상태를 검증하는 풍부한 도메인 모델로 전환하는 방법을 안내한다."
wiki_source: 10-wiki/tech/java-oop-patterns/03-domain-model.md
categories: [Java]
---

## 이런 코드, 불안하지 않나요?

주문 취소 API를 만들었다. Service 코드는 이렇다.

```java
public void cancelOrder(Long orderId) {
    Order order = orderRepository.findById(orderId)
        .orElseThrow(() -> new EntityNotFoundException("주문을 찾을 수 없습니다."));

    if (order.getStatus() == OrderStatus.SHIPPED) {
        throw new IllegalStateException("배송 중인 주문은 취소할 수 없습니다.");
    }
    if (order.getStatus() == OrderStatus.CANCELLED) {
        throw new IllegalStateException("이미 취소된 주문입니다.");
    }

    order.setStatus(OrderStatus.CANCELLED);
    order.setCancelledAt(LocalDateTime.now());
    orderRepository.save(order);
}
```

여기서 질문 하나. 나중에 배치 처리에서도 주문을 취소해야 한다면? 관리자 기능에서도 취소를 해야 한다면? 그때마다 저 `if` 블록을 복붙해야 한다. 그리고 언젠가 취소 규칙이 바뀌면, 모든 복붙 지점을 찾아서 고쳐야 한다.

이것이 **빈약한 도메인 모델(Anemic Domain Model)**의 문제다. Martin Fowler는 이를 안티패턴이라고 불렀다.

---

## 빈약한 도메인 모델이란?

엔티티는 데이터 컨테이너(getter/setter만 있음)이고, 비즈니스 로직은 전부 Service에 집중된 구조다.

```java
// Order.java — 빈약한 도메인 (Anemic)
@Entity
@Getter @Setter  // setter가 열려 있어 어디서든 상태 변경 가능
@NoArgsConstructor
public class Order {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;

    @Enumerated(EnumType.STRING)
    private OrderStatus status;   // PENDING, PAID, CANCELLED, SHIPPED

    private long totalAmount;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL)
    private List<OrderItem> items = new ArrayList<>();

    private LocalDateTime orderedAt;
    private LocalDateTime cancelledAt;
    // 비즈니스 메서드 없음. 그냥 데이터 덩어리.
}
```

`@Setter`가 열려 있으면 어디서든 `order.setStatus(OrderStatus.CANCELLED)`를 호출할 수 있다. 취소 가능 여부를 검증하지 않고도. 이것이 캡슐화가 깨진 상태다.

---

## 풍부한 도메인 모델로 전환하기

풍부한 도메인 모델은 간단한 원칙을 따른다. **"객체 자신의 상태는 객체 스스로가 변경한다."**

### setter를 없애고 커맨드 메서드를 만든다

```java
// Order.java — 풍부한 도메인 (Rich)
@Entity
@Table(name = "orders")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)  // JPA 전용, 외부에서 new Order() 불가
public class Order extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;

    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    private long totalAmount;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderItem> items = new ArrayList<>();

    private LocalDateTime orderedAt;
    private LocalDateTime cancelledAt;

    // ── 생성 ─────────────────────────────────────────────
    // 정적 팩토리 메서드 — 생성 시점의 불변식 보장
    public static Order place(Long userId) {
        Order order = new Order();
        order.userId = userId;
        order.status = OrderStatus.PENDING;
        order.totalAmount = 0L;
        order.orderedAt = LocalDateTime.now();
        return order;
    }

    // ── 커맨드 메서드 ────────────────────────────────────

    /**
     * 주문 취소.
     * 비즈니스 규칙: SHIPPED, CANCELLED 상태에서는 취소 불가.
     */
    public void cancel() {
        validateCancellable();
        this.status = OrderStatus.CANCELLED;
        this.cancelledAt = LocalDateTime.now();
    }

    /**
     * 주문 아이템 추가.
     * 비즈니스 규칙: PENDING 상태에서만 추가 가능.
     */
    public void addItem(Long productId, String productName, long price, int quantity) {
        validatePending();
        if (quantity <= 0) {
            throw new IllegalArgumentException("수량은 1개 이상이어야 합니다.");
        }
        OrderItem item = OrderItem.of(this, productId, productName, price, quantity);
        this.items.add(item);
        this.totalAmount += price * quantity;
    }

    /**
     * 결제 완료 처리.
     */
    public void pay() {
        if (this.status != OrderStatus.PENDING) {
            throw new IllegalStateException("대기 중인 주문만 결제할 수 있습니다.");
        }
        if (this.items.isEmpty()) {
            throw new IllegalStateException("주문 항목이 없습니다.");
        }
        this.status = OrderStatus.PAID;
    }

    // ── 내부 검증 (private) ──────────────────────────────

    private void validateCancellable() {
        if (this.status == OrderStatus.SHIPPED) {
            throw new IllegalStateException("배송 중인 주문은 취소할 수 없습니다.");
        }
        if (this.status == OrderStatus.CANCELLED) {
            throw new IllegalStateException("이미 취소된 주문입니다.");
        }
    }

    private void validatePending() {
        if (this.status != OrderStatus.PENDING) {
            throw new IllegalStateException("대기 중인 주문에만 상품을 추가할 수 있습니다.");
        }
    }
}
```

취소 가능 여부 검증이 `Order.cancel()` 내부에 있다. 배치에서 취소하든, 관리자 API에서 취소하든, 어디서 `order.cancel()`을 호출해도 규칙은 반드시 거친다.

### Service는 흐름만 담당한다

```java
@Service
@RequiredArgsConstructor
@Transactional
public class OrderService {

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;

    public Order placeOrder(Long userId, List<OrderItemRequest> itemRequests) {
        Order order = Order.place(userId);   // 생성 책임은 Order에게

        for (OrderItemRequest req : itemRequests) {
            Product product = productRepository.findById(req.getProductId())
                .orElseThrow(() -> new EntityNotFoundException("상품 없음: " + req.getProductId()));

            order.addItem(product.getId(), product.getName(),
                          product.getPrice(), req.getQuantity());
        }

        return orderRepository.save(order);
    }

    public void cancelOrder(Long orderId) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new EntityNotFoundException("주문 없음: " + orderId));

        order.cancel();   // 취소 가능 여부 판단은 Order가 담당
        // @Transactional + 영속성 컨텍스트 변경 감지로 save() 불필요
    }

    public void payOrder(Long orderId) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new EntityNotFoundException("주문 없음: " + orderId));

        order.pay();   // 결제 가능 여부 판단은 Order가 담당
    }
}
```

Service 코드가 거짓말처럼 짧아졌다. `if` 블록이 없다. Service는 "어떤 순서로 무엇을 호출할지"만 결정한다.

---

## 테스트가 엄청나게 쉬워진다

빈약한 도메인 모델에서는 `OrderService`를 테스트하려면 `OrderRepository`, `ProductRepository`를 모두 Mock으로 세팅해야 했다. 풍부한 도메인 모델에서는 도메인 객체만 단독으로 테스트할 수 있다.

```java
class OrderTest {

    @Test
    void 주문_생성_후_아이템_추가() {
        Order order = Order.place(1L);
        order.addItem(10L, "티셔츠", 30_000L, 2);

        assertThat(order.getTotalAmount()).isEqualTo(60_000L);
        assertThat(order.getItems()).hasSize(1);
    }

    @Test
    void 배송중_주문_취소_불가() {
        Order order = Order.place(1L);
        order.addItem(10L, "티셔츠", 30_000L, 1);
        order.pay();
        ReflectionTestUtils.setField(order, "status", OrderStatus.SHIPPED);

        assertThatThrownBy(order::cancel)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("배송 중인 주문은 취소할 수 없습니다");
    }

    @Test
    void 결제완료_주문에_아이템_추가_불가() {
        Order order = Order.place(1L);
        order.addItem(10L, "티셔츠", 30_000L, 1);
        order.pay();

        assertThatThrownBy(() -> order.addItem(20L, "바지", 50_000L, 1))
            .isInstanceOf(IllegalStateException.class);
    }
}
```

Spring Context 없이, Mock 없이, 순수 Java로 비즈니스 규칙을 테스트한다.

---

## 한 단계 더: Value Object로 원시 타입 집착 해소

원시 타입 `long price`는 타입 시스템이 도메인 개념을 표현하지 못한다. `pay(long price, long discount, long shippingFee)`처럼 파라미터가 늘어나면 순서 실수가 생긴다.

Value Object는 **불변(immutable)**이고 **값 기반 동등성**을 가진다.

```java
@Getter
@EqualsAndHashCode
public final class Money {

    private final long amount;
    private final Currency currency;

    private Money(long amount, Currency currency) {
        if (amount < 0) {
            throw new IllegalArgumentException("금액은 0 이상이어야 합니다: " + amount);
        }
        this.amount = amount;
        this.currency = currency;
    }

    public static Money krw(long amount) {
        return new Money(amount, Currency.KRW);
    }

    public Money add(Money other) {
        validateSameCurrency(other);
        return new Money(this.amount + other.amount, this.currency);
    }

    public Money subtract(Money other) {
        validateSameCurrency(other);
        long result = this.amount - other.amount;
        if (result < 0) {
            throw new IllegalStateException("금액이 부족합니다.");
        }
        return new Money(result, this.currency);
    }

    public Money multiply(int multiplier) {
        return new Money(this.amount * multiplier, this.currency);
    }

    private void validateSameCurrency(Money other) {
        if (this.currency != other.currency) {
            throw new IllegalArgumentException("통화가 다릅니다.");
        }
    }
}
```

`Money.krw(30_000).add(Money.krw(5_000))`는 `30000 + 5000` 보다 훨씬 의도가 명확하다. 검증 로직도 `Money` 생성자 안에 있어서 음수 금액이 만들어질 수 없다.

JPA 엔티티에 쓸 때는 `@Embeddable`을 붙이면 된다.

```java
@Embeddable
@Getter
@EqualsAndHashCode
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public final class Address {
    private String zipCode;
    private String street;
    private String detail;

    public Address(String zipCode, String street, String detail) {
        if (zipCode == null || !zipCode.matches("\\d{5}")) {
            throw new IllegalArgumentException("올바른 우편번호 형식이 아닙니다: " + zipCode);
        }
        this.zipCode = Objects.requireNonNull(zipCode);
        this.street = Objects.requireNonNull(street, "도로명주소는 필수입니다.");
        this.detail = detail;
    }
}
```

```java
@Entity
public class User extends BaseEntity {

    @Embedded
    private Address address;  // 테이블에는 zip_code, street, detail 컬럼으로 펼쳐짐

    public void changeAddress(Address newAddress) {
        this.address = Objects.requireNonNull(newAddress);
    }
}
```

---

## 빈약한 도메인 vs 풍부한 도메인 비교

| 항목 | 빈약한 도메인 | 풍부한 도메인 |
|------|-------------|-------------|
| 비즈니스 규칙 위치 | Service (여러 곳에 흩어짐) | 엔티티 메서드 내부 |
| setter | 열려 있음 (누구나 상태 변경) | 없음, 커맨드 메서드만 |
| 단위 테스트 | Service + Mock 세팅 필요 | 도메인 객체 단독 테스트 |
| 규칙 중복 | 여러 Service에서 같은 검증 반복 | 엔티티에 단 한 번 |
| 가독성 | `orderService.cancel()` → 내부 로직 추적 필요 | `order.cancel()` → 의도 명확 |

---

## 마치며

**비즈니스 규칙은 그 규칙의 주인인 도메인 객체 안에 있어야 한다.** setter를 닫고, 커맨드 메서드를 열고, Service는 흐름을 조율하는 데에만 집중하자. 규칙을 찾으러 Service 여러 개를 뒤질 필요가 없어진다.
