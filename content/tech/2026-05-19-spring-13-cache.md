---
title: "[Spring 완전 정복 #13] Spring Cache — @Cacheable로 DB 부하 줄이기, Redis 캐시 전략"
date: 2026-05-19
draft: false
series: "Spring 완전 정복"
series_order: 13
series_total: 14
categories: ["Spring"]
tags: [spring, cache, cacheable, redis, cacheevict, performance, backend]
description: "@Cacheable/@CacheEvict/@CachePut 동작 원리, 로컬 캐시에서 Redis로 전환하는 방법, Cache-Aside/Write-Through 전략, 캐시 스탬피드와 자기 호출 함정까지 정리한다."
wiki_source: 10-wiki/tech/spring/11-spring-cache.md
---

## 같은 데이터를 매번 DB에서 가져와야 할까?

자주 조회되지만 잘 바뀌지 않는 데이터가 있다. 상품 카탈로그, 카테고리 목록, 설정값 같은 것들이다. 이런 데이터를 요청마다 DB에서 가져오는 것은 비효율적이다.

**캐시**는 이 데이터를 메모리에 저장해두고, 다음 요청부터는 DB를 거치지 않고 메모리에서 반환한다. Spring Cache 추상화는 `@Cacheable` 어노테이션 하나로 이 동작을 구현한다.

---

## @Cacheable — 캐시 조회 → 없으면 실행 → 저장

```java
@Service
public class ProductService {

    @Cacheable(value = "products", key = "#productId")
    public ProductDto getProduct(Long productId) {
        // 캐시에 없을 때만 실행 (Cache Miss)
        return productRepository.findById(productId)
            .map(ProductDto::from)
            .orElseThrow(() -> new ProductNotFoundException(productId));
    }
}
```

```java
@Configuration
@EnableCaching  // 캐시 활성화
public class CacheConfig { }
```

동작 흐름:

```text
[첫 번째 호출]
→ 캐시 조회 → Miss → 메서드 실행 → 결과를 캐시에 저장 → 반환

[두 번째 이후]
→ 캐시 조회 → Hit → 메서드 실행 없이 캐시 반환
```

키를 복합적으로 구성할 수 있다.

```java
@Cacheable(value = "products", key = "#category + ':' + #page")
public List<ProductDto> getProductsByCategory(String category, int page) { ... }
```

---

## @CacheEvict — 데이터 수정 시 캐시 삭제

```java
@CacheEvict(value = "products", key = "#productId")
public void updateProduct(Long productId, ProductUpdateRequest request) {
    // 메서드 실행 후 캐시 삭제 (기본값)
    // 다음 조회 시 DB에서 새 데이터를 가져와 캐시에 저장
}

// 전체 삭제
@CacheEvict(value = "products", allEntries = true)
public void clearAllCache() { }
```

---

## @CachePut — 항상 실행 + 캐시 갱신

```java
@CachePut(value = "products", key = "#result.id")
public ProductDto createProduct(ProductCreateRequest request) {
    Product saved = productRepository.save(new Product(request));
    return ProductDto.from(saved); // 반환값이 캐시에 저장됨
}
```

`@Cacheable`은 캐시에 있으면 실행을 건너뛰지만, `@CachePut`은 항상 실행하고 결과로 캐시를 갱신한다.

---

## 로컬 캐시에서 Redis로 교체

Spring Cache는 추상화 레이어라 구현체를 쉽게 교체할 수 있다. 코드 변경 없이 `CacheManager`만 바꾸면 된다.

### 로컬 캐시 (기본)

기본값은 `ConcurrentMapCacheManager`다. 별도 설정 없이 동작하지만 서버가 여러 대면 서버마다 다른 캐시를 갖게 되어 데이터 불일치가 생긴다.

### Redis 캐시 (다중 서버 환경)

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

```yaml
spring:
  cache:
    type: redis
    redis:
      time-to-live: 3600000  # 기본 TTL: 1시간
```

캐시별로 TTL을 다르게 설정하려면:

```java
@Bean
public RedisCacheManager cacheManager(RedisConnectionFactory factory) {
    Map<String, RedisCacheConfiguration> configs = new HashMap<>();

    configs.put("products",
        RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(30))
            .serializeValuesWith(
                RedisSerializationContext.SerializationPair
                    .fromSerializer(new GenericJackson2JsonRedisSerializer())));

    configs.put("users",
        RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofHours(1)));

    return RedisCacheManager.builder(factory)
        .withInitialCacheConfigurations(configs)
        .build();
}
```

---

## 캐시 전략

### Cache-Aside (Lazy Loading) — 가장 일반적

```text
읽기: 캐시 → Miss면 DB 조회 → 캐시 저장 → 반환
쓰기: DB 업데이트 → 캐시 삭제 (다음 읽기 때 재적재)
```

Spring의 `@Cacheable` + `@CacheEvict` 패턴이 이것이다.

### Write-Through

```text
쓰기: DB 업데이트 + 캐시 동시 업데이트
```

`@CachePut` 패턴이다. 읽기가 항상 캐시에서 이루어져 빠르지만, 잘 쓰지 않는 데이터도 캐시에 올라가 공간을 낭비할 수 있다.

---

## 주의사항 3가지

### 1. 캐시 스탬피드

캐시가 만료되는 순간 대량의 요청이 동시에 DB로 몰리는 현상이다. TTL에 랜덤 jitter를 추가하거나 분산 락으로 하나의 요청만 DB를 조회하도록 처리한다.

### 2. 캐시 무효화 누락

```java
@Transactional
@CacheEvict(value = "products", key = "#id")  // 잊으면 안 됨
public void updateProduct(Long id, ProductUpdateRequest request) {
    productRepository.save(product.update(request));
}
```

데이터 수정 후 `@CacheEvict`를 빠트리면 수정 전 데이터가 캐시에 남아 서비스한다.

### 3. 자기 호출

`@Cacheable`도 AOP 프록시로 동작한다. `@Transactional`, `@Async`와 동일하게 같은 클래스 내부에서 직접 호출하면 캐시가 적용되지 않는다.

Redis에 저장하는 DTO는 직렬화 가능해야 한다. Jackson JSON 직렬화 시 기본 생성자가 필요하다.

---

## 마치며

Spring Cache의 핵심은 **구현체 독립성**이다. 로컬 캐시에서 Redis로 교체할 때 `@Cacheable` 코드는 전혀 바꾸지 않아도 된다. `@Cacheable`(조회 캐시), `@CacheEvict`(삭제), `@CachePut`(갱신) 세 가지 어노테이션을 목적에 맞게 조합하고, 다중 서버 환경에서는 반드시 Redis 같은 분산 캐시를 사용해야 한다.

다음 편에서는 Spring Scheduling — `@Scheduled`와 다중 서버 환경에서의 중복 실행 방지를 정리한다.
