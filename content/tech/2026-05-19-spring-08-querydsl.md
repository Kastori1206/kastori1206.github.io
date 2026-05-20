---
title: "[Spring 완전 정복 #8] QueryDSL이 실무 표준인 이유 — JPQL의 한계와 타입 안전한 동적 쿼리"
date: 2026-05-19
draft: false
series: "Spring 완전 정복"
series_order: 8
series_total: 14
categories: ["Spring"]
tags: [spring, jpa, jpql, querydsl, java, backend]
description: "JPQL의 문자열 한계를 QueryDSL이 어떻게 해결하는지, BooleanExpression 동적 쿼리 패턴, @QueryProjection DTO 조회, 페이징 최적화까지 실전 코드로 정리한다."
wiki_source: 10-wiki/tech/spring/06a-spring-query-technologies.md
---

## JPQL의 불편함 — 오타가 런타임에 터진다

JPA Repository의 쿼리 메서드로 해결되지 않는 복잡한 조회는 `@Query`로 JPQL을 직접 작성한다.

```java
@Query("SELECT o FROM Order o WHERE o.member.id = :memberId AND o.status = :status")
List<Order> findByMemberAndStatus(@Param("memberId") Long memberId,
                                   @Param("status") OrderStatus status);
```

이 방식의 문제가 있다.

**컴파일 타임에 오류를 잡을 수 없다.** `o.member.id`를 `o.member.idx`로 오타를 내도 컴파일은 된다. 런타임에 쿼리가 실행되는 순간에야 오류가 난다.

**동적 쿼리가 불편하다.** 조건이 있을 수도 없을 수도 있는 검색 기능을 JPQL로 만들려면 조건마다 쿼리 문자열을 조합해야 한다.

**리팩터링에 취약하다.** 엔티티 필드명을 바꾸면 문자열 안의 JPQL도 직접 찾아서 수정해야 한다.

QueryDSL은 이 문제를 해결한다.

---

## QueryDSL이란

QueryDSL은 Java 코드로 SQL처럼 읽히는, 타입 안전한 쿼리를 작성하게 해주는 라이브러리다.

빌드 시 엔티티 클래스로부터 **Q클래스를 자동 생성**한다. `Order` 엔티티가 있으면 `QOrder`가 생성된다. Q클래스의 필드는 엔티티 필드와 1:1 대응한다.

```java
QOrder order = QOrder.order;
QMember member = QMember.member;

// 자바 코드로 쿼리를 작성 — 컴파일 타임 타입 체크
queryFactory
    .selectFrom(order)
    .join(order.member, member).fetchJoin()
    .where(order.status.eq(OrderStatus.COMPLETED))
    .orderBy(order.createdAt.desc())
    .fetch();
```

`order.status.eq(OrderStatus.COMPLETED)` — `order.status`는 Q클래스의 타입 안전한 필드다. 오타를 내면 컴파일 오류가 발생한다.

---

## 기본 설정

```xml
<dependency>
    <groupId>com.querydsl</groupId>
    <artifactId>querydsl-jpa</artifactId>
    <classifier>jakarta</classifier>
</dependency>
```

```java
@Configuration
public class QueryDslConfig {
    @Bean
    public JPAQueryFactory jpaQueryFactory(EntityManager em) {
        return new JPAQueryFactory(em);
    }
}
```

---

## 동적 쿼리 — QueryDSL의 핵심 강점

검색 조건이 선택적으로 적용되는 동적 쿼리가 QueryDSL의 진짜 강점이다.

```java
@Repository
@RequiredArgsConstructor
public class OrderQueryRepository {
    private final JPAQueryFactory queryFactory;

    public List<Order> findByCondition(OrderSearchCondition cond) {
        return queryFactory
            .selectFrom(order)
            .join(order.member, member).fetchJoin()
            .where(
                statusEq(cond.getStatus()),
                memberIdEq(cond.getMemberId())
            )
            .fetch();
    }

    // BooleanExpression — null 반환 시 WHERE 조건에서 자동 제외
    private BooleanExpression statusEq(OrderStatus status) {
        return status != null ? order.status.eq(status) : null;
    }

    private BooleanExpression memberIdEq(Long memberId) {
        return memberId != null ? order.member.id.eq(memberId) : null;
    }
}
```

`BooleanExpression`을 반환하는 메서드로 분리하면 두 가지 이점이 있다. null을 반환하면 WHERE 조건에서 자동으로 제외된다. 그리고 이 조건 메서드를 여러 쿼리에서 **재사용**할 수 있다.

---

## DTO 직접 조회 — 필요한 필드만

엔티티 전체가 아닌 필요한 컬럼만 DTO로 조회할 때 `@QueryProjection`을 사용한다.

```java
@QueryProjection  // DTO 생성자에 붙이면 QOrderSummary 자동 생성
public class OrderSummary {
    private Long orderId;
    private String memberName;
    private OrderStatus status;

    @QueryProjection
    public OrderSummary(Long orderId, String memberName, OrderStatus status) { ... }
}
```

```java
public List<OrderSummary> findSummary(OrderStatus status) {
    return queryFactory
        .select(new QOrderSummary(
            order.id,
            order.member.name,
            order.status
        ))
        .from(order)
        .join(order.member, member)
        .where(statusEq(status))
        .fetch();
}
```

DTO 생성자 파라미터도 타입 안전하게 체크된다.

---

## 페이징 최적화

```java
public Page<OrderSummary> findSummaryPage(OrderStatus status, Pageable pageable) {
    List<OrderSummary> content = queryFactory
        .select(new QOrderSummary(order.id, order.member.name, order.status))
        .from(order)
        .join(order.member, member)
        .where(statusEq(status))
        .offset(pageable.getOffset())
        .limit(pageable.getPageSize())
        .fetch();

    // count 쿼리 분리 (최적화)
    JPAQuery<Long> countQuery = queryFactory
        .select(order.count())
        .from(order)
        .where(statusEq(status));

    return PageableExecutionUtils.getPage(content, pageable, countQuery::fetchOne);
}
```

`PageableExecutionUtils.getPage()`는 마지막 페이지이거나 첫 페이지에서 결과가 pageSize보다 적으면 count 쿼리를 실행하지 않는다. 불필요한 COUNT 쿼리를 줄이는 최적화다.

---

## Repository 구조 패턴

```java
// 1. 기본 JPA Repository + 커스텀 인터페이스
public interface OrderRepository extends JpaRepository<Order, Long>,
                                          OrderRepositoryCustom { }

// 2. 커스텀 인터페이스 선언
public interface OrderRepositoryCustom {
    List<OrderSummary> findByCondition(OrderSearchCondition cond);
}

// 3. QueryDSL 구현체
@Repository
public class OrderRepositoryImpl implements OrderRepositoryCustom {
    private final JPAQueryFactory queryFactory;
    // QueryDSL 쿼리 구현
}
```

단순 CRUD는 `JpaRepository`가, 복잡한 조회는 `OrderRepositoryImpl`이 담당하는 역할 분리다.

---

## 언제 무엇을 쓸까

```text
단순 조회         → JPA 쿼리 메서드 (findByStatus, findByMemberId)
조건 1~2개        → @Query (JPQL)
동적 쿼리 / 복잡한 조인 / DTO 조회 → QueryDSL ← 실무 표준
DB 특화 함수 / 성능 힌트           → Native Query
대용량 통계·배치  → MyBatis (별도 모듈)
```

| 기준 | JPQL | QueryDSL | Native Query |
|---|---|---|---|
| **타입 안전성** | ❌ 문자열 | ✅ Q클래스 | ❌ 문자열 |
| **동적 쿼리** | 불편 | ✅ BooleanExpression | 불편 |
| **DB 특화 기능** | ❌ | ❌ | ✅ |
| **DTO 조회** | new 키워드 (불편) | ✅ @QueryProjection | 수동 매핑 |

---

## 마치며

QueryDSL이 실무 표준이 된 이유는 명확하다. JPQL의 문자열 기반 한계를 타입 안전한 Java 코드로 대체하고, 동적 쿼리를 `BooleanExpression` 패턴으로 깔끔하게 처리한다.

다음 편에서는 Spring Security — 인증/인가와 JWT 구현을 정리한다.
