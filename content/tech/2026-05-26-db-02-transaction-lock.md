---
title: "[DB 완전 정복 #2] MySQL이 동시 요청을 처리하는 방법 — MVCC, 갭 락, 데드락"
date: 2026-05-26
draft: false
target_section: tech
series: "DB 완전 정복"
series_order: 2
series_total: 9
tags: [database, mysql, transaction, mvcc, lock, deadlock]
description: "락 없이 읽기 일관성을 보장하는 MVCC, 갭 락이 Phantom Read를 막는 원리, 데드락이 생기는 이유와 예방법까지. MySQL InnoDB의 동시성 처리 방식을 정리한다."
wiki_source: 10-wiki/tech/db/02-transaction-lock.md
categories: [Database]
---

## 동시에 100명이 같은 행을 읽고 있다면

서버에 동시 요청이 들어오면 여러 트랜잭션이 같은 데이터를 동시에 읽고 쓴다. 이때 두 가지 문제가 생긴다.

첫 번째는 **일관성**. A가 읽는 도중 B가 데이터를 수정하면, A는 수정 전을 봐야 할까 수정 후를 봐야 할까?

두 번째는 **성능**. 읽기마다 락을 걸면 안전하지만, 100개 스레드가 모두 대기 상태가 된다.

MySQL InnoDB는 **MVCC**로 이 두 문제를 동시에 해결한다.

---

## MVCC — 락 없이 일관된 읽기

MVCC(Multi-Version Concurrency Control)는 **각 트랜잭션이 자신이 시작한 시점의 스냅샷을 본다**는 개념이다.

InnoDB는 모든 행에 숨겨진 컬럼을 둔다.

```
DB_TRX_ID   : 이 행을 마지막으로 수정한 트랜잭션 ID
DB_ROLL_PTR : Undo Log 포인터 (이전 버전으로 가는 링크)
```

트랜잭션이 시작되면 **스냅샷 ID**가 부여된다. 이후 데이터를 읽을 때, 해당 행의 `DB_TRX_ID`가 자신의 스냅샷 ID보다 크면(= 내가 시작한 이후에 수정됨) Undo Log에서 이전 버전을 찾아 읽는다.

```
[현재 데이터]   TX_ID=200, name="수정됨"
      │
      └──▶ [Undo Log]  TX_ID=100, name="원본"   ← TX 150이 읽는 버전
                  │
                  └──▶ [Undo Log]  TX_ID=50, name="초기값"
```

트랜잭션 150은 TX 200이 수정한 내용을 보지 않는다. 락 없이도 일관된 데이터를 읽는다. 이것이 MVCC의 핵심이다.

덕분에 **읽기는 쓰기를 방해하지 않고, 쓰기는 읽기를 방해하지 않는다.**

---

## 행 레벨 락 — 필요한 행만 잠근다

읽기는 MVCC로, 쓰기는 **행 레벨 락**으로 처리한다.

```
S락 (Shared Lock)   : 읽기 락. 여러 트랜잭션이 동시에 획득 가능
X락 (Exclusive Lock): 쓰기 락. 하나의 트랜잭션만 획득 가능

S + S → 허용
S + X → 대기
X + X → 대기
```

InnoDB는 테이블 전체가 아닌 **특정 행**에만 락을 건다. `id = 1`에 락이 걸려 있어도 `id = 2`는 다른 트랜잭션이 자유롭게 수정할 수 있다.

```sql
BEGIN;
SELECT * FROM orders WHERE id = 1 FOR UPDATE;  -- id=1에만 X락
-- id=2, 3, 4 ... 다른 트랜잭션이 자유롭게 접근 가능
```

---

## 갭 락 — Phantom Read를 막는 방법

`REPEATABLE READ` 격리 수준에서는 같은 쿼리를 두 번 실행해도 결과가 같아야 한다. 하지만 락 없이 범위 조회를 하면, 그 사이 다른 트랜잭션이 새 행을 삽입(INSERT)할 수 있다. 이것이 **Phantom Read**다.

InnoDB는 이를 **갭 락(Gap Lock)**으로 막는다.

```sql
-- orders에 id: 10, 20, 30이 있다고 가정
SELECT * FROM orders WHERE id BETWEEN 10 AND 30 FOR UPDATE;
-- 10~30 범위의 "빈 공간(갭)"에도 락 → 이 범위에 INSERT 불가
```

갭 락은 인덱스 레코드 사이의 공간에 걸린다. 행이 없어도 "그 자리"를 잠가서 새 INSERT를 막는다.

실무에서 갭 락 주의사항: 인덱스가 없는 컬럼으로 UPDATE하면 범위를 특정할 수 없어 테이블 전체에 갭 락이 걸린다. 다른 트랜잭션의 INSERT가 전부 막힌다.

---

## 데드락 — 서로를 기다리는 교착 상태

두 트랜잭션이 서로 상대방의 락이 풀리기를 기다리면 데드락이 발생한다.

```sql
-- TX A                              -- TX B
BEGIN;                               BEGIN;
UPDATE orders SET ... WHERE id = 1;  UPDATE orders SET ... WHERE id = 2;
-- A가 id=1 X락 획득                 -- B가 id=2 X락 획득

UPDATE orders SET ... WHERE id = 2;  UPDATE orders SET ... WHERE id = 1;
-- id=2 락 대기 (B가 가지고 있음)    -- id=1 락 대기 (A가 가지고 있음)
-- → 영원히 대기 = 데드락
```

InnoDB는 데드락을 자동으로 감지해서 **한쪽 트랜잭션을 강제 롤백**한다.

```
ERROR 1213 (40001): Deadlock found when trying to get lock;
try restarting transaction
```

### 데드락 예방 4가지

```
1. 모든 트랜잭션에서 테이블/행 접근 순서를 일관되게 유지
   (항상 id 오름차순으로 락을 잡으면 교차가 발생하지 않는다)

2. 트랜잭션을 짧게 유지 — 락 보유 시간 최소화

3. 인덱스를 통한 정확한 행 접근 — 갭 락 범위 최소화

4. @Transactional(timeout = 5) — 일정 시간 후 자동 롤백
```

---

## 낙관적 락 vs 비관적 락 — 언제 뭘 써야 하나

충돌이 드문지 잦은지에 따라 전략이 달라진다.

### 낙관적 락 — "충돌이 드물다"

읽을 때는 락을 걸지 않고, 수정할 때 version 조건을 추가한다.

```sql
-- 읽기 (락 없음)
SELECT id, stock, version FROM products WHERE id = 1;
-- 결과: stock=10, version=5

-- 수정 (version 조건 추가)
UPDATE products SET stock = 9, version = 6
WHERE id = 1 AND version = 5;
-- 영향받은 행이 0이면 → 다른 트랜잭션이 먼저 수정 → 애플리케이션에서 재시도
```

JPA에서는 `@Version` 어노테이션으로 자동 처리된다.

**적합한 케이스**: 게시글 수정, 사용자 프로필 변경 — 동시 수정이 드문 경우

### 비관적 락 — "충돌이 잦다"

읽을 때부터 X락을 걸어 다른 트랜잭션의 접근 자체를 막는다.

```sql
SELECT * FROM products WHERE id = 1 FOR UPDATE;  -- X락
UPDATE products SET stock = stock - 1 WHERE id = 1;
COMMIT;  -- 커밋 시 락 해제
```

**적합한 케이스**: 재고 차감, 선착순 쿠폰, 포인트 사용 — 동시 수정이 잦고 정확성이 중요한 경우

---

## 마치며

MVCC는 읽기와 쓰기가 서로를 방해하지 않게 해준다. 행 레벨 락은 필요한 부분만 잠근다. 갭 락은 Phantom Read를 막는다. 그리고 데드락은 락 순서를 통일하면 예방할 수 있다.

`@Transactional`을 쓸 때 격리 수준을 설정하는 이유, JPA의 `@Version`이 하는 일 — 모두 여기서 나온다. 다음 편에서는 느린 쿼리를 진단하는 EXPLAIN을 다룬다.
