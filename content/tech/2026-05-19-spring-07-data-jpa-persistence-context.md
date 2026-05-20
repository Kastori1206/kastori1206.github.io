---
title: "[Spring 완전 정복 #7] Spring Data JPA — 영속성 컨텍스트와 N+1 문제 완전 정리"
date: 2026-05-19
draft: false
series: "Spring 완전 정복"
series_order: 7
series_total: 14
categories: ["Spring"]
tags: [spring, jpa, hibernate, orm, persistence-context, n+1, lazy-loading, java, backend]
description: "JPA 면접 단골 주제 두 가지 — 영속성 컨텍스트(Dirty Checking, 1차 캐시, 지연 쓰기)와 N+1 문제(원인과 해결책 3가지)를 코드와 함께 정리한다."
wiki_source: 10-wiki/tech/spring/06-spring-data-jpa.md
---

## JPA 면접 = 영속성 컨텍스트 + N+1

JPA 관련 면접 질문은 결국 두 가지로 수렴한다. "영속성 컨텍스트가 무엇인지 설명해보세요"와 "N+1 문제가 무엇이고 어떻게 해결하나요?"

이 두 가지를 이해하면 Dirty Checking, 지연 로딩, LazyInitializationException, N+1이 모두 연결된 하나의 그림으로 보인다.

---

## JPA / Hibernate / Spring Data JPA 관계

```text
JPA       : Java ORM 표준 인터페이스 (명세)
Hibernate : JPA의 대표 구현체 (Spring Boot 기본)
Spring Data JPA : JPA를 더 편리하게 추상화한 Spring 모듈

개발자 코드 → Spring Data JPA → JPA → Hibernate → JDBC → DB
```

---

## 영속성 컨텍스트 — JPA의 핵심

영속성 컨텍스트는 **Entity 객체를 관리하는 1차 저장소**다. 트랜잭션당 하나씩 생성된다.

### Entity 생명주기

```text
비영속  : new Order()  → 컨텍스트와 무관한 일반 객체
영속    : save() 또는 조회 후 → 컨텍스트가 관리, 변경 감지 적용
준영속  : 트랜잭션 종료 → 컨텍스트가 더 이상 관리 안 함
삭제    : delete() → DELETE 예약
```

### 1차 캐시

같은 트랜잭션 안에서 같은 Entity를 두 번 조회하면 DB를 두 번 치지 않는다.

```java
Order order1 = orderRepository.findById(1L); // DB 조회
Order order2 = orderRepository.findById(1L); // 1차 캐시에서 반환 — DB 조회 없음

order1 == order2 // true — 동일 객체 보장
```

### Dirty Checking — save() 없이 UPDATE

```java
@Transactional
public void updateOrder(Long id, String newStatus) {
    Order order = orderRepository.findById(id).get(); // 영속 상태
    order.setStatus(newStatus); // setter만 호출
    // save() 없어도 트랜잭션 종료 시 UPDATE 자동 실행
}
```

영속성 컨텍스트는 Entity를 조회할 때 스냅샷을 저장한다. 트랜잭션 종료 시 현재 상태와 스냅샷을 비교해 변경이 있으면 UPDATE를 자동으로 실행한다. 이것이 Dirty Checking이다.

`readOnly = true` 트랜잭션에서는 스냅샷을 저장하지 않아 성능이 향상된다. 조회 메서드에 `@Transactional(readOnly = true)`를 붙이는 이유다.

### 지연 쓰기 (Write-behind)

```java
@Transactional
public void saveOrders() {
    orderRepository.save(order1); // INSERT 예약
    orderRepository.save(order2); // INSERT 예약
    orderRepository.save(order3); // INSERT 예약
    // 트랜잭션 커밋 시 INSERT 3개 한번에 실행
}
```

쿼리를 모아뒀다가 커밋 직전에 한번에 DB로 보내 네트워크 왕복 횟수를 줄인다.

---

## 지연 로딩 — 필요할 때만 조회

```java
@Entity
public class Order {
    @ManyToOne(fetch = FetchType.LAZY)  // 지연 로딩
    @JoinColumn(name = "member_id")
    private Member member;
}
```

`FetchType.LAZY`는 Order를 조회해도 Member는 즉시 가져오지 않는다. `order.getMember()`를 호출하는 순간 DB 조회가 발생한다.

**기본값 주의**: `@ManyToOne`, `@OneToOne`의 기본값은 `EAGER`(즉시 로딩)다. 필요한 연관 데이터를 항상 함께 가져와 N+1을 유발할 수 있다. **항상 LAZY로 명시적으로 변경하는 것을 권장한다.**

### LazyInitializationException

```java
@Transactional
public Order getOrder(Long id) {
    return orderRepository.findById(id).get();
} // 트랜잭션 종료 → 영속성 컨텍스트 닫힘

// 컨트롤러에서
Order order = orderService.getOrder(1L);
order.getMember().getName(); // LazyInitializationException!
```

트랜잭션이 끝나면 영속성 컨텍스트가 닫힌다. 이 상태에서 LAZY 로딩을 시도하면 컨텍스트가 없어 예외가 발생한다. 해결책은 트랜잭션 안에서 필요한 데이터를 미리 로딩하거나 Fetch Join을 쓰는 것이다.

---

## N+1 문제 — JPA의 가장 흔한 함정

### 원인

```java
List<Order> orders = orderRepository.findAll(); // 쿼리 1번 (N개 Order 조회)

for (Order order : orders) {
    System.out.println(order.getMember().getName()); // 주문마다 Member 조회 N번
}
// 총 1 + N번 쿼리
```

Order가 100개면 쿼리가 101번 실행된다. 이것이 N+1 문제다.

### 해결 방법 1: Fetch Join

```java
@Query("SELECT o FROM Order o JOIN FETCH o.member")
List<Order> findAllWithMember();
```

```sql
-- 실행 쿼리 (1번)
SELECT o.*, m.* FROM orders o INNER JOIN member m ON o.member_id = m.id
```

Order와 Member를 JOIN 한 번으로 가져온다. 단, `@OneToMany` 컬렉션 Fetch Join + 페이징은 메모리에서 처리하므로 위험하다.

### 해결 방법 2: @EntityGraph

```java
@EntityGraph(attributePaths = {"member"})
@Query("SELECT o FROM Order o")
List<Order> findAllWithMember();
```

Fetch Join과 동일하게 동작하지만 어노테이션으로 간결하게 표현.

### 해결 방법 3: @BatchSize (컬렉션 + 페이징)

```java
@BatchSize(size = 100)
@OneToMany(mappedBy = "order")
private List<OrderItem> items;
```

```sql
-- N번 쿼리 대신 IN절로 묶어서 실행
SELECT * FROM order_item WHERE order_id IN (1, 2, 3, ..., 100)
```

`default_batch_fetch_size`를 전역 설정하면 모든 컬렉션에 적용된다.

```yaml
spring:
  jpa:
    properties:
      hibernate:
        default_batch_fetch_size: 100
```

**컬렉션 페이징 + 연관 데이터 조회**에 가장 실용적인 해결책이다.

### 선택 기준

```text
ToOne 관계 (ManyToOne, OneToOne) → Fetch Join / @EntityGraph
컬렉션 + 페이징 필요             → @BatchSize (전역 설정 권장)
복잡한 조회                       → QueryDSL + Fetch Join
```

---

## 연관관계 주인 — mappedBy 규칙

양방향 관계에서 외래 키를 관리하는 쪽이 **연관관계의 주인**이다.

```java
// Order (주인) — @JoinColumn 있음, 외래 키 실제 관리
@ManyToOne
@JoinColumn(name = "member_id")
private Member member;

// Member (주인 아님) — mappedBy로 읽기 전용 선언
@OneToMany(mappedBy = "member")
private List<Order> orders = new ArrayList<>();
```

**주인에게만 값을 설정해야 DB에 반영된다.**

```java
order.setMember(member);          // DB에 반영됨 ← 주인
member.getOrders().add(order);    // DB 반영 안 됨 (읽기 전용)
```

---

## 실무 활용 — Entity Auditing

생성일시·수정일시를 자동 관리한다. 거의 모든 Entity에 적용하는 패턴이다.

```java
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseEntity {
    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}

@Entity
public class Order extends BaseEntity { ... }
```

`@SpringBootApplication`에 `@EnableJpaAuditing`을 추가하면 된다.

---

## 마치며

영속성 컨텍스트를 이해하면 JPA의 동작 방식이 논리적으로 연결된다.

- **Dirty Checking**: 스냅샷 비교 → save() 없이 UPDATE
- **1차 캐시**: 같은 트랜잭션 내 동일 Entity 재조회 최적화
- **N+1**: LAZY 로딩이 반복 호출될 때 발생 → Fetch Join, @BatchSize로 해결
- **LazyInitializationException**: 트랜잭션 밖에서 LAZY 로딩 시도 → 트랜잭션 안에서 미리 로딩

다음 편에서는 Spring 쿼리 기술 — JPQL, Criteria API, QueryDSL을 비교한다.
