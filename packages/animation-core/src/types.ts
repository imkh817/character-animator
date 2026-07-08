/**
 * Scene Document — 이 프로젝트의 심장.
 *
 * 에디터(apps/web)가 만들고, 서버(apps/api)가 JSONB로 저장하고,
 * 렌더 워커(apps/render-worker)가 영상으로 굽는 단일 진실이다.
 * 구조 변경은 반드시 schemaVersion 증가와 마이그레이션을 동반해야 한다.
 */

export interface SceneSettings {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  /** '#rrggbb' 또는 'transparent' */
  backgroundColor: string;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Transform {
  /** 부모 기준 위치(px) */
  x: number;
  y: number;
  /** 도(deg), 시계 방향 */
  rotation: number;
  scaleX: number;
  scaleY: number;
  /** 0~1 */
  opacity: number;
}

export type AnimatableProperty = 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'opacity';

export type Easing =
  | { type: 'linear' }
  | { type: 'easeIn' }
  | { type: 'easeOut' }
  | { type: 'easeInOut' }
  /** cubic-bezier(x1, y1, x2, y2) */
  | { type: 'bezier'; values: [number, number, number, number] }
  /** 다음 키프레임까지 값 고정 (스텝) */
  | { type: 'hold' };

export interface Keyframe {
  /** 정수 프레임. 시간의 단위는 항상 프레임이다 (부동소수점 오차 배제) */
  frame: number;
  value: number;
  /** 이 키프레임 → 다음 키프레임 구간의 easing */
  easing: Easing;
}

export interface SceneNode {
  id: string;
  name: string;
  /** 서버 assets 테이블의 UUID → SVG 파일 */
  assetId: string;
  /** 부모 노드. 부모의 트랜스폼을 상속한다 (몸통 회전 → 팔 따라감) */
  parentId: string | null;
  /**
   * 파츠의 렌더 크기(px). SVG는 width="100%" 등 고유 크기가 없는 경우가 흔해
   * (그대로 <img>로 그리면 0으로 붕괴), 에디터가 업로드 시점에 viewBox에서 읽어 기록한다.
   */
  size: { width: number; height: number };
  /** 회전/스케일 기준점. 노드 로컬 좌표(px). 애니메이션 불가 (정적) */
  pivot: Vec2;
  /** 키프레임이 없을 때의 기본 상태 */
  base: Transform;
  visible: boolean;
  /** 에디터 전용: 실수로 선택/수정 방지 */
  locked: boolean;
}

export type NodeAnimations = Partial<Record<AnimatableProperty, Keyframe[]>>;

export interface SceneDocument {
  schemaVersion: 1;
  settings: SceneSettings;
  /** 배열 순서 = 레이어 순서 (앞 = 아래) */
  nodes: SceneNode[];
  /** nodeId → 속성별 키프레임 (frame 오름차순 정렬 불변식) */
  animations: Record<string, NodeAnimations>;
}

export const CURRENT_SCHEMA_VERSION = 1 as const;

export const ANIMATABLE_PROPERTIES: readonly AnimatableProperty[] = [
  'x',
  'y',
  'rotation',
  'scaleX',
  'scaleY',
  'opacity',
];

export function createDefaultTransform(): Transform {
  return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 };
}

export function createEmptySceneDocument(settings?: Partial<SceneSettings>): SceneDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: {
      width: 1080,
      height: 1080,
      fps: 30,
      durationInFrames: 150,
      backgroundColor: '#ffffff',
      ...settings,
    },
    nodes: [],
    animations: {},
  };
}
