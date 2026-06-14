---
title: "Java 상속과 다형성 — 언제 쓰고 언제 피해야 하나"
date: 2026-06-13
draft: false
target_section: tech
series: "Java 핵심 개념"
series_order: 2
series_total: 7
tags: [java, inheritance, polymorphism, override, composition, extends]
description: "상속은 강한 결합을 만든다. 다형성은 유연성을 준다. 둘의 차이를 이해하고, 상속보다 컴포지션을 권장하는 이유를 코드로 설명한다."
wiki_source: 10-wiki/tech/java/06-inheritance-polymorphism.md
categories: [Java]
---

## 상속을 쓰는 이유, 그리고 조심해야 하는 이유

상속은 부모 클래스의 코드를 자식이 물려받는 기능이다. "공통 로직을 한 곳에 모은다"는 장점이 있지만, 무분별하게 쓰면 오히려 코드가 더 복잡해진다.

이펙티브 자바에서는 "상속보다 컴포지션을 사용하라"고 강조한다. 왜 그런지 직접 코드로 살펴보자.

---

## 상속 기본

```java
public class Animal {
    protected String name;

    public Animal(String name) {
        this.name = name;
    }

    public void makeSound() {
        System.out.println(name + ": ...");
    }
}

public class Dog extends Animal {
    private String breed;

    public Dog(String name, String breed) {
        super(name); // 부모 생성자 호출 — 첫 줄에 와야 함
        this.breed = breed;
    }

    @Override
    public void makeSound() {
        System.out.println(name + ": 멍멍!");
    }
}
```

`@Override`는 반드시 붙이자. 컴파일러가 "진짜 오버라이딩인지" 검증해준다. 없으면 메서드명 오타 같은 실수를 잡지 못한다.

---

## 오버라이딩 vs 오버로딩

자주 혼동되는 두 개념이다.

| 구분 | 오버라이딩 | 오버로딩 |
|------|----------|---------|
| 위치 | 자식 클래스 | 같은 클래스 |
| 목적 | 부모 동작 재정의 | 같은 기능, 다른 입력 |
| 매개변수 | 동일 | 다름 |

```java
// 오버라이딩 — 부모와 시그니처 동일, 다른 클래스
public class Cat extends Animal {
    @Override
    public void makeSound() {
        System.out.println(name + ": 야옹");
    }
}

// 오버로딩 — 같은 클래스, 매개변수 다름
public class Calculator {
    public int add(int a, int b) { return a + b; }
    public double add(double a, double b) { return a + b; }
}
```

---

## 다형성 — 상속의 핵심 가치

다형성은 "같은 타입으로 여러 구현을 다루는 것"이다.

```java
// 업캐스팅 — 자식 → 부모 타입으로, 자동 변환
Animal animal = new Dog("바둑이", "진돗개");
animal.makeSound(); // "바둑이: 멍멍!" — Dog의 makeSound() 실행

// 같은 타입으로 여러 구현체를 다룰 수 있다
List<Animal> animals = new ArrayList<>();
animals.add(new Dog("바둑이", "진돗개"));
animals.add(new Cat("나비"));

for (Animal a : animals) {
    a.makeSound(); // 각자 자신의 구현 실행
}
```

`animal.makeSound()`를 호출할 때 컴파일 타임에는 `Animal.makeSound()`를 부르는 것처럼 보이지만, 런타임에는 실제 객체 타입(`Dog`)의 메서드가 실행된다. 이것을 **동적 바인딩**이라 한다.

### 다운캐스팅은 조심해서

```java
Animal animal = new Dog("바둑이", "진돗개");

// Dog에만 있는 메서드를 쓰려면 다운캐스팅 필요
if (animal instanceof Dog dog) { // Java 16+ 패턴 매칭
    dog.fetch();
}

// instanceof 없이 바로 캐스팅하면 ClassCastException 위험
Dog dog = (Dog) new Cat("나비"); // 런타임 오류!
```

---

## 상속의 문제 — 캡슐화가 깨진다

상속을 쓰면 자식 클래스가 부모 내부 구현에 의존하게 된다. 부모가 바뀌면 자식도 영향을 받는다.

실제 Java 표준 라이브러리에서도 이 문제가 있었다.

```java
// HashSet을 상속해서 "몇 번 추가됐는지" 세는 클래스
public class MyHashSet<E> extends HashSet<E> {
    private int addCount = 0;

    @Override
    public boolean add(E e) {
        addCount++;
        return super.add(e);
    }

    @Override
    public boolean addAll(Collection<? extends E> c) {
        addCount += c.size();
        return super.addAll(c); // 문제: HashSet의 addAll은 내부적으로 add()를 호출
                                 // → addCount가 이중으로 카운트됨!
    }
}

MyHashSet<String> set = new MyHashSet<>();
set.addAll(List.of("a", "b", "c"));
System.out.println(set.addCount); // 예상: 3, 실제: 6
```

`HashSet`의 `addAll` 내부 구현이 `add()`를 호출한다는 사실에 의존하고 있어서 생기는 문제다. 부모 클래스를 직접 만든 게 아니라면 내부 구현을 믿을 수 없다.

---

## 컴포지션 — 상속의 안전한 대안

상속 대신 **포함(has-a)** 관계로 설계하면 이 문제를 피할 수 있다.

```java
public class MyHashSet<E> {
    private final HashSet<E> set = new HashSet<>(); // 상속 대신 포함
    private int addCount = 0;

    public boolean add(E e) {
        addCount++;
        return set.add(e); // HashSet에 위임
    }

    public boolean addAll(Collection<? extends E> c) {
        addCount += c.size();
        return set.addAll(c); // HashSet 내부 구현에 의존하지 않음
    }
}
```

### 언제 상속, 언제 컴포지션?

```
상속을 쓸 때:
  - "is-a" 관계가 명확할 때 (Dog is an Animal)
  - 부모 클래스를 내가 직접 만들고 제어할 때
  - 다형성이 필요할 때

컴포지션을 쓸 때:
  - 코드 재사용만이 목적일 때
  - 외부 라이브러리 클래스를 확장할 때
  - 여러 클래스의 기능을 조합할 때
```

---

## final — 상속을 막을 때

```java
public final class String { }  // 상속 불가 — Java String이 final인 이유

public class Parent {
    public final void fixedMethod() { } // 오버라이딩 불가
}
```

`String`이 `final`인 이유는 누군가 `String`을 상속해서 `equals()` 동작을 바꿔버리면 Java 전체가 무너지기 때문이다.

---

## 마치며

상속은 강력하지만 남용하면 오히려 코드가 취약해진다. "is-a 관계가 명확하고, 부모 클래스를 직접 제어할 수 있을 때"만 상속을 쓰고, 그 외에는 컴포지션을 고려하는 게 좋다.

다음 편에서는 다형성을 더 유연하게 활용하는 방법인 **인터페이스와 추상 클래스**를 다룬다.
