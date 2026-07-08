import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEditorStore, type SaveState } from '../stores/editorStore';
import { RenderDialog } from './RenderDialog';

const SAVE_LABEL: Record<SaveState, string> = {
  saved: '저장됨',
  dirty: '변경됨',
  saving: '저장 중…',
  conflict: '충돌',
  error: '저장 실패',
};

export const TopBar: React.FC = () => {
  const title = useEditorStore((s) => s.title);
  const saveState = useEditorStore((s) => s.saveState);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const store = useEditorStore.getState;
  const [renderOpen, setRenderOpen] = useState(false);

  return (
    <div className="topbar">
      <Link to="/projects" className="btn btn--ghost" style={{ textDecoration: 'none' }}>
        ←
      </Link>
      <div className="logotype" style={{ fontSize: 12 }}>
        CHAR<span className="tick">◆</span>ANIM
      </div>
      <strong>{title}</strong>
      <span className="save-indicator" data-state={saveState}>
        <span className="dot" />
        {SAVE_LABEL[saveState]}
      </span>
      <div className="spacer" />
      <button className="btn btn--ghost" disabled={!canUndo} onClick={() => store().undo()} title="⌘Z">
        ↶ 실행취소
      </button>
      <button className="btn btn--ghost" disabled={!canRedo} onClick={() => store().redo()} title="⇧⌘Z">
        ↷ 다시실행
      </button>
      <button className="btn btn--primary" onClick={() => setRenderOpen(true)}>
        영상 만들기
      </button>
      {renderOpen && <RenderDialog onClose={() => setRenderOpen(false)} />}
    </div>
  );
};
