---
title: "JVM 메모리 구조와 GC — OOM이 왜 발생하고 어떻게 막는가"
date: 2026-06-15
draft: false
target_section: tech
series: "Java 핵심 개념"
series_order: 4
series_total: 7
tags: [java, jvm, gc, heap, stack, memory, oom, g1gc]
description: "Heap과 Stack의 차이, GC가 동작하는 원리, OOM이 발생하는 이유. JVM 메모리를 이해하면 Spring 애플리케이션 성능 문제의 원인을 찾는 눈이 생긴다."
wiki_source: 10-wiki/tech/java/01-jvm-memory.md
categories: [Java]
---

## Java 코드가 실행되는 환경

Java 코드를 작성하면 `javac`가 `.class` 바이트코드로 컴파일하고, JVM이 그것을 실행한다. "Write Once, Run Anywhere"가 가능한 이유가 여기 있다. 운영체제마다 다른 JVM이 바이트코드를 해석하기 때문이다.

JVM 내부를 간단히 표현하면:

```
[ .class 바이트코드 ]
         ↓
[ JVM ]
  ├─ ClassLoader     : 클래스 파일 로드
  ├─ Execution Engine: 바이트코드 실행 (인터프리터 + JIT)
  ├─ Garbage Collector: 불필요한 객체 메모리 회수
  └─ Runtime Data Areas: 메모리 영역
```

---

## Heap vs Stack — 면접 단골 질문

JVM 메모리에서 가장 중요한 두 영역이다.

```java
public void method() {
    int x = 10;              // x → Stack
    User user = new User();  // user 참조 → Stack, User 인스턴스 → Heap
    String s = "hello";      // s 참조 → Stack, "hello" 객체 → Heap
}
// 메서드 종료 → x, user, s 참조는 Stack에서 자동 제거
// Heap의 객체는 GC가 나중에 처리
```

| 구분 | Heap | Stack |
|------|------|-------|
| 저장 내용 | 객체 인스턴스 (`new`) | 지역변수, 메서드 호출 정보 |
| 공유 여부 | 모든 스레드 공유 | 스레드마다 독립 |
| GC 대상 | ✅ | ❌ (자동 제거) |
| 오류 | `OutOfMemoryError` | `StackOverflowError` |

`StackOverflowError`는 주로 무한 재귀 호출 때 발생한다.

---

## GC — 메모리를 자동으로 정리한다

Java가 C/C++과 다른 결정적인 차이 중 하나가 GC다. 개발자가 직접 메모리를 해제하지 않아도 된다.

### 약한 세대 가설

GC 설계의 핵심 전제다.

> "대부분의 객체는 생성 직후 짧은 시간 내에 죽는다."

HTTP 요청 하나를 처리할 때 생각해보자. 요청 파라미터, DTO, 응답 객체 등 대부분은 요청이 끝나면 더 이상 필요 없다. 반면 서비스 객체, 캐시 데이터는 오래 살아남는다.

이를 기반으로 Heap을 **Young / Old** 영역으로 나눈다.

### GC 동작 과정

```
Eden (새 객체 생성)
  ↓ Minor GC (Eden 꽉 참)
Survivor 0/1 (살아남은 객체, age +1)
  ↓ age가 15 초과
Old Generation (오래 살아남은 객체)
  ↓ Old 영역 꽉 참
Full GC (전체 정리 — 오래 걸림)
```

Minor GC는 Young 영역만 청소해서 빠르다. Full GC는 전체를 다 보기 때문에 느리다.

### Stop-the-World

GC가 실행되는 동안 **애플리케이션의 모든 스레드가 멈춘다**. 메모리를 정리하는 중에 객체 참조가 바뀌면 안 되기 때문이다.

Spring 애플리케이션에서 갑자기 응답이 느려지거나 타임아웃이 발생하는 원인 중 하나가 Full GC의 긴 STW다.

---

## GC 종류 — 지금은 G1GC가 기본

| GC | 특징 | 사용 환경 |
|----|------|---------|
| Serial GC | 단일 스레드 | 소형 앱 |
| Parallel GC | 멀티 스레드, 처리량 우선 | 배치 작업 |
| G1 GC | Region 기반, 예측 가능한 STW | Java 9+ 기본 |
| ZGC | STW 10ms 미만, 초저지연 | 대용량 Heap |

**G1 GC**는 Heap을 고정 크기 Region으로 나누고 가비지가 많은 Region부터 수집한다. JVM 옵션으로 STW 목표 시간을 설정할 수 있다.

```bash
-XX:+UseG1GC
-XX:MaxGCPauseMillis=200   # 목표 STW 200ms
-Xms2g -Xmx4g              # 최소/최대 Heap 크기
```

---

## OOM, 왜 발생하나

OutOfMemoryError가 발생하면 로그에 이유가 나온다.

```
java.lang.OutOfMemoryError: Java heap space
  → Heap 부족. 객체가 너무 많거나 메모리 누수.

java.lang.OutOfMemoryError: Metaspace
  → 클래스가 너무 많이 로드됨.

java.lang.OutOfMemoryError: GC overhead limit exceeded
  → GC가 열심히 해도 회수되는 메모리가 너무 적음.
```

가장 흔한 메모리 누수 패턴:

```java
// 1. static 컬렉션에 계속 추가 — GC가 회수 못함
static List<Object> cache = new ArrayList<>();
// 이 cache를 지우는 코드가 없으면 계속 쌓임

// 2. ThreadLocal을 제거하지 않음 (스레드 풀 환경)
threadLocal.set(value);
// 반드시: threadLocal.remove();

// 3. 이벤트 리스너 미해제
button.addListener(listener);
// 해제하지 않으면 listener 객체가 계속 참조됨
```

---

## JIT 컴파일러 — 왜 JVM은 "워밍업"이 필요한가

JVM은 처음에는 바이트코드를 인터프리터로 실행하다가, 자주 실행되는 코드(핫스팟)를 감지하면 네이티브 코드로 컴파일해서 캐시한다.

```
초기 실행: 인터프리터 (느림)
워밍업 후: JIT 컴파일된 네이티브 코드 (빠름)
```

Spring Boot 앱을 배포했을 때 처음 몇 분간 응답이 느린 이유가 여기 있다. GraalVM Native Image는 이 워밍업 문제를 해결하기 위해 빌드 시점에 미리 컴파일한다.

---

## 마치며

JVM 메모리 구조를 이해하면 "왜 이 에러가 났는지"를 추론할 수 있다. `StackOverflowError`면 무한 재귀를 의심하고, `OutOfMemoryError: Java heap space`면 메모리 누수나 객체 생성 패턴을 살펴봐야 한다.

다음 편에서는 자주 쓰는 컬렉션 내부가 어떻게 동작하는지 살펴본다.
