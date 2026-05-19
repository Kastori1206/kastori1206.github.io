---
title: "[Spring 완전 정복 #3] Spring MVC 내부 구조 — DispatcherServlet이 요청을 처리하는 방법"
date: 2026-05-19
draft: false
series: "Spring 완전 정복"
series_order: 3
series_total: 14
tags: [spring, spring-mvc, dispatcher-servlet, interceptor, filter, aop, java, backend]
description: "HTTP 요청이 DispatcherServlet에서 Controller까지 처리되는 12단계 흐름을 분석하고, Filter/Interceptor/AOP를 언제 써야 하는지 레이어 구조로 정리한다."
wiki_source: 10-wiki/tech/spring/03-spring-mvc.md
---

## 모든 요청이 거치는 하나의 관문

Spring MVC 애플리케이션에서 HTTP 요청은 예외 없이 `DispatcherServlet`을 먼저 통과한다. URL이 `/users`든 `/orders`든 상관없다. 이 "하나의 관문"이 무엇이고, 내부에서 무슨 일이 일어나는지 이해하면 Filter, Interceptor, AOP 중 어디서 로직을 처리해야 하는지가 자연스럽게 보인다.

---

## Front Controller 패턴 — 왜 DispatcherServlet이 필요한가

Spring MVC 이전에는 URL마다 Servlet을 따로 만들었다.

```
/users  → UserServlet
/orders → OrderServlet
/items  → ItemServlet
```

이 방식의 문제는 공통 처리다. 인증 체크, 로깅, 인코딩 설정을 Servlet마다 중복해서 넣어야 했다.

**Front Controller 패턴**은 모든 요청을 하나의 진입점이 받아 적절한 핸들러에 위임한다.

```
모든 요청 (/*) → DispatcherServlet → Controller 위임
```

공통 로직을 `DispatcherServlet` 한 곳에서 처리하니 중복이 사라진다. Spring Boot는 이 `DispatcherServlet`을 자동으로 등록해 모든 URL(`/`)을 받도록 설정한다.

---

## DispatcherServlet 내부 구성요소

`DispatcherServlet`은 모든 일을 혼자 처리하지 않는다. 역할별 전문 컴포넌트에게 위임한다.

```
DispatcherServlet
  ├─ HandlerMapping        : "이 URL → 어떤 Controller?"
  ├─ HandlerAdapter        : "이 Controller를 어떻게 실행?"
  ├─ HandlerInterceptor    : Controller 실행 전·후 부가 처리
  ├─ ViewResolver          : "뷰 이름 → 실제 View 파일?"
  └─ HandlerExceptionResolver : "예외 발생 → 어떻게 응답?"
```

**HandlerMapping** — `@GetMapping("/users/{id}")`처럼 선언된 매핑 정보를 읽어 요청 URL에 맞는 Controller 메서드를 찾는다.

**HandlerAdapter** — 찾은 Controller 메서드를 실제로 실행한다. `@RequestBody`, `@PathVariable`, `@ModelAttribute` 파라미터 바인딩도 여기서 처리한다.

**ViewResolver** — Controller가 문자열 뷰 이름을 반환할 때 실제 파일 경로로 변환한다. `@RestController`를 쓰면 이 단계를 건너뛰고 `HttpMessageConverter`가 JSON으로 직렬화한다.

**HandlerExceptionResolver** — `@ControllerAdvice` + `@ExceptionHandler`가 이 메커니즘으로 동작한다.

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<String> handle(UserNotFoundException e) {
        return ResponseEntity.status(404).body(e.getMessage());
    }
}
```

단, Filter에서 발생한 예외는 `DispatcherServlet` 밖이라 이 핸들러가 잡지 못한다.

---

## 요청 처리 12단계 흐름

HTTP 요청이 응답까지 가는 전체 흐름이다.

```
① HTTP 요청 → Tomcat
② Filter Chain (전처리)
③ DispatcherServlet 진입
④ HandlerMapping → 처리할 Controller 메서드 조회
⑤ Interceptor.preHandle() — 순서대로 실행
   (false 반환 시 여기서 중단)
⑥ HandlerAdapter → Controller 메서드 실행
   (AOP 프록시를 통해 Before → 메서드 → After)
⑦ ModelAndView 반환
⑧ Interceptor.postHandle() — 역순으로 실행
⑨ ViewResolver → View 렌더링 (REST면 생략)
⑩ Interceptor.afterCompletion() — 역순, 예외 발생해도 항상 실행
⑪ Filter Chain (후처리, 역순)
⑫ HTTP 응답
```

`postHandle()`은 Controller에서 예외가 발생하면 실행되지 않는다. `afterCompletion()`은 예외 여부와 무관하게 항상 실행된다. 그래서 실행 시간 측정이나 리소스 해제는 `afterCompletion()`에 넣어야 한다.

---

## Interceptor — Spring 내부에서 요청을 제어하다

Interceptor는 `DispatcherServlet` 내부, Spring Context 안에서 동작한다. Spring Bean을 주입받을 수 있고, `@ControllerAdvice` 예외 처리도 적용된다.

```java
@Component
public class AuthInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) {
        String token = request.getHeader("Authorization");
        if (token == null) {
            response.setStatus(401);
            return false; // 여기서 중단, Controller까지 가지 않음
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request,
                                HttpServletResponse response,
                                Object handler, Exception ex) {
        // 요청 처리 시간 로깅 — 예외가 나도 실행됨
    }
}
```

URL 패턴으로 적용 범위를 지정할 수 있다.

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new AuthInterceptor())
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/login", "/api/signup");
    }
}
```

---

## Filter vs Interceptor vs AOP — 결론은 레이어 위치

이 세 가지를 구분하는 가장 명확한 기준은 **어느 레이어에 위치하는가**다.

| 구분 | 위치 | Spring Bean 접근 | 예외 처리 | 적합한 용도 |
|---|---|---|---|---|
| **Filter** | Servlet Container (Spring 밖) | 제한적 | 직접 처리 | CORS, 인코딩, XSS 방어 |
| **Interceptor** | Spring MVC (DispatcherServlet 내) | 가능 | @ControllerAdvice | 로그인 체크, URL별 접근 제어 |
| **AOP** | Spring Bean | 가능 | @ControllerAdvice | 트랜잭션, 실행 시간 측정, 메서드 로깅 |

Filter는 Spring Context가 시작되기 전에 동작하므로 Spring Bean 주입이 어렵고, 예외가 발생해도 `@ControllerAdvice`가 잡지 못한다. 반면 Interceptor와 AOP는 Spring 안에서 동작하므로 Bean 주입과 통합 예외 처리가 모두 가능하다.

Spring Security의 필터체인이 Filter 레이어에 있는 것도 이 때문이다. 인증되지 않은 요청은 `DispatcherServlet`까지 도달하지 못하고 Filter에서 차단된다.

---

## 입력값 검증 — Controller 진입 전 자동 검증

Spring MVC는 `@Valid`로 Controller 파라미터를 자동 검증한다.

```java
public class CreateUserRequest {
    @NotBlank(message = "이름은 필수입니다")
    private String name;

    @Email
    private String email;

    @Min(18)
    private int age;
}

@RestController
public class UserController {
    @PostMapping("/api/users")
    public ResponseEntity<UserDto> create(
            @Valid @RequestBody CreateUserRequest request) {
        // 여기까지 오면 request는 유효한 상태
        return ResponseEntity.ok(userService.create(request));
    }
}
```

검증 실패 시 `MethodArgumentNotValidException`이 발생한다. `@ControllerAdvice`에서 공통 처리하면 된다.

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(
            MethodArgumentNotValidException e) {
        List<String> errors = e.getBindingResult().getFieldErrors().stream()
            .map(err -> err.getField() + ": " + err.getDefaultMessage())
            .toList();
        return ResponseEntity.badRequest().body(new ErrorResponse("VALIDATION_FAILED", errors));
    }
}
```

---

## 마치며

DispatcherServlet은 Spring MVC의 모든 요청 처리를 조율하는 중앙 컨트롤러다. 이 구조를 이해하면 Filter와 Interceptor의 차이, `@ControllerAdvice`가 Filter 예외를 잡지 못하는 이유, Interceptor 세 메서드의 실행 조건 등이 자연스럽게 설명된다.

다음 편에서는 Spring Boot — 설정 없이 바로 실행되는 원리(자동설정, 스타터, 내장 서버)를 정리한다.
