import {
  IDENTITY_MAT,
  blockRanges,
  compileStoryboard,
  createDefaultTransform,
  decomposeMatrix,
  getPreset,
  getWorldMatrix,
  invertMat,
  layoutBubble,
  multiplyMat,
  sampleKeyframes,
  storyboardTotalFrames,
  transformPoint,
  type AnimatableProperty,
  type BubbleSpec,
  type NodeOutline,
  type OutlineStyle,
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
  /** 마지막으로 클릭한(대표) 노드. 속성 패널·타임라인이 이 노드를 보여준다 */
  selectedNodeId: string | null;
  /** 현재 선택된 모든 노드. 그룹 노드를 클릭하면 그룹 전체가 여기에 들어온다 */
  selectedNodeIds: string[];
  /** 스토리보드에서 선택된 장면. 간단 모드의 프리셋/숨김 편집이 이 장면에 적용된다 */
  selectedBlockId: string | null;
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
  /** 노드 선택. 그룹에 속한 노드면 그룹 전체가 함께 선택된다 */
  selectNode: (nodeId: string | null) => void;
  /** 그룹 확장 없이 이 노드 하나만 선택 (Alt+클릭) — 피벗·개별 프리셋 편집용 */
  selectSingleNode: (nodeId: string) => void;
  /** 여러 노드 선택 (드래그 박스). 걸친 노드가 그룹에 속하면 그룹 전체로 확장된다 */
  selectNodes: (nodeIds: string[]) => void;
  /** Shift+클릭: 노드(그룹이면 그룹 전체)를 선택에 추가/제거 */
  toggleNodeSelection: (nodeId: string) => void;
  /** 선택된 노드들을 하나의 그룹으로 묶는다 (기존 그룹에서는 빠져나온다) */
  groupSelectedNodes: () => void;
  /** 선택된 노드들의 그룹을 해제한다 */
  ungroupSelectedNodes: () => void;
  /** 선택된 노드 전부 삭제 (undo 한 단위) */
  deleteSelectedNodes: () => void;
  setEditingBubble: (nodeId: string | null) => void;
  markSaving: () => void;
  markSaved: (version: number) => void;
  markSaveFailed: (conflict: boolean) => void;

  /** position(캔버스 좌표)이 있으면 그 지점을 중심으로, 없으면 캔버스 중앙에 놓는다 */
  addNodeFromAsset: (
    asset: AssetResponse,
    size: { width: number; height: number },
    position?: { x: number; y: number },
    outline?: NodeOutline,
  ) => void;
  /** 여러 노드의 실루엣 테두리 선 종류를 한 번에 변경 (outline이 있는 노드만) */
  setOutlineStyle: (nodeIds: string[], style: OutlineStyle) => void;
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
  /**
   * 노드 하나를 "겹쳐 있는" 다른 이미지 기준으로 한 단계 앞(1)/뒤(-1)로 보낸다.
   * 사이에 겹치지 않는 레이어가 있으면 건너뛰므로 버튼 한 번에 항상 눈에 보이는 변화가 생긴다.
   * 그룹과 무관하게 이 노드만 움직인다 (다리만 몸통 뒤로 보내기)
   */
  moveNodeDepth: (nodeId: string, direction: 1 | -1) => void;
  /**
   * 속성 값 변경. 기본 모드: 항상 base 수정 (스토리보드가 트랙을 소유하므로).
   * 고급 모드: 애니메이션된 속성이면 현재 프레임에 키프레임 upsert, 아니면 base 수정 (AE 방식)
   */
  setPropertyValue: (nodeId: string, property: AnimatableProperty, value: number) => void;
  /** 여러 노드(그룹)의 기본 불투명도를 한 번에 변경. 0~1로 클램프 */
  setNodesOpacity: (nodeIds: string[], value: number) => void;
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

  /** 장면 선택: 재생 위치도 그 장면의 시작으로 이동한다 */
  selectBlock: (blockId: string) => void;
  /** 장면 추가 (기본 2초). 추가된 장면을 선택한다 */
  addBlock: () => void;
  /** 장면 삭제. 마지막 하나는 지울 수 없다 */
  deleteBlock: (blockId: string) => void;
  moveBlock: (blockId: string, direction: 1 | -1) => void;
  setBlockDuration: (blockId: string, durationInFrames: number) => void;
  /** 장면에서 노드의 프리셋 켜기/끄기 (겹쳐 쓰기 가능) */
  toggleBlockPreset: (blockId: string, nodeId: string, presetId: string) => void;
  clearBlockPresets: (blockId: string, nodeId: string) => void;
  /**
   * 여러 노드(그룹/다중 선택)에 프리셋 토글 — undo 한 단위.
   * 전부 켜져 있으면 전부 끄고, 아니면 없는 노드에 켠다 (그룹 전체가 같은 상태가 되도록)
   */
  toggleBlockPresetForNodes: (blockId: string, nodeIds: string[], presetId: string) => void;
  clearBlockPresetsForNodes: (blockId: string, nodeIds: string[]) => void;
  /** 고급 모드: 여러 노드에 프리셋 적용 — undo 한 단위 */
  applyPresetToNodes: (nodeIds: string[], presetId: string) => void;
  clearNodesAnimation: (nodeIds: string[]) => void;
  setBlockNodeHidden: (blockId: string, nodeId: string, hidden: boolean) => void;

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

    /**
     * 스토리보드 변경은 항상 여기로: 변경 후 즉시 animations로 컴파일한다.
     * 스토리보드가 상태를 가진 노드의 트랙은 통째로 대체되고, 나머지는 보존된다.
     */
    function commitStoryboard(mutator: (doc: SceneDocument) => void): void {
      commitDocument((doc) => {
        mutator(doc);
        if (!doc.storyboard) return;
        const compiled = compileStoryboard(doc.storyboard, doc.nodes, doc.settings.fps);
        doc.settings.durationInFrames = compiled.durationInFrames;
        for (const [nodeId, tracks] of Object.entries(compiled.animations)) {
          if (Object.keys(tracks).length === 0) delete doc.animations[nodeId];
          else doc.animations[nodeId] = tracks;
        }
      });
      // 길이가 줄었을 수 있으므로 재생 위치를 범위 안으로 클램프
      get().setFrame(get().currentFrame);
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
      selectedNodeIds: [],
      selectedBlockId: null,
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
          // 스토리보드 보장 (메모리에서만 — dirty로 만들지 않는다. 다음 편집 때 함께 저장된다)
          const doc = state.document;
          if (!doc.storyboard || doc.storyboard.blocks.length === 0) {
            doc.storyboard = {
              blocks: [{ id: nanoid(10), durationInFrames: doc.settings.durationInFrames, nodes: {} }],
            };
          } else {
            // 고급 모드에서 문서 길이를 직접 바꿨을 수 있다 → 마지막 장면이 차이를 흡수
            const diff = doc.settings.durationInFrames - storyboardTotalFrames(doc.storyboard);
            if (diff !== 0) {
              const last = doc.storyboard.blocks[doc.storyboard.blocks.length - 1]!;
              last.durationInFrames = Math.max(1, last.durationInFrames + diff);
              doc.settings.durationInFrames = storyboardTotalFrames(doc.storyboard);
            }
          }
          state.selectedBlockId = doc.storyboard.blocks[0]!.id;
          state.savedVersion = detail.sceneVersion;
          state.saveState = 'saved';
          state.revision = 0;
          state.assets = assets;
          state.selectedNodeId = null;
          state.selectedNodeIds = [];
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

      selectNode: (nodeId) => {
        const doc = get().document;
        if (!nodeId || !doc) {
          set({ selectedNodeId: null, selectedNodeIds: [] });
          return;
        }
        set({ selectedNodeId: nodeId, selectedNodeIds: expandGroups(doc, [nodeId]) });
      },

      selectSingleNode: (nodeId) => set({ selectedNodeId: nodeId, selectedNodeIds: [nodeId] }),

      selectNodes: (nodeIds) => {
        const doc = get().document;
        if (!doc || nodeIds.length === 0) {
          set({ selectedNodeId: null, selectedNodeIds: [] });
          return;
        }
        const expanded = expandGroups(doc, nodeIds);
        set({ selectedNodeId: nodeIds[0]!, selectedNodeIds: expanded });
      },

      toggleNodeSelection: (nodeId) => {
        const doc = get().document;
        if (!doc) return;
        const unit = expandGroups(doc, [nodeId]); // 그룹이면 그룹 전체가 토글 단위
        const current = get().selectedNodeIds;
        const allSelected = unit.every((id) => current.includes(id));
        if (allSelected) {
          const next = current.filter((id) => !unit.includes(id));
          set({
            selectedNodeIds: next,
            selectedNodeId: next.includes(get().selectedNodeId ?? '') ? get().selectedNodeId : (next[0] ?? null),
          });
        } else {
          const next = [...current, ...unit.filter((id) => !current.includes(id))];
          set({ selectedNodeIds: next, selectedNodeId: nodeId });
        }
      },

      groupSelectedNodes: () => {
        const ids = get().selectedNodeIds;
        if (ids.length < 2) return;
        const groupId = nanoid(10);
        commitDocument((d) => {
          for (const n of d.nodes) {
            if (ids.includes(n.id)) n.groupId = groupId;
          }
        });
      },

      ungroupSelectedNodes: () => {
        const ids = get().selectedNodeIds;
        if (ids.length === 0) return;
        commitDocument((d) => {
          for (const n of d.nodes) {
            if (ids.includes(n.id)) delete n.groupId;
          }
        });
      },

      deleteSelectedNodes: () => {
        const ids = new Set(get().selectedNodeIds);
        if (ids.size === 0) return;
        commitDocument((d) => {
          const byId = new Map(d.nodes.map((n) => [n.id, n]));
          // 자식은 삭제되지 않는 가장 가까운 조상으로 재연결
          for (const n of d.nodes) {
            if (ids.has(n.id)) continue;
            let p = n.parentId;
            while (p && ids.has(p)) p = byId.get(p)?.parentId ?? null;
            n.parentId = p;
          }
          d.nodes = d.nodes.filter((n) => !ids.has(n.id));
          for (const id of ids) {
            delete d.animations[id];
            if (d.storyboard) {
              for (const block of d.storyboard.blocks) delete block.nodes[id];
            }
          }
        });
        set({ selectedNodeId: null, selectedNodeIds: [] });
        if (ids.has(get().editingBubbleId ?? '')) set({ editingBubbleId: null });
      },

      setEditingBubble: (nodeId) => set({ editingBubbleId: nodeId }),

      markSaving: () => set({ saveState: 'saving' }),
      markSaved: (version) =>
        set((state) => {
          state.savedVersion = version;
          if (state.saveState === 'saving') state.saveState = 'saved';
        }),
      markSaveFailed: (conflict) => set({ saveState: conflict ? 'conflict' : 'error' }),

      addNodeFromAsset: (asset, size, position, outline) => {
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
          ...(outline && outline.paths.length > 0 ? { outline } : {}),
        };
        commitDocument((d) => {
          d.nodes.push(node);
        });
        set({ selectedNodeId: node.id, selectedNodeIds: [node.id] });
      },

      setOutlineStyle: (nodeIds, style) =>
        commitDocument((d) => {
          for (const n of d.nodes) {
            if (nodeIds.includes(n.id) && n.outline) n.outline.style = style;
          }
        }),

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
        set({ selectedNodeId: node.id, selectedNodeIds: [node.id] });
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
        set({ selectedNodeId: node.id, selectedNodeIds: [node.id] });
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
          if (d.storyboard) {
            for (const block of d.storyboard.blocks) delete block.nodes[nodeId];
          }
        });
        if (get().selectedNodeId === nodeId) set({ selectedNodeId: null });
        set({ selectedNodeIds: get().selectedNodeIds.filter((id) => id !== nodeId) });
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
          if (!n || n.parentId === parentId) return;
          // 순환 방지: 새 부모의 조상 체인에 자신이 있으면 거부
          let cursor = parentId;
          while (cursor) {
            if (cursor === nodeId) return;
            cursor = d.nodes.find((x) => x.id === cursor)?.parentId ?? null;
          }
          // 월드 위치 보존: 새 로컬 = (새 부모 월드)⁻¹ × 기존 월드.
          // 키프레임 값은 옛 좌표계 기준이므로 건드리지 않고 base만 보정한다.
          const baseOnly: SceneDocument = { ...d, animations: {} };
          const oldWorld = getWorldMatrix(baseOnly, nodeId, 0);
          const newParentWorld = parentId ? getWorldMatrix(baseOnly, parentId, 0) : IDENTITY_MAT;
          const inv = invertMat(newParentWorld);
          n.parentId = parentId;
          if (inv) {
            Object.assign(n.base, decomposeMatrix(multiplyMat(inv, oldWorld), n.pivot));
          }
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

      moveNodeDepth: (nodeId, direction) => {
        const state = get();
        const doc = state.document;
        if (!doc) return;
        const index = doc.nodes.findIndex((n) => n.id === nodeId);
        if (index < 0) return;
        const frame = state.currentFrame;

        // 회전·스케일·부모 트랜스폼까지 반영한 월드 AABB
        const aabbOf = (n: SceneNode) => {
          const m = getWorldMatrix(doc, n.id, frame);
          const pts = [
            transformPoint(m, 0, 0),
            transformPoint(m, n.size.width, 0),
            transformPoint(m, 0, n.size.height),
            transformPoint(m, n.size.width, n.size.height),
          ];
          return {
            minX: Math.min(...pts.map((p) => p.x)),
            maxX: Math.max(...pts.map((p) => p.x)),
            minY: Math.min(...pts.map((p) => p.y)),
            maxY: Math.max(...pts.map((p) => p.y)),
          };
        };
        const target = aabbOf(doc.nodes[index]!);
        const overlapsTarget = (n: SceneNode) => {
          const b = aabbOf(n);
          return b.minX < target.maxX && b.maxX > target.minX && b.minY < target.maxY && b.maxY > target.minY;
        };

        // 그 방향에서 가장 가까운 "겹치는" 노드를 찾아 그 바로 뒤/앞으로 이동
        let insertAt = -1;
        if (direction === -1) {
          for (let i = index - 1; i >= 0; i--) {
            const n = doc.nodes[i]!;
            if (n.visible && overlapsTarget(n)) {
              insertAt = i;
              break;
            }
          }
          if (insertAt < 0) insertAt = index - 1; // 겹치는 게 없으면 한 층만
        } else {
          for (let i = index + 1; i < doc.nodes.length; i++) {
            const n = doc.nodes[i]!;
            if (n.visible && overlapsTarget(n)) {
              insertAt = i;
              break;
            }
          }
          if (insertAt < 0) insertAt = index + 1;
        }
        if (insertAt === index || insertAt < 0 || insertAt >= doc.nodes.length) return;

        commitDocument((d) => {
          const [node] = d.nodes.splice(index, 1);
          d.nodes.splice(insertAt, 0, node!);
        });
      },

      setPropertyValue: (nodeId, property, value) => {
        // 기본 모드: 항상 기본값(base)을 수정한다. 프리셋·숨김이 만든 트랙은 base 기준으로
        // 재컴파일되므로 값이 유지된다 — 키프레임에 upsert하면 재생/재컴파일 때 사라져 "안 먹는" 것처럼 보인다
        if (!get().advancedMode) {
          commitStoryboard((d) => {
            const n = d.nodes.find((x) => x.id === nodeId);
            if (n) n.base[property] = value;
          });
          return;
        }
        const frame = get().currentFrame;
        commitDocument((d) => applyPropertyValue(d, nodeId, property, frame, value));
      },

      setNodesOpacity: (nodeIds, value) => {
        const opacity = Math.max(0, Math.min(1, value));
        commitStoryboard((d) => {
          for (const n of d.nodes) {
            if (nodeIds.includes(n.id)) n.base.opacity = opacity;
          }
        });
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

      selectBlock: (blockId) => {
        const doc = get().document;
        if (!doc?.storyboard) return;
        const range = blockRanges(doc.storyboard).find((r) => r.id === blockId);
        if (!range) return;
        set({ selectedBlockId: blockId });
        get().setFrame(range.start);
      },

      addBlock: () => {
        const doc = get().document;
        if (!doc?.storyboard) return;
        const id = nanoid(10);
        commitStoryboard((d) => {
          d.storyboard!.blocks.push({ id, durationInFrames: d.settings.fps * 2, nodes: {} });
        });
        get().selectBlock(id);
      },

      deleteBlock: (blockId) => {
        const doc = get().document;
        if (!doc?.storyboard || doc.storyboard.blocks.length <= 1) return;
        commitStoryboard((d) => {
          d.storyboard!.blocks = d.storyboard!.blocks.filter((b) => b.id !== blockId);
        });
        if (get().selectedBlockId === blockId) {
          get().selectBlock(get().document!.storyboard!.blocks[0]!.id);
        }
      },

      moveBlock: (blockId, direction) =>
        commitStoryboard((d) => {
          const blocks = d.storyboard!.blocks;
          const index = blocks.findIndex((b) => b.id === blockId);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= blocks.length) return;
          const [block] = blocks.splice(index, 1);
          blocks.splice(target, 0, block!);
        }),

      setBlockDuration: (blockId, durationInFrames) =>
        commitStoryboard((d) => {
          const block = d.storyboard!.blocks.find((b) => b.id === blockId);
          if (block) block.durationInFrames = Math.max(1, Math.round(durationInFrames));
        }),

      toggleBlockPreset: (blockId, nodeId, presetId) =>
        commitStoryboard((d) => {
          const block = d.storyboard!.blocks.find((b) => b.id === blockId);
          if (!block) return;
          const state = (block.nodes[nodeId] ??= {});
          const presetIds = state.presetIds ?? [];
          state.presetIds = presetIds.includes(presetId)
            ? presetIds.filter((p) => p !== presetId)
            : [...presetIds, presetId];
        }),

      clearBlockPresets: (blockId, nodeId) =>
        commitStoryboard((d) => {
          const state = d.storyboard!.blocks.find((b) => b.id === blockId)?.nodes[nodeId];
          if (state) state.presetIds = [];
        }),

      toggleBlockPresetForNodes: (blockId, nodeIds, presetId) => {
        const block = get().document?.storyboard?.blocks.find((b) => b.id === blockId);
        if (!block || nodeIds.length === 0) return;
        const allActive = nodeIds.every((id) => block.nodes[id]?.presetIds?.includes(presetId));
        commitStoryboard((d) => {
          const target = d.storyboard!.blocks.find((b) => b.id === blockId);
          if (!target) return;
          for (const nodeId of nodeIds) {
            const state = (target.nodes[nodeId] ??= {});
            const presetIds = state.presetIds ?? [];
            state.presetIds = allActive
              ? presetIds.filter((p) => p !== presetId)
              : presetIds.includes(presetId)
                ? presetIds
                : [...presetIds, presetId];
          }
        });
      },

      clearBlockPresetsForNodes: (blockId, nodeIds) =>
        commitStoryboard((d) => {
          const block = d.storyboard!.blocks.find((b) => b.id === blockId);
          if (!block) return;
          for (const nodeId of nodeIds) {
            const state = block.nodes[nodeId];
            if (state) state.presetIds = [];
          }
        }),

      applyPresetToNodes: (nodeIds, presetId) => {
        const preset = getPreset(presetId);
        if (!preset || nodeIds.length === 0) return;
        commitDocument((d) => {
          for (const nodeId of nodeIds) {
            const node = d.nodes.find((n) => n.id === nodeId);
            if (!node) continue;
            const generated = preset.generate({
              base: node.base,
              fps: d.settings.fps,
              durationInFrames: d.settings.durationInFrames,
            });
            const nodeAnimations = (d.animations[nodeId] ??= {});
            Object.assign(nodeAnimations, generated);
          }
        });
        set({ currentFrame: 0 });
      },

      clearNodesAnimation: (nodeIds) =>
        commitDocument((d) => {
          for (const nodeId of nodeIds) delete d.animations[nodeId];
        }),

      setBlockNodeHidden: (blockId, nodeId, hidden) =>
        commitStoryboard((d) => {
          const block = d.storyboard!.blocks.find((b) => b.id === blockId);
          if (!block) return;
          const state = (block.nodes[nodeId] ??= {});
          state.hidden = hidden;
        }),

      updateSettings: (patch) =>
        commitDocument((d) => {
          Object.assign(d.settings, patch);
          // 고급 모드에서 길이를 직접 바꾸면 마지막 장면이 차이를 흡수해 스토리보드와 동기화
          if (patch.durationInFrames !== undefined && d.storyboard) {
            const diff = d.settings.durationInFrames - storyboardTotalFrames(d.storyboard);
            if (diff !== 0) {
              const last = d.storyboard.blocks[d.storyboard.blocks.length - 1]!;
              last.durationInFrames = Math.max(1, last.durationInFrames + diff);
              d.settings.durationInFrames = storyboardTotalFrames(d.storyboard);
            }
          }
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

/** 선택 확장: 포함된 노드가 그룹에 속하면 같은 그룹의 노드 전부를 선택에 넣는다 */
function expandGroups(doc: SceneDocument, nodeIds: string[]): string[] {
  const ids = new Set(nodeIds);
  const groupIds = new Set<string>();
  for (const n of doc.nodes) {
    if (ids.has(n.id) && n.groupId) groupIds.add(n.groupId);
  }
  for (const n of doc.nodes) {
    if (n.groupId && groupIds.has(n.groupId)) ids.add(n.id);
  }
  // 문서에 실제 존재하는 노드만 (undo 등으로 사라진 id 방지)
  return doc.nodes.filter((n) => ids.has(n.id)).map((n) => n.id);
}

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
