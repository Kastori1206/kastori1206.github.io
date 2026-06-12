---
title: "Java 클래스와 객체 — 접근 제어자, static, 불변 객체까지"
date: 2026-06-12
draft: false
target_section: tech
series: "Java 핵심 개념"
series_order: 1
series_total: 7
tags: [java, class, object, constructor, access-modifier, static, immutable]
description: "클래스와 객체의 관계부터 접근 제어자, static의 적절한 사용, 불변 객체까지. Java 코드를 제대로 설계하기 위한 기본기를 정리한다."
wiki_source: 10-wiki/tech/java/05-class-object.md
categories: [Java]
---

## 클래스는 설계도, 객체는 실체다

Java를 처음 배울 때 "클래스는 설계도고 객체는 그 설계도로 찍어낸 결과물"이라는 설명을 들었을 것이다. 맞는 말이지만 그게 실무에서 어떤 의미인지는 코드를 좀 써봐야 느낀다.

클래스를 잘 설계한다는 건 세 가지를 잘 결정하는 것이다. **무엇을 숨기고**, **어떻게 초기화하며**, **무엇을 공유할지**.

---

## 접근 제어자 — 무엇을 숨길 것인가

Java에는 4가지 접근 제어자가 있다.

| 제어자 | 같은 클래스 | 같은 패키지 | 자식 클래스 | 외부 |
|-------|-----------|-----------|-----------|------|
| `public` | ✅ | ✅ | ✅ | ✅ |
| `protected` | ✅ | ✅ | ✅ | ❌ |
| (없음) | ✅ | ✅ | ❌ | ❌ |
| `private` | ✅ | ❌ | ❌ | ❌ |

실무에서 지키는 원칙은 단순하다.

```java
// ❌ 필드를 public으로 열어두면 외부에서 제약 없이 수정 가능
public class BankAccount {
    public int balance = 1000;
}
account.balance = -9999; // 막을 방법이 없다

// ✅ private으로 숨기고, 메서드로 검증
public class BankAccount {
    private int balance;

    public void deposit(int amount) {
        if (amount <= 0) throw new IllegalArgumentException("금액은 0보다 커야 합니다");
        balance += amount;
    }

    public int getBalance() { return balance; }
}
```

필드는 `private`, 외부에 노출할 메서드만 `public`으로 선언하는 게 기본이다.

---

## 생성자 — 어떻게 초기화할 것인가

생성자는 객체가 만들어지는 순간 실행된다. 잘못된 상태로 객체가 만들어지는 걸 막는 첫 번째 방어선이다.

```java
public class Order {
    private final Long id;
    private String status;
    private final LocalDateTime createdAt;

    public Order(Long id) {
        if (id == null) throw new IllegalArgumentException("id는 필수입니다");
        this.id = id;
        this.status = "PENDING";
        this.createdAt = LocalDateTime.now();
    }
}
```

필드가 많아지면 생성자 인자가 길어져 가독성이 떨어진다. 이럴 때 **빌더 패턴**을 쓴다.

```java
// 인자 순서를 외워야 하는 생성자
new User(1L, "홍길동", 30, "서울", "개발자", true);

// 빌더 — 무엇을 세팅하는지 명확
User user = User.builder()
    .id(1L)
    .name("홍길동")
    .age(30)
    .build();
```

Lombok의 `@Builder`를 쓰면 직접 구현할 필요 없이 쓸 수 있다.

---

## static — 무엇을 공유할 것인가

`static`은 인스턴스 없이 클래스에 붙어있는 것들이다.

```java
public class Counter {
    private static int total = 0; // 모든 인스턴스가 공유
    private int count = 0;        // 인스턴스마다 독립

    public void increment() {
        count++;
        total++;
    }
}

Counter a = new Counter();
Counter b = new Counter();
a.increment(); a.increment();
b.increment();

System.out.println(Counter.total); // 3
System.out.println(a.count);       // 2
System.out.println(b.count);       // 1
```

`static`을 쓰기 적합한 경우는 명확하다.

```
✅ 유틸리티 메서드: Math.abs(), Collections.sort()
✅ 상수: static final MAX_SIZE = 100
✅ 팩토리 메서드: LocalDate.of(2026, 6, 13)

❌ 상태(가변 필드)를 static으로 → 멀티스레드 위험
❌ 서비스 로직을 static으로 → 테스트 어렵고 DI 불가
```

---

## 불변 객체 — 한번 만들면 바뀌지 않는다

불변 객체(Immutable Object)는 한번 생성하면 상태가 바뀌지 않는 객체다. 만드는 방법은 간단하다.

```java
public final class Money {           // 1. 상속 막기 (final class)
    private final int amount;        // 2. 필드를 final로
    private final String currency;

    public Money(int amount, String currency) {
        if (amount < 0) throw new IllegalArgumentException();
        this.amount = amount;
        this.currency = currency;
    }

    // 3. setter 없음
    // 4. 변경 필요시 새 객체 반환
    public Money add(Money other) {
        return new Money(this.amount + other.amount, this.currency);
    }
}
```

불변 객체가 왜 좋은가?

```
스레드 안전   → 상태가 안 바뀌니 동기화 불필요
부작용 없음   → 메서드 호출이 외부에 영향을 안 줌
추론 쉬움     → 값이 바뀌지 않으니 버그 추적이 단순해짐
```

컬렉션 필드가 있을 때는 **방어적 복사**를 해야 한다.

```java
public class Team {
    private final List<String> members;

    public Team(List<String> members) {
        this.members = new ArrayList<>(members); // 외부 리스트와 분리
    }

    public List<String> getMembers() {
        return Collections.unmodifiableList(members); // 읽기 전용으로 반환
    }
}
```

---

## equals와 hashCode는 항상 함께

HashMap, HashSet에서 객체를 키로 쓰려면 `equals`와 `hashCode`를 둘 다 오버라이드해야 한다.

```java
@Override
public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof Money)) return false;
    Money other = (Money) o;
    return amount == other.amount && currency.equals(other.currency);
}

@Override
public int hashCode() {
    return Objects.hash(amount, currency);
}
```

**규칙**: `equals()`가 true이면 `hashCode()`도 같아야 한다. 하나만 오버라이드하면 HashMap에서 오동작한다.

---

## 마치며

클래스 설계에서 기억할 것 세 가지: 필드는 `private`으로 숨기고, 생성자에서 유효성을 검증하며, 변경 필요 없는 객체는 불변으로 만든다. 이 세 가지를 지키는 것만으로도 버그가 줄고 코드가 읽기 쉬워진다.

다음 편에서는 클래스 간의 관계, **상속과 다형성**을 다룬다.
