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

/** 말풍선 모양: 일반 대사, 생각(구름), 외침(뾰족), 자막 박스 */
export type BubbleShape = 'speech' | 'thought' | 'shout' | 'plain';

/**
 * 말풍선 노드의 내용. 렌더러(CharacterScene)가 이걸 보고 직접 그리므로
 * 에셋 업로드 없이 문구·스타일을 바꿀 수 있다.
 */
export interface BubbleSpec {
  text: string;
  fontSize: number;
  /** CSS font-family 이름 (예: 'Malgun Gothic') */
  fontFamily: string;
  /** 없으면 'speech' (하위 호환) */
  shape?: BubbleShape;
}

/** 실루엣 테두리 선 종류 */
export type OutlineStyle = 'none' | 'solid' | 'dashed' | 'dotted' | 'longdash';

/**
 * 트레이싱된 파츠의 실루엣 테두리. 업로드(변환) 시점에 윤곽 패스를 추출해 문서에 저장하고,
 * 렌더러가 이미지 위에 오버레이로 그린다 — 스타일을 언제든 바꿀 수 있고 에셋 재업로드가 필요 없다.
 */
export interface NodeOutline {
  /** 실루엣 윤곽 패스 d 문자열들. 좌표계는 node.size와 같다 */
  paths: string[];
  style: OutlineStyle;
  /** 스트로크 두께(px). 변환 시 이미지 크기에 비례해 정해진다 */
  strokeWidth: number;
  /** 생략하면 짙은 회색(#3a3a3a) */
  color?: string;
}

export interface SceneNode {
  id: string;
  name: string;
  /** 서버 assets 테이블의 UUID → 이미지 파일. 말풍선 노드에는 없다 */
  assetId?: string;
  /** 말풍선 노드: 있으면 렌더러가 에셋 대신 말풍선을 직접 그린다 */
  bubble?: BubbleSpec;
  /** 부모 노드. 부모의 트랜스폼을 상속한다 (몸통 회전 → 팔 따라감) */
  parentId: string | null;
  /**
   * 에디터 전용 묶음(그룹). 같은 groupId를 가진 노드들은 캔버스에서 하나를
   * 선택해도 함께 선택·이동된다. 렌더러/워커는 이 필드를 모른다 (additive → schemaVersion 유지)
   */
  groupId?: string | null;
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
  /** 실루엣 테두리 (additive → schemaVersion 유지). 트레이싱된 파츠에만 존재한다 */
  outline?: NodeOutline;
}

export type NodeAnimations = Partial<Record<AnimatableProperty, Keyframe[]>>;

/** 스토리보드 블록 안에서 노드 하나의 연출 상태 */
export interface BlockNodeState {
  /** 이 장면 동안 실행할 프리셋들. 겹쳐 쓸 수 있고, 겹치는 속성은 뒤가 우선 */
  presetIds?: string[];
  /** 이 장면에서 숨김 (opacity 0 hold 키프레임으로 컴파일) */
  hidden?: boolean;
}

/** 스토리보드의 한 장면. 길이와 노드별 연출만 가진다 — 시간·키프레임 개념이 없다 */
export interface StoryboardBlock {
  id: string;
  durationInFrames: number;
  /** nodeId → 이 장면에서의 상태 */
  nodes: Record<string, BlockNodeState>;
}

/**
 * 초보자용 장면(블록) 편집 모델. 프리셋과 같은 원칙으로 "블록 = 키프레임 생성기"이며,
 * 항상 animations로 컴파일된 결과가 저장된다. 렌더러와 워커는 스토리보드의 존재를 모른다.
 */
export interface Storyboard {
  blocks: StoryboardBlock[];
}

export interface SceneDocument {
  schemaVersion: 1;
  settings: SceneSettings;
  /** 배열 순서 = 레이어 순서 (앞 = 아래) */
  nodes: SceneNode[];
  /** nodeId → 속성별 키프레임 (frame 오름차순 정렬 불변식) */
  animations: Record<string, NodeAnimations>;
  /**
   * 에디터 전용 편집 모델 (선택적·additive라 schemaVersion 유지).
   * 없으면 에디터가 문서 길이 전체를 덮는 블록 하나로 초기화한다.
   */
  storyboard?: Storyboard;
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
