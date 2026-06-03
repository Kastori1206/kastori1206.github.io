---
title: "[DB 완전 정복 #9] 어떤 DB를 왜 선택하는가 — MySQL, PostgreSQL, Redis, MongoDB 선택 기준"
date: 2026-06-03
draft: false
target_section: tech
series: "DB 완전 정복"
series_order: 9
series_total: 9
tags: [database, mysql, postgresql, redis, mongodb, nosql, architecture]
description: "면접에서 '이 DB를 왜 선택했나요?'라는 질문에 근거 있게 답하는 방법. SQL vs NoSQL, 각 DB의 선택 기준, CAP 이론까지 DB 시리즈 마무리."
wiki_source: 10-wiki/topics/db-selection.md
categories: [Database]
---

## "왜 이 DB를 쓰나요?"

기술 면접에서 DB 관련 질문은 보통 여기서 끝난다. "MySQL 쓰셨다고 하셨는데, 왜 MySQL을 선택하셨나요?"

"익숙해서요"는 답이 아니다. "팀에서 써왔어서요"도 부족하다. 트레이드오프를 설명할 수 있어야 한다. 이 시리즈 마지막 편에서는 각 DB를 선택하는 근거를 정리한다.

---

## SQL vs NoSQL — 먼저 이 구분부터

NoSQL이 SQL보다 무조건 빠른 게 아니다. **다른 문제를 풀기 위해 만들어진** 도구다.

```
SQL을 선택할 때:
  - 데이터 간 관계가 명확하고 JOIN이 자주 필요한 경우
  - 트랜잭션(ACID) 보장이 필수인 경우 (결제, 계좌)
  - 스키마가 안정적이고 자주 바뀌지 않는 경우
  - 복잡한 집계·분석 쿼리가 필요한 경우

NoSQL을 선택할 때:
  - 스키마가 유동적이거나 비정형 데이터 (로그, 이벤트)
  - 수평 확장(Sharding)이 필수인 대규모 트래픽
  - 단순 키-값 조회 또는 단일 문서 읽기/쓰기 위주
  - 최종 일관성(Eventual Consistency)으로 충분한 경우
```

---

## MySQL — 웹 서비스의 검증된 선택

MySQL을 선택하는 진짜 이유:

**기술적 근거**
- InnoDB의 MVCC와 행 레벨 락으로 높은 동시성
- Clustered Index로 기본키 조회 최고 성능
- 갭 락으로 Phantom Read 방지 (REPEATABLE READ 기본)

**실무적 근거**
- Spring Boot + JPA 조합의 레퍼런스 압도적
- AWS RDS, Aurora MySQL 등 클라우드 지원 완벽
- DBA, 운영 인력 시장에서 경험자가 가장 많음

언제 MySQL이 부족한가: JSON 데이터를 쿼리하고 인덱스도 필요할 때, 지리 데이터를 다룰 때, AI 벡터 검색이 필요할 때.

---

## PostgreSQL — 기능과 확장성이 필요할 때

**JSONB가 필요하다면 PostgreSQL**

```sql
-- 상품의 동적 속성을 JSON으로 저장하고 쿼리
CREATE INDEX idx_meta ON products USING GIN (meta);
SELECT * FROM products WHERE meta @> '{"color": "red", "size": "L"}';
```

MySQL에서 같은 쿼리를 하려면 Generated Column + 인덱스 트릭이 필요하다.

**AI/ML 연동이 필요하다면 PostgreSQL**

```sql
-- pgvector: 텍스트 임베딩을 저장하고 유사도 검색
SELECT *, embedding <-> '[0.1, 0.2, ...]' AS distance
FROM documents
ORDER BY distance LIMIT 5;
```

LLM 기반 서비스를 만든다면 pgvector를 지원하는 PostgreSQL이 사실상 표준이다.

**지리 데이터라면 PostGIS**

위경도 거리 계산, 반경 내 검색, 지도 위에서의 공간 쿼리가 필요하면 PostGIS 확장이 있는 PostgreSQL이다.

---

## Redis — 인메모리의 다양한 역할

Redis를 캐시로만 쓰면 절반만 쓰는 것이다.

### 캐시

```java
@Cacheable(value = "product", key = "#id")
public Product findById(Long id) { return productRepository.findById(id); }
```

DB 조회가 많고 데이터 변경이 적은 경우 Redis 캐시로 DB 부하를 줄인다. TTL을 설정해 무효화를 자동화한다.

### 세션 저장소

다중 서버 환경에서 세션을 공유할 때. 서버가 재시작되거나 로드밸런서가 다른 서버로 요청을 보내도 세션이 유지된다.

### 분산 락

```java
// 다중 서버 환경에서 재고 차감을 안전하게
RLock lock = redissonClient.getLock("lock:product:" + productId);
if (lock.tryLock(3, 5, TimeUnit.SECONDS)) { ... }
```

단일 서버에서는 `synchronized`로 충분하지만, 서버가 2대 이상이면 Redis 분산 락이 필요하다.

### 실시간 랭킹

```
ZADD ranking 2300 "user:2"
ZREVRANGE ranking 0 9  // 상위 10명 — O(log N)
```

Sorted Set의 O(log N) 연산으로 수백만 명 랭킹도 실시간 처리 가능하다.

---

## MongoDB — 스키마가 유연해야 할 때

**임베딩이 JOIN을 대체한다**

관계형 DB에서 3개 테이블을 JOIN해야 하는 상품 정보를, MongoDB에서는 단일 문서 조회 1번으로 처리한다. 계층 구조 데이터에서 읽기 성능이 좋다.

**초기 개발의 스키마 유연성**

서비스 초기에 데이터 구조가 자주 바뀐다. 관계형 DB에서 컬럼 추가/삭제는 마이그레이션이 필요하다. MongoDB는 문서 구조가 자유로워 마이그레이션 없이 바꿀 수 있다.

**단, 복잡한 관계와 트랜잭션이 많은 도메인은 MySQL이 맞다.**

---

## 실무 조합 패턴

```
일반 웹 서비스:
  MySQL  ← 메인 데이터
  Redis  ← 캐시, 세션, 분산 락

JSON 데이터가 많은 서비스:
  PostgreSQL (JSONB)  ← 메인 데이터
  Redis              ← 캐시, 세션

로그·이벤트 처리:
  MySQL / PostgreSQL  ← 핵심 비즈니스 데이터
  MongoDB            ← 로그, 이벤트, 비정형 데이터
  Redis              ← 실시간 집계, 캐시
```

---

## CAP 이론 — 왜 NoSQL은 최종 일관성인가

분산 데이터베이스는 세 가지를 동시에 보장할 수 없다.

```
C (Consistency)       — 모든 노드가 같은 데이터를 봄
A (Availability)      — 모든 요청이 응답을 받음
P (Partition Tolerance) — 네트워크 분리 상황에서도 동작
```

네트워크 분리(P)는 분산 시스템에서 항상 발생 가능한 사건이다. P를 포기할 수 없으니, 실제로는 C와 A 중 하나를 선택한다.

```
MySQL  → CP (일관성 우선, 가용성 희생 가능)
Redis Cluster → AP (가용성 우선, 최종 일관성)
Cassandra → AP
MongoDB → 기본 CP, 설정에 따라 AP
```

Redis가 캐시에 어울리는 이유도 여기 있다. 캐시는 약간 오래된 데이터를 써도 괜찮다(AP). 반면 결제는 항상 최신 데이터가 필요하다(CP, MySQL).

---

## 면접 답변 정리

**"어떤 DB를 선택하시겠어요?"**

> "서비스 특성에 따라 다릅니다. 관계형 데이터와 ACID 트랜잭션이 중요하면 MySQL을, JSON 데이터 쿼리나 지리 기능이 필요하면 PostgreSQL을 선택합니다. 캐시와 세션은 Redis를, 스키마가 유동적이고 계층 구조 데이터가 많으면 MongoDB를 고려합니다."

**"MySQL을 쓰는 이유가 뭔가요?"**

> "Spring + JPA 조합에서 레퍼런스가 가장 많고, InnoDB의 MVCC와 행 레벨 락으로 높은 동시성을 지원하며, AWS RDS와 Aurora MySQL을 통한 운영 편의성도 고려했습니다."

---

## 시리즈를 마치며

DB는 단순히 데이터를 저장하는 도구가 아니다. 각 DB는 특정 문제를 풀기 위해 설계됐고, 그 설계 철학이 성능과 트레이드오프를 결정한다.

인덱스부터 시작해서 트랜잭션, 쿼리 최적화, 정규화, 커넥션 풀, MySQL vs PostgreSQL, Redis, MongoDB, 그리고 DB 선택 기준까지. 이 시리즈에서 다룬 내용이 면접과 실무에서 근거 있는 선택을 하는 데 도움이 되길 바란다.
