---
title: "[Spring 완전 정복 #4] Spring Boot — xml 없이 바로 뜨는 이유, 자동설정 원리 완전 분석"
date: 2026-05-19
draft: false
series: "Spring 완전 정복"
series_order: 4
series_total: 14
categories: ["Spring"]
tags: [spring, spring-boot, auto-configuration, starter, actuator, java, backend]
description: "Spring Boot가 설정 파일 없이 동작하는 원리 — @SpringBootApplication 분해, @Conditional 자동설정, 스타터와 BOM, 프로파일과 설정 우선순위를 코드와 함께 정리한다."
wiki_source: 10-wiki/tech/spring/04-spring-boot.md
---

## "왜 xml 설정 없이 서버가 뜨는 걸까?"

Spring Boot를 처음 접하면 놀랍다. `main()` 메서드 하나, `@SpringBootApplication` 어노테이션 하나만 있는데 Tomcat이 뜨고, JPA 연결이 설정되고, JSON 변환까지 된다. 아무것도 설정하지 않았는데.

이 "마법"의 이름은 **자동설정(Auto-configuration)**이다.

---

## Spring Boot 이전 — 설정 지옥

Spring 단독으로 웹 애플리케이션을 만들려면 설정 파일이 여러 개 필요했다.

```
web.xml                   → DispatcherServlet 등록
applicationContext.xml    → Bean 설정
dispatcher-servlet.xml    → MVC 설정
pom.xml                   → 의존성 + 버전 수동 관리
```

더 큰 문제는 의존성 버전이었다. Spring 버전에 맞는 Hibernate 버전, 그에 맞는 Jackson 버전... 개발자가 직접 호환성을 맞춰야 했다. 버전 충돌 오류는 흔한 일이었다.

Spring Boot는 이 "설정 지옥"을 없앤다.

---

## @SpringBootApplication 분해하기

Spring Boot 진입점에 붙이는 이 어노테이션은 실제로 세 개의 어노테이션을 합친 것이다.

```java
@SpringBootApplication
public class MyApplication {
    public static void main(String[] args) {
        SpringApplication.run(MyApplication.class, args);
    }
}
```

```
@SpringBootApplication
  ├─ @SpringBootConfiguration  : @Configuration과 동일 — Bean 설정 클래스
  ├─ @EnableAutoConfiguration  : 자동설정 활성화 ← 핵심
  └─ @ComponentScan            : 현재 패키지 하위 컴포넌트 자동 스캔
```

핵심은 `@EnableAutoConfiguration`이다. 이것이 "클래스패스를 보고 Bean을 자동으로 등록"하는 자동설정을 켠다.

---

## 자동설정 동작 원리

Spring Boot는 애플리케이션이 시작될 때 클래스패스에 어떤 라이브러리가 있는지 확인하고, 그에 맞는 Bean을 자동으로 등록한다.

```
spring-boot-starter-web 의존성 추가
  → 클래스패스에 Tomcat, Spring MVC 라이브러리 존재 확인
  → TomcatAutoConfiguration → 내장 Tomcat Bean 자동 등록
  → DispatcherServletAutoConfiguration → DispatcherServlet Bean 자동 등록
  → 개발자가 아무것도 안 해도 웹서버가 뜸
```

자동설정 클래스들은 어떤 조건에서 Bean을 등록할지 `@Conditional` 계열 어노테이션으로 선언한다.

```java
@Configuration
@ConditionalOnClass(DataSource.class)       // DataSource 클래스가 클래스패스에 있고
@ConditionalOnMissingBean(DataSource.class) // DataSource Bean이 아직 없을 때만
public class DataSourceAutoConfiguration {
    @Bean
    public DataSource dataSource() { ... }
}
```

`@ConditionalOnMissingBean`이 핵심이다. **개발자가 직접 Bean을 등록하면 자동설정 Bean은 등록되지 않는다.** 커스텀 설정이 자동설정을 덮어쓸 수 있는 이유다.

| 어노테이션 | 조건 |
|---|---|
| `@ConditionalOnClass` | 특정 클래스가 클래스패스에 있을 때 |
| `@ConditionalOnMissingBean` | 해당 타입 Bean이 없을 때 |
| `@ConditionalOnProperty` | 특정 프로퍼티 값이 설정되었을 때 |
| `@ConditionalOnWebApplication` | 웹 애플리케이션일 때 |

어떤 자동설정이 적용됐는지 보려면 `--debug` 플래그로 실행하면 된다.

---

## 스타터 — 의존성 버전 충돌 해결

스타터는 관련 의존성을 하나의 패키지로 묶어 제공한다.

```xml
<!-- 이것 하나로 Spring MVC + Tomcat + Jackson이 한 번에 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
```

| 스타터 | 포함 내용 |
|---|---|
| `starter-web` | Spring MVC, Tomcat, Jackson |
| `starter-data-jpa` | Spring Data JPA, Hibernate, JDBC |
| `starter-security` | Spring Security |
| `starter-test` | JUnit 5, Mockito, AssertJ |
| `starter-validation` | Hibernate Validator, Bean Validation |

버전은 `spring-boot-dependencies` BOM(Bill of Materials)이 관리한다. 개발자는 버전을 명시하지 않아도 Spring Boot가 검증된 호환 버전을 자동으로 선택한다.

```xml
<!-- 버전 명시 불필요 -->
<dependency>
    <groupId>com.fasterxml.jackson.core</groupId>
    <artifactId>jackson-databind</artifactId>
</dependency>
```

---

## 내장 서버 — java -jar 한 줄로 실행

Spring Boot는 Tomcat을 jar 안에 내장한다. 별도 WAS 설치 없이 실행된다.

```bash
./mvnw package
java -jar target/myapp-0.0.1-SNAPSHOT.jar
```

Tomcat 대신 다른 서버를 쓰고 싶다면 교체할 수 있다.

```xml
<!-- Undertow 사용 (논블로킹, 경량) -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <exclusions>
        <exclusion>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-tomcat</artifactId>
        </exclusion>
    </exclusions>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-undertow</artifactId>
</dependency>
```

---

## 프로파일 — 환경별 설정 분리

개발, 스테이징, 운영 환경마다 DB URL, 로그 레벨, 외부 API 키가 다르다. 프로파일로 분리한다.

```
application.yml          # 공통 설정
application-dev.yml      # 개발 환경
application-prod.yml     # 운영 환경
```

```yaml
# application-dev.yml
spring:
  datasource:
    url: jdbc:h2:mem:testdb  # 개발은 인메모리 DB
logging:
  level:
    root: DEBUG
```

```yaml
# application-prod.yml
spring:
  datasource:
    url: jdbc:postgresql://prod-db:5432/mydb
logging:
  level:
    root: WARN
```

프로파일 활성화는 실행 시 지정한다.

```bash
java -jar myapp.jar --spring.profiles.active=prod
# 또는 환경변수로
SPRING_PROFILES_ACTIVE=prod java -jar myapp.jar
```

### 설정 우선순위 (높을수록 우선)

```
1. 커맨드라인 인수          --server.port=9090
2. 환경변수                 SERVER_PORT=9090
3. application-{profile}.yml
4. application.yml
```

운영 환경에서 민감 정보(DB 패스워드, API 키)는 환경변수나 외부 설정 관리 시스템으로 주입하는 것이 안전하다.

---

## @ConfigurationProperties — 타입 안전한 설정 바인딩

여러 설정값을 하나의 클래스로 묶을 때 `@Value`보다 `@ConfigurationProperties`가 낫다.

```yaml
payment:
  api-key: abc123
  timeout: 5000
  retry-count: 3
```

```java
@ConfigurationProperties(prefix = "payment")
@Component
public class PaymentProperties {
    private String apiKey;
    private int timeout;
    private int retryCount;
    // getter/setter
}
```

`@Value("${payment.api-key}")`로 하나씩 꺼내는 것보다 타입 안전하고, IDE 자동완성도 지원된다.

---

## Actuator — 운영 모니터링

Actuator를 추가하면 애플리케이션 상태를 HTTP 엔드포인트로 조회할 수 있다.

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

| 엔드포인트 | 설명 |
|---|---|
| `/actuator/health` | 앱 상태 (UP/DOWN) — 쿠버네티스 헬스체크에 활용 |
| `/actuator/metrics` | JVM 메모리, HTTP 요청 수, 응답 시간 등 |
| `/actuator/env` | 현재 적용된 설정값 (민감 정보 주의) |

운영 환경에서는 `health`, `info`, `metrics`만 노출하고 나머지는 차단하는 것이 안전하다.

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics
```

---

## 마치며

Spring Boot가 "설정 없이 동작"하는 이유는 세 가지다.

- **자동설정**: 클래스패스를 보고 `@Conditional` 조건에 따라 Bean을 자동 등록한다. 개발자 Bean이 있으면 자동설정은 물러난다.
- **스타터 + BOM**: 관련 의존성을 묶어 제공하고, 버전 충돌을 Spring Boot가 관리한다.
- **내장 서버**: Tomcat이 jar 안에 들어있어 별도 WAS 설치가 필요 없다.

다음 편에서는 Spring Transaction — `@Transactional`의 동작 원리, 전파속성, 격리수준을 정리한다.
