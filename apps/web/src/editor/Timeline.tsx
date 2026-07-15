import { ANIMATABLE_PROPERTIES, blockRanges, getPreset } from '@charanim/animation-core';
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
  return advancedMode ? <AdvancedTimeline /> : <StoryboardTimeline />;
};

/**
 * 장면 길이(초) 입력. 스피너 없는 일반 텍스트 입력으로, 편집 중에는 로컬 문자열을
 * 유지하다가 blur/Enter에 커밋한다 — 지우고 새로 타이핑할 수 있다.
 */
const SceneDurationInput: React.FC<{
  seconds: number;
  onCommit: (seconds: number) => void;
}> = ({ seconds, onCommit }) => {
  const [text, setText] = useState(String(seconds));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(seconds));
  }, [seconds, focused]);

  const commit = () => {
    setFocused(false);
    const parsed = Number(text);
    if (Number.isFinite(parsed) && parsed > 0) {
      onCommit(Math.min(60, parsed));
    } else {
      setText(String(seconds)); // 빈 값/이상한 값이면 원래대로
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={(e) => {
        setFocused(true);
        e.target.select(); // 클릭하자마자 전체 선택 → 바로 덮어쓰기
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
};

/**
 * 기본 모드: 스토리보드. 영상을 "장면"의 나열로 편집한다 — 프레임/키프레임 개념이
 * 등장하지 않고, 각 장면의 연출(프리셋/숨김)은 속성 패널에서 고른다.
 */
const StoryboardTimeline: React.FC = () => {
  const document = useEditorStore((s) => s.document)!;
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const playing = useEditorStore((s) => s.playing);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const store = useEditorStore.getState;

  const { durationInFrames, fps } = document.settings;
  const storyboard = document.storyboard;
  const barRef = useRef<HTMLDivElement>(null);

  const scrubTo = (clientX: number) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    store().setFrame(Math.round(ratio * (durationInFrames - 1)));
  };

  const progress = durationInFrames > 1 ? currentFrame / (durationInFrames - 1) : 0;
  const ranges = storyboard ? blockRanges(storyboard) : [];

  return (
    <div className="timeline timeline--storyboard">
      <div className="timeline--simple" style={{ height: 46 }}>
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
          {(currentFrame / fps).toFixed(1)}s / {(durationInFrames / fps).toFixed(1)}s
        </span>
        <span className="timeline-legend">
          장면을 고르고 파츠를 클릭하면, 오른쪽에서 그 장면의 움직임을 고를 수 있어요.
        </span>
        <button className="btn btn--ghost" onClick={() => store().setAdvancedMode(true)}>
          ⚙ 타임라인 편집 (고급)
        </button>
      </div>
      {storyboard && (
        <div className="storyboard-strip">
          {storyboard.blocks.map((block, i) => {
            const range = ranges[i]!;
            const end = range.start + range.durationInFrames - 1;
            const playingHere = currentFrame >= range.start && currentFrame <= end;
            const emojis = [
              ...new Set(
                Object.values(block.nodes).flatMap(
                  (state) => state.presetIds?.map((id) => getPreset(id)?.emoji ?? '').filter(Boolean) ?? [],
                ),
              ),
            ];
            const hiddenCount = Object.values(block.nodes).filter((s) => s.hidden).length;
            return (
              <div
                key={block.id}
                className="scene-card"
                data-active={block.id === selectedBlockId}
                onClick={() => {
                  playerController.current?.pause();
                  store().selectBlock(block.id);
                }}
              >
                {playingHere && (
                  <div
                    className="scene-card-progress"
                    style={{ width: `${((currentFrame - range.start + 1) / range.durationInFrames) * 100}%` }}
                  />
                )}
                <div className="scene-card-head">
                  <span className="scene-card-title">장면 {i + 1}</span>
                  <span className="row-actions">
                    <button
                      className="icon-btn"
                      title="앞으로"
                      onClick={(e) => {
                        e.stopPropagation();
                        store().moveBlock(block.id, -1);
                      }}
                    >
                      ←
                    </button>
                    <button
                      className="icon-btn"
                      title="뒤로"
                      onClick={(e) => {
                        e.stopPropagation();
                        store().moveBlock(block.id, 1);
                      }}
                    >
                      →
                    </button>
                    {storyboard.blocks.length > 1 && (
                      <button
                        className="icon-btn"
                        title="장면 삭제"
                        onClick={(e) => {
                          e.stopPropagation();
                          store().deleteBlock(block.id);
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </div>
                <div className="scene-card-summary">
                  {emojis.length > 0 ? emojis.join(' ') : <span className="scene-card-empty">연출 없음</span>}
                  {hiddenCount > 0 && <span title={`숨긴 파츠 ${hiddenCount}개`}> 🙈{hiddenCount}</span>}
                </div>
                <label className="scene-card-duration" onClick={(e) => e.stopPropagation()}>
                  <SceneDurationInput
                    seconds={Math.round((range.durationInFrames / fps) * 10) / 10}
                    onCommit={(seconds) => store().setBlockDuration(block.id, Math.round(seconds * fps))}
                  />
                  초
                </label>
              </div>
            );
          })}
          <button className="scene-card scene-card--add" onClick={() => store().addBlock()}>
            + 장면 추가
          </button>
        </div>
      )}
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
