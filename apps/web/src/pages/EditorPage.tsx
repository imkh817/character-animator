import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { getProject, listAssets, saveScene } from '../api/endpoints';
import { useEditorStore } from '../stores/editorStore';
import { AssetsPanel } from '../editor/AssetsPanel';
import { BubblePanel } from '../editor/BubblePanel';
import { CanvasPanel } from '../editor/CanvasPanel';
import { LayersPanel } from '../editor/LayersPanel';
import { PropertiesPanel } from '../editor/PropertiesPanel';
import { Timeline } from '../editor/Timeline';
import { TopBar } from '../editor/TopBar';

const AUTOSAVE_DELAY_MS = 1200;

export const EditorPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const loaded = useEditorStore((s) => s.projectId === projectId && s.document !== null);
  const revision = useEditorStore((s) => s.revision);
  const saveState = useEditorStore((s) => s.saveState);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<'assets' | 'bubbles'>('assets');

  // 프로젝트 로드
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const [detail, assets] = await Promise.all([getProject(projectId), listAssets(projectId)]);
        if (!cancelled) useEditorStore.getState().loadProject(detail, assets);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof ApiError ? e.message : '프로젝트를 불러오지 못했습니다.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Autosave: 문서가 바뀌면(revision 증가) 디바운스 후 문서 전체를 PUT
  useEffect(() => {
    if (revision === 0) return;
    const timer = setTimeout(async () => {
      const s = useEditorStore.getState();
      if (!s.projectId || !s.document || s.saveState === 'conflict' || s.saveState === 'saving') return;
      s.markSaving();
      try {
        const result = await saveScene(s.projectId, s.savedVersion, s.document);
        useEditorStore.getState().markSaved(result.version);
        // 저장하는 동안 또 편집됐다면 dirty 유지 (다음 revision 타이머가 이미 걸려 있다)
        if (useEditorStore.getState().revision !== revision) {
          useEditorStore.setState({ saveState: 'dirty' });
        }
      } catch (e) {
        useEditorStore.getState().markSaveFailed(e instanceof ApiError && e.status === 409);
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [revision]);

  // 단축키: Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z redo, Delete/Backspace 선택 노드 삭제
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useEditorStore.getState().redo();
        else useEditorStore.getState().undo();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.metaKey && !e.ctrlKey) {
        const s = useEditorStore.getState();
        if (s.selectedNodeIds.length > 0) {
          e.preventDefault();
          s.deleteSelectedNodes();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loadError) {
    return (
      <div className="atelier">
        <div className="auth-card">
          <div className="error-text">{loadError}</div>
        </div>
      </div>
    );
  }
  if (!loaded) {
    return null;
  }

  return (
    <div className="editor">
      <TopBar />
      {saveState === 'conflict' && (
        <div className="conflict-banner">
          다른 곳에서 이 프로젝트가 수정되었습니다. 이 화면의 변경사항은 저장되지 않습니다.
          <button className="btn" onClick={() => window.location.reload()}>
            최신 버전 불러오기
          </button>
        </div>
      )}
      <div className="editor-main">
        <div className="side-panel">
          <div className="panel-tabs">
            <button className="panel-tab" data-active={leftTab === 'assets'} onClick={() => setLeftTab('assets')}>
              이미지
            </button>
            <button className="panel-tab" data-active={leftTab === 'bubbles'} onClick={() => setLeftTab('bubbles')}>
              말풍선
            </button>
          </div>
          {leftTab === 'assets' ? <AssetsPanel /> : <BubblePanel />}
          <LayersPanel />
        </div>
        <CanvasPanel />
        <div className="side-panel side-panel--right">
          <PropertiesPanel />
        </div>
      </div>
      <Timeline />
    </div>
  );
};
