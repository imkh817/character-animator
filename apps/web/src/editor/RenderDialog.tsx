import React, { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { getRenderJob, requestRender, saveScene } from '../api/endpoints';
import type { OutputFormat, RenderJobResponse } from '../api/types';
import { useEditorStore } from '../stores/editorStore';

const POLL_INTERVAL_MS = 2000;

export const RenderDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [format, setFormat] = useState<OutputFormat>('MP4');
  const [job, setJob] = useState<RenderJobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      const s = useEditorStore.getState();
      // 렌더는 서버에 저장된 문서를 스냅샷한다 — 미저장 변경이 있으면 먼저 밀어넣는다
      if (s.saveState !== 'saved' && s.projectId && s.document) {
        const result = await saveScene(s.projectId, s.savedVersion, s.document);
        s.markSaved(result.version);
        useEditorStore.setState({ saveState: 'saved' });
      }
      setJob(await requestRender(s.projectId!, format));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '렌더 요청에 실패했습니다.');
    } finally {
      setStarting(false);
    }
  };

  // 진행 중이면 폴링
  useEffect(() => {
    if (!job || job.status === 'COMPLETED' || job.status === 'FAILED') return;
    const timer = setInterval(async () => {
      try {
        setJob(await getRenderJob(job.id));
      } catch {
        /* 다음 폴링에서 재시도 */
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [job]);

  const inProgress = job !== null && (job.status === 'PENDING' || job.status === 'PROCESSING');

  return (
    <div className="dialog-backdrop" onClick={inProgress ? undefined : onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>영상 만들기</h2>

        {!job && (
          <>
            <div className="prop-row" style={{ gridTemplateColumns: '52px 1fr' }}>
              <label>포맷</label>
              <select value={format} onChange={(e) => setFormat(e.target.value as OutputFormat)}>
                <option value="MP4">MP4 (H.264)</option>
                <option value="WEBM">WebM</option>
                <option value="GIF">GIF</option>
              </select>
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn btn--primary" onClick={() => void start()} disabled={starting} style={{ justifyContent: 'center' }}>
              {starting ? '요청 중…' : '렌더 시작'}
            </button>
          </>
        )}

        {job && (
          <>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${job.progress}%` }} />
            </div>
            <div className="save-indicator" data-state={job.status === 'FAILED' ? 'error' : 'saved'}>
              <span className="dot" />
              {job.status === 'PENDING' && '렌더 서버 대기 중…'}
              {job.status === 'PROCESSING' && `렌더링 중 ${job.progress}%`}
              {job.status === 'COMPLETED' && '완료!'}
              {job.status === 'FAILED' && `실패: ${job.errorMessage ?? '알 수 없는 오류'}`}
            </div>
            {job.status === 'COMPLETED' && job.downloadUrl && (
              <a className="btn btn--primary" href={job.downloadUrl} download style={{ justifyContent: 'center', textDecoration: 'none' }}>
                ⬇ {job.outputFormat} 다운로드
              </a>
            )}
          </>
        )}

        <button className="btn btn--ghost" onClick={onClose} disabled={inProgress} style={{ justifyContent: 'center' }}>
          {inProgress ? '렌더 중에는 닫을 수 없습니다' : '닫기'}
        </button>
      </div>
    </div>
  );
};
