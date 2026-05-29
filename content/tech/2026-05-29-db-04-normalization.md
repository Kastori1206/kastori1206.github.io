---
title: "[DB 완전 정복 #4] 정규화는 언제 깨야 하나 — 1NF부터 3NF, 실무 비정규화까지"
date: 2026-05-29
draft: false
target_section: tech
series: "DB 완전 정복"
series_order: 4
series_total: 9
tags: [database, normalization, denormalization, schema-design, mysql]
description: "이상 현상이 뭔지, 1NF~3NF가 어떻게 이를 해결하는지, 그리고 실무에서 의도적으로 정규화를 깨는 경우는 언제인지 정리한다."
wiki_source: 10-wiki/tech/db/04-normalization.md
categories: [Database]
---

## 테이블 하나에 다 넣으면 안 되나요?

DB를 처음 설계할 때 이런 생각을 한 적이 있을 것이다. 그냥 필요한 정보를 테이블 하나에 다 넣으면 조인도 없고 편하지 않을까?

실제로 해보면 금방 문제가 생긴다.

---

## 이상 현상 — 설계가 나쁠 때 생기는 일

이런 테이블이 있다고 해보자.

```
주문_정보 (비정규화)
| order_id | member_id | member_name | member_email  | product_id | product_name | price |
|----------|-----------|-------------|---------------|------------|--------------|-------|
| 1        | 100       | 홍길동      | hong@test.com | 200        | 노트북       | 1500  |
| 2        | 100       | 홍길동      | hong@test.com | 201        | 마우스       | 30    |
| 3        | 101       | 김철수      | kim@test.com  | 200        | 노트북       | 1500  |
```

**삽입 이상**: 주문이 없는 신규 회원을 등록하고 싶다. `order_id`가 없으니 행을 추가할 수 없다.

**삭제 이상**: 주문 1번을 삭제한다. 그런데 홍길동의 이메일 정보가 주문 2번에만 남는 게 아니라, 만약 주문이 1번 하나뿐이었다면 회원 정보 자체가 사라진다.

**수정 이상**: 홍길동이 이메일을 변경했다. `order_id = 1`과 `order_id = 2` 두 군데를 모두 수정해야 한다. 하나만 고치면 같은 사람의 이메일이 두 개가 된다.

이것이 **이상 현상(Anomaly)**이다. 정규화는 이 문제를 해결하기 위한 설계 원칙이다.

---

## 1NF — 원자값 원칙

> 모든 컬럼의 값이 더 이상 분리할 수 없는 원자적인 값이어야 한다.

```
❌ 1NF 위반
| order_id | products         |
|----------|------------------|
| 1        | 노트북, 마우스    |  ← 여러 값이 한 컬럼에

✅ 1NF 준수
| order_id | product_id | product_name |
|----------|------------|--------------|
| 1        | 200        | 노트북       |
| 1        | 201        | 마우스       |
```

컬럼에 여러 값을 콤마로 넣거나, 배열처럼 넣는 것이 대표적인 위반이다. 이렇게 하면 `WHERE products LIKE '%마우스%'`처럼 검색해야 하고, 인덱스도 제대로 못 탄다.

---

## 2NF — 부분 함수 종속 제거

> 기본키가 복합키일 때, 모든 일반 컬럼이 복합키 전체에 종속되어야 한다. (기본키의 일부에만 종속되면 안 된다)

```
order_items 테이블 (1NF)
기본키: (order_id, product_id)

| order_id | product_id | product_name | qty |
|----------|------------|--------------|-----|
| 1        | 200        | 노트북       | 1   |
| 1        | 201        | 마우스       | 2   |

문제: product_name은 product_id에만 종속 (order_id와는 무관)
     → 노트북 이름이 바뀌면 여러 주문 행을 모두 수정해야 함
```

```
✅ 2NF 준수 (분리)
order_items: (order_id, product_id, qty)
products:    (product_id, product_name, price)
```

---

## 3NF — 이행적 함수 종속 제거

> 기본키가 아닌 일반 컬럼 간의 종속이 없어야 한다.

```
members 테이블 (2NF)
기본키: member_id

| member_id | zip_code | city   | district |
|-----------|----------|--------|----------|
| 1         | 06130    | 서울   | 강남구   |
| 2         | 06130    | 서울   | 강남구   |

문제: city와 district는 zip_code에 종속 (member_id → zip_code → city/district)
     → 06130 우편번호의 시/구가 바뀌면 모든 행을 수정해야 함
```

```
✅ 3NF 준수 (분리)
members:   (member_id, zip_code)
zip_codes: (zip_code, city, district)
```

---

## 정규화 vs 비정규화 — 트레이드오프

정규화를 하면 데이터 무결성이 좋아지지만, 조회 시 조인이 많아진다.

```
정규화의 장점:
  ✅ 데이터 중복 없음 → 수정 이상 없음
  ✅ 삽입/삭제 이상 없음
  ✅ 저장 공간 절약

정규화의 단점:
  ❌ 조회 시 JOIN 필요 → 쿼리 복잡
  ❌ 성능이 중요한 읽기 위주 서비스에서 조인 비용
```

실무에서는 **의도적으로 정규화를 깨는** 경우도 있다.

### 비정규화가 정당한 경우

**1. 집계 결과를 미리 저장**

```sql
-- 매번 COUNT 집계 쿼리 실행
SELECT COUNT(*) FROM posts WHERE member_id = 1;

-- 비정규화: members 테이블에 post_count 컬럼 추가
-- 게시글 INSERT/DELETE 시 post_count를 함께 업데이트
SELECT post_count FROM members WHERE id = 1;  -- 빠름
```

**2. 자주 함께 조회되는 컬럼 중복 저장**

```sql
-- orders 테이블에 member_name을 중복 저장
-- 주문 목록 조회 시 members 테이블 JOIN 불필요
| order_id | member_id | member_name | total_amount |
```

주문 당시의 회원명을 보존한다는 의미도 있다(회원이 탈퇴해도 주문 이력 유지).

**3. 읽기 전용 분석 테이블**

OLAP(분석 쿼리) 용도의 테이블은 처음부터 비정규화로 설계한다. 수십 개 테이블을 조인하는 분석 쿼리보다 평탄화된 넓은 테이블이 훨씬 빠르다.

### JPA와 정규화의 관계

JPA 연관관계(`@OneToMany`, `@ManyToOne`)는 정규화된 테이블을 객체로 매핑하는 방식이다. 정규화가 잘 되어 있으면 JPA 설계도 자연스럽게 따라온다.

비정규화를 하면 JPA 매핑이 어색해질 수 있다. 그래서 비정규화는 신중하게, 이유가 명확할 때만 해야 한다.

---

## 마치며

정규화는 목표가 아니라 도구다. **이상 현상을 없애기 위해 필요한 만큼** 하고, 성능이 중요하고 이유가 명확한 경우에만 의도적으로 비정규화를 선택한다. "정규화를 깨는 이유가 뭔가요?"라는 질문에 답할 수 있다면 충분하다.

다음 편에서는 DB 연결 자체의 비용을 다루는 커넥션 풀(HikariCP)을 다룬다.
