import { CharacterScene } from '@charanim/animation-core';
import { Player, type PlayerRef } from '@remotion/player';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { CanvasOverlay } from './CanvasOverlay';
import { playerController } from './playerController';
import { useAssetUpload } from './useAssetUpload';

/**
 * 캔버스 = @remotion/player. 최종 렌더와 문자 그대로 같은 컴포넌트(CharacterScene)를
 * 그리므로 미리보기와 결과물이 어긋날 수 없다.
 *
 * 프레임 동기화 규칙: 재생 중에는 Player가 진실(frameupdate → store),
 * 정지 중에는 store가 진실(currentFrame → seekTo).
 */
export const CanvasPanel: React.FC = () => {
  const document = useEditorStore((s) => s.document)!;
  const assets = useEditorStore((s) => s.assets);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const playing = useEditorStore((s) => s.playing);

  const playerRef = useRef<PlayerRef>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });
  const [dragOver, setDragOver] = useState(false);
  const { uploading, error, uploadFiles } = useAssetUpload();

  const assetUrls = useMemo(
    () =>
      Object.fromEntries(
        assets.filter((a) => a.downloadUrl !== null).map((a) => [a.id, a.downloadUrl!]),
      ),
    [assets],
  );

  const inputProps = useMemo(() => ({ document, assetUrls }), [document, assetUrls]);

  // Player 이벤트 구독
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    playerController.current = player;

    const store = useEditorStore.getState;
    const onFrame = (e: { detail: { frame: number } }) => {
      if (store().playing) store().setFrame(e.detail.frame);
    };
    const onPlay = () => store().setPlaying(true);
    const onPause = () => {
      store().setPlaying(false);
      store().setFrame(player.getCurrentFrame());
    };

    player.addEventListener('frameupdate', onFrame);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    return () => {
      player.removeEventListener('frameupdate', onFrame);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
      playerController.current = null;
    };
  }, []);

  // 정지 상태에서 타임라인 스크럽 → Player를 따라 움직인다
  useEffect(() => {
    if (!playing) {
      playerRef.current?.seekTo(currentFrame);
    }
  }, [currentFrame, playing]);

  // 캔버스 영역에 맞춰 축소 표시
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setAreaSize({ width: entry!.contentRect.width, height: entry!.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { width, height, fps, durationInFrames } = document.settings;
  const scale = Math.min(
    1,
    areaSize.width > 0 ? (areaSize.width - 48) / width : 1,
    areaSize.height > 0 ? (areaSize.height - 48) / height : 1,
  );

  // OS에서 끌어온 파일을 캔버스에 놓으면 그 위치에 노드로 추가
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const stage = stageRef.current;
    let position: { x: number; y: number } | undefined;
    if (stage && scale > 0) {
      const box = stage.getBoundingClientRect();
      position = {
        x: Math.max(0, Math.min(width, (e.clientX - box.left) / scale)),
        y: Math.max(0, Math.min(height, (e.clientY - box.top) / scale)),
      };
    }
    void uploadFiles(e.dataTransfer.files, position);
  };

  return (
    <div
      className={`canvas-area${dragOver ? ' canvas-area--dragover' : ''}`}
      ref={areaRef}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      {document.nodes.length === 0 && !dragOver && (
        <div className="canvas-empty-hint">
          왼쪽에서 이미지를 업로드하거나
          <br />
          여기에 파일을 끌어다 놓으세요.
        </div>
      )}
      {dragOver && <div className="canvas-drop-hint">놓으면 캔버스에 추가됩니다</div>}
      {uploading && <div className="canvas-upload-badge">업로드 중…</div>}
      {error && <div className="canvas-upload-badge canvas-upload-badge--error">{error}</div>}
      <div
        ref={stageRef}
        style={{ position: 'relative', width: width * scale, height: height * scale }}
      >
        <Player
          ref={playerRef}
          component={CharacterScene}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          fps={fps}
          compositionWidth={width}
          compositionHeight={height}
          style={{ width: '100%', height: '100%' }}
          className="canvas-frame"
          loop
          clickToPlay={false}
          controls={false}
          acknowledgeRemotionLicense
        />
        <CanvasOverlay stageRef={stageRef} scale={scale} />
      </div>
    </div>
  );
};
