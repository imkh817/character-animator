# 데이터 모델

## ERD

구현됨: `users`, `refresh_tokens`, `projects` (V1), `assets` (V2), `render_jobs` (V3)

```text
users 1──N projects 1──N assets
                    1──N render_jobs
users 1──N refresh_tokens
```

### users
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | UUID | UUID v7, 애플리케이션 생성 |
| email | VARCHAR(255) | UNIQUE |
| password_hash | VARCHAR(100) | BCrypt |
| nickname | VARCHAR(50) | |

### refresh_tokens
토큰 원문이 아닌 SHA-256 해시만 저장. 재발급 시 회전(기존 삭제 + 신규 발급).

### projects
| 컬럼 | 타입 | 비고 |
|---|---|---|
| scene_document | JSONB | Scene 문서 전체 (아래 스키마) |
| scene_version | BIGINT | 낙관적 락. 저장 성공마다 +1 |
| thumbnail_key | VARCHAR(512) | MinIO object key |

### assets
2단계 업로드: `PENDING`(presigned URL 발급) → 클라이언트 직접 업로드 → 존재/크기 검증 후 `READY`.
object key는 서버가 생성 (`projects/{projectId}/assets/{assetId}.svg`).
부분 인덱스 `idx_assets_pending_cleanup`으로 고아 PENDING 청소.

### render_jobs
`PENDING → PROCESSING → COMPLETED | FAILED` (전이 규칙은 RenderJob 엔티티가 소유).
요청 시점 문서를 `scene_snapshot`(JSONB)으로 복사 — 렌더 중 편집돼도 결과 불변.
실패 시 `attempt_count < max_attempts`(3)면 PENDING 복귀로 재시도.
큐 폴링용 부분 인덱스(`WHERE status = 'PENDING'`), 죽은 worker 회수용 인덱스(`WHERE status = 'PROCESSING'`).
`output_key`는 생성 시 서버가 결정 (`projects/{projectId}/renders/{jobId}.{ext}`).

## Scene Document 스키마 (schemaVersion 1)

`packages/animation-core`가 소유. 서버는 최소 형식 검증만 한다.

```typescript
interface SceneDocument {
  schemaVersion: 1;
  settings: { width; height; fps; durationInFrames; backgroundColor };
  nodes: SceneNode[];              // 배열 순서 = 레이어 순서 (앞 = 아래)
  animations: {
    [nodeId: string]: { [property in AnimatableProperty]?: Keyframe[] };  // frame 오름차순
  };
}

interface SceneNode {
  id: string;                      // nanoid
  name: string;
  assetId: string;                 // assets.id → SVG
  parentId: string | null;         // 계층 구조 (부모 트랜스폼 상속)
  pivot: { x: number; y: number }; // 회전/스케일 기준점. 정적 (애니메이션 불가)
  base: Transform;                 // 키프레임 없을 때의 기본값
  visible: boolean;
  locked: boolean;
}

interface Transform { x; y; rotation; scaleX; scaleY; opacity }

type AnimatableProperty = 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'opacity';

interface Keyframe {
  frame: number;                   // 정수 프레임 (시간 단위는 프레임)
  value: number;                   // 속성별 스칼라 채널 (AE separate dimensions)
  easing: Easing;                  // 이 키 → 다음 키 구간의 easing
}

type Easing =
  | { type: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold' }
  | { type: 'bezier'; values: [number, number, number, number] };
```

### 설계 이유 요약
- **프레임(정수) 시간축**: Remotion이 프레임 기반, 부동소수점 오차 배제
- **스칼라 채널 분리**: x/y 독립 easing 가능, 보간 함수 단일화
- **parentId를 v1부터**: 캐릭터 애니메이션의 본질(본 계층). 나중에 추가하면 파괴적 변경
- **pivot 정적**: 회전축이 움직이면 UX 붕괴
- **레이어 = 배열 순서**: zIndex 중복/정규화 문제 회피
