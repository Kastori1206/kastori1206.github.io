---
title: "Java 컬렉션 내부 구조 — ArrayList, HashMap이 실제로 어떻게 동작하는가"
date: 2026-06-16
draft: false
target_section: tech
series: "Java 핵심 개념"
series_order: 5
series_total: 7
tags: [java, collections, arraylist, hashmap, linkedlist, concurrenthashmap, set]
description: "ArrayList는 배열이고, HashMap은 버킷 배열이다. 내부 구조를 알면 왜 ArrayList가 빠르고 HashMap이 O(1)인지, 그리고 멀티스레드에서 HashMap이 왜 위험한지 자연스럽게 이해된다."
wiki_source: 10-wiki/tech/java/02-collections.md
categories: [Java]
---

## "어떤 컬렉션을 써야 하나요?"

이 질문에 제대로 답하려면 내부 구조를 알아야 한다. `ArrayList`가 `LinkedList`보다 빠른 이유, `HashMap`이 평균 O(1)인 이유, `ConcurrentHashMap`이 필요한 이유. 전부 내부 구조에서 나오는 답이다.

---

## ArrayList — 배열 위의 리스트

`ArrayList`는 내부적으로 **배열**로 구현된다.

```java
// 실제 OpenJDK 코드 (단순화)
public class ArrayList<E> {
    private Object[] elementData; // 저장 배열
    private int size;             // 실제 원소 수
    // 기본 초기 용량: 10
    // 꽉 차면 1.5배 크기 배열 생성 후 복사
}
```

배열이라는 특성 때문에:

| 연산 | 시간복잡도 | 이유 |
|------|---------|------|
| `get(index)` | O(1) | 배열 인덱스 직접 접근 |
| `add(마지막)` | O(1) 평균 | 배열 끝에 추가 |
| `add(중간)` | O(n) | 뒤 원소들을 한 칸씩 이동 |
| `remove(중간)` | O(n) | 뒤 원소들을 한 칸씩 이동 |

**언제 LinkedList를 쓸까?** 거의 안 쓴다. `get(index)`가 O(n)이라 전체적으로 느리다. Queue/Deque 용도라면 `ArrayDeque`가 훨씬 빠르다.

```
조회가 많다 → ArrayList
첫/마지막 삽입/삭제가 많다 → ArrayDeque
Queue/Stack → ArrayDeque
대부분의 경우 → ArrayList
```

---

## HashMap — 버킷 배열 + 해시

`HashMap`이 평균 O(1)인 이유는 구조에 있다.

```
버킷 배열 (기본 크기 16)
  index 0: null
  index 1: [Entry("key1", val1)] → [Entry("key5", val5)]  ← 해시 충돌
  index 2: [Entry("key2", val2)]
  ...
```

키를 저장할 때:

```java
int hash = key.hashCode();     // 1. 해시코드 계산
int index = hash & (n - 1);   // 2. 버킷 인덱스 결정
buckets[index].add(entry);    // 3. 해당 버킷에 저장
```

`get(key)`도 같은 방식으로 버킷을 바로 찾기 때문에 평균 O(1)이다.

### 해시 충돌이 생기면?

같은 버킷에 여러 키가 들어오는 게 해시 충돌이다.

- **Java 8 이전**: 연결 리스트 (충돌 많으면 O(n))
- **Java 8 이후**: 버킷 내 원소가 8개 초과하면 **Red-Black Tree**로 변환 (O(log n))

### Resize

버킷 배열이 75% 이상 차면 2배로 늘리고 전체를 재배치한다. 이 과정이 O(n)이라 미리 예상 크기를 알면 초기 용량을 지정하는 게 좋다.

```java
// 10,000개 원소를 넣을 거라면
Map<String, Integer> map = new HashMap<>(10000 / 0.75 + 1);
```

### equals와 hashCode를 같이 오버라이드해야 하는 이유

HashMap은 키를 찾을 때 두 단계를 거친다: `hashCode()`로 버킷을 찾고, `equals()`로 정확한 키를 찾는다.

```java
// hashCode만 오버라이드하면 → 버킷은 찾아도 equals가 항상 false → 못 찾음
// equals만 오버라이드하면 → 버킷 자체를 못 찾음

// 반드시 함께 오버라이드
@Override
public boolean equals(Object o) { ... }

@Override
public int hashCode() {
    return Objects.hash(id);
}
```

---

## HashMap은 스레드 안전하지 않다

```java
// 멀티스레드 환경에서 HashMap 사용 → 데이터 손실, 무한루프 가능
Map<String, Integer> map = new HashMap<>();

// 해결 방법 1: Collections.synchronizedMap (모든 메서드 동기화 → 느림)
Map<String, Integer> sync = Collections.synchronizedMap(new HashMap<>());

// 해결 방법 2: ConcurrentHashMap (권장)
Map<String, Integer> concurrent = new ConcurrentHashMap<>();
```

`ConcurrentHashMap`은 전체 맵을 잠그지 않고 **버킷 단위로 락**을 건다. 다른 버킷에는 여러 스레드가 동시 접근할 수 있어서 `synchronized`보다 훨씬 빠르다.

```
HashMap           : 빠름, 스레드 비안전
HashTable         : 모든 메서드 synchronized → 느림, 거의 사용 안 함
ConcurrentHashMap : 버킷 단위 락 → 빠름, 멀티스레드 표준
```

---

## Map 종류 한눈에

| | HashMap | LinkedHashMap | TreeMap | ConcurrentHashMap |
|--|---------|--------------|---------|------------------|
| 순서 | 없음 | 삽입 순서 | 키 정렬 | 없음 |
| null 키 | 허용 | 허용 | ❌ | ❌ |
| 스레드 안전 | ❌ | ❌ | ❌ | ✅ |
| 성능 | O(1) | O(1) | O(log n) | O(1) |

`LinkedHashMap`은 조회 순서로도 정렬할 수 있어서 LRU 캐시 구현에 자주 쓰인다.

---

## HashSet은 사실 HashMap이다

```java
// HashSet 내부 구현
private transient HashMap<E, Object> map;
private static final Object PRESENT = new Object(); // 더미 값

public boolean add(E e) {
    return map.put(e, PRESENT) == null;
}
```

`HashSet`은 `HashMap`의 key만 쓰고 value에는 더미 객체를 넣는다. 중복 판단도 `equals + hashCode`로 한다.

---

## 마치며

컬렉션 선택은 단순하다. 대부분은 `ArrayList`와 `HashMap`이면 된다. 멀티스레드 환경이라면 `ConcurrentHashMap`. 정렬이 필요하면 `TreeMap` 또는 `TreeSet`. 이 판단 기준을 내부 구조와 연결해서 이해하면 면접 질문에도 자연스럽게 답할 수 있다.

다음 편에서는 멀티스레드 환경에서 발생하는 문제와 해결책인 **Java 동시성**을 다룬다.
