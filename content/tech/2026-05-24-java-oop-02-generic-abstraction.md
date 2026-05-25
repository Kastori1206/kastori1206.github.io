---
title: "엔티티마다 반복되는 코드를 제네릭으로 한 번에 — BaseEntity, GenericService, ApiResponse"
date: 2026-05-24
draft: false
target_section: tech
series: "Java 객체지향 실전"
series_order: 2
tags: [java, oop, spring, design-pattern]
description: "Spring + JPA 프로젝트에서 엔티티마다 복붙하는 Auditing 필드, CRUD 메서드, 응답 래퍼를 제네릭 추상화로 한 곳에 모으는 방법을 설명한다."
wiki_source: 10-wiki/tech/java-oop-patterns/02-generic-abstraction.md
categories: [Java]
---

## 이런 코드, 복붙하고 있지 않나요?

Spring + JPA 프로젝트를 막 시작하면 이런 일이 생긴다. `User` 엔티티를 만들고, `Product` 엔티티를 만들고, `Order` 엔티티를 만들다 보면, 어느 순간 `createdAt`, `updatedAt`, `createdBy`, `updatedBy`를 모든 파일에 복붙하고 있다.

```java
// User.java
@Entity
public class User {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;

    // 모든 엔티티에 아래 4개 필드가 반복
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private String createdBy;
    private String updatedBy;
}
```

```java
// Product.java
@Entity
public class Product {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;
    private long price;

    // 또 반복
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private String createdBy;
    private String updatedBy;
}
```

서비스 레이어도 마찬가지다. `UserService`의 `findById`, `save`, `delete`를 `ProductService`에 그대로 가져다 쓴다. 컨트롤러의 응답 구조도 사람마다 제각각이다.

반복 코드는 단순히 귀찮은 게 아니다. **버그 수정 지점이 여러 곳**이 된다는 게 진짜 문제다.

---

## 해결 1: BaseEntity로 Auditing 필드 공통화

### Spring JPA Auditing 활성화

먼저 Auditing을 쓰려면 설정이 필요하다.

```java
@Configuration
@EnableJpaAuditing(auditorAwareRef = "auditorProvider")
public class AuditingConfig {

    @Bean
    public AuditorAware<String> auditorProvider() {
        // SecurityContext에서 현재 로그인 사용자 이름을 가져옴
        return () -> Optional.ofNullable(SecurityContextHolder.getContext())
            .map(SecurityContext::getAuthentication)
            .filter(Authentication::isAuthenticated)
            .map(Authentication::getName);
    }
}
```

### BaseEntity 추상 클래스 하나로 정리

```java
@Getter
@MappedSuperclass                               // 이 클래스 자체는 테이블 없음
@EntityListeners(AuditingEntityListener.class)  // Auditing 이벤트 수신
public abstract class BaseEntity {

    @CreatedDate
    @Column(updatable = false)    // 최초 생성 후 변경 불가
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;

    @CreatedBy
    @Column(updatable = false)
    private String createdBy;

    @LastModifiedBy
    private String updatedBy;
}
```

`@MappedSuperclass`가 핵심이다. JPA에게 "이 클래스 자체는 테이블을 만들지 말고, 상속받는 엔티티의 테이블에 컬럼을 추가하라"고 지시한다.

### 엔티티에 적용하면

```java
@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private String email;
    // createdAt, updatedAt, createdBy, updatedBy — 4개가 사라졌다
}
```

```java
@Entity
@Table(name = "products")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Product extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private long price;
}
```

4개 필드가 `extends BaseEntity` 한 줄로 교체됐다.

---

## 해결 2: GenericService로 CRUD 공통화

서비스 레이어도 제네릭으로 추상화할 수 있다. 타입 파라미터를 세 개 쓰는 것이 처음엔 낯설 수 있지만, 논리는 단순하다.

```java
/**
 * T  : 엔티티 타입
 * ID : PK 타입 (Long, String 등)
 * R  : 사용할 JpaRepository 구현체 타입
 */
public abstract class GenericService<T, ID, R extends JpaRepository<T, ID>> {

    protected final R repository;

    protected GenericService(R repository) {
        this.repository = repository;
    }

    public T findById(ID id) {
        return repository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException(
                getEntityName() + " not found: " + id));
    }

    public List<T> findAll() {
        return repository.findAll();
    }

    public T save(T entity) {
        return repository.save(entity);
    }

    public void delete(ID id) {
        if (!repository.existsById(id)) {
            throw new EntityNotFoundException(getEntityName() + " not found: " + id);
        }
        repository.deleteById(id);
    }

    // 예외 메시지에 쓸 엔티티 이름. 하위 클래스에서 오버라이드.
    protected String getEntityName() {
        return "Entity";
    }
}
```

구체 서비스는 공통 CRUD를 상속받고, **도메인 특화 메서드만** 추가하면 된다.

```java
@Service
public class UserService extends GenericService<User, Long, UserRepository> {

    public UserService(UserRepository userRepository) {
        super(userRepository);
    }

    @Override
    protected String getEntityName() { return "User"; }

    // 도메인 특화 메서드만 여기 추가
    public Optional<User> findByEmail(String email) {
        return repository.findByEmail(email);
    }

    public boolean existsByEmail(String email) {
        return repository.existsByEmail(email);
    }
}
```

```java
@Service
public class ProductService extends GenericService<Product, Long, ProductRepository> {

    public ProductService(ProductRepository productRepository) {
        super(productRepository);
    }

    @Override
    protected String getEntityName() { return "Product"; }

    public List<Product> findByPriceLessThan(long maxPrice) {
        return repository.findByPriceLessThan(maxPrice);
    }
}
```

`findById`, `save`, `delete`가 사라지고, 각 서비스가 가진 고유한 로직만 남았다.

---

## 해결 3: ApiResponse\<T\>로 응답 구조 통일

컨트롤러마다 응답 형태가 다르면 프론트 팀은 힘들다.

```java
// 어떤 컨트롤러
return ResponseEntity.ok(Map.of("data", user, "success", true));

// 다른 컨트롤러
return ResponseEntity.ok(product);  // 래퍼 없이 바로 반환

// 또 다른 컨트롤러
return ResponseEntity.ok(Map.of("result", order, "code", 200, "message", "OK"));
```

제네릭 응답 래퍼 하나로 전 프로젝트의 응답 구조를 통일한다.

```java
@Getter
@NoArgsConstructor(access = AccessLevel.PRIVATE)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ApiResponse<T> {

    private int code;
    private String message;
    private T data;

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(200, "OK", data);
    }

    public static <T> ApiResponse<T> success() {
        return new ApiResponse<>(200, "OK", null);
    }

    public static <T> ApiResponse<T> success(int code, String message, T data) {
        return new ApiResponse<>(code, message, data);
    }

    public static <T> ApiResponse<T> error(int code, String message) {
        return new ApiResponse<>(code, message, null);
    }
}
```

컨트롤러는 이렇게 쓴다.

```java
@RestController
@RequiredArgsConstructor
@RequestMapping("/users")
public class UserController {

    private final UserService userService;

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> getUser(@PathVariable Long id) {
        User user = userService.findById(id);
        return ResponseEntity.ok(ApiResponse.success(UserResponse.from(user)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<UserResponse>> createUser(
            @RequestBody @Valid CreateUserRequest request) {
        User saved = userService.save(request.toEntity());
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(201, "Created", UserResponse.from(saved)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteUser(@PathVariable Long id) {
        userService.delete(id);
        return ResponseEntity.ok(ApiResponse.success());
    }
}
```

`GlobalExceptionHandler`에서도 같은 래퍼를 쓰면 성공 응답과 오류 응답이 같은 구조를 갖는다.

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotFound(EntityNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(ApiResponse.error(404, e.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> handleBadRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest()
            .body(ApiResponse.error(400, e.getMessage()));
    }
}
```

---

## 적용 전후 비교

| 항목 | 적용 전 | 적용 후 |
|------|---------|---------|
| Auditing 필드 | 엔티티마다 4개 반복 | `extends BaseEntity` 1줄 |
| CRUD 메서드 | Service마다 findById/save/delete 반복 | `GenericService` 상속, 도메인 메서드만 추가 |
| API 응답 구조 | Controller마다 제각각 | `ApiResponse<T>` 통일 |
| 타입 안전성 | `Map<String, Object>` 등 타입 소실 | 컴파일 타임에 타입 검증 |

---

## 마치며

**반복 코드는 복붙의 문제가 아니라 버그 수정 지점이 여러 곳이라는 문제다.** 제네릭 추상화로 공통 로직을 한 곳에 모으면, 고칠 게 생겼을 때 한 파일만 수정하면 된다.
