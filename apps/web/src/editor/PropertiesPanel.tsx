import {
  ANIMATABLE_PROPERTIES,
  ANIMATION_PRESETS,
  getLocalTransform,
  type AnimatableProperty,
} from '@charanim/animation-core';
import React, { useEffect, useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { BUBBLE_FONTS, BUBBLE_SHAPES } from './bubblePresets';
import { playerController } from './playerController';

const PROPERTY_META: Record<AnimatableProperty, { label: string; step: number }> = {
  x: { label: 'X', step: 1 },
  y: { label: 'Y', step: 1 },
  rotation: { label: '회전°', step: 1 },
  scaleX: { label: '배율 X', step: 0.05 },
  scaleY: { label: '배율 Y', step: 0.05 },
  opacity: { label: '불투명', step: 0.05 },
};

/** blur/Enter 시점에 커밋하는 숫자 입력. 편집 중에는 로컬 문자열을 유지한다. */
const NumberInput: React.FC<{
  value: number;
  step: number;
  onCommit: (value: number) => void;
}> = ({ value, step, onCommit }) => {
  const [text, setText] = useState(String(round3(value)));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(round3(value)));
  }, [value, focused]);

  const commit = () => {
    const parsed = Number(text);
    if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
    setFocused(false);
  };

  return (
    <input
      type="number"
      step={step}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = Number(e.target.value);
        // 스피너(위/아래 화살표) 조작은 즉시 반영해 캔버스로 확인할 수 있게 한다
        if (e.target.value !== '' && Number.isFinite(parsed)) onCommit(parsed);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const PropertiesPanel: React.FC = () => {
  const document = useEditorStore((s) => s.document)!;
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const advancedMode = useEditorStore((s) => s.advancedMode);
  const store = useEditorStore.getState;

  const node = document.nodes.find((n) => n.id === selectedNodeId);

  if (!node) {
    const { settings } = document;
    return (
      <div className="panel-section">
        <span className="panel-label">장면 설정</span>
        <div className="prop-row">
          <span />
          <label>너비</label>
          <NumberInput value={settings.width} step={10} onCommit={(v) => store().updateSettings({ width: v })} />
        </div>
        <div className="prop-row">
          <span />
          <label>높이</label>
          <NumberInput value={settings.height} step={10} onCommit={(v) => store().updateSettings({ height: v })} />
        </div>
        <div className="prop-row">
          <span />
          <label>FPS</label>
          <NumberInput value={settings.fps} step={1} onCommit={(v) => store().updateSettings({ fps: Math.max(1, Math.round(v)) })} />
        </div>
        <div className="prop-row">
          <span />
          <label>프레임</label>
          <NumberInput
            value={settings.durationInFrames}
            step={1}
            onCommit={(v) => store().updateSettings({ durationInFrames: Math.max(1, Math.round(v)) })}
          />
        </div>
        <div className="empty-hint">레이어를 선택하면 트랜스폼과 키프레임을 편집할 수 있습니다.</div>
      </div>
    );
  }

  const animations = document.animations[node.id];
  const transform = getLocalTransform(node, animations, currentFrame);
  const otherNodes = document.nodes.filter((n) => n.id !== node.id);

  return (
    <>
      <div className="panel-section">
        <span className="panel-label">노드</span>
        <input
          key={node.id}
          defaultValue={node.name}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== node.name) {
              store().renameNode(node.id, e.target.value.trim());
            }
          }}
        />
        {node.bubble && (
          <>
            <div className="prop-row">
              <span />
              <label>모양</label>
              <select
                value={node.bubble.shape ?? 'speech'}
                onChange={(e) =>
                  store().updateBubble(node.id, { shape: e.target.value as (typeof BUBBLE_SHAPES)[number]['shape'] })
                }
              >
                {BUBBLE_SHAPES.map((s) => (
                  <option key={s.shape} value={s.shape}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="prop-row">
              <span />
              <label>글꼴</label>
              <select
                value={node.bubble.fontFamily}
                onChange={(e) => store().updateBubble(node.id, { fontFamily: e.target.value })}
              >
                {BUBBLE_FONTS.map((font) => (
                  <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="prop-row">
              <span />
              <label>글자 크기</label>
              <NumberInput
                value={node.bubble.fontSize}
                step={2}
                onCommit={(v) =>
                  store().updateBubble(node.id, { fontSize: Math.max(10, Math.min(200, Math.round(v))) })
                }
              />
            </div>
            <button className="btn" onClick={() => store().setEditingBubble(node.id)}>
              💬 문구 수정
            </button>
          </>
        )}
        <div className="prop-row">
          <span />
          <label>부모</label>
          <select
            value={node.parentId ?? ''}
            onChange={(e) => store().setNodeParent(node.id, e.target.value || null)}
          >
            <option value="">(없음)</option>
            {otherNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
        <div className="prop-row">
          <span />
          <label>피벗 X</label>
          <NumberInput value={node.pivot.x} step={1} onCommit={(v) => store().setNodePivot(node.id, 'x', v)} />
        </div>
        <div className="prop-row">
          <span />
          <label>피벗 Y</label>
          <NumberInput value={node.pivot.y} step={1} onCommit={(v) => store().setNodePivot(node.id, 'y', v)} />
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-section-head">
          <span className="panel-label">애니메이션</span>
          {animations && Object.keys(animations).length > 0 && (
            <button className="icon-btn" onClick={() => store().clearNodeAnimation(node.id)}>
              지우기
            </button>
          )}
        </div>
        <div className="preset-grid">
          {ANIMATION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className="preset-chip"
              title={preset.description}
              onClick={() => {
                store().applyPreset(node.id, preset.id);
                playerController.current?.seekTo(0);
                playerController.current?.play();
              }}
            >
              <span className="preset-emoji">{preset.emoji}</span>
              {preset.label}
            </button>
          ))}
        </div>
        <div className="empty-hint">누르면 바로 재생됩니다. 겹쳐 쓸 수도 있어요 (숨쉬기 + 끄덕끄덕).</div>
      </div>

      <div className="panel-section">
        <div className="panel-section-head">
          <span className="panel-label">트랜스폼 · f{currentFrame}</span>
        </div>
        {ANIMATABLE_PROPERTIES.map((property) => {
          const keyframes = animations?.[property];
          const animated = (keyframes?.length ?? 0) > 0;
          const keyed = keyframes?.some((k) => k.frame === currentFrame) ?? false;
          const meta = PROPERTY_META[property];
          return (
            <div className={advancedMode ? 'prop-row' : 'prop-row prop-row--simple'} key={property}>
              {advancedMode && (
                <button
                  className="kf-toggle"
                  data-animated={animated}
                  data-keyed={keyed}
                  title={keyed ? '이 프레임의 키프레임 제거' : '이 프레임에 키프레임 추가'}
                  onClick={() => store().toggleKeyframe(node.id, property)}
                >
                  <span className="diamond" />
                </button>
              )}
              <label>{meta.label}</label>
              <NumberInput
                value={transform[property]}
                step={meta.step}
                onCommit={(v) => store().setPropertyValue(node.id, property, v)}
              />
            </div>
          );
        })}
        <div className="empty-hint">
          {advancedMode
            ? '◆를 켜면 그 속성이 애니메이션됩니다. 값을 바꾸면 애니메이션된 속성은 현재 프레임에 키프레임이 생깁니다.'
            : '위치는 캔버스에서 파츠를 드래그해서도 바꿀 수 있어요.'}
        </div>
      </div>
    </>
  );
};
