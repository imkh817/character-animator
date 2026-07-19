import {
  getLocalTransform,
  getWorldMatrix,
  IDENTITY_MAT,
  invertLinear,
  layoutBubble,
  transformVector,
  type BubbleSpec,
  type Mat2D,
} from '@charanim/animation-core';
import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { playerController } from './playerController';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DragTarget {
  nodeId: string;
  startX: number;
  startY: number;
  /** 화면 delta → 부모 공간 delta 변환용 (부모 월드 행렬의 역) */
  invParent: Pick<Mat2D, 'a' | 'b' | 'c' | 'd'>;
}

/** 선택된 노드 전체를 한 번에 끄는 드래그 (그룹/다중 선택 포함) */
interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  targets: DragTarget[];
}

/** 빈 곳에서 시작하는 드래그 박스 선택 */
interface MarqueeState {
  pointerId: number;
  /** stage 좌표 */
  startX: number;
  startY: number;
}

/** 모서리 4개(비율 유지) + 가장자리 4개(한 축만) */
type HandleDir = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
const HANDLES: readonly HandleDir[] = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];

type ResizeAxis = 'both' | 'x' | 'y';

interface ResizeState {
  pointerId: number;
  nodeId: string;
  /** 잡은 핸들의 반대편 지점 (stage 좌표) — 스케일 기준점 */
  anchor: { x: number; y: number };
  /** both: 비율 유지(모서리), x/y: 한 축만(가장자리) */
  axis: ResizeAxis;
  startDistance: number;
  startScaleX: number;
  startScaleY: number;
}

function resizeDistance(axis: ResizeAxis, dx: number, dy: number): number {
  if (axis === 'x') return Math.abs(dx);
  if (axis === 'y') return Math.abs(dy);
  return Math.hypot(dx, dy);
}

/**
 * Player 위에 얹히는 직접 조작 레이어.
 *
 * 히트테스트는 좌표 계산 대신 DOM에 맡긴다: CharacterScene이 노드마다
 * data-node-id를 달아주므로, elementsFromPoint()가 회전·스케일·계층까지
 * 포함해 "실제로 그려진 것"을 정확히 찾아준다.
 */
export const CanvasOverlay: React.FC<{
  stageRef: React.RefObject<HTMLDivElement>;
  scale: number;
}> = ({ stageRef, scale }) => {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const sceneDoc = useEditorStore((s) => s.document);
  const editingBubbleId = useEditorStore((s) => s.editingBubbleId);
  const editingNode = useEditorStore((s) =>
    s.editingBubbleId ? (s.document?.nodes.find((n) => n.id === s.editingBubbleId) ?? null) : null,
  );
  const [selectionRects, setSelectionRects] = useState<Record<string, Rect>>({});
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const marqueeRef = useRef<MarqueeState | null>(null);

  // 편집 중 다른 노드가 선택되면(레이어 패널 등) 편집 모드를 닫는다
  useEffect(() => {
    if (editingBubbleId && editingBubbleId !== selectedNodeId) {
      useEditorStore.getState().setEditingBubble(null);
    }
  }, [editingBubbleId, selectedNodeId]);

  // 선택 외곽선: Player가 실제로 그린 요소의 위치를 매 프레임 읽는다 (재생 중에도 따라감)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const stage = stageRef.current;
      const rects: Record<string, Rect> = {};
      if (stage && selectedNodeIds.length > 0) {
        const stageBox = stage.getBoundingClientRect();
        for (const id of selectedNodeIds) {
          const nodeEl = stage.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
          // 이미지 노드는 <img>, 말풍선 노드는 <svg>가 실제 그려진 크기를 가진다
          const imgEl = nodeEl?.querySelector('img, svg') ?? nodeEl;
          if (!imgEl) continue;
          const box = imgEl.getBoundingClientRect();
          rects[id] = {
            x: box.left - stageBox.left,
            y: box.top - stageBox.top,
            w: box.width,
            h: box.height,
          };
        }
      }
      setSelectionRects(rects);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selectedNodeIds, stageRef]);

  const hitTest = (clientX: number, clientY: number): string | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      const hit = (el as HTMLElement).closest?.('[data-node-id]');
      if (hit instanceof HTMLElement && stage.contains(hit)) {
        return hit.dataset.nodeId ?? null;
      }
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    playerController.current?.pause();
    const store = useEditorStore.getState();
    const nodeId = hitTest(e.clientX, e.clientY);

    // 빈 곳: 드래그 박스 선택 시작 (놓을 때 확정. 그냥 클릭이면 선택 해제)
    if (!nodeId) {
      const stage = stageRef.current;
      if (!stage) return;
      const box = stage.getBoundingClientRect();
      const startX = e.clientX - box.left;
      const startY = e.clientY - box.top;
      marqueeRef.current = { pointerId: e.pointerId, startX, startY };
      setMarqueeRect({ x: startX, y: startY, w: 0, h: 0 });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Shift+클릭: 선택에 추가/제거만 하고 드래그는 시작하지 않는다
    if (e.shiftKey) {
      store.toggleNodeSelection(nodeId);
      return;
    }

    if (e.altKey) {
      // Alt+클릭: 그룹이어도 이 파츠 하나만 선택 — 피벗 설정·파츠별 프리셋용
      store.selectSingleNode(nodeId);
    } else if (!store.selectedNodeIds.includes(nodeId)) {
      // 이미 선택된 노드를 다시 누르면 선택 유지(다중 선택을 통째로 드래그), 아니면 새로 선택.
      // selectNode는 그룹에 속한 노드면 그룹 전체를 선택한다.
      store.selectNode(nodeId);
    }

    const state = useEditorStore.getState();
    const doc = state.document;
    if (!doc) return;

    const frame = state.currentFrame;
    const selectedSet = new Set(state.selectedNodeIds);
    // 조상이 함께 선택된 노드는 조상 이동으로 이미 따라오므로 제외 (이중 이동 방지)
    const hasSelectedAncestor = (startId: string): boolean => {
      let cursor = doc.nodes.find((n) => n.id === startId)?.parentId ?? null;
      while (cursor) {
        if (selectedSet.has(cursor)) return true;
        cursor = doc.nodes.find((n) => n.id === cursor)?.parentId ?? null;
      }
      return false;
    };

    const targets: DragTarget[] = [];
    for (const id of state.selectedNodeIds) {
      const node = doc.nodes.find((n) => n.id === id);
      if (!node || node.locked || hasSelectedAncestor(id)) continue;
      const local = getLocalTransform(node, doc.animations[id], frame);
      const parentWorld = node.parentId ? getWorldMatrix(doc, node.parentId, frame) : IDENTITY_MAT;
      const invParent = invertLinear(parentWorld);
      if (!invParent) continue;
      targets.push({ nodeId: id, startX: local.x, startY: local.y, invParent });
    }
    if (targets.length === 0) return;

    store.beginHistoryEntry(); // 드래그 전체가 undo 한 단위
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      targets,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  /** 핸들 드래그 시작: 반대편 지점을 기준점으로 스케일. 모서리는 비율 유지, 가장자리는 한 축만 */
  const startResize = (e: React.PointerEvent<HTMLDivElement>, dir: HandleDir) => {
    e.stopPropagation();
    playerController.current?.pause();
    const store = useEditorStore.getState();
    const nodeId = store.selectedNodeId;
    const rect = nodeId ? (selectionRects[nodeId] ?? null) : null;
    const stage = stageRef.current;
    if (!nodeId || !rect || !stage || !store.document) return;
    const node = store.document.nodes.find((n) => n.id === nodeId);
    if (!node || node.locked) return;

    const axis: ResizeAxis = dir.length === 2 ? 'both' : dir === 'e' || dir === 'w' ? 'x' : 'y';
    const anchor = {
      x: dir.includes('w') ? rect.x + rect.w : dir.includes('e') ? rect.x : rect.x + rect.w / 2,
      y: dir.includes('n') ? rect.y + rect.h : dir.includes('s') ? rect.y : rect.y + rect.h / 2,
    };
    const stageBox = stage.getBoundingClientRect();
    const startDistance = resizeDistance(
      axis,
      e.clientX - stageBox.left - anchor.x,
      e.clientY - stageBox.top - anchor.y,
    );
    if (startDistance < 1) return;

    const local = getLocalTransform(node, store.document.animations[nodeId], store.currentFrame);
    store.beginHistoryEntry(); // 리사이즈 전체가 undo 한 단위
    resizeRef.current = {
      pointerId: e.pointerId,
      nodeId,
      anchor,
      axis,
      startDistance,
      startScaleX: local.scaleX,
      startScaleY: local.scaleY,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const marquee = marqueeRef.current;
    if (marquee && e.pointerId === marquee.pointerId) {
      const stage = stageRef.current;
      if (!stage) return;
      const box = stage.getBoundingClientRect();
      const cx = e.clientX - box.left;
      const cy = e.clientY - box.top;
      setMarqueeRect({
        x: Math.min(cx, marquee.startX),
        y: Math.min(cy, marquee.startY),
        w: Math.abs(cx - marquee.startX),
        h: Math.abs(cy - marquee.startY),
      });
      return;
    }

    const resize = resizeRef.current;
    if (resize && e.pointerId === resize.pointerId) {
      const stage = stageRef.current;
      if (!stage) return;
      const stageBox = stage.getBoundingClientRect();
      const distance = resizeDistance(
        resize.axis,
        e.clientX - stageBox.left - resize.anchor.x,
        e.clientY - stageBox.top - resize.anchor.y,
      );
      // 기준점(반대편)과의 거리 비율 = 스케일 배율
      const factor = Math.max(0.02, distance / resize.startDistance);
      const values: Partial<Record<'scaleX' | 'scaleY', number>> = {};
      if (resize.axis !== 'y') values.scaleX = Math.round(resize.startScaleX * factor * 1000) / 1000;
      if (resize.axis !== 'x') values.scaleY = Math.round(resize.startScaleY * factor * 1000) / 1000;
      useEditorStore.getState().dragProperties(resize.nodeId, values);
      return;
    }

    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    // 화면 px → 캔버스 px → (부모가 회전/스케일돼 있어도 정확하게) 각 노드의 부모 공간 px
    const canvasDx = (e.clientX - drag.startClientX) / scale;
    const canvasDy = (e.clientY - drag.startClientY) / scale;
    for (const target of drag.targets) {
      const parentDelta = transformVector(target.invParent, canvasDx, canvasDy);
      useEditorStore.getState().dragProperties(target.nodeId, {
        x: Math.round(target.startX + parentDelta.x),
        y: Math.round(target.startY + parentDelta.y),
      });
    }
  };

  /** 드래그 박스 확정: 박스에 걸친 노드들을 선택. 움직임이 거의 없으면 빈 클릭 = 선택 해제 */
  const finishMarquee = (rect: Rect | null) => {
    const store = useEditorStore.getState();
    if (!rect || (rect.w < 4 && rect.h < 4)) {
      store.selectNodes([]);
      return;
    }
    const stage = stageRef.current;
    const doc = store.document;
    if (!stage || !doc) return;
    const stageBox = stage.getBoundingClientRect();
    const ids: string[] = [];
    for (const el of Array.from(stage.querySelectorAll<HTMLElement>('[data-node-id]'))) {
      const id = el.dataset.nodeId;
      if (!id) continue;
      const node = doc.nodes.find((n) => n.id === id);
      if (!node || node.locked || !node.visible) continue;
      const target = el.querySelector('img, svg') ?? el;
      const box = target.getBoundingClientRect();
      const r: Rect = { x: box.left - stageBox.left, y: box.top - stageBox.top, w: box.width, h: box.height };
      const overlaps =
        r.x < rect.x + rect.w && r.x + r.w > rect.x && r.y < rect.y + rect.h && r.y + r.h > rect.y;
      if (overlaps) ids.push(id);
    }
    store.selectNodes(ids);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (marqueeRef.current?.pointerId === e.pointerId) {
      marqueeRef.current = null;
      finishMarquee(marqueeRect);
      setMarqueeRect(null);
    }
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
    if (resizeRef.current?.pointerId === e.pointerId) resizeRef.current = null;
  };

  /** 말풍선 더블클릭 → 말풍선 위에 인라인 입력창을 연다 */
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const nodeId = hitTest(e.clientX, e.clientY);
    if (!nodeId) return;
    const node = useEditorStore.getState().document?.nodes.find((n) => n.id === nodeId);
    if (!node?.bubble) return;
    playerController.current?.pause();
    useEditorStore.getState().setEditingBubble(nodeId);
  };

  const selectedNodes = sceneDoc?.nodes.filter((n) => selectedNodeIds.includes(n.id)) ?? [];
  const groupIdsInSelection = new Set(selectedNodes.filter((n) => n.groupId).map((n) => n.groupId!));
  // 선택 전체가 이미 같은 그룹 하나면 다시 묶을 필요가 없다
  const isSingleWholeGroup =
    selectedNodes.length >= 2 && groupIdsInSelection.size === 1 && selectedNodes.every((n) => n.groupId);
  const canGroup = selectedNodes.length >= 2 && !isSingleWholeGroup;
  const canUngroup = selectedNodes.some((n) => n.groupId);

  const primaryRect = selectedNodeId ? (selectionRects[selectedNodeId] ?? null) : null;
  const rects = Object.entries(selectionRects);
  const unionRect: Rect | null =
    rects.length > 0
      ? rects.reduce<Rect>(
          (acc, [, r]) => {
            const x = Math.min(acc.x, r.x);
            const y = Math.min(acc.y, r.y);
            return {
              x,
              y,
              w: Math.max(acc.x + acc.w, r.x + r.w) - x,
              h: Math.max(acc.y + acc.h, r.y + r.h) - y,
            };
          },
          { ...rects[0]![1] },
        )
      : null;

  return (
    <div
      className="canvas-overlay"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
    >
      {rects.map(([id, r]) => (
        <div
          key={id}
          className={id === selectedNodeId ? 'selection-rect' : 'selection-rect selection-rect--secondary'}
          style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
        />
      ))}
      {primaryRect && selectedNodeIds.length === 1 && !editingBubbleId &&
        HANDLES.map((dir) => (
          <div
            key={dir}
            className="resize-handle"
            data-corner={dir}
            style={{
              left: dir.includes('w')
                ? primaryRect.x
                : dir.includes('e')
                  ? primaryRect.x + primaryRect.w
                  : primaryRect.x + primaryRect.w / 2,
              top: dir.includes('n')
                ? primaryRect.y
                : dir.includes('s')
                  ? primaryRect.y + primaryRect.h
                  : primaryRect.y + primaryRect.h / 2,
            }}
            onPointerDown={(e) => startResize(e, dir)}
          />
        ))}
      {unionRect && selectedNodes.length > 0 && !editingBubbleId && (
        <div
          className="group-toolbar"
          style={{ left: unionRect.x + unionRect.w / 2, top: Math.max(8, unionRect.y - 40) }}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {selectedNodeId && (
            <>
              <button
                className="group-toolbar-btn group-toolbar-btn--quiet"
                title="클릭한 파츠를 겹쳐 있는 이미지 뒤로 (그룹이어도 이 파츠만)"
                onClick={() => useEditorStore.getState().moveNodeDepth(selectedNodeId, -1)}
              >
                ⬇ 뒤로
              </button>
              <button
                className="group-toolbar-btn group-toolbar-btn--quiet"
                title="클릭한 파츠를 겹쳐 있는 이미지 앞으로 (그룹이어도 이 파츠만)"
                onClick={() => useEditorStore.getState().moveNodeDepth(selectedNodeId, 1)}
              >
                ⬆ 앞으로
              </button>
            </>
          )}
          {canGroup && (
            <button className="group-toolbar-btn" onClick={() => useEditorStore.getState().groupSelectedNodes()}>
              🔗 묶기 ({selectedNodes.length})
            </button>
          )}
          {canUngroup && (
            <button className="group-toolbar-btn" onClick={() => useEditorStore.getState().ungroupSelectedNodes()}>
              해제
            </button>
          )}
        </div>
      )}
      {marqueeRect && (
        <div
          className="marquee-rect"
          style={{ left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.w, height: marqueeRect.h }}
        />
      )}
      {editingNode?.bubble && editingBubbleId === selectedNodeId && primaryRect && primaryRect.w > 0 && (
        <BubbleTextEditor
          key={editingBubbleId}
          nodeId={editingBubbleId!}
          spec={editingNode.bubble}
          rect={primaryRect}
        />
      )}
    </div>
  );
};

/**
 * 말풍선 본체 위에 겹쳐지는 텍스트 입력창.
 * rect는 화면 좌표라 노드 스케일·캔버스 축소가 이미 반영되어 있고,
 * 글자 크기도 같은 비율로 맞춰 "말풍선 안에서 바로 쓰는" 느낌을 만든다.
 * Enter 확정, Shift+Enter 줄바꿈, Esc 취소, 바깥 클릭(blur) 확정.
 */
const BubbleTextEditor: React.FC<{
  nodeId: string;
  spec: BubbleSpec;
  rect: { x: number; y: number; w: number; h: number };
}> = ({ nodeId, spec, rect }) => {
  // 언마운트 시점에는 DOM ref가 이미 비워져 있으므로, 최신 입력값을 항상 여기에 보관한다
  const valueRef = useRef(spec.text);
  const cancelRef = useRef(false);
  const doneRef = useRef(false);
  const layout = layoutBubble(spec);
  const metrics = layout.metrics;
  const ratio = rect.w / layout.width;

  const commit = (value: string) => {
    const store = useEditorStore.getState();
    const node = store.document?.nodes.find((n) => n.id === nodeId);
    const trimmed = value.trim();
    if (node?.bubble && trimmed !== node.bubble.text) store.updateBubble(nodeId, { text: trimmed });
  };

  const finish = (text: string | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    useEditorStore.getState().setEditingBubble(null);
    if (text !== null) commit(text);
  };

  // 다른 노드 선택 등으로 blur 없이 언마운트되어도 입력이 사라지지 않게 커밋
  useEffect(() => {
    return () => {
      if (!doneRef.current && !cancelRef.current) {
        commit(valueRef.current);
      }
    };
    // nodeId는 key로 고정되어 인스턴스 수명 동안 변하지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <textarea
      className="bubble-editor"
      style={{
        left: rect.x + layout.body.x * ratio,
        top: rect.y + layout.body.y * ratio,
        width: layout.body.width * ratio,
        height: layout.body.height * ratio,
        fontSize: metrics.fontSize * ratio,
        lineHeight: `${metrics.lineHeight * ratio}px`,
        borderRadius: metrics.cornerRadius * ratio,
        fontFamily: `'${spec.fontFamily}', sans-serif`,
      }}
      defaultValue={spec.text}
      autoFocus
      placeholder="문구 입력"
      onChange={(e) => {
        valueRef.current = e.target.value;
      }}
      onFocus={(e) => e.currentTarget.select()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          cancelRef.current = true;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const cancelled = cancelRef.current;
        cancelRef.current = false;
        finish(cancelled ? null : e.currentTarget.value);
      }}
    />
  );
};
