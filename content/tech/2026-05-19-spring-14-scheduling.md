---
title: "[Spring 완전 정복 #14] Spring @Scheduled — cron 표현식과 다중 서버 중복 실행 방지"
date: 2026-05-19
draft: false
series: "Spring 완전 정복"
series_order: 14
series_total: 14
categories: ["Spring"]
tags: [spring, scheduling, scheduled, cron, shedlock, java, backend]
description: "fixedRate vs fixedDelay vs cron 차이, 크론 표현식 작성법, 단일 스레드 함정, 그리고 다중 서버 환경에서 ShedLock으로 중복 실행을 방지하는 방법을 정리한다."
wiki_source: 10-wiki/tech/spring/12-spring-scheduling.md
---

## 매일 새벽 2시에 배치를 실행하려면

통계 집계, 만료 데이터 정리, 리포트 생성 같은 작업은 주기적으로 실행해야 한다. Spring `@Scheduled`는 메서드에 어노테이션 하나만 붙여서 이런 작업을 등록할 수 있다.

단 하나의 함정이 있다. **서버가 여러 대라면 모든 서버가 동시에 실행한다.**

---

## 기본 설정

```java
@Configuration
@EnableScheduling  // 스케줄링 활성화
public class SchedulingConfig {

    // 기본값은 단일 스레드 — 독립 실행이 필요하면 풀 설정
    @Bean
    public TaskScheduler taskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(5);
        scheduler.setThreadNamePrefix("scheduled-");
        scheduler.initialize();
        return scheduler;
    }
}
```

기본값이 단일 스레드라는 점을 기억해두자. 스케줄 메서드 A가 10초 걸리면 B는 A가 끝날 때까지 대기한다. 독립적으로 실행돼야 한다면 위처럼 스레드 풀을 설정해야 한다.

---

## 세 가지 실행 방식

### fixedRate — 시작 시점 기준

```java
@Scheduled(fixedRate = 5000)  // 5초마다 (이전 실행 시작으로부터)
public void fixedRateTask() { ... }
```

```text
실행 시작: 0초
실행 완료: 3초
다음 시작: 5초 (0초 + 5초)
다음 시작: 10초 (5초 + 5초)
```

실행 시간이 주기를 초과하면 다음 실행이 겹칠 수 있다(스레드 풀이 있을 때).

### fixedDelay — 완료 시점 기준

```java
@Scheduled(fixedDelay = 5000)  // 이전 실행 완료 후 5초
public void fixedDelayTask() { ... }
```

```text
실행 시작: 0초
실행 완료: 3초
다음 시작: 8초 (3초 완료 + 5초)
```

실행이 아무리 오래 걸려도 완료 후 5초 뒤에 시작한다. 겹칠 위험이 없다.

### cron — 특정 시각에 실행

```java
@Scheduled(cron = "0 0 2 * * *")  // 매일 새벽 2시
public void dailyBatchJob() { ... }

@Scheduled(cron = "0 */30 9-18 * * MON-FRI")  // 평일 9~18시 30분마다
public void businessHoursTask() { ... }
```

### 크론 표현식 구조

```text
초  분  시  일  월  요일
0   0   2   *   *   *    → 매일 02:00:00
```

자주 쓰는 표현:

```text
"0 0 * * * *"       // 매 시간 정각
"0 0 0 * * *"       // 매일 자정
"0 0 0 1 * *"       // 매월 1일 자정
"0 0 9 * * MON-FRI" // 평일 오전 9시
"0 */5 * * * *"     // 5분마다
```

### 환경별 cron 분리

로컬에서는 빠르게 테스트하고, 운영에서는 실제 스케줄을 적용한다.

```yaml
# application.yml
schedule:
  daily-batch:
    cron: "0 0 2 * * *"

# application-local.yml
schedule:
  daily-batch:
    cron: "0 */1 * * * *"  # 1분마다 테스트
```

```java
@Scheduled(cron = "${schedule.daily-batch.cron}")
public void dailyBatch() { ... }
```

---

## 다중 서버 환경의 중복 실행 문제

서버가 3대면 새벽 2시에 배치가 3번 실행된다.

```text
서버 A ─┐
서버 B ─┼─ 모두 02:00에 dailyBatch() 실행 → 데이터 3번 처리
서버 C ─┘
```

### 해결: ShedLock

DB나 Redis를 락 저장소로 사용해 **단 하나의 서버만** 실행을 보장한다.

```xml
<dependency>
    <groupId>net.javacrumbs.shedlock</groupId>
    <artifactId>shedlock-spring</artifactId>
</dependency>
<dependency>
    <groupId>net.javacrumbs.shedlock</groupId>
    <artifactId>shedlock-provider-jdbc-template</artifactId>
</dependency>
```

```sql
-- 락 테이블 (MySQL)
CREATE TABLE shedlock (
    name        VARCHAR(64)  NOT NULL,
    lock_until  TIMESTAMP(3) NOT NULL,
    locked_at   TIMESTAMP(3) NOT NULL,
    locked_by   VARCHAR(255) NOT NULL,
    PRIMARY KEY (name)
);
```

```java
@Configuration
@EnableScheduling
@EnableSchedulerLock(defaultLockAtMostFor = "10m")
public class SchedulingConfig {
    @Bean
    public LockProvider lockProvider(DataSource dataSource) {
        return new JdbcTemplateLockProvider(dataSource);
    }
}
```

```java
@Service
public class BatchJobService {

    @Scheduled(cron = "0 0 2 * * *")
    @SchedulerLock(
        name = "dailyBatchJob",   // 유니크한 락 이름
        lockAtLeastFor = "5m",    // 빠르게 끝나도 5분간 락 유지 (중복 방지)
        lockAtMostFor = "30m"     // 서버가 죽어도 30분 후 자동 해제
    )
    public void dailyBatchJob() {
        // 이 서버만 실행 — 다른 서버는 락을 잡지 못해 건너뜀
        processOrders();
    }
}
```

`lockAtMostFor`이 중요하다. 서버가 배치 실행 중에 죽으면 DB의 락 레코드가 남아있게 된다. 이 설정이 있어야 일정 시간 후 락이 자동으로 해제된다.

---

## 주의사항

### 예외는 반드시 잡는다

```java
@Scheduled(cron = "0 0 2 * * *")
public void dailyBatch() {
    try {
        processBatch();
    } catch (Exception e) {
        log.error("배치 실패", e);
        alertService.sendAlert("dailyBatch 실패: " + e.getMessage());
    }
}
```

예외가 전파되면 다음 실행이 안 될 수 있다. 항상 try-catch로 잡고 알림을 보내는 것이 좋다.

### 트랜잭션은 서비스에 위임

```java
@Scheduled(cron = "0 0 2 * * *")
public void dailyBatch() {
    batchService.processDailyOrders(); // @Transactional이 있는 서비스에 위임
}
```

`@Scheduled`는 트랜잭션을 자동으로 걸지 않는다. 필요하면 `@Transactional`을 추가하거나 서비스 레이어에 위임한다.

---

## 마치며

단일 서버라면 `@Scheduled`만으로 충분하다. 다중 서버 환경이라면 중복 실행 방지가 필수다. **ShedLock**이 가장 간단한 해결책이다. DB에 락 레코드를 남기는 방식이라 별도 인프라 없이 사용할 수 있다. 복잡한 잡 관리(의존성, 재시도, 히스토리)가 필요하다면 Quartz를 고려한다.

Spring 시리즈 마지막 편이다. Servlet 기초부터 스케줄링까지 14편을 통해 Spring의 핵심 구조를 정리했다.
