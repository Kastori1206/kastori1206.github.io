---
title: "[DB 완전 정복 #8] MongoDB는 왜 임베딩을 권장하나 — 문서 모델과 WiredTiger"
date: 2026-06-02
draft: false
target_section: tech
series: "DB 완전 정복"
series_order: 8
series_total: 9
tags: [database, mongodb, nosql, document-db, wiredtiger, aggregation]
description: "MongoDB가 관계형 DB와 근본적으로 다른 이유는 '어떻게 데이터를 모델링하느냐'에 있다. 임베딩 vs 참조 결정 기준, WiredTiger 스토리지 엔진, 집계 파이프라인을 정리한다."
wiki_source: 10-wiki/tech/db/08-mongodb-internals.md
categories: [Database]
---

## "MongoDB는 그냥 JSON 저장하는 DB 아닌가요?"

MongoDB를 처음 접하면 이런 인식이 생기기 쉽다. 실제로 저장 형태가 JSON처럼 보이기 때문이다. 하지만 MongoDB가 진짜로 해결하려는 문제는 "JSON 저장"이 아니라 **관계형 모델이 맞지 않는 데이터 구조**다.

---

## 문서 모델 — 계층 구조를 그대로 저장한다

관계형 DB는 데이터를 정규화해서 여러 테이블에 나눠 저장한다. 조회 시 JOIN으로 합친다. MongoDB는 반대로, **관련 데이터를 하나의 문서 안에 중첩해서** 저장한다.

상품 정보를 예로 들어보자.

```
관계형 DB:
  products (id, name, price)
  product_options (id, product_id, size, color, stock)
  product_images (id, product_id, url, order)
  → 조회 시 3개 테이블 JOIN

MongoDB:
  {
    _id: ObjectId("..."),
    name: "운동화",
    price: 89000,
    options: [
      { size: "260", color: "black", stock: 10 },
      { size: "270", color: "white", stock: 5 }
    ],
    images: [
      { url: "https://...", order: 1 },
      { url: "https://...", order: 2 }
    ]
  }
  → 단일 문서 조회 1번
```

JOIN 없이 한 번의 조회로 모든 데이터를 가져온다. 그리고 컬렉션 내 문서마다 구조가 달라도 된다 — 어떤 상품은 `options` 필드가 없어도 괜찮다.

---

## 임베딩 vs 참조 — MongoDB 설계의 핵심 결정

MongoDB 설계에서 가장 중요한 질문은 "관련 데이터를 한 문서 안에 넣을까(임베딩), 별도 컬렉션으로 분리할까(참조)?"다.

### 임베딩 — 함께 조회되는 데이터

```javascript
// 주문과 주문 아이템을 한 문서에
{
  _id: ObjectId("order1"),
  orderNo: "ORD-001",
  member: { id: 100, name: "홍길동" },
  items: [
    { productId: 200, name: "노트북", qty: 1, price: 1500000 },
    { productId: 201, name: "마우스", qty: 2, price: 30000 }
  ],
  totalAmount: 1560000
}
```

**임베딩이 맞는 경우**:
- 항상 함께 조회하는 데이터
- 1:1 또는 1:소수 관계
- 임베딩된 데이터가 독립적으로 존재할 필요가 없는 경우

주문 생성 당시의 상품 정보를 함께 저장하는 것은 의미가 있다. 나중에 상품 가격이 바뀌어도 주문 당시 가격이 보존된다.

### 참조 — 무제한 증가하거나 독립 조회가 필요한 경우

```javascript
// 게시글과 댓글을 별도 컬렉션으로
// posts
{ _id: ObjectId("post1"), title: "글 제목", content: "..." }

// comments
{ _id: ObjectId("c1"), postId: ObjectId("post1"), text: "댓글1" }
{ _id: ObjectId("c2"), postId: ObjectId("post1"), text: "댓글2" }
// ... 댓글이 수천 개가 되어도 posts 문서 크기는 그대로
```

**참조가 맞는 경우**:
- 배열이 무제한 증가할 수 있는 경우 (댓글, 로그)
- 양쪽 데이터를 독립적으로 수정하는 경우
- N:M 관계

문서 크기 한도는 16MB다. 배열에 데이터를 계속 추가하면 결국 이 한도에 부딪힌다.

---

## WiredTiger — MongoDB의 스토리지 엔진

MongoDB 3.2부터 기본 스토리지 엔진이다.

### 문서 레벨 락

구 엔진(MMAPv1)은 컬렉션 전체에 락을 걸었다. 같은 컬렉션 안의 다른 문서도 동시 쓰기가 불가능했다.

WiredTiger는 **문서 레벨 락**을 지원한다. 같은 컬렉션의 다른 문서에 동시에 쓸 수 있다. MVCC도 지원해서 읽기와 쓰기가 서로를 방해하지 않는다.

### 압축

디스크 사용량을 자동으로 줄여준다.

```
기본 압축: snappy (빠름, 적당한 압축률)
높은 압축: zlib 또는 zstd (더 강한 압축, CPU 비용 있음)
→ 실제로 디스크 사용량 50~80% 감소
```

### WAL (Journal)

쓰기 전에 Journal(WAL)에 먼저 기록한다. 서버가 갑자기 꺼져도 Journal로 복구할 수 있다. 기본적으로 100ms마다 또는 128KB마다 flush된다.

---

## 집계 파이프라인 — SQL의 GROUP BY를 대체하는 방법

MongoDB에서 집계 쿼리는 **파이프라인** 방식이다. 문서가 여러 단계를 순서대로 통과한다.

```javascript
// SQL: SELECT status, COUNT(*), SUM(amount)
//      FROM orders WHERE created_at >= '2026-01-01'
//      GROUP BY status HAVING COUNT(*) > 10
//      ORDER BY SUM(amount) DESC

db.orders.aggregate([
  { $match: { createdAt: { $gte: new Date("2026-01-01") } } },
  { $group: {
      _id: "$status",
      count: { $sum: 1 },
      totalAmount: { $sum: "$amount" }
  }},
  { $match: { count: { $gt: 10 } } },
  { $sort: { totalAmount: -1 } }
])
```

**성능 팁**: `$match`를 파이프라인 앞에 배치해서 처리 문서 수를 먼저 줄여야 한다. 뒤에 두면 전체 문서를 집계한 다음 필터링하는 낭비가 생긴다.

---

## 트랜잭션

MongoDB는 **단일 문서 내 업데이트는 항상 원자적**이다. 여러 필드를 한 번에 수정해도 일부만 반영되는 일이 없다.

멀티 문서 트랜잭션은 4.0부터 지원되지만, 관계형 DB 트랜잭션보다 비용이 높다. MongoDB 설계 철학은 **트랜잭션이 필요 없도록 임베딩으로 설계**하는 것이다. 트랜잭션은 임베딩으로 해결이 안 되는 경우에만 쓴다.

---

## 언제 MongoDB를 선택하나

```
✅ 이런 경우 MongoDB
  - 스키마가 자주 바뀌는 초기 개발 단계
  - 상품 옵션, 설정값처럼 구조가 문서마다 다른 데이터
  - 로그, 이벤트 등 대량 쓰기 + 계층 구조
  - 지리 데이터 (2dsphere 인덱스 내장)

❌ 이런 경우 MongoDB 비적합
  - 복잡한 JOIN이 많은 경우 ($lookup은 있지만 SQL JOIN보다 느림)
  - 결제, 재고처럼 강한 ACID 트랜잭션이 필요한 경우
  - 복잡한 집계·분석 쿼리가 중심인 경우
```

---

## 마치며

MongoDB의 강점은 "스키마 없이 저장한다"가 아니라 **계층 구조 데이터를 JOIN 없이 한 번에 읽는다**는 것이다. 임베딩 vs 참조를 올바르게 선택하는 것이 MongoDB 성능의 핵심이다.

마지막 편에서는 이번 시리즈를 정리하며 각 DB를 어떤 기준으로 선택하는지 종합한다.
