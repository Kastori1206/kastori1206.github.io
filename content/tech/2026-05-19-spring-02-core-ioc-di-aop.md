---
title: "[Spring 완전 정복 #2] Spring Core — IoC, DI, AOP, 그리고 동시성까지"
date: 2026-04-25
draft: false
target_section: tech
series: "Spring 완전 정복"
series_order: 2
series_total: 14
tags: [spring, ioc, di, aop, bean, thread, concurrency, java, backend]
description: "Spring이 어노테이션 하나로 동작하는 원리, IoC/DI가 왜 필요한지, AOP 프록시가 @Transactional을 어떻게 처리하는지, 그리고 Singleton Bean이 수백 개의 동시 요청을 받을 때 무슨 일이 벌어지는지를 코드로 풀어낸다."
wiki_source: 10-wiki/tech/spring/02-spring-core.md
categories: [Spring]
---

## "@Service만 붙이면 왜 되는 걸까?"

Spring을 처음 쓸 때 누구나 한 번쯤 갖는 의문이다. 클래스에 어노테이션 하나 달았을 뿐인데 의존성이 주입되고, `@Transactional`만 붙이면 트랜잭션이 처리된다.

이게 "마법"처럼 느껴지는 건 내부 동작을 모르기 때문이다. 이 글에서는 Spring의 핵심 메커니즘 — **IoC, DI, AOP, 그리고 Singleton Bean의 동시성** — 을 코드 수준에서 풀어낸다.

---

## 어노테이션은 라벨일 뿐이다

먼저 오해 하나를 짚고 시작한다. `@Service`, `@Autowired` 같은 어노테이션은 **그 자체로 아무 일도 하지 않는다.**

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

**IoC(Inversion of Control, 제어의 역전)** 는 이 제어권을 개발자에서 Spring Container로 넘기는 것이다.

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

**생성자 주입을 권장하는 이유:**

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

`PaymentService` 구현체가 `KakaopayService`, `NaverPayService` 두 개라면 `@Autowired`만으로는 어떤 걸 주입할지 알 수 없다. `NoUniqueBeanDefinitionException`이 발생한다.

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

`@Primary`는 "이게 기본"이라는 선언, `@Qualifier`는 "이걸 써라"는 명시다. 하나의 기본 구현이 있고 특정 상황에서만 다른 구현이 필요할 때 두 가지를 조합해서 쓴다.

### Bean 생명주기

```
Container 시작
  → Bean 인스턴스 생성
  → 의존성 주입
  → @PostConstruct 실행  (초기화 콜백)
  → Bean 사용
  → @PreDestroy 실행     (소멸 콜백)
  → Container 종료
```

```java
@Component
public class DatabaseConnector {

    @PostConstruct
    public void init() {
        // DB 커넥션 풀 초기화
    }

    @PreDestroy
    public void close() {
        // 커넥션 정리
    }
}
```

---

## 동시 요청이 와도 괜찮은 이유 — 스레드 모델 이해하기

Spring Bean의 기본 스코프는 **Singleton**이다. Container당 인스턴스가 1개이고, 모든 요청이 이 인스턴스를 공유한다. 여기서 당연한 질문이 생긴다.

> "수백 개의 동시 요청이 같은 Bean 인스턴스를 공유하는데, 괜찮은 걸까?"

이를 이해하려면 Tomcat이 어떻게 요청을 처리하는지부터 알아야 한다.

### Tomcat의 thread-per-request 모델

Spring Boot의 기본 내장 서버인 Tomcat은 **스레드 풀(Thread Pool)** 을 사용해 HTTP 요청을 처리한다.

```
HTTP 요청 도착
  → Tomcat 스레드 풀에서 스레드 1개 꺼냄
  → 해당 스레드가 요청 처리 전체를 담당
     (Filter → DispatcherServlet → Controller → Service → Repository → DB)
  → 응답 완료 후 스레드를 풀에 반납
```

요청 1개 = 스레드 1개가 처음부터 끝까지 전담하는 것이 **thread-per-request 모델**이다.

```yaml
# application.yml — Tomcat 스레드 풀 설정
server:
  tomcat:
    threads:
      max: 200        # 최대 스레드 수 (기본값)
      min-spare: 10   # 최소 유지 스레드 수 (기본값)
```

스레드 풀이 가득 차면 (200개 모두 처리 중) 새 요청은 대기 큐에 쌓이고, 큐도 가득 차면 `503 Service Unavailable`이 발생한다. DB 쿼리나 외부 API 호출처럼 I/O 대기가 길면 스레드를 오래 점유해 처리량이 급격히 떨어진다.

### 지역 변수는 안전하고, 인스턴스 변수는 위험하다

동시 요청이 들어오면 각 요청은 서로 다른 스레드에서 병렬로 실행된다.

```
[요청 A] → 스레드-1 → UserController.getUser(1L)
[요청 B] → 스레드-2 → UserController.getUser(2L)
[요청 C] → 스레드-3 → OrderController.create()
```

이때 메모리 관점에서 중요한 사실이 있다.

- 각 스레드의 **스택(Stack)** 은 독립적 — 지역 변수는 스레드별로 완전히 분리
- **힙(Heap)** 의 객체는 공유됨 — Singleton Bean의 인스턴스 변수는 모든 스레드가 동시 접근 가능

```java
@Service  // Singleton — 인스턴스 1개, 스레드 수백 개가 공유
public class UserService {

    private final UserRepository userRepository; // 의존성 주입 — 불변, 안전

    // ⚠️ 위험: 인스턴스 변수에 상태 저장
    private User lastAccessedUser; // 스레드-A가 저장 → 스레드-B가 덮어씀

    public User getUser(Long id) {
        // ✅ 안전: 지역 변수는 스택에 생성 (스레드별 독립)
        User user = userRepository.findById(id).orElseThrow();
        return user;
    }
}
```

지역 변수가 안전한 이유:

```
스레드-1 스택: getUser(1L) → user = User{id=1}
스레드-2 스택: getUser(2L) → user = User{id=2}  ← 완전히 별개의 메모리
```

인스턴스 변수가 위험한 이유:

```
힙 메모리: UserService 인스턴스 { lastAccessedUser = ??? }
  스레드-1: lastAccessedUser = User{id=1} 저장
  스레드-2: lastAccessedUser = User{id=2} 덮어씀 ← 스레드-1은 User{id=2}를 읽게 됨
```

### 안전한 설계 패턴 3가지

**1. Stateless (무상태) — 권장**

가장 단순하고 확실한 해결책이다. 인스턴스 변수에 상태를 두지 않는다.

```java
@Service
public class OrderService {
    private final OrderRepository orderRepository; // 의존성만 보유 (불변)

    // 모든 상태는 파라미터로 받고, 처리 결과는 반환값으로만
    public Order createOrder(CreateOrderRequest request, Long userId) {
        Order order = Order.of(request, userId);
        return orderRepository.save(order);
    }
}
```

**2. 상태가 꼭 필요하다면 AtomicXxx**

요청 횟수를 세는 것처럼 공유 상태가 필요한 경우, `int count++`는 read-modify-write 세 단계로 이뤄져 동시 실행 시 카운트가 유실될 수 있다.

```java
@Service
public class RequestCounterService {
    // ⚠️ 위험: count++는 원자적이지 않음
    private int count = 0;

    // ✅ 안전: AtomicInteger는 내부적으로 CAS(Compare-And-Swap) 연산 사용
    private final AtomicInteger safeCount = new AtomicInteger(0);

    public void record() {
        safeCount.incrementAndGet(); // 원자적 연산
    }
}
```

**3. 불변 객체 (Immutable)**

읽기만 하는 설정 값이라면 `final` 필드로 선언한다. 여러 스레드가 동시에 읽어도 값이 변하지 않으니 안전하다.

```java
@Component
public class ApiConfig {
    private final String apiKey;
    private final int timeout;

    public ApiConfig(@Value("${api.key}") String apiKey,
                     @Value("${api.timeout}") int timeout) {
        this.apiKey = apiKey;
        this.timeout = timeout;
    }
}
```

---

## ThreadLocal — 스레드마다 독립된 저장소

"요청-스코프 데이터를 모든 레이어에 파라미터로 전달하지 않고도 공유하려면?" — 이 문제를 해결하는 게 `ThreadLocal`이다.

ThreadLocal은 **같은 스레드 안에서만 공유**되는 저장소다.

```java
ThreadLocal<User> currentUser = new ThreadLocal<>();

// 스레드-1에서 저장
currentUser.set(User{id=1});

// 스레드-2에서 조회
currentUser.get(); // → null (스레드-2는 스레드-1의 데이터를 볼 수 없음)
```

Spring 자체가 내부적으로 ThreadLocal을 광범위하게 사용한다.

| 컴포넌트 | ThreadLocal 용도 |
|---|---|
| `SecurityContextHolder` | 현재 요청의 인증 정보(`Authentication`) 저장 |
| `TransactionSynchronizationManager` | 현재 트랜잭션의 DB 커넥션 저장 |
| `RequestContextHolder` | 현재 요청의 `HttpServletRequest` 저장 |

덕분에 `SecurityContextHolder.getContext().getAuthentication()`처럼 어디서든 현재 사용자 정보를 꺼낼 수 있다. 파라미터로 전달하지 않아도 같은 스레드(= 같은 요청) 안이면 접근 가능하기 때문이다.

**주의: `@Async`와 ThreadLocal**

`@Async`로 비동기 실행하면 **새 스레드**에서 실행되므로 `SecurityContextHolder` 인증 정보가 자동으로 전파되지 않는다. `DelegatingSecurityContextAsyncTaskExecutor`를 사용하거나 `SecurityContextHolder.setStrategyName(MODE_INHERITABLETHREADLOCAL)`로 설정해야 한다.

---

## Prototype Scope — 요청마다 새 인스턴스가 필요할 때

장바구니처럼 요청마다 독립된 상태가 필요한 경우, Prototype Scope를 사용할 수 있다.

```java
@Component
@Scope("prototype")
public class ShoppingCart {
    private final List<Item> items = new ArrayList<>();

    public void addItem(Item item) { items.add(item); }
}
```

단, **Singleton Bean에 Prototype Bean을 `@Autowired`로 주입하면 함정이 생긴다.** Singleton이 초기화될 때 Prototype 인스턴스가 1개 생성되고, 이후로는 그 인스턴스가 계속 재사용된다. Prototype의 의미가 사라지는 것이다.

```java
@Service  // Singleton
public class OrderService {
    @Autowired
    private ShoppingCart cart; // ⚠️ 항상 같은 cart 인스턴스 — 모든 요청이 공유
}
```

해결책은 `ObjectProvider`로 매번 새 인스턴스를 직접 요청하는 것이다.

```java
@Service
public class OrderService {
    @Autowired
    private ObjectProvider<ShoppingCart> cartProvider;

    public void checkout() {
        ShoppingCart cart = cartProvider.getObject(); // 호출마다 새 인스턴스 생성
        // cart는 이 메서드 범위 내에서만 사용
    }
}
```

---

## AOP — 비즈니스 로직에서 공통 코드를 분리하다

로깅, 트랜잭션, 인증 체크 같은 코드는 비즈니스 로직과 무관하지만 여러 곳에 반복해서 등장한다.

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

AOP는 이 **횡단 관심사(Cross-cutting Concerns)** 를 별도 모듈로 분리해서, 비즈니스 코드가 핵심 로직에만 집중하게 한다.

### 프록시가 핵심이다

Spring AOP는 **프록시 패턴**으로 동작한다. 실제 Bean 대신 Bean을 감싼 프록시 객체를 주입한다. 메서드 호출이 들어오면 프록시가 먼저 받아서 부가 로직을 실행하고, 실제 Bean으로 넘긴다.

```
호출자 → [프록시] → 실제 Bean
             ↑
        Advice(부가 로직) 실행
```

```java
@Aspect
@Component
public class LoggingAspect {

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

여기서 자주 나오는 함정이 있다. **같은 클래스 내부에서 `@Transactional` 메서드를 직접 호출하면 트랜잭션이 적용되지 않는다.**

```java
@Service
public class OrderService {

    public void process() {
        createOrder(); // this.createOrder() — 프록시를 거치지 않음 → 트랜잭션 미적용!
    }

    @Transactional
    public void createOrder() { ... }
}
```

외부에서 호출할 때만 프록시를 거치기 때문이다. 내부 호출은 프록시를 건너뛴다.

---

## 마치며

Spring의 핵심을 정리하면 이렇다.

- **IoC/DI**: 객체 생성·의존성 연결의 제어권을 Spring에게 넘긴다. 생성자 주입을 써야 불변성과 테스트 가능성을 모두 얻는다.
- **Singleton Bean과 동시성**: 모든 스레드가 같은 Bean 인스턴스를 공유하므로 인스턴스 변수에 상태를 두면 안 된다. Stateless 설계가 기본이고, 공유 상태가 필요하면 `AtomicXxx`, 스레드별 상태가 필요하면 `ThreadLocal`.
- **AOP**: 횡단 관심사를 프록시로 분리한다. `@Transactional`이 대표적이고, 자기 호출 시 프록시를 거치지 않는다는 점을 주의해야 한다.

이 구조를 이해하면 `@Transactional` 자기 호출 버그, Singleton Bean 상태 오염, `@Async`에서 인증 정보가 사라지는 문제 같은 Spring의 흔한 함정을 미리 피할 수 있다.

다음 편에서는 Spring MVC — DispatcherServlet 내부 구조와 요청 처리 흐름을 정리한다.
