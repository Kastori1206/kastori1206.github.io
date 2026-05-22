---
title: "[Spring 완전 정복 #6] Java 데이터 접근 기술의 진화 — JDBC에서 JPA까지, 왜 바뀌었나"
date: 2026-05-03
draft: false
series: "Spring 완전 정복"
series_order: 6
series_total: 14
categories: ["Spring"]
tags: [spring, jdbc, jdbctemplate, mybatis, jpa, orm, java, backend]
description: "순수 JDBC의 문제점부터 JdbcTemplate, MyBatis, JPA까지 각 기술이 무엇을 해결하고 무엇을 포기했는지 코드로 비교한다. 'JPA vs MyBatis' 논쟁에 명확한 답을 제시한다."
wiki_source: 10-wiki/tech/spring/05a-data-access-evolution.md
---

## "JPA vs MyBatis 뭐가 더 낫나요?"

이 질문의 답을 제대로 하려면 두 기술이 각각 어떤 문제를 해결하기 위해 등장했는지 알아야 한다. 역사를 따라가면 답이 보인다.

---

## 1단계: 순수 JDBC — 모든 것을 직접

Java에서 DB에 접근하는 가장 원시적인 방법이다.

```java
public Order findById(Long id) {
    Connection conn = null;
    PreparedStatement pstmt = null;
    ResultSet rs = null;

    try {
        conn = DriverManager.getConnection(URL, USER, PASSWORD);
        pstmt = conn.prepareStatement("SELECT * FROM orders WHERE id = ?");
        pstmt.setLong(1, id);
        rs = pstmt.executeQuery();

        if (rs.next()) {
            Order order = new Order();
            order.setId(rs.getLong("id"));
            order.setStatus(rs.getString("status"));
            return order;
        }
        return null;
    } catch (SQLException e) {
        throw new RuntimeException(e);
    } finally {
        // 안 닫으면 커넥션 누수 — 매 메서드마다 이 코드가 반복
        if (rs != null) try { rs.close(); } catch (SQLException e) {}
        if (pstmt != null) try { pstmt.close(); } catch (SQLException e) {}
        if (conn != null) try { conn.close(); } catch (SQLException e) {}
    }
}
```

이 코드의 문제점이 한눈에 보인다.

- **커넥션 획득 → 쿼리 실행 → 결과 매핑 → 리소스 반납** 패턴이 모든 메서드에 반복된다.
- `finally`에서 리소스를 수동으로 닫아야 한다. 빠트리면 커넥션 풀 고갈.
- `SQLException`이 체크 예외라 모든 메서드가 예외를 처리하거나 throws해야 한다.

---

## 2단계: JdbcTemplate — 반복 코드 제거

Spring이 JDBC의 반복 코드를 추상화한 것이 `JdbcTemplate`이다.

```java
@Repository
public class OrderRepository {
    private final JdbcTemplate jdbcTemplate;

    public Order findById(Long id) {
        return jdbcTemplate.queryForObject(
            "SELECT * FROM orders WHERE id = ?",
            (rs, rowNum) -> {
                Order order = new Order();
                order.setId(rs.getLong("id"));
                order.setStatus(rs.getString("status"));
                return order;
            },
            id
        );
    }
}
```

커넥션 획득/반납, `try-finally`, `SQLException` 처리가 사라졌다. Spring이 내부적으로 처리해준다. `SQLException`은 Spring의 `DataAccessException`(런타임 예외)으로 변환된다.

하지만 SQL은 여전히 직접 작성해야 하고, 결과를 객체에 매핑하는 `RowMapper` 코드도 직접 써야 한다.

---

## 3단계: MyBatis — SQL을 코드에서 분리

MyBatis는 SQL을 XML 파일로 분리하고, 결과 매핑을 자동화한다.

```xml
<!-- OrderMapper.xml -->
<mapper namespace="com.example.mapper.OrderMapper">
    <resultMap id="orderResultMap" type="Order">
        <id property="id" column="id"/>
        <result property="status" column="status"/>
        <result property="memberId" column="member_id"/>
    </resultMap>

    <select id="findById" resultMap="orderResultMap">
        SELECT id, status, member_id FROM orders WHERE id = #{id}
    </select>
</mapper>
```

```java
@Mapper
public interface OrderMapper {
    Order findById(Long id);  // 인터페이스만 선언하면 구현체 자동 생성
}
```

MyBatis의 진짜 강점은 **동적 쿼리**다.

```xml
<select id="findByCondition" resultMap="orderResultMap">
    SELECT * FROM orders
    <where>
        <if test="status != null">AND status = #{status}</if>
        <if test="memberId != null">AND member_id = #{memberId}</if>
    </where>
</select>
```

조건에 따라 WHERE절을 동적으로 구성하는 것이 직관적이다.

---

## 4단계: JPA — SQL을 아예 작성하지 않는다

JPA(ORM)는 SQL을 직접 작성하지 않고, **객체 간 관계를 그대로 DB에 매핑**한다.

```java
@Entity
public class Order {
    @Id @GeneratedValue
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id")
    private Member member;
}
```

```java
// SQL 없이 CRUD
orderRepository.save(order);       // INSERT 자동
orderRepository.findById(id);      // SELECT 자동
order.setStatus(COMPLETED);        // UPDATE 자동 (Dirty Checking)
orderRepository.delete(order);     // DELETE 자동
```

DB 벤더가 바뀌어도 코드 변경이 없다. 객체 관계를 그대로 코드로 표현할 수 있다.

단점도 있다. 학습 곡선이 높고(영속성 컨텍스트, 지연 로딩, N+1 등), 복잡한 집계·통계 쿼리는 JPQL이나 QueryDSL이 필요하다.

---

## 4가지 기술 한눈에 비교

| 기준 | JDBC | JdbcTemplate | MyBatis | JPA |
|---|---|---|---|---|
| **SQL 작성** | 직접 | 직접 | 직접 (XML) | 자동 생성 |
| **결과 매핑** | 수동 | RowMapper | 자동 (resultMap) | 자동 |
| **복잡한 쿼리** | 자유롭게 | 자유롭게 | 자유롭게 (동적 쿼리 강점) | JPQL/QueryDSL 필요 |
| **DB 종속성** | 높음 | 높음 | 높음 | 낮음 |
| **학습 난이도** | 낮음 | 낮음 | 중간 | 높음 |
| **생산성** | 낮음 | 중간 | 중간 | 높음 (단순 CRUD) |

---

## JPA vs MyBatis — 이분법이 아니다

"JPA vs MyBatis"를 선택의 문제로 보는 건 틀린 프레임이다. 실무에서는 함께 쓰는 경우도 많고, 상황에 따라 선택이 다르다.

**JPA가 유리한 경우**: 비즈니스 로직이 복잡하고 객체 중심 설계가 중요한 서비스, 단순 CRUD가 많은 경우.

**MyBatis가 유리한 경우**: 복잡한 통계·집계 쿼리가 많은 경우, DBA와 협업하며 SQL을 직접 관리해야 하는 경우, 레거시 DB 스키마에 맞춰야 하는 경우.

**실무에서 가장 많이 쓰는 조합**:

```text
단순 CRUD       → JPA Repository
복잡한 조회      → QueryDSL (타입 안전한 JPQL 빌더)
통계·집계 쿼리   → Native Query 또는 MyBatis (별도 모듈)
```

---

## JdbcTemplate은 여전히 쓴다

JPA 프로젝트에서도 JdbcTemplate이 필요한 상황이 있다.

```java
@Repository
public class OrderBatchRepository {
    private final JdbcTemplate jdbcTemplate;

    // 수백만 건 상태 일괄 변경 — JPA Dirty Checking으로 하면 메모리 부족
    public void bulkUpdateStatus(String oldStatus, String newStatus) {
        jdbcTemplate.update(
            "UPDATE orders SET status = ? WHERE status = ?",
            newStatus, oldStatus
        );
    }
}
```

JPA `@Modifying`으로 안 되는 벌크 업데이트, Spring Batch 처리, 간단한 유틸리티 쿼리 등에서 여전히 활용된다.

---

## 마치며

각 기술의 진화 방향은 **반복 코드 제거 → SQL 관리 편의 → 객체 중심 개발**이었다. 이 흐름을 이해하면 "왜 JPA를 쓰는가"와 "언제 MyBatis가 더 나은가"를 맥락 있게 설명할 수 있다.

다음 편에서는 Spring Data JPA — 영속성 컨텍스트와 N+1 문제를 자세히 정리한다.
