---
title: "[Spring 완전 정복 #10] Spring 예외 처리 — @ControllerAdvice와 Custom Exception 설계"
date: 2026-05-19
draft: false
series: "Spring 완전 정복"
series_order: 10
series_total: 14
categories: ["Spring"]
tags: [spring, exception, controlleradvice, error-handling, java, backend]
description: "@ControllerAdvice + @ExceptionHandler 전역 예외 처리 구조, BusinessException + ErrorCode Enum으로 Custom Exception 계층 설계하는 실전 패턴을 정리한다."
wiki_source: 10-wiki/tech/spring/08-exception-handling.md
---

## 예외 처리가 흩어져 있으면 생기는 문제

Spring 애플리케이션에서 예외 처리를 각 Controller마다 개별로 하면 두 가지 문제가 생긴다. 에러 응답 형식이 제각각이 되고, 같은 예외를 여러 곳에서 중복 처리하게 된다.

`@ControllerAdvice`는 이 문제를 해결한다. **전역 예외 핸들러**를 하나 만들어 모든 Controller에서 발생하는 예외를 한 곳에서 처리한다.

---

## @ControllerAdvice 기본 구조

```java
@RestControllerAdvice  // @ControllerAdvice + @ResponseBody
public class GlobalExceptionHandler {

    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleUserNotFound(UserNotFoundException e) {
        return ResponseEntity
            .status(HttpStatus.NOT_FOUND)
            .body(ErrorResponse.of("USER_NOT_FOUND", e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(
            MethodArgumentNotValidException e) {
        List<String> errors = e.getBindingResult().getFieldErrors().stream()
            .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
            .toList();
        return ResponseEntity.badRequest()
            .body(ErrorResponse.of("VALIDATION_FAILED", errors.toString()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleException(Exception e) {
        log.error("Unhandled exception", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ErrorResponse.of("INTERNAL_ERROR", "서버 오류가 발생했습니다"));
    }
}
```

예외 처리 계층은 다음과 같다.

```text
Controller 예외 발생
  → HandlerExceptionResolver (Spring MVC 내부)
  → @ControllerAdvice
  → 일관된 에러 응답 반환
```

Filter에서 발생한 예외는 `DispatcherServlet` 밖이라 `@ControllerAdvice`가 잡지 못한다. Filter 내부에서 직접 응답을 작성해야 한다.

---

## 에러 응답 DTO

클라이언트가 에러 상황을 파악할 수 있도록 일관된 형식으로 응답한다.

```java
@Getter
public class ErrorResponse {
    private final String code;
    private final String message;
    private final LocalDateTime timestamp;

    private ErrorResponse(String code, String message) {
        this.code = code;
        this.message = message;
        this.timestamp = LocalDateTime.now();
    }

    public static ErrorResponse of(String code, String message) {
        return new ErrorResponse(code, message);
    }
}
```

```json
{
  "code": "USER_NOT_FOUND",
  "message": "사용자를 찾을 수 없습니다: id=123",
  "timestamp": "2026-05-19T10:30:00"
}
```

`code`는 클라이언트가 에러 종류를 분기 처리하기 위한 값이고, `message`는 사람이 읽는 설명이다.

---

## Custom Exception 설계 — ErrorCode Enum 패턴

에러 코드가 늘어날수록 관리가 중요해진다. **ErrorCode Enum + BusinessException 기반 클래스** 패턴이 실무에서 가장 많이 쓰인다.

### 1. ErrorCode Enum

```java
@Getter
@RequiredArgsConstructor
public enum ErrorCode {

    // 공통
    INVALID_INPUT(400, "INVALID_INPUT", "잘못된 입력입니다"),
    UNAUTHORIZED(401, "UNAUTHORIZED", "인증이 필요합니다"),
    FORBIDDEN(403, "FORBIDDEN", "권한이 없습니다"),

    // 사용자
    USER_NOT_FOUND(404, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다"),
    DUPLICATE_EMAIL(409, "DUPLICATE_EMAIL", "이미 사용 중인 이메일입니다"),

    // 주문
    ORDER_NOT_FOUND(404, "ORDER_NOT_FOUND", "주문을 찾을 수 없습니다"),
    INSUFFICIENT_STOCK(400, "INSUFFICIENT_STOCK", "재고가 부족합니다"),

    // 서버
    INTERNAL_ERROR(500, "INTERNAL_ERROR", "서버 오류가 발생했습니다");

    private final int status;
    private final String code;
    private final String message;
}
```

### 2. BusinessException 기반 클래스

```java
public class BusinessException extends RuntimeException {
    private final ErrorCode errorCode;

    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    public BusinessException(ErrorCode errorCode, String detail) {
        super(errorCode.getMessage() + ": " + detail);
        this.errorCode = errorCode;
    }

    public int getStatus() { return errorCode.getStatus(); }
    public String getCode() { return errorCode.getCode(); }
}
```

### 3. 도메인별 구체 예외 클래스

```java
public class UserNotFoundException extends BusinessException {
    public UserNotFoundException(Long userId) {
        super(ErrorCode.USER_NOT_FOUND, "id=" + userId);
    }
}

public class InsufficientStockException extends BusinessException {
    public InsufficientStockException(Long productId, int requested, int available) {
        super(ErrorCode.INSUFFICIENT_STOCK,
            String.format("productId=%d, 요청=%d, 재고=%d", productId, requested, available));
    }
}
```

### 4. 서비스에서 사용

```java
@Service
public class UserService {
    public User findById(Long id) {
        return userRepository.findById(id)
            .orElseThrow(() -> new UserNotFoundException(id));
    }
}
```

### 5. 핸들러에서 통합 처리

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    // BusinessException 계층 전체를 한 곳에서 처리
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusinessException(BusinessException e) {
        return ResponseEntity
            .status(e.getStatus())
            .body(ErrorResponse.of(e.getCode(), e.getMessage()));
    }
}
```

새로운 예외가 생겨도 `ErrorCode`에 추가하고 `BusinessException`을 상속하면 핸들러 수정 없이 자동으로 처리된다.

---

## HTTP 상태 코드 — 자주 쓰는 것

| 코드 | 의미 | 사용 상황 |
|---|---|---|
| 200 OK | 성공 | 조회, 수정 성공 |
| 201 Created | 생성 성공 | POST로 리소스 생성 |
| 204 No Content | 성공, 바디 없음 | DELETE 성공 |
| 400 Bad Request | 잘못된 요청 | Validation 실패 |
| 401 Unauthorized | 미인증 | 로그인 필요 |
| 403 Forbidden | 권한 없음 | 인증됐지만 권한 부족 |
| 404 Not Found | 리소스 없음 | 존재하지 않는 ID |
| 409 Conflict | 충돌 | 중복 이메일 |
| 500 Internal Error | 서버 오류 | 예상치 못한 예외 |

401과 403의 차이를 명확히 해두자. 401은 "누구인지 모른다 → 로그인 필요", 403은 "누구인지 알지만 권한이 없다"는 뜻이다.

---

## 마치며

Spring 예외 처리의 핵심은 두 가지다. `@ControllerAdvice`로 전역 핸들러를 만들어 에러 응답 형식을 통일하고, `ErrorCode Enum + BusinessException` 패턴으로 예외를 체계적으로 관리한다. 이 구조를 갖추면 새 예외 추가 시 `ErrorCode`에 한 줄 추가하는 것으로 끝난다.

다음 편에서는 Spring 테스트 — 단위/슬라이스/통합 테스트 전략을 정리한다.
