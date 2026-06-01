---
title: "[DB 완전 정복 #7] Redis가 빠른 진짜 이유 — 단일 스레드, 이벤트 루프, 자료구조"
date: 2026-06-01
draft: false
target_section: tech
series: "DB 완전 정복"
series_order: 7
series_total: 9
tags: [database, redis, nosql, in-memory, single-thread, data-structure]
description: "Redis가 인메모리라서 빠른 건 반쪽짜리 설명이다. 단일 스레드 이벤트 루프가 Lock 없이 고성능을 내는 원리, 자료구조별 내부 구현과 시간복잡도, RDB vs AOF 영속성 차이를 정리한다."
wiki_source: 10-wiki/tech/db/07-redis-internals.md
categories: [Database]
---

## "Redis가 빠른 이유가 인메모리라서 아닌가요?"

인메모리인 것은 맞지만, 그것만으로는 설명이 부족하다. Memcached도 인메모리인데 Redis만큼 다양하게 쓰이지 않는다. Redis가 특별한 이유는 **단일 스레드 + 이벤트 루프 + 정교한 자료구조**의 조합이다.

---

## 단일 스레드인데 왜 느리지 않나

Redis는 모든 명령을 **단일 스레드**가 처리한다. 멀티코어 서버에서 코어 하나만 쓴다는 뜻이다. 직관적으로 비효율적으로 보이지만, 이것이 Redis의 핵심 설계 철학이다.

멀티 스레드의 문제는 **동기화 비용**이다. 여러 스레드가 같은 데이터에 접근할 때 Race Condition을 막으려면 뮤텍스와 락이 필요하다. 락을 거는 것 자체가 비용이고, Context Switch도 비용이다.

Redis는 이 문제를 **처음부터 단일 스레드**로 설계해 피해갔다.

```
단일 스레드의 장점:
  - Lock 없음 → Race Condition 없음
  - 모든 명령이 원자적(Atomic) 보장
  - Context Switch 없음
  - 예측 가능한 성능
```

그렇다면 I/O는 어떻게 처리할까? 단일 스레드가 소켓을 하나씩 읽으면 느리지 않나?

### 이벤트 루프 + I/O Multiplexing

Redis는 `epoll`(Linux) 또는 `kqueue`(macOS) 같은 OS 레벨 I/O Multiplexing을 사용한다.

```
[클라이언트 수백 개]
  Client A ──┐
  Client B ──┤──▶  epoll (OS 커널)  ──▶  이벤트 큐
  Client C ──┘
                                           │
                                           ▼
                                   [단일 스레드 처리]
                                   명령 실행 → 응답
```

OS 커널이 수백 개의 소켓을 동시에 감시하다가, 읽을 데이터가 생기면 이벤트 큐에 넣는다. 단일 스레드는 큐에서 이벤트를 꺼내 처리한다. **I/O 대기 시간을 OS가 흡수**하므로 단일 스레드도 충분히 많은 클라이언트를 처리할 수 있다.

결국 Redis가 빠른 이유는: **인메모리 + Lock 없는 단일 스레드 + OS가 처리하는 I/O 대기** 세 가지의 조합이다.

### 6.0+에서 멀티스레드 I/O

Redis 6.0부터 네트워크 I/O(패킷 읽기/쓰기)는 멀티스레드로 처리하도록 개선됐다. 하지만 실제 명령 실행은 여전히 단일 스레드다. 원자성과 단순함을 유지하면서 대용량 데이터 전송 성능만 개선한 것이다.

---

## 자료구조별 내부 구현

Redis의 또 다른 강점은 상황에 따라 **내부 인코딩을 자동으로 최적화**한다는 것이다.

### Sorted Set — 실시간 랭킹의 핵심

```
데이터가 128개 이하: listpack (연속 메모리, 캐시 효율)
데이터가 많아지면: skiplist + hashtable 조합
  - skiplist: 정렬된 순서로 빠른 범위 조회 (O(log N))
  - hashtable: 멤버 → 점수 O(1) 조회
```

```
ZADD ranking 1500 "user:1"
ZADD ranking 2300 "user:2"
ZADD ranking 1800 "user:3"

ZREVRANGE ranking 0 9 WITHSCORES  → 상위 10명 O(log N + 10)
ZRANK ranking "user:1"             → 내 순위 O(log N)
ZSCORE ranking "user:2"            → 점수 조회 O(1)
```

점수 변경이 잦은 실시간 랭킹에 최적이다.

### Hash — 세션 저장의 패턴

```
필드가 128개 이하: listpack (연속 메모리)
필드가 많아지면: hashtable

HSET session:abc userId 1 username "kastori"  // O(1)
HGET session:abc userId                         // O(1)
// 필드별 부분 업데이트 가능 (전체 덮어쓰기 필요 없음)
```

사용자 세션 데이터를 Hash로 저장하면 필드별로 읽고 쓸 수 있어 효율적이다.

### 자료구조 시간복잡도 요약

| 자료구조 | 주요 연산 | 시간복잡도 |
|---------|----------|-----------|
| String | SET/GET | O(1) |
| List | LPUSH/RPUSH, LPOP/RPOP | O(1) |
| Hash | HSET/HGET | O(1) |
| Set | SADD/SISMEMBER | O(1) |
| Sorted Set | ZADD/ZSCORE | O(log N) |
| Sorted Set | ZRANGE | O(log N + M) |

---

## 영속성 — 인메모리인데 재시작하면 데이터는?

Redis는 기본적으로 인메모리라 서버가 꺼지면 데이터가 사라진다. 영속성이 필요하다면 두 가지 방법이 있다.

### RDB — 스냅샷

```
주기적으로 현재 메모리를 .rdb 파일로 저장
  → fork() 로 자식 프로세스가 저장, 부모는 계속 요청 처리

장점: 파일 크기 작음, 복구 빠름
단점: 마지막 스냅샷 이후 데이터 유실 가능
```

### AOF — 명령 로그

```
모든 쓰기 명령을 파일에 순서대로 기록
재시작 시 파일을 재실행해서 복구

appendfsync everysec  → 1초마다 flush (권장, 최대 1초 유실)

장점: 데이터 유실 최소화
단점: 파일 크기 큼, 복구 시간 느림
```

### 권장: 혼합 모드

```yaml
# redis.conf
aof-use-rdb-preamble yes

→ AOF 파일 앞: RDB 스냅샷 (빠른 로딩)
→ AOF 파일 뒤: 스냅샷 이후 증분 명령 (데이터 안전)
```

---

## 실무에서 꼭 지켜야 할 것

### KEYS 명령 절대 금지

```
KEYS *       → 전체 키 순회, O(N), 단일 스레드 완전 블로킹
             → 운영 환경에서 1초도 안에 서버 응답 불가 상태 만들 수 있음

대신 SCAN:
  SCAN 0 MATCH user:* COUNT 100  → 커서 기반, 블로킹 없음
```

### TTL 설정 필수

캐시 목적의 키는 반드시 만료 시간을 설정해야 한다. 안 하면 메모리가 계속 쌓이다가 `maxmemory`에 도달하고, eviction 정책에 따라 데이터가 예고 없이 삭제된다.

```
SET key value EX 3600  // 1시간 후 자동 만료
```

---

## 마치며

Redis를 "그냥 캐시"로만 알면 반쪽이다. 단일 스레드 이벤트 루프가 어떻게 동시 처리를 하는지, 자료구조마다 다른 내부 인코딩이 성능에 어떤 영향을 주는지 이해하면 Redis를 더 잘 쓸 수 있다. 다음 편에서는 문서 지향 DB인 MongoDB의 내부 구조를 다룬다.
