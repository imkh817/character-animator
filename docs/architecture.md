# 아키텍처와 핵심 결정

## 시스템 구성

```text
 사용자 브라우저
 ┌─────────────────────────────────────┐
 │ React 에디터                          │
 │  └ @remotion/player (미리보기)        │──── SVG/영상 직접 업·다운로드 (presigned URL)
 └──────────────┬──────────────────────┘                     │
                │ REST (JWT)                                  │
 ┌──────────────▼──────────────┐                    ┌─────────▼────────┐
 │ Spring Boot API             │                    │ MinIO (S3 호환)   │
 │  인증·프로젝트·Asset 메타     │                    │ SVG, MP4, 썸네일  │
 │  Scene Document 저장         │                    └─────────▲────────┘
 │  RenderJob 생성·상태 관리     │                              │
 └──────┬──────────▲───────────┘                              │
        │          │ claim / progress / complete (internal)    │
 ┌──────▼──────┐   │                                          │
 │ PostgreSQL  │   │        ┌──────────────────────┐          │
 │ render_jobs │   └────────┤ Remotion Render Worker├──────────┘
 │ (작업 큐)    │            │ (N대로 수평 확장)       │
 └─────────────┘            └──────────────────────┘
```

## 핵심 결정

### 1. 미리보기와 최종 렌더는 같은 코드 (`packages/animation-core`)
Scene 문서 타입 + 보간 로직 + Remotion 컴포지션을 공유 패키지로 두고,
프론트는 `@remotion/player`로 재생, 렌더 워커는 같은 컴포지션을 `renderMedia()`로 렌더한다.
→ WYSIWYG이 구조적으로 보장되고 보간 로직이 한 곳에만 존재한다.
⚠️ Remotion은 SaaS 수익화 시 Company License(유료)가 필요하다.

### 2. 애니메이션 데이터는 JSONB Scene Document 스냅샷
키프레임을 행 단위로 정규화하지 않고 `projects.scene_document`(JSONB)에 문서 전체를 저장한다.
- Autosave = 디바운스된 `PUT /projects/{id}/scene` 한 번 (문서 전체 교체)
- 충돌 감지 = `scene_version` 낙관적 락 (불일치 시 409)
- Undo/Redo = 순수 클라이언트 사이드
- 서버는 문서 내용을 소유하지 않는다 (최소 형식 검증만)

### 3. Render Queue는 PostgreSQL 기반, worker는 pull
Spring이 `render_jobs`에 INSERT하면 worker가 `POST /internal/render-jobs/claim`으로 가져간다.
- claim 내부는 `SELECT ... FOR UPDATE SKIP LOCKED` — worker 증설 시 중복 집기 없음
- worker는 DB를 모른다 (HTTP + MinIO만) — 스키마 변경·큐 교체(SQS 등)에서 worker 격리
- 렌더 요청 시점의 문서를 `scene_snapshot`으로 복사 — 편집 중 렌더 결과 불변
- 재시도·타임아웃 회수 정책은 서버(도메인)가 소유

### 4. Storage는 S3 API로 통일 + presigned URL
`StoragePort` 인터페이스 + AWS S3 SDK 구현체 하나. MinIO/S3/R2 전환은 endpoint 설정 교체.
파일은 API 서버를 통과하지 않는다 (업로드/다운로드 모두 presigned URL로 직거래).

## 기술 스택
React + TypeScript(에디터) · Spring Boot 3.5/Java 21(API) · Remotion(렌더) ·
PostgreSQL(메타 + 문서 + 큐) · MinIO(파일) · pnpm workspace 모노레포
