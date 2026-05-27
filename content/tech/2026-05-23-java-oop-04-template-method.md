---
title: "[Java 객체지향 실전 #4] 카카오, 네이버, 구글... API 클라이언트 코드가 계속 늘어난다면"
date: 2026-05-23
draft: false
target_section: tech
series: "Java 객체지향 실전"
series_order: 4
tags: [java, oop, spring, design-pattern]
description: "외부 API 호출 코드에서 흐름은 똑같은데 구현만 다른 상황, 템플릿 메서드 패턴으로 중복 없이 해결하는 법을 다룬다."
wiki_source: 10-wiki/tech/java-oop-patterns/04-template-method.md
categories: [Java]
---

## 이런 코드 본 적 있지 않나요?

소셜 로그인을 붙이다 보면 어느 순간 이런 상황이 온다.

`KakaoApiClient`에 인증 헤더 붙이고, 요청 실행하고, 에러 처리하고, 응답 파싱하는 코드를 짜고 나서 — `NaverApiClient`를 만들 차례가 됐는데 Ctrl+C, Ctrl+V가 손에서 멈추지 않는다.

엔드포인트만 다르고, 파싱 방식만 살짝 다를 뿐인데, 나머지 코드는 거의 동일하다.

문제는 내일 구글 로그인을 추가해야 할 때다. 또 같은 코드를 복사해야 한다.

---

## 나쁜 코드: 흐름이 복사된다

```java
// 카카오 API 클라이언트
public class KakaoApiClient {

    public KakaoUserInfo fetchUserInfo(String accessToken) {
        // 중복 1: 인증 헤더 추가
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<Void> request = new HttpEntity<>(headers);

        // 중복 2: 요청 실행
        ResponseEntity<String> response;
        try {
            response = restTemplate.exchange(
                "https://kapi.kakao.com/v2/user/me",
                HttpMethod.GET,
                request,
                String.class
            );
        } catch (HttpClientErrorException e) {
            // 중복 3: 에러 처리
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                throw new TokenExpiredException("카카오 토큰 만료");
            }
            throw new ExternalApiException("카카오 API 오류: " + e.getMessage());
        }

        // 중복 4: 응답 파싱 (카카오 전용)
        return objectMapper.readValue(response.getBody(), KakaoUserInfo.class);
    }
}

// 네이버 API 클라이언트 — 거의 동일한 코드가 반복됨
public class NaverApiClient {

    public NaverUserInfo fetchUserInfo(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<Void> request = new HttpEntity<>(headers);

        ResponseEntity<String> response;
        try {
            response = restTemplate.exchange(
                "https://openapi.naver.com/v1/nid/me",  // 엔드포인트만 다름
                HttpMethod.GET,
                request,
                String.class
            );
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                throw new TokenExpiredException("네이버 토큰 만료");
            }
            throw new ExternalApiException("네이버 API 오류: " + e.getMessage());
        }

        // 파싱 방식만 다름
        NaverApiResponse rawResponse = objectMapper.readValue(response.getBody(), NaverApiResponse.class);
        return rawResponse.getResponse();
    }
}
```

무엇이 문제일까?

- 인증 헤더 추가 방식이 바뀌면 `KakaoApiClient`, `NaverApiClient`, `GoogleApiClient` 전부 찾아다니며 수정해야 한다.
- 에러 처리 정책이 바뀌어도 마찬가지다.
- 새 OAuth 제공자가 생길 때마다 이 200줄짜리 파일이 그대로 복사된다.

---

## 템플릿 메서드 패턴이란?

핵심 아이디어는 간단하다.

> **"흐름(뼈대)은 상위 클래스에 고정하고, 달라지는 부분만 하위 클래스에 위임한다."**

인증 헤더 추가 → 요청 실행 → 에러 처리 → 응답 파싱, 이 4단계 흐름은 모든 API 클라이언트가 동일하다. 달라지는 건 엔드포인트와 파싱 방식뿐이다.

---

## 좋은 코드: AbstractApiClient로 흐름 고정

```java
// 템플릿 메서드를 정의하는 추상 클래스
public abstract class AbstractApiClient {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    protected AbstractApiClient(RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    // 템플릿 메서드: 흐름이 고정됨 (final로 오버라이드 방지)
    public final <T> T fetch(String accessToken, Class<T> responseType) {
        // 흐름 1: 인증 헤더 추가 (공통)
        HttpHeaders headers = buildAuthHeaders(accessToken);
        HttpEntity<Void> request = new HttpEntity<>(headers);

        // 흐름 2: 요청 실행 (공통)
        ResponseEntity<String> response = executeRequest(request);

        // 흐름 3: 에러 처리 (공통)
        validateResponse(response);

        // 흐름 4: 응답 파싱 (하위 클래스가 결정)
        return parseResponse(response.getBody(), responseType);
    }

    // 훅 메서드: 기본 구현 있음, 필요시 오버라이드 가능
    protected HttpHeaders buildAuthHeaders(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    protected void validateResponse(ResponseEntity<String> response) {
        if (response.getStatusCode() == HttpStatus.UNAUTHORIZED) {
            throw new TokenExpiredException(getProviderName() + " 토큰 만료");
        }
        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new ExternalApiException(getProviderName() + " API 오류: " + response.getStatusCode());
        }
    }

    // 추상 메서드: 하위 클래스가 반드시 구현
    protected abstract String getEndpoint();
    protected abstract String getProviderName();

    // 훅 메서드: 기본 파싱, 필요시 오버라이드
    protected <T> T parseResponse(String body, Class<T> responseType) {
        try {
            return objectMapper.readValue(body, responseType);
        } catch (JsonProcessingException e) {
            throw new ExternalApiException("응답 파싱 실패: " + e.getMessage());
        }
    }

    private ResponseEntity<String> executeRequest(HttpEntity<Void> request) {
        try {
            return restTemplate.exchange(
                getEndpoint(),
                HttpMethod.GET,
                request,
                String.class
            );
        } catch (HttpClientErrorException e) {
            validateResponse(ResponseEntity.status(e.getStatusCode()).body(e.getResponseBodyAsString()));
            throw e;
        }
    }
}
```

이제 각 클라이언트는 "나만 다른 부분"만 구현하면 된다.

```java
// 카카오: 엔드포인트와 이름만 반환
@Component
public class KakaoApiClient extends AbstractApiClient {

    public KakaoApiClient(RestTemplate restTemplate, ObjectMapper objectMapper) {
        super(restTemplate, objectMapper);
    }

    @Override
    protected String getEndpoint() {
        return "https://kapi.kakao.com/v2/user/me";
    }

    @Override
    protected String getProviderName() {
        return "카카오";
    }

    public KakaoUserInfo fetchUserInfo(String accessToken) {
        return fetch(accessToken, KakaoUserInfo.class);
    }
}

// 네이버: 응답 구조가 다르니 parseResponse만 오버라이드
@Component
public class NaverApiClient extends AbstractApiClient {

    @Override
    protected String getEndpoint() {
        return "https://openapi.naver.com/v1/nid/me";
    }

    @Override
    protected String getProviderName() {
        return "네이버";
    }

    // 네이버는 {"resultcode": "00", "response": {...}} 구조라 래퍼 벗기기 필요
    @Override
    protected <T> T parseResponse(String body, Class<T> responseType) {
        NaverApiResponse wrapper = super.parseResponse(body, NaverApiResponse.class);
        return objectMapper.convertValue(wrapper.getResponse(), responseType);
    }

    public NaverUserInfo fetchUserInfo(String accessToken) {
        return fetch(accessToken, NaverUserInfo.class);
    }
}
```

구글을 추가해야 한다면? `AbstractApiClient`를 상속받아 `getEndpoint()`와 `getProviderName()`만 구현하면 된다. 기존 파일은 손댈 필요가 없다.

---

## 추상 메서드 vs 훅 메서드

이 패턴을 쓸 때 구분해야 할 개념이 있다.

```java
// 추상 메서드: 하위 클래스가 반드시 구현 (구현 안 하면 컴파일 오류)
protected abstract String getEndpoint();

// 훅 메서드: 기본 구현이 있어 오버라이드는 선택
protected void preProcess() {}          // 기본: 아무것도 안 함
protected boolean shouldNotify() {      // 기본: 항상 알림
    return true;
}
```

| 구분 | 추상 메서드 | 훅 메서드 |
|------|------------|----------|
| 구현 강제 | O (컴파일 오류) | X (선택적) |
| 기본값 | 없음 | 있음 |
| 용도 | 반드시 달라야 하는 부분 | 대부분 같지만 가끔 달라야 하는 부분 |

---

## 실무 예시: 배치 작업에도 똑같이 쓴다

API 클라이언트뿐 아니라 배치 작업도 흐름이 고정된 경우가 많다.

`전처리 → 핵심 처리 → 후처리 → 알림` — 이 흐름을 `AbstractBatchJob`으로 고정하면, 개별 배치는 핵심 처리 로직에만 집중할 수 있다.

```java
public abstract class AbstractBatchJob {

    // 템플릿 메서드: 배치 실행 흐름 고정
    public final BatchResult execute() {
        logger.start(getJobName());
        try {
            preProcess();                     // 훅: 선택적
            BatchResult result = process();   // 추상: 반드시 구현
            postProcess(result);              // 훅: 선택적
            if (shouldNotify()) {
                slackNotifier.sendSuccess(getJobName(), result.getSummary());
            }
            return result;
        } catch (Exception e) {
            slackNotifier.sendFailure(getJobName(), e.getMessage());
            throw new BatchJobException(getJobName() + " 실패", e);
        }
    }

    protected abstract String getJobName();
    protected abstract BatchResult process();

    protected void preProcess() {}
    protected void postProcess(BatchResult result) {}
    protected boolean shouldNotify() { return true; }
}

// 만료 쿠폰 정리 배치: 핵심 로직만 작성
@Component
public class ExpiredCouponCleanupJob extends AbstractBatchJob {

    @Override
    protected String getJobName() { return "만료-쿠폰-정리"; }

    @Override
    protected BatchResult process() {
        List<Coupon> expiredCoupons = couponRepository.findExpiredCoupons(LocalDate.now());
        couponRepository.deleteAll(expiredCoupons);
        return BatchResult.of(expiredCoupons.size() + "개 삭제 완료");
    }

    @Override
    protected void preProcess() {
        distributedLock.acquire("expired-coupon-cleanup");
    }

    @Override
    protected void postProcess(BatchResult result) {
        distributedLock.release("expired-coupon-cleanup");
    }
}
```

슬랙 알림 형식이 바뀌면? `AbstractBatchJob`만 수정하면 모든 배치에 반영된다.

---

## 이 패턴을 써도 되는지 판단하는 기준

템플릿 메서드는 상속을 사용하기 때문에 남용하면 계층이 깊어진다. 언제 써야 하는지 기준을 명확히 해두는 게 좋다.

**상속(템플릿 메서드)이 맞는 경우**
- 알고리즘의 흐름이 완전히 동일하고 세부 구현만 다를 때
- 변형 가능한 지점이 2~3개 이하로 한정될 때

**컴포지션(전략 패턴)이 맞는 경우**
- 런타임에 동작을 교체해야 할 때
- 변형 지점이 많아 상속 계층이 폭발적으로 증가할 것 같을 때
- 인증 방식 × 파싱 방식처럼 다중 조합이 필요할 때

외부 API 클라이언트처럼 "흐름은 같고 엔드포인트·파싱만 다른" 경우는 템플릿 메서드가 깔끔하다. 반면 결제 수단처럼 완전히 다른 알고리즘을 교체해야 하는 경우는 전략 패턴 쪽이 낫다.

---

## 마치며

템플릿 메서드 패턴의 핵심은 **"공통 흐름은 한 곳에, 변하는 부분만 오버라이드"** — 새 구현체를 추가해도 기존 코드를 건드리지 않아야 진짜 OCP다.

---

> **참고**: 템플릿 메서드 패턴(Template Method Pattern)은 GoF(Gang of Four)의 *Design Patterns: Elements of Reusable Object-Oriented Software* (Gamma et al., 1994)에서 정의한 행동 패턴이다. 이 글의 예시는 그 원형을 Spring 외부 API 클라이언트 구조에 맞게 응용한 것이다.
