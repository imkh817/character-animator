import {
  getLocalTransform,
  getWorldMatrix,
  IDENTITY_MAT,
  invertLinear,
  transformVector,
  type Mat2D,
} from '@charanim/animation-core';
import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { playerController } from './playerController';

interface DragState {
  pointerId: number;
  nodeId: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  /** 화면 delta → 부모 공간 delta 변환용 (부모 월드 행렬의 역) */
  invParent: Pick<Mat2D, 'a' | 'b' | 'c' | 'd'>;
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
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // 선택 외곽선: Player가 실제로 그린 요소의 위치를 매 프레임 읽는다 (재생 중에도 따라감)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const stage = stageRef.current;
      if (stage && selectedNodeId) {
        const nodeEl = stage.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(selectedNodeId)}"]`);
        const imgEl = nodeEl?.querySelector('img') ?? nodeEl;
        if (imgEl) {
          const stageBox = stage.getBoundingClientRect();
          const box = imgEl.getBoundingClientRect();
          setSelectionRect({
            x: box.left - stageBox.left,
            y: box.top - stageBox.top,
            w: box.width,
            h: box.height,
          });
        } else {
          setSelectionRect(null);
        }
      } else {
        setSelectionRect(null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selectedNodeId, stageRef]);

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
    store.selectNode(nodeId);
    if (!nodeId || !store.document) return;

    const doc = store.document;
    const node = doc.nodes.find((n) => n.id === nodeId);
    if (!node || node.locked) return;

    const frame = store.currentFrame;
    const local = getLocalTransform(node, doc.animations[nodeId], frame);
    const parentWorld = node.parentId ? getWorldMatrix(doc, node.parentId, frame) : IDENTITY_MAT;
    const invParent = invertLinear(parentWorld);
    if (!invParent) return;

    store.beginHistoryEntry(); // 드래그 전체가 undo 한 단위
    dragRef.current = {
      pointerId: e.pointerId,
      nodeId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: local.x,
      startY: local.y,
      invParent,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    // 화면 px → 캔버스 px → (부모가 회전/스케일돼 있어도 정확하게) 부모 공간 px
    const canvasDx = (e.clientX - drag.startClientX) / scale;
    const canvasDy = (e.clientY - drag.startClientY) / scale;
    const parentDelta = transformVector(drag.invParent, canvasDx, canvasDy);
    useEditorStore.getState().dragProperties(drag.nodeId, {
      x: Math.round(drag.startX + parentDelta.x),
      y: Math.round(drag.startY + parentDelta.y),
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  return (
    <div
      className="canvas-overlay"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {selectionRect && (
        <div
          className="selection-rect"
          style={{
            left: selectionRect.x,
            top: selectionRect.y,
            width: selectionRect.w,
            height: selectionRect.h,
          }}
        />
      )}
    </div>
  );
};
