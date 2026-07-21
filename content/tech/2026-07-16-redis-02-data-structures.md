---
title: "[Redis 실무 입문 #2] 자료구조 5종 — 언제 무엇을 쓰나"
date: 2026-07-16
draft: false
target_section: tech
series: "Redis 실무 입문"
series_order: 2
series_total: 5
tags: [redis, data-structure, sorted-set, hash, backend]
description: "Redis의 값은 단순 문자열만이 아니다. String·Hash·List·Set·Sorted Set 다섯 가지 자료구조를 각각 어떤 실무 상황에서 쓰는지 시나리오로 정리한다."
wiki_source: 10-wiki/tech/db/09-redis-getting-started.md
categories: [Database]
---

## Redis를 문자열 저장소로만 쓰면 절반만 쓰는 거다

[지난 편](/tech/2026-07-14-redis-01-getting-started/)에서 `SET`/`GET`으로 문자열을 넣고 뺐다. 처음엔 나도 Redis를 딱 이 정도로만 썼다. "값 하나 빠르게 저장하는 통" 정도로. 그러다 Redis 자료구조를 제대로 보고 나서야, 그동안 애플리케이션 코드로 끙끙대며 짜던 것들이 명령 한 줄로 끝난다는 걸 알았다.

Redis에는 **5가지 기본 자료구조**가 있다. 핵심은 문법 암기가 아니라 **"이 상황엔 뭘 쓰지?"를 판단하는 감**이다. 하나씩, 어떤 상황에서 꺼내 쓰는지 위주로 보자.

---

## String — 캐시와 카운터

가장 기본. JSON을 통째로 캐싱하거나 숫자를 셀 때 쓴다.

```bash
# JSON 통째로 캐싱 (실무에서 제일 흔한 패턴)
SET user:1 '{"id":1,"name":"kastori","role":"admin"}' EX 3600

# 조회수 카운터
INCR post:100:views
```

**언제 쓰나**: 조회 결과 캐싱, 조회수·좋아요 같은 단순 카운터. 고민되면 일단 String으로 시작해도 된다. 대부분의 캐시가 여기서 출발한다.

---

## Hash — 객체를 필드별로 (세션, 프로필)

하나의 키 안에 여러 필드를 담는다. 여기서 자주 나오는 질문. "그냥 JSON을 String에 통째로 넣으면 안 되나?" 된다. 그런데 **필드 하나만 바꾸려 할 때** 차이가 난다.

```bash
HSET user:1 name "kastori" role "admin" age 30
HGET user:1 name          # "kastori"
HGETALL user:1            # 전체 필드
HINCRBY user:1 age 1      # age만 +1
```

JSON을 String에 넣어뒀으면 `age` 하나 올리려 해도 전체를 읽어서 파싱하고 다시 통째로 `SET`해야 한다. Hash는 `HINCRBY`로 그 필드만 콕 집는다. 나는 "이 객체의 필드를 따로따로 건드릴 일이 있나?"를 기준으로 String과 Hash를 가른다. 있으면 Hash, 없으면 그냥 String에 JSON.

**언제 쓰나**: 세션 데이터, 사용자 프로필처럼 필드 단위로 읽고 쓰는 객체.

---

## List — 순서 있는 목록 (최근 기록, 간단한 큐)

양쪽 끝에서 넣고 빼는 게 빠르다.

```bash
LPUSH recent:user:1 "상품A"   # 왼쪽에 추가
LPUSH recent:user:1 "상품B"
LRANGE recent:user:1 0 4      # 최근 5개 조회
LTRIM recent:user:1 0 9       # 최근 10개만 남기고 자르기
```

"최근 본 상품" 같은 걸 만들 때 딱인데, **`LTRIM`을 빼먹으면 사고**다. 사용자가 상품을 볼 때마다 `LPUSH`만 하고 잘라주지 않으면 이 리스트가 무한히 커진다. 최근 10개만 보여줄 거면 넣을 때마다 `LTRIM ... 0 9`로 꼬리를 잘라줘야 한다. 나는 이걸 `LPUSH`와 세트로 붙여 다닌다.

```bash
# 간단한 작업 큐
RPUSH job:queue "email-1"     # 생산자
LPOP job:queue                # 소비자
```

**언제 쓰나**: "최근 N개", 가벼운 작업 큐.

> 다만 진짜 튼튼한 메시지 큐가 필요하면 List로 버티지 말자. 재시도·확인응답 같은 게 필요해지는 순간 Redis Streams나 Kafka로 가는 게 맞다. List 큐는 "가볍고 단순할 때"까지다.

---

## Set — 중복 없는 집합 (좋아요, 중복 방지)

```bash
SADD post:100:likes "user:1"       # 좋아요 누른 사람
SADD post:100:likes "user:1"       # 중복은 조용히 무시됨
SCARD post:100:likes               # 좋아요 수
SISMEMBER post:100:likes "user:1"  # 이 사람 눌렀나? 1
```

Set의 매력은 중복을 알아서 걸러준다는 거다. "이미 좋아요 눌렀는지" 애플리케이션에서 조회해서 검사할 필요 없이 `SADD` 하면 그만이고, 눌렀는지 확인은 `SISMEMBER` 한 방이다. 좋아요를 DB로 구현하면서 UNIQUE 제약이랑 씨름해본 사람이라면 이게 얼마나 편한지 안다.

```bash
# 교집합 — "나랑 상대가 공통으로 팔로우하는 사람"
SINTER user:1:following user:2:following
```

**언제 쓰나**: 좋아요·투표처럼 중복을 막아야 하는 집합, 태그, 팔로워 교집합.

---

## Sorted Set — 점수로 정렬 (실시간 랭킹)

개인적으로 Redis에서 제일 "오, 이거네" 했던 자료구조다. 각 멤버에 **점수**를 매기면 알아서 정렬된 상태로 유지된다.

```bash
ZADD game:ranking 1500 "user:1"
ZADD game:ranking 2300 "user:2"
ZADD game:ranking 1800 "user:3"

ZREVRANGE game:ranking 0 9 WITHSCORES   # 상위 10명 (점수 높은 순)
ZREVRANK game:ranking "user:1"          # user:1의 순위 (0부터)
ZINCRBY game:ranking 100 "user:1"       # user:1 점수 +100
```

실시간 랭킹을 DB로 만들어본 적 있다면, 매 요청마다 `ORDER BY score DESC LIMIT 10`을 돌리고 데이터가 쌓일수록 느려지는 걸 겪었을 거다. Sorted Set은 **넣는 순간 이미 정렬**돼 있어서 순위 조회가 늘 빠르다. "내 순위"를 구하는 `ZREVRANK`도 공짜로 딸려온다. 이걸 DB로 하려면 서브쿼리로 골치 아프다.

**언제 쓰나**: 실시간 랭킹, 인기글 순위, 실시간 검색어, 우선순위 큐.

---

## 한 장 요약

헷갈리면 이 표 하나만 기억하자.

| 자료구조 | 대표 용도 | 핵심 명령 |
|---|---|---|
| String | 캐시, 카운터 | `SET` `GET` `INCR` |
| Hash | 세션, 프로필 (필드별 수정) | `HSET` `HGET` `HINCRBY` |
| List | 최근 N개, 가벼운 큐 | `LPUSH` `LRANGE` `LTRIM` |
| Set | 좋아요, 중복 방지, 교집합 | `SADD` `SISMEMBER` `SINTER` |
| Sorted Set | 실시간 랭킹 | `ZADD` `ZREVRANGE` `ZINCRBY` |

---

## 마치며

자료구조를 알았으니 이제 실제로 붙일 차례다. 다음 편은 Redis를 도입하는 가장 흔한 이유, **캐시**다. 값을 저장하는 것까지는 쉬운데, "DB를 바꿨는데 캐시가 옛날 값을 준다"는 정합성 문제에서 다들 한 번씩 데인다. 그 얘기를 제대로 하겠다.
