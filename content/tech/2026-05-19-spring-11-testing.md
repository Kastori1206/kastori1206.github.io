---
title: "[Spring 완전 정복 #11] Spring 테스트 전략 — 단위·슬라이스·통합 테스트를 언제 어떻게 쓸까"
date: 2026-05-19T04:00:00+09:00
draft: false
series: "Spring 완전 정복"
series_order: 11
series_total: 14
categories: ["Spring"]
tags: [spring, test, springboottest, webmvctest, datajpatest, mockito, java, backend]
description: "Spring 테스트의 세 계층 — JUnit5+Mockito 단위 테스트, @WebMvcTest 슬라이스 테스트, @DataJpaTest, @SpringBootTest 통합 테스트를 목적별로 구분하고 실전 코드로 정리한다."
wiki_source: 10-wiki/tech/spring/09-spring-testing.md
---

## 테스트를 왜 계층으로 나누는가

`@SpringBootTest`를 쓰면 전체 Spring Context를 로드하므로 모든 것을 테스트할 수 있다. 그런데 왜 단위 테스트, 슬라이스 테스트를 따로 쓸까?

**속도** 때문이다. `@SpringBootTest`는 전체 Context를 띄우므로 느리다. 단순 비즈니스 로직 검증에 매번 10초씩 기다리는 것은 비효율적이다. 테스트 종류를 목적에 맞게 선택하면 빠르고 명확한 테스트를 작성할 수 있다.

```text
단위 테스트     : 빠름  — 비즈니스 로직
@WebMvcTest    : 빠름  — API 계약, Validation, HTTP 상태코드
@DataJpaTest   : 빠름  — 쿼리 메서드, 커스텀 쿼리
@SpringBootTest : 느림  — 전체 플로우 통합 검증
```

---

## 단위 테스트 — JUnit5 + Mockito

Spring Context 없이 순수 Java로 테스트한다. 가장 빠르고 의존성이 없다.

```java
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private PaymentService paymentService;

    @InjectMocks  // @Mock 객체들을 OrderService에 자동 주입
    private OrderService orderService;

    @Test
    void 주문_생성_성공() {
        // given
        OrderRequest request = new OrderRequest(1L, 2, 10000);
        Order mockOrder = Order.builder().id(1L).status(OrderStatus.PENDING).build();
        given(orderRepository.save(any(Order.class))).willReturn(mockOrder);

        // when
        OrderDto result = orderService.createOrder(request);

        // then
        assertThat(result.getId()).isEqualTo(1L);
        verify(orderRepository, times(1)).save(any(Order.class));
    }

    @Test
    void 재고_부족_시_예외_발생() {
        given(productRepository.findById(anyLong()))
            .willReturn(Optional.of(Product.builder().stock(0).build()));

        assertThatThrownBy(() -> orderService.createOrder(request))
            .isInstanceOf(InsufficientStockException.class);
    }
}
```

**ArgumentCaptor**로 메서드에 전달된 인자를 검증할 수 있다.

```java
ArgumentCaptor<Order> captor = ArgumentCaptor.forClass(Order.class);
verify(orderRepository).save(captor.capture());
assertThat(captor.getValue().getStatus()).isEqualTo(OrderStatus.PENDING);
```

---

## @WebMvcTest — Controller 레이어만 테스트

Controller, Filter, `@ControllerAdvice`만 로드한다. Service, Repository는 `@MockBean`으로 대체한다. MockMvc로 실제 HTTP 요청처럼 테스트한다.

```java
@WebMvcTest(OrderController.class)
class OrderControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean  // Spring Context에 Mock Bean 등록
    private OrderService orderService;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void 주문_생성_API_테스트() throws Exception {
        // given
        CreateOrderRequest request = new CreateOrderRequest(1L, 2);
        OrderDto response = OrderDto.builder().id(1L).status("PENDING").build();
        given(orderService.createOrder(any())).willReturn(response);

        // when & then
        mockMvc.perform(post("/api/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(1L))
            .andExpect(jsonPath("$.status").value("PENDING"))
            .andDo(print());
    }

    @Test
    void Validation_실패_시_400_반환() throws Exception {
        CreateOrderRequest invalidRequest = new CreateOrderRequest(null, 2);

        mockMvc.perform(post("/api/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(invalidRequest)))
            .andExpect(status().isBadRequest());
    }
}
```

Spring Security가 설정된 프로젝트에서는 인증 설정이 필요하다.

```java
@WebMvcTest(OrderController.class)
@WithMockUser(roles = "USER")  // 인증된 사용자로 테스트
class OrderControllerTest { ... }
```

**`@MockBean` vs `@Mock`의 차이**: `@MockBean`은 Spring Context에 Mock을 올린다(슬라이스 테스트에서 사용). `@Mock`은 Spring 없이 Mockito만으로 사용하는 것이다.

---

## @DataJpaTest — JPA 레이어만 테스트

JPA 관련 Bean만 로드한다. 기본적으로 인메모리 H2 DB를 사용하고, 각 테스트 후 자동 롤백한다.

```java
@DataJpaTest
class OrderRepositoryTest {

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private TestEntityManager em;

    @Test
    void 주문_저장_및_조회() {
        // given
        Member member = em.persist(Member.builder().email("test@test.com").build());
        Order order = Order.builder().member(member).status(OrderStatus.PENDING).build();

        // when
        Order saved = orderRepository.save(order);
        em.flush();   // 1차 캐시 → DB 즉시 반영
        em.clear();   // 1차 캐시 비우기 → 실제 DB 조회 강제

        // then
        Order found = orderRepository.findById(saved.getId()).get();
        assertThat(found.getStatus()).isEqualTo(OrderStatus.PENDING);
    }
}
```

`em.flush()` + `em.clear()` 패턴이 중요하다. flush 없이 findById를 하면 1차 캐시에서 반환되어 DB에 실제로 저장됐는지 확인할 수 없다. flush로 DB에 반영하고 clear로 캐시를 비운 뒤 다시 조회해야 한다.

실제 DB로 테스트하려면:

```java
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
class OrderRepositoryTest { ... }
```

---

## @SpringBootTest — 통합 테스트

전체 Spring Context를 로드한다. 실제 DB와 함께 통합 테스트에 사용한다.

```java
@SpringBootTest
@Transactional  // 테스트 후 자동 롤백
class OrderServiceIntegrationTest {

    @Autowired
    private OrderService orderService;

    @Autowired
    private OrderRepository orderRepository;

    @Test
    void 주문_생성_통합_테스트() {
        CreateOrderRequest request = new CreateOrderRequest(1L, 2);

        OrderDto result = orderService.createOrder(request);

        Order savedOrder = orderRepository.findById(result.getId()).get();
        assertThat(savedOrder.getStatus()).isEqualTo(OrderStatus.PENDING);
    }
}
```

MockMvc와 함께 전체 API 플로우를 테스트할 수 있다.

```java
@SpringBootTest
@AutoConfigureMockMvc
class OrderApiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void 전체_주문_플로우_테스트() throws Exception {
        mockMvc.perform(post("/api/orders")
                .header("Authorization", "Bearer " + getToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestJson))
            .andExpect(status().isCreated());
    }
}
```

---

## 4가지 비교

| 구분 | 속도 | 범위 | 목적 |
|---|---|---|---|
| **JUnit5 + Mockito** | 가장 빠름 | 클래스 단위 | 비즈니스 로직 |
| **@WebMvcTest** | 빠름 | Controller 레이어 | API 계약, Validation, 상태코드 |
| **@DataJpaTest** | 빠름 | JPA 레이어 | 쿼리 메서드, 커스텀 쿼리 |
| **@SpringBootTest** | 느림 | 전체 컨텍스트 | E2E 플로우, 통합 검증 |

---

## 자주 쓰는 AssertJ

```java
assertThat(result).isEqualTo(expected);
assertThat(list).hasSize(3).contains(element);
assertThat(list).isEmpty();

assertThatThrownBy(() -> service.method())
    .isInstanceOf(SomeException.class)
    .hasMessageContaining("에러 메시지");

assertThat(order)
    .extracting("status", "amount")
    .containsExactly(OrderStatus.PENDING, 10000);
```

---

## 마치며

테스트는 단계별로 목적에 맞게 작성하는 것이 효율적이다. 비즈니스 로직은 빠른 단위 테스트로, Controller 계층은 `@WebMvcTest`로, JPA 쿼리는 `@DataJpaTest`로 검증한다. `@SpringBootTest`는 전체 플로우 통합 검증에만 사용한다. 이렇게 하면 테스트 속도를 유지하면서 신뢰성 있는 테스트 스위트를 구성할 수 있다.
