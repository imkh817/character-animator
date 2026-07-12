import { BubbleView, type BubbleShape } from '@charanim/animation-core';
import React from 'react';
import { useEditorStore } from '../stores/editorStore';
import { BUBBLE_SHAPES, DEFAULT_BUBBLE_SPEC } from './bubblePresets';

/** 말풍선 팔레트: 모양을 고르면 캔버스에 추가되고 바로 문구 입력이 열린다 */
export const BubblePanel: React.FC = () => {
  const addBubble = (shape: BubbleShape) => {
    const store = useEditorStore.getState();
    store.addBubbleNode({ ...DEFAULT_BUBBLE_SPEC, shape });
    const newNodeId = useEditorStore.getState().selectedNodeId;
    if (newNodeId) useEditorStore.getState().setEditingBubble(newNodeId);
  };

  return (
    <div className="panel-section">
      <span className="panel-label">말풍선</span>
      <div className="bubble-grid">
        {BUBBLE_SHAPES.map(({ shape, label }) => (
          <button key={shape} className="bubble-chip" onClick={() => addBubble(shape)} title={`${label} 말풍선 추가`}>
            <span className="bubble-thumb">
              <BubbleView spec={{ ...DEFAULT_BUBBLE_SPEC, text: '안녕!', shape }} />
            </span>
            {label}
          </button>
        ))}
      </div>
      <div className="empty-hint">누르면 캔버스에 추가되고 바로 문구를 입력할 수 있어요.</div>
    </div>
  );
};
