import { ANIMATABLE_PROPERTIES } from '@charanim/animation-core';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { playerController } from './playerController';

const PROPERTY_LABEL: Record<string, string> = {
  x: 'X',
  y: 'Y',
  rotation: '회전',
  scaleX: '배율 X',
  scaleY: '배율 Y',
  opacity: '불투명',
};

export const Timeline: React.FC = () => {
  const advancedMode = useEditorStore((s) => s.advancedMode);
  return advancedMode ? <AdvancedTimeline /> : <SimpleTransport />;
};

/** 기본 모드: 유튜브식 재생 바. 프레임/키프레임 개념이 등장하지 않는다. */
const SimpleTransport: React.FC = () => {
  const document = useEditorStore((s) => s.document)!;
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const playing = useEditorStore((s) => s.playing);
  const store = useEditorStore.getState;

  const { durationInFrames, fps } = document.settings;
  const barRef = useRef<HTMLDivElement>(null);

  const scrubTo = (clientX: number) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    store().setFrame(Math.round(ratio * (durationInFrames - 1)));
  };

  const progress = durationInFrames > 1 ? currentFrame / (durationInFrames - 1) : 0;
  const durationSeconds = durationInFrames / fps;

  return (
    <div className="timeline timeline--simple">
      <button
        className="btn"
        onClick={() => (playing ? playerController.current?.pause() : playerController.current?.play())}
        style={{ width: 38, justifyContent: 'center' }}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <div
        ref={barRef}
        className="scrub-bar"
        onPointerDown={(e) => {
          playerController.current?.pause();
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          scrubTo(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) scrubTo(e.clientX);
        }}
      >
        <div className="scrub-fill" style={{ width: `${progress * 100}%` }} />
        <div className="scrub-handle" style={{ left: `${progress * 100}%` }} />
      </div>
      <span className="timecode">
        {(currentFrame / fps).toFixed(1)}s / {durationSeconds.toFixed(1)}s
      </span>
      <label className="panel-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        길이
        <input
          type="number"
          min={1}
          max={60}
          step={0.5}
          value={Math.round(durationSeconds * 2) / 2}
          onChange={(e) => {
            const seconds = Number(e.target.value);
            if (Number.isFinite(seconds) && seconds > 0) {
              store().updateSettings({ durationInFrames: Math.max(2, Math.round(seconds * fps)) });
            }
          }}
          style={{ width: 56 }}
        />
        초
      </label>
      <button className="btn btn--ghost" onClick={() => store().setAdvancedMode(true)}>
        ⚙ 타임라인 편집 (고급)
      </button>
    </div>
  );
};

/** 고급 모드: 키프레임 타임라인. ◆의 의미를 그 자리에서 설명한다. */
const AdvancedTimeline: React.FC = () => {
  const document = useEditorStore((s) => s.document)!;
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const playing = useEditorStore((s) => s.playing);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const store = useEditorStore.getState;

  const { durationInFrames, fps } = document.settings;
  const node = document.nodes.find((n) => n.id === selectedNodeId);
  const animations = node ? document.animations[node.id] : undefined;

  const tracksRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    const el = tracksRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setTrackWidth(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pxPerFrame = trackWidth > 0 ? trackWidth / durationInFrames : 0;

  const scrubTo = useCallback(
    (clientX: number) => {
      const el = tracksRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      store().setFrame(Math.round(ratio * (durationInFrames - 1)));
    },
    [durationInFrames],
  );

  const tickStep = [1, 5, 10, 15, 30, 60, 150, 300].find((s) => s * pxPerFrame >= 56) ?? 300;
  const ticks: number[] = [];
  for (let f = 0; f < durationInFrames; f += tickStep) ticks.push(f);

  return (
    <div className="timeline">
      <div className="timeline-toolbar">
        <button
          className="btn btn--ghost"
          onClick={() => (playing ? playerController.current?.pause() : playerController.current?.play())}
          style={{ width: 34, justifyContent: 'center' }}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <span className="timecode">
          f{String(currentFrame).padStart(3, '0')} · {(currentFrame / fps).toFixed(2)}s
        </span>
        <span className="panel-label">
          {durationInFrames}f / {fps}fps
        </span>
        <span className="timeline-legend">
          <span className="diamond-inline" /> 키프레임 = 그 순간의 값 기록. 두 키프레임 사이는 자동으로
          부드럽게 이어집니다. 눈금을 클릭해 시간을 옮기세요.
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn btn--ghost" onClick={() => store().setAdvancedMode(false)}>
          간단히 보기
        </button>
      </div>
      <div className="timeline-body">
        <div className="track-labels">
          <div className="track-label track-label--head" style={{ height: 24 }}>
            {node ? node.name : '—'}
          </div>
          {node &&
            ANIMATABLE_PROPERTIES.map((property) => (
              <div className="track-label" key={property}>
                {PROPERTY_LABEL[property]}
                {(animations?.[property]?.length ?? 0) > 0 && (
                  <span style={{ color: 'var(--amber)', marginLeft: 6 }}>◆{animations![property]!.length}</span>
                )}
              </div>
            ))}
          {!node && <div className="empty-hint">레이어를 선택하면 속성 트랙이 표시됩니다.</div>}
        </div>
        <div
          className="tracks"
          ref={tracksRef}
          onPointerDown={(e) => {
            playerController.current?.pause();
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            scrubTo(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) scrubTo(e.clientX);
          }}
        >
          <div className="ruler">
            {ticks.map((f) => (
              <div className="tick" key={f} style={{ left: f * pxPerFrame }}>
                {f}
              </div>
            ))}
          </div>
          {node &&
            ANIMATABLE_PROPERTIES.map((property) => (
              <div className="track" key={property}>
                {animations?.[property]?.map((kf) => (
                  <div
                    key={kf.frame}
                    className="keyframe-dot"
                    style={{ left: (kf.frame + 0.5) * pxPerFrame }}
                    title={`f${kf.frame} = ${Math.round(kf.value * 100) / 100} (더블클릭: 삭제)`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => store().setFrame(kf.frame)}
                    onDoubleClick={() => {
                      store().setFrame(kf.frame);
                      store().toggleKeyframe(node.id, property);
                    }}
                  />
                ))}
              </div>
            ))}
          <div className="playhead" style={{ left: (currentFrame + 0.5) * pxPerFrame }} />
        </div>
      </div>
    </div>
  );
};
