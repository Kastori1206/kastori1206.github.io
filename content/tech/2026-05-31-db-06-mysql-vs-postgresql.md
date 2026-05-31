---
title: "[DB 완전 정복 #6] MySQL과 PostgreSQL, 뭐가 다른가 — MVCC 구현부터 JSONB까지"
date: 2026-05-31
draft: false
target_section: tech
series: "DB 완전 정복"
series_order: 6
series_total: 9
tags: [database, mysql, postgresql, mvcc, jsonb, storage-engine]
description: "둘 다 RDBMS지만 MVCC 구현 방식이 다르고, 인덱스 구조가 다르고, JSON 처리 능력이 다르다. 선택 기준을 근거 있게 설명할 수 있게 됩니다."
wiki_source: 10-wiki/tech/db/06-mysql-vs-postgresql.md
categories: [Database]
---

## "그냥 MySQL 쓰면 안 되나요?"

사실 대부분의 경우 MySQL로 충분하다. 하지만 "왜 MySQL인가요?"라는 질문에 "익숙해서요"는 좋은 답이 아니다. 두 DB의 내부 구조 차이를 알면, 상황에 따른 선택 근거를 만들 수 있다.

---

## MVCC 구현 방식 — 가장 근본적인 차이

앞서 MVCC가 트랜잭션의 일관된 읽기를 보장한다고 배웠다. 그런데 MySQL과 PostgreSQL은 이 MVCC를 다른 방식으로 구현한다.

### MySQL InnoDB: Undo Log 방식

```
[테이블 페이지]
  행 데이터: TX_ID=200, name="수정됨"  ← 항상 최신 버전
      │
      └──(포인터)──▶ [Undo Log]
                       TX_ID=100, name="원본"   ← 이전 버전
                           │
                           └──▶ [Undo Log]
                                  TX_ID=50, name="초기값"
```

현재 데이터 페이지에는 **최신 버전만** 저장한다. 이전 버전은 별도 Undo Log 공간에 체인으로 보관한다. 읽기 시 자신의 스냅샷보다 최신 데이터면 Undo Log에서 이전 버전을 찾아 읽는다.

### PostgreSQL: Heap 방식

```
[테이블 파일 (Heap)]
  t_xmin=100, t_xmax=200, name="원본"    ← 이전 버전 (dead tuple)
  t_xmin=200, t_xmax=0,   name="수정됨" ← 현재 버전 (live tuple)
```

같은 테이블 파일 안에 **여러 버전이 공존**한다. 각 행에 생성 트랜잭션(`t_xmin`)과 삭제 트랜잭션(`t_xmax`)을 기록한다. 읽기 시 내 트랜잭션 기준으로 어떤 버전을 볼지 visibility check로 판단한다.

### 운영상 차이

| 항목 | MySQL | PostgreSQL |
|------|-------|------------|
| 이전 버전 위치 | 별도 Undo Log | 같은 테이블 파일 |
| 정리 방법 | Purge 스레드 자동 | **VACUUM** 필수 |
| 운영 주의점 | 긴 트랜잭션 (Undo 과다) | table bloat, autovacuum 튜닝 |

PostgreSQL은 오래된 dead tuple이 쌓이면 **table bloat** 현상이 발생한다. autovacuum이 자동으로 정리하지만, 대용량 테이블에서는 VACUUM 튜닝이 운영의 핵심이다.

---

## 인덱스 구조 — Clustered vs Heap

MySQL의 기본키 인덱스는 **Clustered Index**다. 리프 노드에 실제 행 데이터가 저장되고, 기본키 순서로 물리적으로 정렬된다.

```
MySQL Secondary Index 조회:
  인덱스에서 PK 찾기 → PK로 Clustered Index 조회 (2단계)

PostgreSQL 모든 인덱스 조회:
  인덱스에서 heap tuple pointer 찾기 → heap에서 행 조회 (1단계)
```

MySQL의 Secondary Index는 2단계를 거치지만, 기본키 조회는 Clustered Index 덕분에 최고 성능이다. PostgreSQL은 모든 인덱스가 동등한 구조를 가진다.

---

## JSONB — PostgreSQL이 MySQL을 압도하는 부분

반정형 데이터(JSON)를 DB에 저장해야 한다면, PostgreSQL의 JSONB가 압도적으로 유리하다.

```sql
-- MySQL JSON: 텍스트로 저장, 조회마다 파싱
ALTER TABLE products ADD COLUMN meta JSON;

-- 인덱스를 걸려면 Generated Column 트릭 필요
ALTER TABLE products
ADD COLUMN meta_color VARCHAR(50)
  GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(meta, '$.color'))) STORED;
CREATE INDEX idx_color ON products(meta_color);
```

```sql
-- PostgreSQL JSONB: 바이너리 파싱 후 저장, GIN 인덱스 직접 가능
ALTER TABLE products ADD COLUMN meta JSONB;
CREATE INDEX idx_meta ON products USING GIN (meta);

-- 풍부한 연산자
SELECT * FROM products WHERE meta @> '{"color": "red"}';   -- 포함 여부
SELECT * FROM products WHERE meta ? 'color';                -- 키 존재 여부
```

PostgreSQL JSONB는 바이너리로 저장해 파싱 없이 빠르고, GIN 인덱스로 JSON 내부 키에 직접 인덱싱할 수 있다. MySQL은 이 수준의 JSON 쿼리 지원이 없다.

---

## PostgreSQL의 확장 생태계

PostgreSQL은 확장(Extension)으로 기능을 추가할 수 있다.

```
PostGIS   → 지리 데이터, 위경도 거리 계산, 공간 인덱스
pgvector  → AI 벡터 임베딩 저장 및 유사도 검색 (LLM 연동)
pg_trgm   → 문자열 유사도 검색 (LIKE '%검색어%' 인덱스)
TimescaleDB → 시계열 데이터 최적화
```

LLM, AI 서비스와 연동하거나 지리 기능이 필요하다면 PostgreSQL이 사실상 유일한 선택이다.

---

## 라이선스 차이

MySQL은 GPL 라이선스다. 오픈소스 프로젝트에서 MySQL을 수정해 배포하면 소스를 공개해야 한다. MariaDB 포크가 생긴 배경이기도 하다.

PostgreSQL은 BSD 계열(PostgreSQL License)로 **상업용 포함 완전 자유**다.

---

## 선택 기준 정리

```
MySQL을 선택하는 경우:
  - Spring Boot + JPA 조합 (레퍼런스와 생태계 압도적)
  - 단순 CRUD 위주의 일반 웹 서비스
  - 팀에 MySQL 운영 경험이 있는 경우
  - AWS Aurora MySQL 사용 계획

PostgreSQL을 선택하는 경우:
  - JSON 데이터를 쿼리하고 인덱스도 필요한 경우 (JSONB)
  - 지리 데이터 (PostGIS)
  - AI/ML 벡터 검색 (pgvector)
  - 복잡한 분석 쿼리 위주 서비스
  - 오픈소스 라이선스 자유도가 중요한 경우
```

---

## 마치며

MySQL은 웹 서비스의 검증된 선택이고, PostgreSQL은 확장성과 기능 다양성에서 강하다. 어느 쪽이 낫다는 게 아니라, **사용하는 이유를 설명할 수 있느냐**가 중요하다.

다음 편에서는 관계형 DB와 전혀 다른 구조로 설계된 Redis의 내부 동작 원리를 다룬다.
