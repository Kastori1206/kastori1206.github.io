---
title: "OOP와 SOLID — Spring이 왜 이렇게 설계됐는지 이해하는 열쇠"
date: 2026-06-18
draft: false
target_section: tech
series: "Java 핵심 개념"
series_order: 7
series_total: 7
tags: [java, oop, solid, srp, ocp, lsp, isp, dip, spring, design-principles]
description: "SOLID는 추상적인 원칙이 아니다. Spring의 DI가 DIP의 구현이고, @Transactional이 OCP의 사례다. Spring을 쓰면서 이미 SOLID를 적용하고 있다는 걸 코드로 확인한다."
wiki_source: 10-wiki/tech/java/04-oop-solid.md
categories: [Java]
---

## SOLID를 외우지 말고 이해하자

SOLID는 면접에서 "SRP는 단일 책임 원칙이고..."로 외워서 답하는 것이 아니다. 실제로 코드에 적용해서 "왜 이렇게 짰는지"를 설명할 수 있어야 한다.

좋은 소식이 있다. Spring을 쓰면서 이미 SOLID를 적용하고 있다.

---

## OOP 4대 원칙 — 한 줄 정리

앞 시리즈에서 다룬 내용의 요약이다.

| 원칙 | 한 줄 | 코드 키워드 |
|------|------|-----------|
| 캡슐화 | 내부를 숨기고 인터페이스만 노출 | `private` 필드, getter/setter |
| 상속 | 부모의 속성을 물려받음 | `extends`, `super` |
| 다형성 | 같은 타입으로 다양한 구현 | 인터페이스, 업캐스팅 |
| 추상화 | 복잡한 내부를 숨기고 핵심만 노출 | `interface`, `abstract` |

---

## S — 단일 책임 원칙 (SRP)

> "클래스는 하나의 이유로만 변경되어야 한다."

```java
// ❌ SRP 위반 — 주문 처리와 이메일 발송이 한 클래스에
public class OrderService {
    public void createOrder(Order order) { ... }
    public void sendConfirmationEmail(Order order) { ... } // 이메일 책임이 왜 여기?
}

// ✅ SRP 준수 — 책임 분리
public class OrderService {
    public void createOrder(Order order) { ... }
}

public class EmailService {
    public void sendConfirmationEmail(Order order) { ... }
}
```

"이 클래스가 변경되는 이유가 몇 가지인가?"로 체크한다. 이메일 템플릿이 바뀌어도 `OrderService`가 수정된다면 SRP를 위반하고 있다.

---

## O — 개방-폐쇄 원칙 (OCP)

> "확장에는 열려있고, 수정에는 닫혀있어야 한다."

```java
// ❌ OCP 위반 — 결제 수단 추가할 때마다 기존 코드 수정
public void pay(String type, int amount) {
    if (type.equals("kakao")) { ... }
    else if (type.equals("naver")) { ... }
    else if (type.equals("toss")) { ... } // 추가할 때마다 여기 수정
}

// ✅ OCP 준수 — 새 구현체만 추가하면 됨
public interface PaymentStrategy {
    void pay(int amount);
}

public class KakaoPay implements PaymentStrategy { ... }
public class NaverPay implements PaymentStrategy { ... }
// Toss 추가 = TossPay 클래스만 추가. 기존 코드 수정 없음
```

Spring DI가 OCP를 지원하는 방식이다. `OrderService`는 `PaymentStrategy` 인터페이스만 알고, 어떤 구현체가 주입될지는 신경 쓰지 않는다.

---

## L — 리스코프 치환 원칙 (LSP)

> "자식 클래스는 부모 클래스를 대체할 수 있어야 한다."

```java
// ❌ LSP 위반
public class Rectangle {
    int width, height;
    public int area() { return width * height; }
}

public class Square extends Rectangle {
    @Override
    public void setWidth(int w) {
        this.width = w;
        this.height = w; // 정사각형이라 높이도 같이 바꿈
    }
}

Rectangle r = new Square();
r.setWidth(5);
r.setHeight(3);
System.out.println(r.area()); // 예상: 15, 실제: 9 (Square의 setWidth가 height도 바꿨으므로)
```

부모 자리에 자식을 넣었을 때 예상대로 동작하지 않으면 LSP 위반이다. 해결책: 상속 대신 별도 클래스로 분리하거나 인터페이스로.

---

## I — 인터페이스 분리 원칙 (ISP)

> "클라이언트가 사용하지 않는 메서드에 의존하지 않아야 한다."

```java
// ❌ ISP 위반 — 너무 큰 인터페이스
public interface Worker {
    void work();
    void eat();
    void sleep();
}

// Robot은 eat, sleep이 필요 없지만 구현 강제됨
public class Robot implements Worker {
    public void work() { ... }
    public void eat() { throw new UnsupportedOperationException(); } // 억지로
    public void sleep() { throw new UnsupportedOperationException(); }
}

// ✅ ISP 준수 — 인터페이스 분리
public interface Workable { void work(); }
public interface Eatable { void eat(); }

public class Human implements Workable, Eatable { ... }
public class Robot implements Workable { ... } // 필요한 것만
```

---

## D — 의존성 역전 원칙 (DIP)

> "고수준 모듈이 저수준 모듈에 의존하면 안 된다. 둘 다 추상화에 의존해야 한다."

```java
// ❌ DIP 위반 — 구체 클래스에 직접 의존
public class OrderService {
    private KakaopayService kakaopay = new KakaopayService(); // 이 구현체에 묶임
}

// ✅ DIP 준수 — 추상화(인터페이스)에 의존
public class OrderService {
    private final PaymentService paymentService; // 인터페이스에 의존

    public OrderService(PaymentService paymentService) { // 외부에서 주입
        this.paymentService = paymentService;
    }
}
```

이게 Spring DI다. `OrderService`는 `PaymentService` 인터페이스만 알고, 실제 구현체(`KakaopayService`, `NaverPayService`)는 Spring이 주입한다.

---

## SOLID가 Spring에서 어떻게 쓰이는가

| SOLID | Spring 적용 사례 |
|-------|----------------|
| SRP | `@Service`, `@Repository` — 계층별로 책임 분리 |
| OCP | 인터페이스 기반 Bean — 구현체 교체해도 코드 수정 불필요 |
| LSP | Spring AOP 프록시 — 원본 Bean 대신 프록시가 들어가도 정상 동작 |
| ISP | `JpaRepository`의 세분화된 인터페이스 상속 구조 |
| DIP | `@Autowired` DI — 구체 클래스 대신 인터페이스에 의존 |

`@Transactional`도 OCP의 사례다. 트랜잭션 로직을 모든 서비스 메서드에 직접 쓰지 않고, AOP로 분리해서 적용한다. 서비스 코드는 수정하지 않고 기능을 추가하는 것이다.

---

## 제네릭과 어노테이션은 부록

### 제네릭 — 컴파일 타임 타입 안전성

```java
// 제네릭 없이 — 런타임에 ClassCastException 위험
List list = new ArrayList();
list.add("hello");
String s = (String) list.get(0); // 캐스팅 필요, 틀리면 런타임 오류

// 제네릭 사용 — 컴파일 타임에 타입 체크
List<String> list = new ArrayList<>();
list.add(123); // 컴파일 오류 — 미리 잡힘
```

Spring에서 `ResponseEntity<T>`, `List<UserDto>`, `Optional<User>` 등을 쓸 때 항상 제네릭이 등장한다.

### 어노테이션 — 붙이는 것만으로는 아무 일도 없다

```java
@Service // 이걸 붙이는 것만으로 Bean이 되지 않는다
public class UserService { ... }
```

Spring이 시작될 때 리플렉션으로 `@Service`를 읽고, Bean으로 등록하는 것이다. 어노테이션은 "이 클래스를 Bean으로 등록해줘"라는 표시일 뿐, 실제 동작은 Spring의 ApplicationContext가 한다.

---

## 시리즈를 마치며

Java 핵심 개념 7편을 통해 다룬 것들:

```
#1 클래스와 객체   — 캡슐화, 불변 객체, 방어적 복사
#2 상속과 다형성   — 동적 바인딩, 컴포지션 vs 상속
#3 인터페이스      — 계약, 다중 구현, 함수형 인터페이스
#4 JVM 메모리     — Heap/Stack, GC, OOM 원인
#5 컬렉션         — ArrayList/HashMap 내부 구조, ConcurrentHashMap
#6 동시성         — synchronized, volatile, ThreadLocal
#7 OOP & SOLID   — Spring 설계의 기반
```

이 개념들은 Spring을 쓰면서 매일 마주치는 것들이다. 코드를 쓸 때 "이게 왜 이렇게 됐지?"라는 질문이 생기면, 이 시리즈가 출발점이 되길 바란다.
