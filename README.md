# Character Animator

SVG 파츠를 업로드해 캐릭터를 만들고, 웹에서 Timeline 기반 keyframe 애니메이션을 제작한 뒤
영상(MP4/WebM/GIF)으로 렌더링하는 웹 서비스.

## 구조

```
apps/
  api/            Spring Boot API 서버 (Java 21, Gradle)
  web/            React 에디터 (Vite + Zustand + @remotion/player)
  render-worker/  Remotion 렌더 워커 (Node, npm workspace)
packages/
  animation-core/ Scene 문서 타입 + 보간 로직 + Remotion 컴포지션
docs/             설계 문서
```

## 로컬 실행

```bash
# 전부 한 번에 (인프라 + API + 워커 + 웹)
./dev.sh
```

또는 개별 실행:

```bash
# 0. JS 의존성 (npm workspaces)
npm install

# 1. 인프라 (PostgreSQL:5433 + MinIO:9000)
docker compose up -d

# 2. API 서버
cd apps/api && ./gradlew bootRun
# → http://localhost:8080 (health: /actuator/health)

# 3. 렌더 워커 (여러 개 띄우면 곧 렌더 서버 증설)
cd apps/render-worker && npm start

# 4. 웹 에디터 → http://localhost:5173
cd apps/web && npm run dev

# 테스트
cd apps/api && ./gradlew test   # Docker 필요 (Testcontainers)
npm test                        # animation-core (vitest)
```

MinIO 콘솔: http://localhost:9001 (charanim / charanim123)

## 설계 문서

- [아키텍처와 핵심 결정](docs/architecture.md)
- [ERD와 Scene Document 스키마](docs/data-model.md)
- [REST API 명세](docs/api-spec.md)
