---
title: "인터페이스 vs 추상 클래스 — 면접 단골 질문, 제대로 이해하기"
date: 2026-06-14
draft: false
target_section: tech
series: "Java 핵심 개념"
series_order: 3
series_total: 7
tags: [java, interface, abstract-class, default-method, functional-interface, lambda]
description: "인터페이스는 계약, 추상 클래스는 공통 구현 공유. 차이를 표로 외우는 게 아니라 왜 그렇게 설계됐는지 이해하면 언제 뭘 쓸지 자연스럽게 알게 된다."
wiki_source: 10-wiki/tech/java/07-interface-abstract.md
categories: [Java]
---

## 표를 외우는 것보다 중요한 것

인터페이스와 추상 클래스의 차이를 묻는 면접 질문에 많은 사람이 표를 외워서 답한다. 다중 구현 가능 여부, 생성자 유무, 필드 허용 여부...

하지만 진짜 중요한 건 **왜 그렇게 설계됐는지**다. 이걸 이해하면 표를 외우지 않아도 언제 무엇을 써야 할지 판단할 수 있다.

---

## 인터페이스 — "무엇을 할 수 있는가"의 계약

인터페이스는 구현 클래스가 "어떤 기능을 제공하겠다"는 약속이다.

```java
public interface PaymentService {
    void process(int amount);
    boolean cancel(String orderId);
}

public class KakaopayService implements PaymentService {
    @Override
    public void process(int amount) { /* 카카오페이 결제 로직 */ }

    @Override
    public boolean cancel(String orderId) { /* 취소 로직 */ }
}

public class NaverPayService implements PaymentService {
    @Override
    public void process(int amount) { /* 네이버페이 결제 로직 */ }

    @Override
    public boolean cancel(String orderId) { /* 취소 로직 */ }
}
```

`PaymentService` 인터페이스 하나로 카카오페이, 네이버페이를 동일하게 다룰 수 있다. Spring DI에서 이 패턴을 그대로 쓴다.

```java
@Service
public class OrderService {
    private final PaymentService paymentService; // 구현체가 아닌 인터페이스에 의존

    // Spring이 KakaopayService 또는 NaverPayService를 주입
    public OrderService(PaymentService paymentService) {
        this.paymentService = paymentService;
    }
}
```

### 다중 구현이 가능한 이유

Java는 클래스 단일 상속만 허용하지만 인터페이스는 여러 개 구현할 수 있다.

```java
// 오리는 날 수도, 헤엄칠 수도 있다
public class Duck extends Animal implements Flyable, Swimmable {
    @Override public void fly() { ... }
    @Override public void swim() { ... }
}
```

### Java 8+ default 메서드

인터페이스에 구현을 추가할 수 있게 됐다. 기존 인터페이스에 메서드를 추가해도 구현 클래스들이 깨지지 않는 장점이 있다.

```java
public interface PaymentService {
    void process(int amount);

    default void processWithLog(int amount) {
        System.out.println("결제 시작: " + amount);
        process(amount);
        System.out.println("결제 완료");
    }
}
// 기존 KakaopayService, NaverPayService는 수정 없이 processWithLog() 사용 가능
```

---

## 추상 클래스 — "공통 구현을 공유"

추상 클래스는 "is-a" 관계에서 공통 로직을 여러 자식이 공유할 때 쓴다.

```java
public abstract class BaseService<T, ID> {
    protected final Logger log = LoggerFactory.getLogger(getClass());

    // 공통 구현 — 모든 자식이 동일하게 사용
    public T findById(ID id) {
        log.debug("조회: {}", id);
        return doFindById(id); // 실제 구현은 자식에게 위임
    }

    // 추상 메서드 — 자식이 반드시 구현
    protected abstract T doFindById(ID id);
}

public class UserService extends BaseService<User, Long> {
    @Override
    protected User doFindById(Long id) {
        return userRepository.findById(id).orElseThrow();
    }
}
```

이것이 **Template Method 패턴**이다. 알고리즘 골격(로그 출력 → 조회 → 반환)은 부모가 정의하고, 세부 구현만 자식이 담당한다.

추상 클래스는 생성자와 인스턴스 변수를 가질 수 있어서 상태를 공유할 때도 유리하다.

```java
public abstract class AbstractRepository<T> {
    protected final EntityManager em; // 모든 Repository가 공유

    public AbstractRepository(EntityManager em) {
        this.em = em;
    }
}
```

---

## 언제 무엇을 선택하는가

한 문장으로 정리하면:

```
인터페이스  → "무엇을 할 수 있는가 (can-do)" — 계약, 다형성
추상 클래스 → "무엇인가 (is-a)" — 공통 구현, 상태 공유
```

**인터페이스를 선택할 때:**

```
1. 관련 없는 클래스들이 같은 기능을 가져야 할 때
   → Serializable, Comparable — Dog, Integer, String 모두 구현 가능

2. 다중 구현이 필요할 때
   → Flyable + Swimmable 동시에

3. Spring DI에서 구현체를 교체할 수 있게 할 때
   → 테스트 시 MockPaymentService로 교체
```

**추상 클래스를 선택할 때:**

```
1. 관련 클래스들이 공통 코드를 공유해야 할 때
   → BaseController, AbstractEntity

2. 상태(필드)를 공유해야 할 때
   → EntityManager, Logger 공유

3. Template Method 패턴 — 알고리즘 골격 고정
```

---

## 함수형 인터페이스와 람다

추상 메서드가 **딱 1개**인 인터페이스를 함수형 인터페이스라 한다. 람다 표현식으로 구현할 수 있다.

```java
// 익명 클래스로 구현 (Java 8 이전)
Comparator<String> comp = new Comparator<String>() {
    @Override
    public int compare(String a, String b) {
        return a.compareTo(b);
    }
};

// 람다로 구현 (Java 8+)
Comparator<String> comp = (a, b) -> a.compareTo(b);

// 메서드 레퍼런스로 더 간결하게
Comparator<String> comp = String::compareTo;
```

자주 쓰는 함수형 인터페이스:

```java
Predicate<String> notEmpty = s -> !s.isEmpty();   // 조건 검사
Function<String, Integer> length = String::length; // 변환
Consumer<String> print = System.out::println;      // 소비 (반환 없음)
Supplier<String> uuid = () -> UUID.randomUUID().toString(); // 공급
```

---

## default 메서드 충돌

두 인터페이스가 같은 이름의 default 메서드를 가지면 구현 클래스에서 직접 해결해야 한다.

```java
interface A { default void hello() { System.out.println("A"); } }
interface B { default void hello() { System.out.println("B"); } }

class C implements A, B {
    @Override
    public void hello() {
        A.super.hello(); // A의 default 명시적 선택
    }
}
```

---

## 마치며

인터페이스와 추상 클래스의 차이를 외우는 것보다, "이 설계가 계약(can-do)인가, 공통 구현 공유(is-a)인가"를 생각하는 습관이 더 중요하다.

실무에서는 Spring DI 덕분에 인터페이스를 훨씬 더 많이 쓰게 된다. 다음 편에서는 코드가 실행되는 환경인 **JVM 메모리 구조와 GC**를 살펴본다.
