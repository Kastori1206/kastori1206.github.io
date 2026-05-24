---
title: "if/else 지옥에서 탈출하기 — 전략 패턴 + Spring Bean 자동 주입"
date: 2026-05-24
draft: false
target_section: tech
series: "Java 객체지향 실전"
series_order: 1
tags: [java, oop, spring, design-pattern]
description: "결제 수단이 늘어날 때마다 if/else를 추가하고 있다면, 전략 패턴과 Spring Bean 자동 주입으로 OCP를 달성하는 방법을 소개한다."
wiki_source: 10-wiki/tech/java-oop-patterns/01-strategy-pattern.md
categories: [Java]
---

## 이런 코드, 본 적 있지 않나요?

```java
public void pay(String method, long amount) {
    if ("CARD".equals(method)) {
        // 카드 결제 로직
    } else if ("KAKAO_PAY".equals(method)) {
        // 카카오페이 로직
    } else if ("NAVER_PAY".equals(method)) {
        // 네이버페이 로직
    } else {
        throw new IllegalArgumentException("지원하지 않는 결제 수단: " + method);
    }
}
```

처음 만들 때는 두 개였던 분기가, 어느 날 기획자가 "토스페이도 붙여주세요"라고 하면 세 개가 되고, "삼성페이도요"가 따라오면 네 개가 된다. 수백 줄짜리 서비스 클래스의 탄생이다.

새로운 결제 수단이 추가될 때마다 `PaymentService`를 열어야 한다는 것, 그리고 이미 잘 돌아가고 있는 코드를 건드려야 한다는 긴장감. 이것이 **OCP(개방-폐쇄 원칙) 위반**이다.

---

## 전략 패턴으로 분기를 없애보자

전략 패턴의 핵심은 단순하다. **"같은 역할을 하는 것들을 인터페이스로 묶는다."** 카드 결제, 카카오페이, 네이버페이는 모두 "결제"라는 같은 역할을 한다. 이걸 인터페이스 하나로 추상화하면 된다.

### 1단계: 전략 인터페이스 정의

```java
public interface PaymentStrategy {
    String getMethod();   // "CARD", "KAKAO_PAY" 등 구분 키
    void pay(long amount);
}
```

### 2단계: 전략 구현체를 각각 @Component로 등록

```java
@Component
public class CardPaymentStrategy implements PaymentStrategy {

    @Override
    public String getMethod() {
        return "CARD";
    }

    @Override
    public void pay(long amount) {
        // 실제 카드사 API 호출 로직
        System.out.println("카드 결제 처리: " + amount + "원");
    }
}
```

```java
@Component
public class KakaoPayStrategy implements PaymentStrategy {

    @Override
    public String getMethod() {
        return "KAKAO_PAY";
    }

    @Override
    public void pay(long amount) {
        // 카카오페이 API 호출 로직
        System.out.println("카카오페이 결제 처리: " + amount + "원");
    }
}
```

### 3단계: Service에서 List로 주입받아 Map으로 변환

Spring의 강력한 기능 중 하나는 특정 인터페이스의 **모든 구현체를 List로 자동 주입**해 준다는 것이다.

```java
@Service
public class PaymentService {

    private final Map<String, PaymentStrategy> strategyMap;

    // Spring이 PaymentStrategy 구현체 전부를 List로 수집해 줌
    public PaymentService(List<PaymentStrategy> strategies) {
        this.strategyMap = strategies.stream()
            .collect(Collectors.toMap(PaymentStrategy::getMethod, Function.identity()));
    }

    public void pay(String method, long amount) {
        PaymentStrategy strategy = strategyMap.get(method);
        if (strategy == null) {
            throw new IllegalArgumentException("지원하지 않는 결제 수단: " + method);
        }
        strategy.pay(amount);
    }
}
```

if/else가 사라졌다. `strategyMap.get(method)` 한 줄이 모든 분기를 대신한다.

---

## 토스페이를 추가하고 싶다면?

```java
// 이 파일 하나만 추가하면 끝
@Component
public class TossPayStrategy implements PaymentStrategy {

    @Override
    public String getMethod() {
        return "TOSS_PAY";
    }

    @Override
    public void pay(long amount) {
        System.out.println("토스페이 결제 처리: " + amount + "원");
    }
}
```

`PaymentService`는 단 한 줄도 수정하지 않는다. Spring이 애플리케이션 기동 시 `TossPayStrategy`를 자동으로 수집해 `strategyMap`에 등록한다. 이것이 OCP다.

---

## 같은 패턴, 다른 도메인에도 그대로

결제뿐 아니라 알림 채널(이메일, SMS, 슬랙)에도 완전히 같은 구조를 쓸 수 있다.

```java
public interface NotificationStrategy {
    String getChannel(); // "EMAIL", "SMS", "SLACK"
    void send(String recipient, String message);
}
```

```java
@Component
public class EmailNotificationStrategy implements NotificationStrategy {
    @Override
    public String getChannel() { return "EMAIL"; }

    @Override
    public void send(String recipient, String message) {
        // JavaMailSender 등 이메일 발송 로직
    }
}
```

```java
@Service
public class NotificationService {

    private final Map<String, NotificationStrategy> strategyMap;

    public NotificationService(List<NotificationStrategy> strategies) {
        this.strategyMap = strategies.stream()
            .collect(Collectors.toMap(NotificationStrategy::getChannel, Function.identity()));
    }

    public void send(String channel, String recipient, String message) {
        NotificationStrategy strategy = strategyMap.get(channel);
        if (strategy == null) {
            throw new IllegalArgumentException("지원하지 않는 알림 채널: " + channel);
        }
        strategy.send(recipient, message);
    }
}
```

---

## 테스트도 훨씬 쉬워진다

전략 패턴의 또 다른 장점은 테스트 가능성이다. 각 전략을 독립적으로 테스트할 수 있고, `PaymentService` 테스트도 필요한 전략만 골라서 넣을 수 있다.

```java
@Test
void 카드_결제_전략이_정상_호출된다() {
    CardPaymentStrategy cardStrategy = new CardPaymentStrategy();
    KakaoPayStrategy kakaoStrategy = new KakaoPayStrategy();
    PaymentService service = new PaymentService(List.of(cardStrategy, kakaoStrategy));

    // if/else 전체를 거칠 필요 없이 해당 케이스만 테스트
    assertDoesNotThrow(() -> service.pay("CARD", 10000L));
}

@Test
void 지원하지_않는_결제수단_예외() {
    PaymentService service = new PaymentService(List.of(new CardPaymentStrategy()));

    assertThatThrownBy(() -> service.pay("BITCOIN", 10000L))
        .isInstanceOf(IllegalArgumentException.class);
}
```

---

## 핵심 정리

| 항목 | 내용 |
|------|------|
| OCP 달성 | 새 전략 추가 = 새 `@Component` 클래스 하나, 기존 코드 수정 없음 |
| Spring 자동화 | `List<인터페이스>` 주입 → 구현체 전부 자동 수집 |
| 테스트 용이성 | 전략별 독립 단위 테스트 가능 |

**마치며**: 분기가 늘어날 것 같다는 예감이 들 때, `@Component` + `List<인터페이스>` 조합을 떠올려 보자. if/else가 들어갈 자리를 인터페이스가 대신한다.
