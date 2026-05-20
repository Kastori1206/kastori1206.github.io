---
title: "[Spring 완전 정복 #1] Spring을 제대로 이해하려면 Servlet부터 — HTTP 요청이 Controller에 닿기까지"
date: 2026-05-19
draft: false
series: "Spring 완전 정복"
series_order: 1
series_total: 14
categories: ["Spring"]
tags: [spring, servlet, tomcat, java, backend]
description: "Spring MVC의 Filter, Interceptor, AOP 차이를 진짜로 이해하려면 Servlet 구조를 알아야 한다. HTTP 요청이 Controller에 닿기까지 거치는 5개 레이어를 코드와 함께 정리한다."
wiki_source: 10-wiki/tech/spring/01-servlet-fundamentals.md
---

## Spring을 써도 Servlet을 알아야 하는 이유

"Filter와 Interceptor의 차이가 뭔가요?"

면접에서 자주 나오는 질문이다. 많은 개발자들이 "Filter는 Servlet 앞, Interceptor는 Controller 앞"이라고 외워서 답한다. 맞는 말이지만, *왜* 그런지를 이해하고 있는 사람은 적다.

그 이유를 이해하려면 HTTP 요청이 Spring Controller에 닿기까지 거치는 전체 레이어를 알아야 한다. 그리고 그 출발점은 **Servlet**이다.

---

## CGI에서 Servlet으로 — 왜 바뀌었나

초창기 웹 서버는 정적 파일만 제공했다. 동적 응답(사용자별 맞춤 페이지, DB 조회 결과 등)이 필요해지자 **CGI(Common Gateway Interface)**가 등장했다.

CGI의 방식은 단순하다: HTTP 요청이 들어올 때마다 새 프로세스를 생성해서 처리하고, 끝나면 종료한다.

```text
요청 1 → 프로세스 생성 → 처리 → 프로세스 종료
요청 2 → 프로세스 생성 → 처리 → 프로세스 종료
요청 N → ...
```

문제는 프로세스 생성 비용이다. 동시 접속자가 늘어나면 서버가 버티지 못한다.

**Java Servlet은 이 문제를 스레드로 해결했다.** Servlet 인스턴스는 JVM에 딱 1개만 상주하고, 요청마다 스레드를 하나씩 할당해 처리한다.

```text
Servlet 인스턴스 (1개, JVM에 상주)
  ├─ 요청 1 → 스레드 1
  ├─ 요청 2 → 스레드 2
  └─ 요청 N → 스레드 N
```

인스턴스를 매번 새로 만들지 않으니 메모리와 시간 비용이 크게 줄었다. 이 설계가 오늘날 Spring 애플리케이션의 근간이 된다.

---

## Servlet 생명주기 — 인스턴스는 한 번만 만들어진다

Servlet 인스턴스는 **Servlet Container(Tomcat)**가 관리한다. 생명주기는 세 단계다.

```text
최초 요청 또는 서버 시작
  → init()    : 인스턴스 생성 + 초기화 (딱 1회)
  → service() : 요청마다 호출 (doGet / doPost 등으로 분기)
  → destroy() : 컨테이너 종료 시 (딱 1회)
```

코드로 보면 이렇다.

```java
public class MyServlet extends HttpServlet {

    @Override
    public void init() {
        // DB 커넥션 풀 초기화 등 1회성 작업
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse res)
            throws IOException {
        res.getWriter().write("Hello");
    }

    @Override
    public void destroy() {
        // 리소스 해제
    }
}
```

직접 이런 코드를 쓸 일은 거의 없다. 하지만 Spring의 `DispatcherServlet`이 내부적으로 이 구조를 그대로 따른다는 점이 핵심이다.

---

## Tomcat의 역할 — Spring Boot가 jar 하나로 뜨는 이유

Servlet Container인 Tomcat은 단순히 Servlet을 실행하는 것 이상의 역할을 한다.

| 역할 | 설명 |
|---|---|
| Servlet 인스턴스 관리 | 생성, 초기화, 소멸 |
| 스레드 풀 관리 | 요청마다 스레드 할당 |
| HTTP 파싱 | 원시 HTTP 바이트 스트림 → `HttpServletRequest` 객체 변환 |
| URL 매핑 | 어떤 URL을 어떤 Servlet이 처리할지 결정 |
| Filter Chain 실행 | Servlet 앞뒤로 Filter 실행 |

Spring Boot가 별도의 WAS 없이 `java -jar` 한 줄로 서버를 시작할 수 있는 이유는 **Tomcat을 내장(embedded)**하기 때문이다. 애플리케이션 안에 Tomcat이 들어있으니 따로 설치할 필요가 없다.

---

## Filter — Spring보다 바깥 레이어

Filter는 Servlet Container 레벨에서 동작한다. Spring Context가 시작되기 전, 즉 DispatcherServlet보다 앞에 위치한다.

```text
HTTP 요청 → [Filter1 → Filter2 → Filter3] → Servlet(DispatcherServlet)
HTTP 응답 ← [Filter1 ← Filter2 ← Filter3] ← Servlet
```

```java
@Component
public class LoggingFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response,
                         FilterChain chain) throws IOException, ServletException {
        System.out.println("요청 진입: " + ((HttpServletRequest) request).getRequestURI());

        chain.doFilter(request, response); // 다음 Filter 또는 Servlet으로 넘김

        System.out.println("응답 완료");
    }
}
```

Filter가 적합한 작업:
- **인코딩 설정**: 모든 요청에 `UTF-8` 적용
- **CORS 처리**: 응답 헤더 추가
- **인증 토큰 1차 검사**: Authorization 헤더 존재 여부 확인
- **요청/응답 로깅**: URL, 처리 시간 기록

한 가지 중요한 제약이 있다. Filter는 Spring Context 밖에 있기 때문에 **Spring의 예외 처리(`@ControllerAdvice`)가 적용되지 않는다.** Filter에서 예외가 발생하면 직접 처리해야 한다.

> Spring Security의 필터체인도 Servlet Filter다. 이 때문에 Security 설정이 Spring MVC(Controller, Interceptor 등)보다 먼저 동작한다.

---

## DispatcherServlet — Spring MVC의 시작점

`DispatcherServlet`은 Spring MVC의 핵심이지만, 결국 `HttpServlet`을 상속한 **Servlet**이다. Tomcat이 관리하는 수많은 Servlet 인스턴스 중 하나일 뿐이다.

Spring Boot는 `DispatcherServlet`을 자동 등록하고, 모든 URL(`/`)을 이 Servlet이 받도록 설정한다. 이후 요청을 어떤 Controller로 보낼지는 `DispatcherServlet` 내부의 `HandlerMapping`이 결정한다.

---

## 전체 요청 흐름 — 한눈에 보기

HTTP 요청이 Controller에 닿기까지 거치는 전체 레이어다.

```text
HTTP 요청
  → Tomcat (HTTP 파싱, 스레드 할당)
    → Filter Chain (Servlet Container 레벨)
      → DispatcherServlet (Spring MVC 진입)
        → Interceptor (preHandle)
          → AOP (Before Advice)
            → Controller 메서드 실행
          → AOP (After Advice)
        → Interceptor (postHandle)
      → DispatcherServlet (ViewResolver 등)
    → Filter Chain (역순)
  → HTTP 응답
```

이 흐름이 Filter / Interceptor / AOP의 차이를 결정한다.

| 구분 | 위치 | Spring Bean 접근 | Spring 예외 처리 | 주요 용도 |
|---|---|---|---|---|
| **Filter** | Servlet Container | 제한적 | X | 인코딩, CORS, 인증 토큰 |
| **Interceptor** | Spring MVC | O | O | 로그인 체크, 권한 검사 |
| **AOP** | Spring Bean | O | O | 트랜잭션, 로깅, 성능 측정 |

---

## 마치며

Servlet은 오래된 기술이지만, Spring MVC의 모든 레이어(Filter, DispatcherServlet, Interceptor, AOP)가 이 위에 쌓여있다. 이 구조를 이해하면 "Filter와 Interceptor 중 무엇을 써야 하나?"라는 질문에 외운 답이 아닌 구조적 이해로 답할 수 있다.

다음 편에서는 Spring Core — IoC 컨테이너와 의존성 주입이 어떻게 동작하는지 정리한다.
