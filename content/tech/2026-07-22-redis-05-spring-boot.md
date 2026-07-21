---
title: "[Redis 실무 입문 #5] Spring Boot 연동 + 운영 체크리스트"
date: 2026-07-22
draft: false
target_section: tech
series: "Redis 실무 입문"
series_order: 5
series_total: 5
tags: [redis, spring-boot, redistemplate, cacheable, backend]
description: "Redis 실무 입문 시리즈 마지막 편. Spring Boot에서 RedisTemplate과 @Cacheable로 Redis를 연동하는 법, 그리고 운영에서 사고를 막는 체크리스트를 정리한다."
wiki_source: 10-wiki/tech/db/09-redis-getting-started.md
categories: [Database]
---

## cli 그만 치고, 이제 코드로

지금까지 [설치](/tech/2026-07-14-redis-01-getting-started/)부터 [자료구조](/tech/2026-07-16-redis-02-data-structures/), [캐시](/tech/2026-07-18-redis-03-caching/), [실전 패턴](/tech/2026-07-20-redis-04-patterns/)까지 전부 `redis-cli`로 손으로 쳤다. 감을 잡는 덴 이게 제일이지만, 실제 서비스는 애플리케이션 코드에서 Redis를 호출한다. 마지막 편은 이걸 Spring Boot에 붙이는 법과, 운영에 올리기 전 마지막으로 훑을 체크리스트다.

---

## 붙이는 건 의존성 하나면 끝

```groovy
// build.gradle
implementation 'org.springframework.boot:spring-boot-starter-data-redis'
```

```yaml
# application.yml
spring:
  data:
    redis:
      host: localhost
      port: 6379
```

이게 끝이다. 기본 클라이언트는 Spring Boot가 골라주는 **Lettuce**(비동기, 스레드 안전)다. 예전 자료를 보면 Jedis 얘기가 많이 나오는데, 지금은 특별한 이유 없으면 그냥 Lettuce 기본값을 쓰면 된다. 나도 굳이 바꿔본 적 없다.

---

## RedisTemplate — 명령을 그대로 코드로

가장 기본적인 방법은 명령을 직접 호출하는 것이다. 앞 편들에서 손으로 친 `SET`/`GET`/`HSET`이 메서드로 그대로 대응된다.

```java
@Autowired
private StringRedisTemplate redisTemplate;

// String — 저장 + TTL
redisTemplate.opsForValue().set("user:1", json, Duration.ofHours(1));
String value = redisTemplate.opsForValue().get("user:1");

// Hash
redisTemplate.opsForHash().put("session:abc", "userId", "1");

// Sorted Set (랭킹)
redisTemplate.opsForZSet().incrementScore("ranking:today", "post:100", 1);
Set<String> top10 = redisTemplate.opsForZSet()
        .reverseRange("ranking:today", 0, 9);
```

`opsForValue()`(String), `opsForHash()`, `opsForList()`, `opsForSet()`, `opsForZSet()` — 자료구조마다 짝이 되는 연산 객체가 있다. [#2](/tech/2026-07-16-redis-02-data-structures/)에서 잡아둔 감이 여기서 그대로 이어진다. 자료구조를 먼저 이해하고 오면 이 API가 하나도 안 낯설다.

---

## @Cacheable — 캐시를 코드에서 아예 안 보이게

[#3의 Cache-Aside](/tech/2026-07-18-redis-03-caching/)를 메서드마다 손으로 짜는 건 금방 지겨워진다. `if 캐시 있으면 반환, 없으면 DB, 저장...`을 서비스마다 반복하게 된다. Spring은 이걸 어노테이션으로 감춰준다.

```java
@Cacheable(value = "user", key = "#id")
public User getUser(Long id) {
    return userRepository.findById(id).orElseThrow();
}

@CacheEvict(value = "user", key = "#user.id")
public void updateUser(User user) {
    userRepository.save(user);
}
```

`@Cacheable`이 "먼저 캐시 보고, 없으면 메서드 실행해서 그 결과를 캐시에 저장"하는 Cache-Aside를 통째로 대신한다. `@CacheEvict`는 수정 시 캐시를 지운다 — #3에서 강조한 "수정하면 덮어쓰기 말고 삭제" 원칙 그대로다. 메서드 본문에서 Redis 얘기가 아예 사라지는 게 깔끔하다.

근데 여기 함정이 하나 있다. **`@Cacheable`의 기본값은 TTL이 없다.** #3에서 그렇게 강조한 "TTL 없는 캐시"의 함정에 그대로 빠진다. 편하다고 어노테이션만 붙이고 끝내면 안 되고, `CacheManager`에서 TTL을 반드시 지정해야 한다.

```java
@Bean
public RedisCacheManager cacheManager(RedisConnectionFactory cf) {
    RedisCacheConfiguration config = RedisCacheConfiguration
            .defaultCacheConfig()
            .entryTtl(Duration.ofHours(1));   // 이거 안 넣으면 만료 없음
    return RedisCacheManager.builder(cf).cacheDefaults(config).build();
}
```

---

## 운영에 올리기 전 체크리스트 6

시리즈 내내 흘린 주의사항을 한곳에 모았다. 처음 Redis를 운영에 올릴 때 이것만 훑어도 큰 사고는 피한다. 개인적으로 배포 전에 이 목록을 실제로 눈으로 짚고 넘어가는 편이다.

```
✅ TTL을 걸었는가
   → 캐시엔 거의 항상. @Cacheable이면 CacheManager에서 entryTtl 확인.

✅ KEYS * 를 어딘가에서 쓰고 있지 않은가
   → 운영 블로킹의 주범. SCAN으로 대체.

✅ 너무 큰 값을 넣고 있지 않은가
   → 1MB 넘는 값, 수만 개짜리 컬렉션은 단일 스레드를 막는다.

✅ Redis가 통째로 비어도 서비스가 복구되는가
   → 휘발성 전제. 사라지면 안 되는 데이터는 Redis 단독 보관 금지.

✅ 원본 수정 시 캐시를 무효화하는가
   → @CacheEvict / DEL로 정합성. 안 하면 낡은 값 노출.

✅ 직렬화 형식을 팀에서 합의했는가
   → JSON 등 일관되게. 안 그러면 나중에 못 읽는 값이 쌓인다.
```

---

## 시리즈를 마치며

다섯 편에 걸쳐 설치부터 운영까지 훑었다.

- **#1** 개념과 설치, redis-cli 기본
- **#2** 자료구조 5종 — 상황에 맞게 고르기
- **#3** 캐시 — Cache-Aside와 정합성
- **#4** 실전 패턴 — 세션·Rate Limiting·분산 락·랭킹
- **#5** Spring Boot 연동과 운영 체크리스트

처음이라면 욕심내지 말고 **캐시(#3)와 세션(#4)** 두 개만 제대로 붙여봐도 충분하다. 나도 거기서 시작했다. 익숙해지면 랭킹이랑 Rate Limiting으로 넓혀가면 된다. 그리고 "대체 이게 왜 이렇게 빠른가", "왜 `KEYS *`가 서버를 멈추는가"가 궁금해지는 순간이 온다. 그때 [Redis가 빠른 진짜 이유](/tech/2026-06-01-db-07-redis-internals/)로 돌아가 원리를 보면, 지금까지 외운 명령어들이 비로소 구조로 이해된다. 그 순서를 추천한다 — 쓰면서 궁금해진 다음에 원리를 보는 것.
