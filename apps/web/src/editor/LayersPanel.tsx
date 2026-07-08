import React from 'react';
import { useEditorStore } from '../stores/editorStore';

export const LayersPanel: React.FC = () => {
  const document = useEditorStore((s) => s.document)!;
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const selectNode = useEditorStore((s) => s.selectNode);
  const setNodeVisible = useEditorStore((s) => s.setNodeVisible);
  const moveLayer = useEditorStore((s) => s.moveLayer);
  const deleteNode = useEditorStore((s) => s.deleteNode);

  // 배열 순서 = 렌더 순서(앞 = 아래). 목록은 위 레이어부터 보여준다.
  const layers = [...document.nodes].reverse();

  return (
    <div className="panel-section" style={{ flex: 1 }}>
      <div className="panel-section-head">
        <span className="panel-label">레이어</span>
      </div>
      {layers.length === 0 && <div className="empty-hint">파츠를 추가하면 여기에 나타납니다.</div>}
      {layers.map((node) => (
        <div
          key={node.id}
          className="layer-row"
          data-selected={node.id === selectedNodeId}
          onClick={() => selectNode(node.id)}
        >
          <button
            className="icon-btn"
            data-active={node.visible}
            title={node.visible ? '숨기기' : '보이기'}
            onClick={(e) => {
              e.stopPropagation();
              setNodeVisible(node.id, !node.visible);
            }}
          >
            {node.visible ? '●' : '○'}
          </button>
          <span className="row-name" style={{ opacity: node.visible ? 1 : 0.45 }}>
            {node.name}
            {node.parentId && <span style={{ color: 'var(--text-faint)' }}> ↳</span>}
          </span>
          <span className="row-actions">
            <button
              className="icon-btn"
              title="한 층 위로"
              onClick={(e) => {
                e.stopPropagation();
                moveLayer(node.id, 1);
              }}
            >
              ↑
            </button>
            <button
              className="icon-btn"
              title="한 층 아래로"
              onClick={(e) => {
                e.stopPropagation();
                moveLayer(node.id, -1);
              }}
            >
              ↓
            </button>
            <button
              className="icon-btn"
              title="레이어 삭제"
              onClick={(e) => {
                e.stopPropagation();
                deleteNode(node.id);
              }}
            >
              ✕
            </button>
          </span>
        </div>
      ))}
    </div>
  );
};
