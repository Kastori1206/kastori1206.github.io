---
title: "[Spring 완전 정복 #2] Spring Core — IoC, DI, AOP를 코드로 이해하기"
date: 2026-05-19
draft: false
series: "Spring 완전 정복"
series_order: 2
series_total: 14
categories: ["Spring"]
tags: [spring, ioc, di, aop, bean, java, backend]
description: "Spring이 어노테이션 하나로 마법처럼 동작하는 이유, IoC/DI가 왜 필요한지, AOP 프록시가 @Transactional을 어떻게 처리하는지를 코드로 풀어낸다."
wiki_source: 10-wiki/tech/spring/02-spring-core.md
---

## "@Service만 붙이면 왜 되는 걸까?"

Spring을 처음 쓸 때 누구나 한 번쯤 갖는 의문이다. 클래스에 어노테이션 하나 달았을 뿐인데 의존성이 주입되고, `@Transactional`만 붙이면 트랜잭션이 처리된다.

이게 "마법"처럼 느껴지는 건, 내부 동작을 모르기 때문이다. 이 글에서는 Spring의 핵심 메커니즘 세 가지 — **IoC, DI, AOP** — 를 코드 수준에서 풀어낸다.

---

## 어노테이션은 라벨일 뿐이다

먼저 오해를 하나 짚고 시작한다. `@Service`, `@Autowired` 같은 어노테이션은 **그 자체로 아무 일도 하지 않는다.**

Java 어노테이션은 코드에 붙이는 메타데이터다. Spring Container가 없다면 `@Service`를 붙여도 그냥 라벨이 붙은 일반 클래스일 뿐이다.

Spring이 하는 일은 애플리케이션 시작 시 리플렉션으로 클래스를 스캔해서 어노테이션을 읽고, 그에 따라 동작을 결정하는 것이다.

```
애플리케이션 시작
  → @ComponentScan이 지정 패키지 하위를 전부 탐색
  → 각 클래스를 리플렉션으로 읽음
  → @Service/@Repository 발견 → "Bean으로 등록"
  → @Autowired 발견 → "등록된 Bean 중 타입 맞는 것을 주입"
  → @Transactional 발견 → "CGLIB 프록시로 감싸기"
```

Spring이 이 과정을 대신 처리해준다. 개발자가 직접 구현하면 아래처럼 된다.

```java
// Spring 내부에서 실제로 일어나는 일 (단순화)
for (Class<?> clazz : scannedClasses) {
    if (clazz.isAnnotationPresent(Component.class)) {
        Object instance = clazz.getDeclaredConstructor().newInstance();
        beanContainer.register(clazz, instance);
    }
}
```

이걸 자동으로 해주는 것이 Spring의 핵심이다.

---

## IoC — 제어권을 Spring에게 넘기다

전통적인 방식에서는 개발자가 객체를 직접 생성하고 의존성을 연결한다.

```java
public class OrderService {
    // 직접 생성 — 강한 결합
    private PaymentService paymentService = new PaymentService();
}
```

이 코드의 문제는 `OrderService`가 `PaymentService`의 구체적인 구현에 묶여있다는 점이다. `PaymentService` 구현을 `KakaopayService`로 바꾸려면 `OrderService`도 수정해야 한다.

**IoC(Inversion of Control, 제어의 역전)**는 이 제어권을 개발자에서 Spring Container로 넘기는 것이다.

```
전통적: 개발자 → 객체 생성 → 의존성 연결
IoC:    Spring Container → 객체 생성 → 의존성 연결 → 개발자에게 제공
```

개발자는 "무엇이 필요한지"만 선언하면 된다. "어떻게 만들지"는 Spring이 결정한다.

---

## DI — IoC를 구현하는 방법

DI(Dependency Injection, 의존성 주입)는 IoC를 실현하는 구체적인 방법이다. Spring이 의존성을 주입하는 방식은 세 가지가 있다.

### 생성자 주입 (권장)

```java
@Service
public class OrderService {
    private final PaymentService paymentService;

    @Autowired  // 생성자가 1개면 생략 가능
    public OrderService(PaymentService paymentService) {
        this.paymentService = paymentService;
    }
}
```

### 필드 주입 (비권장)

```java
@Service
public class OrderService {
    @Autowired
    private PaymentService paymentService; // 테스트 어려움
}
```

**생성자 주입을 쓰는 이유가 있다.**

| 이유 | 설명 |
|---|---|
| **불변성** | `final` 선언 가능 — 런타임 중 변경 불가 |
| **필수 의존성 명시** | 컴파일 시점에 의존성 누락 감지 |
| **테스트 용이** | `new OrderService(mockPaymentService)`로 직접 주입 가능 |
| **순환 의존성 감지** | 앱 시작 시 즉시 오류 발생 |

필드 주입의 치명적 단점은 테스트다. Spring Container 없이 `new OrderService()`를 하면 `paymentService`가 null이다. 반면 생성자 주입은 테스트 코드에서도 의존성을 명확히 넘길 수 있다.

---

## Bean — Spring이 관리하는 객체

Bean은 Spring Container가 생성하고 관리하는 객체다. 개발자가 `new`로 직접 생성하지 않는다.

### 등록 방법

**컴포넌트 스캔** — 클래스에 어노테이션을 붙이면 자동 등록된다.

```java
@Component   // 일반 컴포넌트
@Service     // 서비스 레이어
@Repository  // 데이터 접근 레이어 (예외 변환 기능 추가)
@Controller  // Spring MVC 컨트롤러
```

**자바 설정** — 외부 라이브러리처럼 소스코드를 수정할 수 없을 때 사용한다.

```java
@Configuration
public class AppConfig {
    @Bean
    public PaymentService paymentService() {
        return new KakaopayService(); // 구현체를 여기서 결정
    }
}
```

### 같은 타입 Bean이 여러 개일 때

`PaymentService` 구현체가 `KakaopayService`, `NaverPayService` 두 개라면 `@Autowired`만으로는 어떤 걸 주입할지 알 수 없다.

```java
// @Primary — 기본 Bean 지정
@Component
@Primary
public class KakaopayService implements PaymentService { ... }

// @Qualifier — 이름으로 명시적 선택
@Autowired
@Qualifier("naverpay")
private PaymentService paymentService;
```

### Singleton Bean의 함정

Spring Bean의 기본 스코프는 **Singleton**이다. Container당 인스턴스가 1개이고, 모든 요청에서 이 인스턴스를 공유한다.

```java
@Service
public class OrderService {
    // 위험! 여러 스레드가 이 변수를 동시에 읽고 씀
    private int orderCount = 0;
    
    public void createOrder() {
        orderCount++; // 스레드 안전하지 않음
    }
}
```

Singleton Bean은 **무상태(stateless)**로 설계해야 한다. 인스턴스 변수에 요청별 데이터를 저장하면 안 된다.

---

## AOP — 비즈니스 로직에서 공통 코드를 분리하다

로깅, 트랜잭션, 인증 체크 같은 코드는 특성이 있다. 비즈니스 로직과 무관하지만 여러 곳에 반복해서 등장한다.

```java
// AOP 없이 — 모든 메서드마다 반복
public Order createOrder(...) {
    log.info("createOrder 시작");   // 로깅
    checkAuth();                     // 인증
    startTransaction();              // 트랜잭션

    Order order = doCreateOrder();   // 실제 비즈니스 로직

    commitTransaction();
    log.info("createOrder 완료");
    return order;
}
```

AOP는 이 **횡단 관심사(Cross-cutting Concerns)**를 별도 모듈로 분리해서, 비즈니스 코드가 핵심 로직에만 집중하게 한다.

### 프록시가 핵심이다

Spring AOP는 **프록시 패턴**으로 동작한다. 실제 Bean을 직접 주입하는 대신, Bean을 감싼 프록시 객체를 주입한다. 메서드 호출이 들어오면 프록시가 먼저 받아서 부가 로직을 실행하고, 실제 Bean으로 넘긴다.

```
호출자 → [프록시] → 실제 Bean
             ↑
        Advice(부가 로직) 실행
```

```java
@Aspect
@Component
public class LoggingAspect {

    // service 패키지의 모든 메서드 실행 전후
    @Around("execution(* com.example.service.*.*(..))")
    public Object around(ProceedingJoinPoint pjp) throws Throwable {
        long start = System.currentTimeMillis();

        Object result = pjp.proceed(); // 실제 메서드 실행

        log.info("{} — {}ms",
            pjp.getSignature().getName(),
            System.currentTimeMillis() - start);
        return result;
    }
}
```

### @Transactional도 AOP다

`@Transactional`이 붙은 Bean에는 **CGLIB 프록시**가 주입된다. 트랜잭션 시작/커밋/롤백은 프록시가 처리하고, 실제 메서드는 비즈니스 로직만 담는다.

```java
@Service
public class OrderService {
    @Transactional
    public Order createOrder(...) {
        // 트랜잭션 begin → 프록시가 처리
        Order order = orderRepository.save(...);
        return order;
        // 트랜잭션 commit → 프록시가 처리
    }
}
```

여기서 하나의 함정이 있다. **같은 클래스 내부에서 `@Transactional` 메서드를 직접 호출하면 트랜잭션이 적용되지 않는다.**

```java
@Service
public class OrderService {

    public void process() {
        createOrder(); // 프록시를 거치지 않음 → 트랜잭션 미적용!
    }

    @Transactional
    public void createOrder() { ... }
}
```

외부에서 호출할 때만 프록시를 거치기 때문이다. 내부 호출은 `this.createOrder()`와 같아서 프록시를 건너뛴다.

---

## 마치며

Spring의 핵심은 결국 세 가지다.

- **IoC**: 객체 생성·의존성 연결의 제어권을 Spring에게 넘긴다.
- **DI**: Spring이 필요한 의존성을 주입해준다. 생성자 주입을 쓰자.
- **AOP**: 횡단 관심사를 프록시로 분리한다. `@Transactional`이 대표적이다.

이 구조를 이해하면 `@Transactional` 자기 호출 버그나 Singleton Bean 상태 문제 같은 Spring의 흔한 함정을 미리 피할 수 있다.

다음 편에서는 Spring MVC — DispatcherServlet 내부 구조와 요청 처리 흐름을 정리한다.
