# REST API 명세

Base: `/api/v1` · 인증: `Authorization: Bearer {accessToken}` · 에러: `{ "code", "message" }`
남의 리소스 접근은 403이 아닌 **404** (존재 여부 숨김).

## Auth (구현됨)

| Method | Path | 설명 |
|---|---|---|
| POST | `/auth/signup` | 회원가입 → 201 |
| POST | `/auth/login` | → accessToken(body) + refresh_token(httpOnly 쿠키, path=/api/v1/auth, Strict) |
| POST | `/auth/refresh` | 쿠키로 재발급. 토큰 회전. 사용된 토큰 재사용 시 401 |
| POST | `/auth/logout` | 토큰 무효화 + 쿠키 삭제 → 204 |

- accessToken: JWT HS256, 30분, 프론트는 메모리에만 보관
- refreshToken: 랜덤 256bit, DB에 SHA-256 해시 저장, 14일

## Projects & Scene (구현됨)

| Method | Path | 설명 |
|---|---|---|
| POST | `/projects` | 생성 (title) → 201, 초기 Scene 문서 포함 |
| GET | `/projects?page=&size=` | 목록 (메타만, 문서 제외) |
| GET | `/projects/{id}` | 상세 — sceneDocument + sceneVersion 포함 |
| PATCH | `/projects/{id}` | 제목 수정 |
| PUT | `/projects/{id}/scene` | Scene 저장 (autosave 통로) |
| DELETE | `/projects/{id}` | 삭제 → 204 |

### PUT /projects/{id}/scene
```json
{ "baseVersion": 41, "document": { ...SceneDocument } }
```
- 200 `{ "version": 42 }` — 다음 저장의 baseVersion
- 409 `SCENE_VERSION_CONFLICT` — 다른 세션이 먼저 저장
- 400 `INVALID_SCENE_DOCUMENT` — 형식 위반

## Assets (구현됨)

| Method | Path | 설명 |
|---|---|---|
| POST | `/projects/{id}/assets` | 등록 (filename, contentType, sizeBytes) → 201 PENDING + presigned PUT URL(10분) |
| POST | `/assets/{id}/complete` | 스토리지 존재 검증 → READY. 미업로드 시 409, 멱등 |
| GET | `/projects/{id}/assets` | READY 목록 + presigned GET URL(1시간) |
| DELETE | `/assets/{id}` | Scene에서 참조 중이면 409 ASSET_IN_USE |

- SVG(`image/svg+xml`)만 허용, 최대 1MB. object key는 서버가 생성
- 고아 PENDING asset은 스케줄러가 24시간 후 청소
- 프로젝트 삭제 시 `ProjectDeletedEvent`로 asset row + 스토리지 오브젝트 정리

## Render Jobs (구현됨)

| Method | Path | 설명 |
|---|---|---|
| POST | `/projects/{id}/render-jobs` | 렌더 요청 {format: MP4/WEBM/GIF} → 문서 스냅샷 후 201. 진행 중이면 409 |
| GET | `/render-jobs/{id}` | 폴링: status, progress, errorMessage, 완료 시 downloadUrl |
| GET | `/projects/{id}/render-jobs` | 렌더 이력 (최신순) |

## Internal — 렌더 worker 전용 (구현됨, `X-Internal-Token`)

| Method | Path | 설명 |
|---|---|---|
| POST | `/internal/render-jobs/claim` | {workerId} → job 획득 (SKIP LOCKED). 없으면 204. 응답: sceneSnapshot + asset 다운로드 URL들 + **outputUploadUrl** (결과물 업로드도 presigned PUT — key는 서버가 결정) |
| PATCH | `/internal/render-jobs/{id}/progress` | {progress: 0~100} — heartbeat 겸용 |
| POST | `/internal/render-jobs/{id}/complete` | 서버가 결과물 존재 검증 후 COMPLETED. 미업로드 시 409 |
| POST | `/internal/render-jobs/{id}/fail` | {errorMessage} — 시도 횟수 남으면 PENDING 복귀(재시도), 소진 시 FAILED |

- 상태 전이: `PENDING → PROCESSING → COMPLETED | FAILED`, 실패 시 최대 3회 시도
- heartbeat 5분 끊긴 PROCESSING job은 스케줄러가 회수 (fail 처리 → 재시도/확정)
