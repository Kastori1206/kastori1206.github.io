---
title: "[DB 완전 정복 #5] HikariCP와 커넥션 풀 — 설정 하나가 서비스를 멈춘다"
date: 2026-05-30
draft: false
target_section: tech
series: "DB 완전 정복"
series_order: 5
series_total: 9
tags: [database, connection-pool, hikaricp, spring, datasource, performance]
description: "DB 커넥션 생성이 얼마나 비싼지, HikariCP가 어떻게 동작하는지, 풀 사이즈 공식과 커넥션 고갈 상황을 어떻게 분석하는지 정리한다."
wiki_source: 10-wiki/tech/db/05-connection-pool.md
categories: [Database]
---

## 요청 1000개에 커넥션 1000개를 만들면?

트래픽이 급증하는 상황을 상상해보자. 매 요청마다 DB 커넥션을 새로 만들면 어떻게 될까.

```
DB 커넥션 생성 과정:
  1. TCP 소켓 연결 (3-way handshake)
  2. DB 서버 인증 (사용자/비밀번호 검증)
  3. 세션 초기화 (인코딩, 타임존, 옵션 설정)

→ 수십 ~ 수백 ms 소요
→ 초당 1000 요청이면 커넥션 생성만으로 서버 과부하
```

커넥션 풀은 이 문제를 미리 만들어 두고 재사용하는 방식으로 해결한다.

---

## HikariCP — Spring Boot의 기본 커넥션 풀

Spring Boot 2.0부터 HikariCP가 기본이다. "세상에서 가장 빠른 커넥션 풀"이라는 별명이 있다. 별도 설정 없이도 동작하지만, 기본값이 모든 상황에 맞지 않다는 게 함정이다.

### 동작 원리

```
애플리케이션 시작
  → 미리 커넥션 N개 생성해서 풀에 보관

HTTP 요청 처리
  → 풀에서 유휴 커넥션 꺼내기 (borrow)
  → DB 작업 수행
  → 커넥션 반납 (close가 아님, return)

풀이 비어있을 때
  → connectionTimeout 동안 대기
  → 초과 → SQLTimeoutException
```

핵심은 커넥션을 **닫지 않고 반납**한다는 것이다. 코드에서 `connection.close()`를 호출해도 실제로 닫히지 않고 풀로 돌아간다.

---

## 풀 사이즈 공식 — 너무 크면 오히려 느리다

직관적으로는 커넥션이 많을수록 좋을 것 같다. 하지만 커넥션이 너무 많으면 DB 서버 자체가 부하를 받는다.

HikariCP 공식 문서가 제안하는 공식:

```
maximumPoolSize = (CPU 코어 수 × 2) + 유효 디스크 수
```

예: CPU 4코어 + SSD 1개 = **9개**

놀랍도록 작은 숫자처럼 보인다. 하지만 실제로 DB 연산은 CPU와 I/O를 번갈아 쓰므로, 코어당 2개가 적절하다. 그 이상은 Context Switch 오버헤드만 늘어난다.

```yaml
# application.yml
spring:
  datasource:
    hikari:
      maximum-pool-size: 10       # 최대 커넥션 수
      minimum-idle: 5             # 유지할 최소 유휴 커넥션 수
      connection-timeout: 30000   # 커넥션 대기 최대 시간 (ms)
      idle-timeout: 600000        # 유휴 커넥션 유지 시간 (ms)
      max-lifetime: 1800000       # 커넥션 최대 수명 (ms)
```

### max-lifetime 주의사항

`max-lifetime`은 DB 서버의 `wait_timeout`보다 반드시 짧게 설정해야 한다.

```
DB 서버 wait_timeout: 8시간 (기본값)
max-lifetime: 30분 (권장)
→ DB가 연결을 끊기 전에 풀에서 먼저 커넥션을 교체
```

`max-lifetime`이 `wait_timeout`보다 길면, DB가 이미 닫은 커넥션을 풀이 계속 들고 있다가 사용 시점에 `Connection is closed` 에러가 난다.

---

## 커넥션 고갈 — 가장 흔한 장애 원인

풀의 모든 커넥션이 사용 중이면, 새 요청은 `connectionTimeout`까지 대기한다. 시간이 초과되면 에러다.

```
HikariPool-1 - Connection is not available, request timed out after 30000ms
```

### 커넥션 고갈의 주요 원인

**1. 트랜잭션 안에서 외부 I/O**

```java
@Transactional
public void processOrder(Long orderId) {
    Order order = orderRepository.findById(orderId);  // 커넥션 획득
    sendEmail(order);  // 이메일 전송 (3~5초)
    // 이메일 전송하는 동안 커넥션을 계속 들고 있음
    orderRepository.save(order);
}  // 여기서 커넥션 반납
```

이메일 전송이 5초 걸리는 동안 커넥션 1개가 묶여 있다. 동시 요청이 많으면 풀이 금방 고갈된다.

**해결**: 트랜잭션 밖으로 느린 I/O를 분리한다.

```java
public void processOrder(Long orderId) {
    Order order = orderService.getOrder(orderId);  // 짧은 트랜잭션
    sendEmail(order);                              // 트랜잭션 밖
    orderService.completeOrder(orderId);           // 짧은 트랜잭션
}
```

**2. 풀 사이즈가 너무 작음**

요청 동시성 대비 풀이 작으면 대기 큐가 쌓인다. 모니터링으로 실제 사용량을 확인하고 조정해야 한다.

**3. 긴 쿼리**

인덱스 없는 쿼리가 10초씩 걸리면 그동안 커넥션이 묶인다. 쿼리 최적화로 해결한다.

---

## 모니터링 — Actuator로 풀 상태 보기

Spring Boot Actuator를 쓰면 커넥션 풀 상태를 실시간으로 볼 수 있다.

```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: health, metrics
```

```
GET /actuator/metrics/hikaricp.connections.active
GET /actuator/metrics/hikaricp.connections.pending
GET /actuator/metrics/hikaricp.connections.timeout
```

`pending`(대기 중)이 0이 아니거나 `timeout`이 발생하기 시작하면 풀 사이즈 조정 또는 쿼리 최적화를 검토해야 한다.

---

## 마치며

커넥션 풀은 조용히 잘 동작하다가 특정 임계점을 넘으면 갑자기 서비스 전체가 멈춘다. 평소에 `maximum-pool-size`, `max-lifetime` 설정을 확인하고, 트랜잭션 안에 느린 I/O가 없는지 리뷰하는 것만으로도 많은 장애를 예방할 수 있다.

다음 편부터는 심화 시리즈로, MySQL과 PostgreSQL의 내부 구조 차이를 다룬다.
