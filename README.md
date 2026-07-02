# Character Animator

SVG 파츠를 업로드해 캐릭터를 만들고, 웹에서 Timeline 기반 keyframe 애니메이션을 제작한 뒤
영상(MP4/WebM/GIF)으로 렌더링하는 웹 서비스.

## 구조

```
apps/
  api/            Spring Boot API 서버 (Java 21, Gradle)
  web/            React 에디터 (예정)
  render-worker/  Remotion 렌더 워커 (예정)
packages/
  animation-core/ Scene 문서 타입 + 보간 로직 + Remotion 컴포지션 (예정)
docs/             설계 문서
```

## 로컬 실행

```bash
# 1. 인프라 (PostgreSQL + MinIO)
docker compose up -d

# 2. API 서버
cd apps/api && ./gradlew bootRun
# → http://localhost:8080 (health: /actuator/health)

# 테스트 (Docker 필요 — Testcontainers)
cd apps/api && ./gradlew test
```

MinIO 콘솔: http://localhost:9001 (charanim / charanim123)

## 설계 문서

- [아키텍처와 핵심 결정](docs/architecture.md)
- [ERD와 Scene Document 스키마](docs/data-model.md)
- [REST API 명세](docs/api-spec.md)
