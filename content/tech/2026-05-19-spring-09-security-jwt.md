---
title: "[Spring 완전 정복 #9] Spring Security + JWT 구현 — 인증 흐름부터 토큰 검증까지"
date: 2026-05-09
draft: false
series: "Spring 완전 정복"
series_order: 9
series_total: 14
categories: ["Spring"]
tags: [spring, security, authentication, authorization, jwt, filter-chain, java, backend]
description: "Spring Security의 DelegatingFilterProxy → FilterChainProxy → SecurityFilterChain 구조를 이해하고, JWT 인증 필터 구현, @PreAuthorize 인가, BCrypt 패스워드 처리까지 실전 코드로 정리한다."
wiki_source: 10-wiki/tech/spring/07-spring-security.md
---

## 인증과 인가 — 순서가 있다

Spring Security를 다루기 전에 개념을 먼저 정리한다.

```text
인증 (Authentication) : "당신이 누구인지" 확인 → 로그인
인가 (Authorization)  : "당신이 무엇을 할 수 있는지" 확인 → 권한 체크
```

순서는 항상 **인증 → 인가**다. 누구인지 확인도 안 된 상태에서 권한을 체크할 수 없다.

---

## Spring Security 전체 구조

HTTP 요청이 Controller에 닿기 전에 Spring Security의 필터 체인이 먼저 처리한다.

```text
HTTP 요청
  ↓
DelegatingFilterProxy       ← Servlet Container에 등록된 진입점
  ↓
FilterChainProxy            ← Spring Security 필터 체인 관리
  ↓
SecurityFilterChain         ← 실제 보안 필터들
  ├── JwtAuthenticationFilter     (JWT 검증 — 커스텀)
  ├── UsernamePasswordAuthenticationFilter  (폼 로그인)
  ├── ExceptionTranslationFilter  (인증/인가 예외 처리)
  └── FilterSecurityInterceptor   (URL 기반 인가)
  ↓
DispatcherServlet
  ↓
Controller
```

`DelegatingFilterProxy`는 Servlet Container 레벨의 Filter이지만 내부적으로 Spring Bean인 `FilterChainProxy`에 처리를 위임한다. Servlet Container와 Spring Context를 연결하는 다리 역할이다.

---

## SecurityFilterChain 설정 (Spring Boot 3.x)

`WebSecurityConfigurerAdapter`는 deprecated됐다. Spring Boot 3.x에서는 `SecurityFilterChain` Bean을 직접 등록한다.

```java
@Configuration
@EnableWebSecurity
@EnableMethodSecurity  // @PreAuthorize 활성화
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())  // JWT + Stateless → CSRF 불필요
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()     // 로그인, 회원가입
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/posts/**").permitAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthenticationFilter,
                             UsernamePasswordAuthenticationFilter.class)
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint(
                    new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)));

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

---

## 폼 로그인 인증 흐름

로그인 요청이 처리되는 전체 흐름이다.

```text
[1] POST /login (username, password)
[2] UsernamePasswordAuthenticationFilter → 미인증 토큰 생성
[3] AuthenticationManager (ProviderManager) → 인증 Provider 목록 순회
[4] DaoAuthenticationProvider → UserDetailsService 호출
[5] UserDetailsService → DB 조회 → UserDetails 반환
[6] PasswordEncoder.matches(입력PW, 저장된해시PW) 검증
[7] 인증 성공 → Authentication 객체 생성 → SecurityContext 저장
```

```java
@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {

    private final MemberRepository memberRepository;

    @Override
    public UserDetails loadUserByUsername(String username) {
        Member member = memberRepository.findByEmail(username)
            .orElseThrow(() -> new UsernameNotFoundException(
                "사용자를 찾을 수 없습니다: " + username));

        return User.builder()
            .username(member.getEmail())
            .password(member.getPassword())  // BCrypt 해시
            .roles(member.getRole().name())  // "USER" → "ROLE_USER" 자동 변환
            .build();
    }
}
```

---

## JWT 인증 구현

### 토큰 생성/검증

```java
@Component
public class JwtTokenProvider {

    @Value("${jwt.secret}")
    private String secretKey;

    @Value("${jwt.expiration}")
    private long expiration;

    public String generateToken(Authentication authentication) {
        return Jwts.builder()
            .setSubject(authentication.getName())
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + expiration))
            .signWith(getSigningKey(), SignatureAlgorithm.HS256)
            .compact();
    }

    public String getUsernameFromToken(String token) {
        return Jwts.parserBuilder()
            .setSigningKey(getSigningKey())
            .build()
            .parseClaimsJws(token)
            .getBody()
            .getSubject();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parserBuilder().setSigningKey(getSigningKey()).build()
                .parseClaimsJws(token);
            return true;
        } catch (ExpiredJwtException e) {
            throw new CustomException(ErrorCode.TOKEN_EXPIRED);
        } catch (JwtException e) {
            throw new CustomException(ErrorCode.INVALID_TOKEN);
        }
    }

    private Key getSigningKey() {
        return Keys.hmacShaKeyFor(secretKey.getBytes(StandardCharsets.UTF_8));
    }
}
```

### JWT 인증 필터

매 요청마다 토큰을 검증하고 SecurityContext에 인증 정보를 설정한다.

```java
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider tokenProvider;
    private final CustomUserDetailsService userDetailsService;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String token = resolveToken(request);

        if (StringUtils.hasText(token) && tokenProvider.validateToken(token)) {
            String username = tokenProvider.getUsernameFromToken(token);
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);

            UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(
                    userDetails, null, userDetails.getAuthorities());

            SecurityContextHolder.getContext().setAuthentication(authentication);
        }

        filterChain.doFilter(request, response);
    }

    private String resolveToken(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }
}
```

`OncePerRequestFilter`를 상속하면 같은 요청에서 필터가 한 번만 실행됨을 보장한다.

### 로그인 API

```java
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @PostMapping("/login")
    public ResponseEntity<TokenResponse> login(@RequestBody LoginRequest request) {
        Authentication authentication = authenticationManager.authenticate(
            new UsernamePasswordAuthenticationToken(
                request.getEmail(), request.getPassword()));

        String token = tokenProvider.generateToken(authentication);
        return ResponseEntity.ok(new TokenResponse(token));
    }
}
```

---

## 인가 — 메서드 수준 보안

`@EnableMethodSecurity`를 활성화하면 메서드에 직접 권한 조건을 선언할 수 있다.

```java
@PreAuthorize("hasRole('ADMIN')")
@GetMapping("/api/admin/users")
public List<UserDto> getAllUsers() { ... }

// 본인 또는 ADMIN만 접근
@PreAuthorize("hasRole('ADMIN') or #userId == authentication.principal.id")
@GetMapping("/api/users/{userId}")
public UserDto getUser(@PathVariable Long userId) { ... }
```

SpEL(Spring Expression Language)을 지원하므로 `@Secured`보다 표현력이 좋다.

현재 로그인한 사용자 정보는 `@AuthenticationPrincipal`로 바로 받을 수 있다.

```java
@GetMapping("/api/me")
public UserDto getMyProfile(@AuthenticationPrincipal UserDetails userDetails) {
    String username = userDetails.getUsername();
    ...
}
```

---

## BCrypt — 패스워드 암호화

```java
@Bean
public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder(); // 기본 strength: 10
}

// 회원가입 시
String encoded = passwordEncoder.encode(rawPassword);

// 로그인 시 검증
boolean matches = passwordEncoder.matches(rawPassword, encodedPassword);
```

BCrypt는 동일한 평문을 암호화해도 매번 다른 해시가 나온다(salt 자동 포함). 역산이 불가능하고, 검증은 반드시 `matches()`로 해야 한다. 해시값을 직접 비교하면 항상 false다.

---

## Refresh Token 패턴

Access Token만 사용하면 만료 시 재로그인이 필요하다. Refresh Token 패턴으로 해결한다.

```text
Access Token  : 짧은 만료 (15분~1시간) — 탈취 위험 최소화
Refresh Token : 긴 만료 (7~30일) — DB/Redis에 저장

[1] 로그인 → Access Token + Refresh Token 발급
[2] API 요청 → Access Token 헤더에 담아 전송
[3] Access Token 만료 → Refresh Token으로 재발급 요청
[4] 서버: DB에서 Refresh Token 검증 → 유효하면 새 Access Token 발급
[5] 로그아웃 → DB에서 Refresh Token 삭제
```

Access Token은 Stateless라 서버에서 강제 무효화가 불가능하다. Refresh Token을 DB에 저장하면 로그아웃과 강제 만료 처리가 가능해진다.

---

## 마치며

Spring Security는 Filter 레이어에서 동작한다. Controller에 닿기 전에 인증/인가가 처리되는 구조다. JWT 방식의 핵심은 `JwtAuthenticationFilter`가 매 요청마다 토큰을 검증하고 `SecurityContextHolder`에 인증 정보를 저장하는 것이다. `@PreAuthorize`는 AOP로 메서드 단위 인가를 처리한다.

다음 편에서는 Spring 예외 처리 — `@ControllerAdvice`와 커스텀 예외 계층 설계를 정리한다.
