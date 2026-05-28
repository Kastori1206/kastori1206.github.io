---
title: "[DB 완전 정복 #3] 느린 쿼리를 잡아라 — EXPLAIN 읽는 법과 페이징 최적화"
date: 2026-05-28
draft: false
target_section: tech
series: "DB 완전 정복"
series_order: 3
series_total: 9
tags: [database, mysql, query-optimization, explain, pagination]
description: "EXPLAIN 실행 계획에서 type, key, Extra가 뭘 의미하는지, OFFSET 페이징이 느린 이유와 커버링 인덱스로 해결하는 방법을 정리한다."
wiki_source: 10-wiki/tech/db/03-query-optimization.md
categories: [Database]
---

## 쿼리가 느리다. 어디서부터 봐야 할까

개발 환경에서는 데이터가 몇 백 건이라 빠르다. 그런데 운영 환경에 올라가면 특정 페이지가 버벅인다. 로그를 보면 DB 쿼리가 범인이다.

이때 시작점은 하나다. **EXPLAIN**.

---

## EXPLAIN — 옵티마이저의 속마음을 보는 방법

`EXPLAIN`은 MySQL 옵티마이저가 쿼리를 어떻게 실행할지 보여주는 명령이다.

```sql
EXPLAIN SELECT o.*, m.name
FROM orders o
JOIN members m ON o.member_id = m.id
WHERE o.status = 'PENDING'
ORDER BY o.created_at DESC
LIMIT 20;
```

출력에서 봐야 할 컬럼 네 가지:

| 컬럼 | 의미 | 좋은 값 | 나쁜 값 |
|------|------|---------|---------|
| `type` | 테이블 접근 방식 | const, ref, range | **ALL** (풀스캔) |
| `key` | 실제 사용한 인덱스 | 인덱스명 | **NULL** |
| `rows` | 예상 스캔 행 수 | 작을수록 | 클수록 |
| `Extra` | 부가 정보 | Using index | **Using filesort**, **Using temporary** |

### type 값 — 빠른 순서

```
const      → PK로 단 1개 행 조회 (가장 빠름)
eq_ref     → 조인에서 PK로 1개 행 조회
ref        → 일반 인덱스로 여러 행 조회
range      → 인덱스 범위 스캔 (BETWEEN, >, <)
index      → 인덱스 풀 스캔 (테이블보다는 낫지만 느림)
ALL        → 테이블 풀 스캔 (가장 느림, 즉시 개선 필요)
```

`type: ALL`이 보이면 인덱스가 없거나 무력화된 것이다.

### Extra 해석

```
Using index       → 커버링 인덱스. 테이블 접근 없음 (좋음)
Using where       → 인덱스 후 WHERE 필터링 (보통)
Using filesort    → ORDER BY를 정렬 버퍼에서 처리 (느림, 인덱스로 해결 가능)
Using temporary   → 임시 테이블 사용 (느림, GROUP BY/DISTINCT 최적화 필요)
Using index condition → ICP (인덱스 레벨에서 조건 필터링, 개선)
```

`Using filesort`와 `Using temporary`가 함께 나오면 위험 신호다. ORDER BY나 GROUP BY 컬럼에 인덱스를 추가하는 것을 검토해야 한다.

---

## 슬로우 쿼리 로그 — 운영에서 느린 쿼리 찾기

`EXPLAIN`은 알고 있는 쿼리를 분석할 때 쓴다. 운영에서 어떤 쿼리가 느린지 모를 때는 슬로우 쿼리 로그를 켠다.

```sql
-- 슬로우 쿼리 로그 설정
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;  -- 1초 이상 걸리는 쿼리 기록
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';
```

로그에 쌓인 쿼리를 `mysqldumpslow`로 집계하면 가장 자주 느린 쿼리 순으로 정렬할 수 있다.

Spring Boot에서는 `p6spy` 라이브러리를 추가하면 JPA가 실행하는 쿼리의 실행 시간을 콘솔에서 볼 수 있다.

---

## 조인 최적화 — 드라이빙 테이블이 결과를 결정한다

MySQL은 조인 시 **드라이빙 테이블(Driving Table)**을 먼저 읽고, 그 결과로 드리븐 테이블(Driven Table)을 검색한다.

```sql
SELECT o.*, m.name
FROM orders o
JOIN members m ON o.member_id = m.id
WHERE o.status = 'PENDING';
```

옵티마이저는 어떤 테이블을 드라이빙으로 할지 결정한다. 일반적으로 **결과 행 수가 적은 테이블**이 드라이빙이 된다.

핵심 원칙: **드리븐 테이블의 조인 조건 컬럼에는 반드시 인덱스가 있어야 한다.** 없으면 드라이빙 테이블의 행마다 드리븐 테이블 풀스캔이 반복된다.

```sql
-- members.id에 인덱스가 없으면
-- orders 행 수만큼 members 풀스캔 반복 → O(N*M)
-- members.id에 인덱스 있으면
-- 각 orders 행에서 members를 O(log M)으로 조회 → O(N*log M)
```

---

## OFFSET 페이징의 함정

가장 많이 쓰는 페이징 쿼리다.

```sql
SELECT * FROM orders ORDER BY created_at DESC LIMIT 20 OFFSET 100000;
```

문제는 `OFFSET 100000`이다. MySQL은 첫 번째 행부터 100,020번째 행까지 읽어서, 앞 100,000개를 버리고 20개만 반환한다. 페이지 번호가 높아질수록 버리는 데이터가 늘어난다.

페이지 1: 20개 읽기  
페이지 5000: 100,020개 읽고 100,000개 버리기

### 해결책 1: 커버링 인덱스 + 서브쿼리

```sql
-- 1단계: 인덱스만으로 PK 목록 조회 (테이블 접근 없음)
SELECT id FROM orders
ORDER BY created_at DESC
LIMIT 20 OFFSET 100000;

-- 2단계: PK로 실제 데이터 조회
SELECT o.* FROM orders o
JOIN (
    SELECT id FROM orders
    ORDER BY created_at DESC
    LIMIT 20 OFFSET 100000
) AS sub ON o.id = sub.id;
```

서브쿼리는 인덱스만 읽으니 빠르고, 최종 데이터는 PK 20개로만 조회한다.

### 해결책 2: 커서 기반 페이징 (No Offset)

```sql
-- 첫 페이지
SELECT * FROM orders ORDER BY created_at DESC LIMIT 20;
-- 마지막으로 받은 created_at이 '2026-05-01 12:00:00'이라면

-- 다음 페이지 (OFFSET 없이 조건으로)
SELECT * FROM orders
WHERE created_at < '2026-05-01 12:00:00'
ORDER BY created_at DESC LIMIT 20;
```

OFFSET 없이 항상 인덱스 범위 스캔으로 처리된다. 몇 백만 페이지가 되어도 속도가 일정하다. 단, 임의 페이지 이동(페이지 번호 클릭)이 필요하면 쓸 수 없다. 무한 스크롤에 최적이다.

---

## 마치며

쿼리 최적화의 순서:

```
1. EXPLAIN으로 실행 계획 확인
2. type: ALL → 인덱스 추가
3. Using filesort → ORDER BY 컬럼에 인덱스
4. 조인: 드리븐 테이블 조인 조건에 인덱스
5. 페이징: OFFSET 높으면 커버링 인덱스 또는 커서 기반으로 전환
```

다음 편에서는 테이블 설계의 기초인 정규화와, 실무에서 의도적으로 정규화를 깨는 경우를 다룬다.
