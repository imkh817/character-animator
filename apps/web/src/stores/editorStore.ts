import {
  createDefaultTransform,
  getPreset,
  layoutBubble,
  sampleKeyframes,
  type AnimatableProperty,
  type BubbleSpec,
  type SceneDocument,
  type SceneNode,
} from '@charanim/animation-core';
import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AssetResponse, ProjectDetail } from '../api/types';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';

const HISTORY_LIMIT = 50;
const DEFAULT_EASING = { type: 'easeInOut' } as const;

interface EditorState {
  projectId: string | null;
  title: string;
  document: SceneDocument | null;
  /** 서버가 알고 있는 버전. autosave의 baseVersion */
  savedVersion: number;
  saveState: SaveState;
  /** 문서가 바뀔 때마다 증가 — autosave 트리거 */
  revision: number;
  assets: AssetResponse[];
  selectedNodeId: string | null;
  /** 인라인 편집 중인 말풍선 노드. 캔버스 위에 텍스트 입력창이 겹쳐진다 */
  editingBubbleId: string | null;
  currentFrame: number;
  playing: boolean;
  /** 고급 모드: 키프레임 타임라인과 ◆ 토글 노출. 기본은 단순 재생 바 */
  advancedMode: boolean;
  past: SceneDocument[];
  future: SceneDocument[];

  loadProject: (detail: ProjectDetail, assets: AssetResponse[]) => void;
  setAssets: (assets: AssetResponse[]) => void;
  setFrame: (frame: number) => void;
  setPlaying: (playing: boolean) => void;
  setAdvancedMode: (advanced: boolean) => void;
  selectNode: (nodeId: string | null) => void;
  setEditingBubble: (nodeId: string | null) => void;
  markSaving: () => void;
  markSaved: (version: number) => void;
  markSaveFailed: (conflict: boolean) => void;

  /** position(캔버스 좌표)이 있으면 그 지점을 중심으로, 없으면 캔버스 중앙에 놓는다 */
  addNodeFromAsset: (
    asset: AssetResponse,
    size: { width: number; height: number },
    position?: { x: number; y: number },
  ) => void;
  /** 배경으로 추가: 캔버스를 덮도록 스케일해 맨 아래 레이어에 넣는다 */
  addBackgroundFromAsset: (asset: AssetResponse, size: { width: number; height: number }) => void;
  /** 말풍선 노드 추가: 에셋 없이 spec만으로 렌더된다 */
  addBubbleNode: (spec: BubbleSpec) => void;
  /** 말풍선 문구/스타일 수정: 크기를 다시 계산하되 중심은 제자리에 유지 */
  updateBubble: (nodeId: string, patch: Partial<BubbleSpec>) => void;
  deleteNode: (nodeId: string) => void;
  renameNode: (nodeId: string, name: string) => void;
  setNodeVisible: (nodeId: string, visible: boolean) => void;
  setNodeParent: (nodeId: string, parentId: string | null) => void;
  setNodePivot: (nodeId: string, axis: 'x' | 'y', value: number) => void;
  moveLayer: (nodeId: string, direction: 1 | -1) => void;
  /** 속성 값 변경: 애니메이션된 속성이면 현재 프레임에 키프레임 upsert, 아니면 base 수정 (AE 방식) */
  setPropertyValue: (nodeId: string, property: AnimatableProperty, value: number) => void;
  /** 드래그 시작 시 1회 호출 — 현재 문서를 히스토리에 남긴다 (드래그 전체가 undo 한 번) */
  beginHistoryEntry: () => void;
  /** 드래그 중 고빈도 갱신 — 히스토리를 쌓지 않는다 */
  dragProperties: (nodeId: string, values: Partial<Record<AnimatableProperty, number>>) => void;
  /** 현재 프레임에 키프레임 토글 (있으면 제거, 없으면 현재 값으로 추가) */
  toggleKeyframe: (nodeId: string, property: AnimatableProperty) => void;
  /** 프리셋 적용: 해당 노드의 겹치는 속성 키프레임을 프리셋으로 교체 */
  applyPreset: (nodeId: string, presetId: string) => void;
  /** 노드의 모든 애니메이션 제거 (정지 상태로) */
  clearNodeAnimation: (nodeId: string) => void;
  updateSettings: (patch: Partial<SceneDocument['settings']>) => void;
  undo: () => void;
  redo: () => void;
}

export const useEditorStore = create<EditorState>()(
  immer((set, get) => {
    /** 모든 문서 변경은 이 함수를 거친다: 히스토리 push + revision 증가 + dirty 마킹 */
    function commitDocument(mutator: (doc: SceneDocument) => void): void {
      const previous = get().document;
      if (!previous) return;
      set((state) => {
        if (!state.document) return;
        state.past.push(previous);
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
        mutator(state.document);
        state.revision++;
        if (state.saveState !== 'conflict') state.saveState = 'dirty';
      });
    }

    return {
      projectId: null,
      title: '',
      document: null,
      savedVersion: 0,
      saveState: 'saved',
      revision: 0,
      assets: [],
      selectedNodeId: null,
      editingBubbleId: null,
      currentFrame: 0,
      playing: false,
      advancedMode: localStorage.getItem('charanim.advancedMode') === '1',
      past: [],
      future: [],

      setAdvancedMode: (advanced) => {
        localStorage.setItem('charanim.advancedMode', advanced ? '1' : '0');
        set({ advancedMode: advanced });
      },

      loadProject: (detail, assets) =>
        set((state) => {
          state.projectId = detail.id;
          state.title = detail.title;
          state.document = detail.sceneDocument;
          state.savedVersion = detail.sceneVersion;
          state.saveState = 'saved';
          state.revision = 0;
          state.assets = assets;
          state.selectedNodeId = null;
          state.editingBubbleId = null;
          state.currentFrame = 0;
          state.playing = false;
          state.past = [];
          state.future = [];
        }),

      setAssets: (assets) => set({ assets }),

      setFrame: (frame) =>
        set((state) => {
          const max = state.document ? state.document.settings.durationInFrames - 1 : 0;
          state.currentFrame = Math.max(0, Math.min(max, Math.round(frame)));
        }),

      setPlaying: (playing) => set({ playing }),

      selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

      setEditingBubble: (nodeId) => set({ editingBubbleId: nodeId }),

      markSaving: () => set({ saveState: 'saving' }),
      markSaved: (version) =>
        set((state) => {
          state.savedVersion = version;
          if (state.saveState === 'saving') state.saveState = 'saved';
        }),
      markSaveFailed: (conflict) => set({ saveState: conflict ? 'conflict' : 'error' }),

      addNodeFromAsset: (asset, size, position) => {
        const doc = get().document;
        if (!doc) return;
        const { width: canvasW, height: canvasH } = doc.settings;
        // 원본이 캔버스보다 크면(고해상도 사진 등) 캔버스 안에 들어오도록 축소
        const fit = Math.min(1, canvasW / size.width, canvasH / size.height);
        const center = position ?? { x: canvasW / 2, y: canvasH / 2 };
        const node: SceneNode = {
          id: nanoid(10),
          name: asset.originalFilename.replace(/\.[^.]+$/, ''),
          assetId: asset.id,
          parentId: null,
          size,
          // 회전/스케일 기준점은 파츠의 중심이 자연스러운 기본값
          pivot: { x: size.width / 2, y: size.height / 2 },
          base: {
            ...createDefaultTransform(),
            x: center.x - size.width / 2,
            y: center.y - size.height / 2,
            scaleX: fit,
            scaleY: fit,
          },
          visible: true,
          locked: false,
        };
        commitDocument((d) => {
          d.nodes.push(node);
        });
        set({ selectedNodeId: node.id });
      },

      addBackgroundFromAsset: (asset, size) => {
        const doc = get().document;
        if (!doc) return;
        const { width, height } = doc.settings;
        // cover: 짧은 쪽 기준으로 확대해 캔버스에 빈 곳이 없게 한다
        const cover = Math.max(width / size.width, height / size.height);
        const node: SceneNode = {
          id: nanoid(10),
          name: `배경 (${asset.originalFilename.replace(/\.[^.]+$/, '')})`,
          assetId: asset.id,
          parentId: null,
          size,
          pivot: { x: size.width / 2, y: size.height / 2 },
          base: {
            ...createDefaultTransform(),
            x: width / 2 - size.width / 2,
            y: height / 2 - size.height / 2,
            scaleX: cover,
            scaleY: cover,
          },
          visible: true,
          locked: false,
        };
        commitDocument((d) => {
          d.nodes.unshift(node); // 배열 앞 = 맨 아래 레이어
        });
        set({ selectedNodeId: node.id });
      },

      addBubbleNode: (spec) => {
        const doc = get().document;
        if (!doc) return;
        const { width, height } = layoutBubble(spec);
        const { width: canvasW, height: canvasH } = doc.settings;
        const node: SceneNode = {
          id: nanoid(10),
          name: bubbleNodeName(spec.text),
          parentId: null,
          size: { width, height },
          pivot: { x: width / 2, y: height / 2 },
          base: {
            ...createDefaultTransform(),
            x: canvasW / 2 - width / 2,
            y: canvasH / 2 - height / 2,
          },
          visible: true,
          locked: false,
          bubble: spec,
        };
        commitDocument((d) => {
          d.nodes.push(node);
        });
        set({ selectedNodeId: node.id });
      },

      updateBubble: (nodeId, patch) =>
        commitDocument((d) => {
          const n = d.nodes.find((x) => x.id === nodeId);
          if (!n?.bubble) return;
          const spec = { ...n.bubble, ...patch };
          const { width, height } = layoutBubble(spec);
          // 크기가 바뀌어도 말풍선의 중심이 제자리에 남도록 보정
          n.base.x += (n.size.width - width) / 2;
          n.base.y += (n.size.height - height) / 2;
          n.size = { width, height };
          n.pivot = { x: width / 2, y: height / 2 };
          n.name = bubbleNodeName(spec.text);
          n.bubble = spec;
        }),

      deleteNode: (nodeId) => {
        commitDocument((d) => {
          const target = d.nodes.find((n) => n.id === nodeId);
          if (!target) return;
          // 자식은 삭제된 노드의 부모로 재연결한다 (통째로 사라지는 것보다 예측 가능)
          for (const n of d.nodes) {
            if (n.parentId === nodeId) n.parentId = target.parentId;
          }
          d.nodes = d.nodes.filter((n) => n.id !== nodeId);
          delete d.animations[nodeId];
        });
        if (get().selectedNodeId === nodeId) set({ selectedNodeId: null });
        if (get().editingBubbleId === nodeId) set({ editingBubbleId: null });
      },

      renameNode: (nodeId, name) =>
        commitDocument((d) => {
          const n = d.nodes.find((x) => x.id === nodeId);
          if (n) n.name = name;
        }),

      setNodeVisible: (nodeId, visible) =>
        commitDocument((d) => {
          const n = d.nodes.find((x) => x.id === nodeId);
          if (n) n.visible = visible;
        }),

      setNodeParent: (nodeId, parentId) =>
        commitDocument((d) => {
          const n = d.nodes.find((x) => x.id === nodeId);
          if (!n) return;
          // 순환 방지: 새 부모의 조상 체인에 자신이 있으면 거부
          let cursor = parentId;
          while (cursor) {
            if (cursor === nodeId) return;
            cursor = d.nodes.find((x) => x.id === cursor)?.parentId ?? null;
          }
          n.parentId = parentId;
        }),

      setNodePivot: (nodeId, axis, value) =>
        commitDocument((d) => {
          const n = d.nodes.find((x) => x.id === nodeId);
          if (n) n.pivot[axis] = value;
        }),

      moveLayer: (nodeId, direction) =>
        commitDocument((d) => {
          const index = d.nodes.findIndex((n) => n.id === nodeId);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= d.nodes.length) return;
          const [node] = d.nodes.splice(index, 1);
          d.nodes.splice(target, 0, node!);
        }),

      setPropertyValue: (nodeId, property, value) => {
        const frame = get().currentFrame;
        commitDocument((d) => applyPropertyValue(d, nodeId, property, frame, value));
      },

      beginHistoryEntry: () => {
        const previous = get().document;
        if (!previous) return;
        set((state) => {
          state.past.push(previous);
          if (state.past.length > HISTORY_LIMIT) state.past.shift();
          state.future = [];
        });
      },

      dragProperties: (nodeId, values) => {
        const frame = get().currentFrame;
        set((state) => {
          if (!state.document) return;
          for (const [property, value] of Object.entries(values) as [AnimatableProperty, number][]) {
            applyPropertyValue(state.document, nodeId, property, frame, value);
          }
          state.revision++;
          if (state.saveState !== 'conflict') state.saveState = 'dirty';
        });
      },

      toggleKeyframe: (nodeId, property) => {
        const state = get();
        const doc = state.document;
        if (!doc) return;
        const node = doc.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const frame = state.currentFrame;
        const keyframes = doc.animations[nodeId]?.[property];
        const exists = keyframes?.some((k) => k.frame === frame) ?? false;

        commitDocument((d) => {
          if (exists) {
            const list = d.animations[nodeId]?.[property];
            if (!list) return;
            const next = list.filter((k) => k.frame !== frame);
            if (next.length === 0) {
              delete d.animations[nodeId]?.[property];
            } else {
              d.animations[nodeId]![property] = next;
            }
          } else {
            const currentValue = sampleKeyframes(keyframes, frame, node.base[property]);
            upsertKeyframe(d, nodeId, property, frame, currentValue);
          }
        });
      },

      applyPreset: (nodeId, presetId) => {
        const preset = getPreset(presetId);
        if (!preset) return;
        commitDocument((d) => {
          const node = d.nodes.find((n) => n.id === nodeId);
          if (!node) return;
          const generated = preset.generate({
            base: node.base,
            fps: d.settings.fps,
            durationInFrames: d.settings.durationInFrames,
          });
          const nodeAnimations = (d.animations[nodeId] ??= {});
          Object.assign(nodeAnimations, generated);
        });
        set({ currentFrame: 0 });
      },

      clearNodeAnimation: (nodeId) =>
        commitDocument((d) => {
          delete d.animations[nodeId];
        }),

      updateSettings: (patch) =>
        commitDocument((d) => {
          Object.assign(d.settings, patch);
        }),

      undo: () =>
        set((state) => {
          const previous = state.past.pop();
          if (!previous || !state.document) return;
          state.future.unshift(state.document);
          state.document = previous;
          state.revision++;
          if (state.saveState !== 'conflict') state.saveState = 'dirty';
        }),

      redo: () =>
        set((state) => {
          const next = state.future.shift();
          if (!next || !state.document) return;
          state.past.push(state.document);
          state.document = next;
          state.revision++;
          if (state.saveState !== 'conflict') state.saveState = 'dirty';
        }),
    };
  }),
);

function bubbleNodeName(text: string): string {
  if (!text) return '말풍선';
  return text.length > 20 ? `${text.slice(0, 20)}…` : text;
}

/** AE 방식: 애니메이션된 속성이면 해당 프레임에 키프레임 upsert, 아니면 base 수정 */
function applyPropertyValue(
  doc: SceneDocument,
  nodeId: string,
  property: AnimatableProperty,
  frame: number,
  value: number,
): void {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const keyframes = doc.animations[nodeId]?.[property];
  if (keyframes && keyframes.length > 0) {
    upsertKeyframe(doc, nodeId, property, frame, value);
  } else {
    node.base[property] = value;
  }
}

function upsertKeyframe(
  doc: SceneDocument,
  nodeId: string,
  property: AnimatableProperty,
  frame: number,
  value: number,
): void {
  const nodeAnimations = (doc.animations[nodeId] ??= {});
  const keyframes = (nodeAnimations[property] ??= []);
  const existing = keyframes.find((k) => k.frame === frame);
  if (existing) {
    existing.value = value;
  } else {
    keyframes.push({ frame, value, easing: DEFAULT_EASING });
    keyframes.sort((a, b) => a.frame - b.frame);
  }
}
