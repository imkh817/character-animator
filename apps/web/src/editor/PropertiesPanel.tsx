import {
  ANIMATABLE_PROPERTIES,
  ANIMATION_PRESETS,
  blockRanges,
  getLocalTransform,
  type AnimatableProperty,
  type OutlineStyle,
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
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const advancedMode = useEditorStore((s) => s.advancedMode);
  const store = useEditorStore.getState;

  const node = document.nodes.find((n) => n.id === selectedNodeId);

  // 여러 노드 선택(드래그 박스·그룹): 묶기/해제 + 그룹 전체 애니메이션/테두리
  if (selectedNodeIds.length > 1) {
    const selectedNodes = document.nodes.filter((n) => selectedNodeIds.includes(n.id));
    const grouped = selectedNodes.some((n) => n.groupId);
    const groupIds = new Set(selectedNodes.filter((n) => n.groupId).map((n) => n.groupId!));
    const isSingleWholeGroup = groupIds.size === 1 && selectedNodes.every((n) => n.groupId);
    const primary = selectedNodes.find((n) => n.id === selectedNodeId) ?? selectedNodes[0];
    return (
      <>
        <div className="panel-section">
          <span className="panel-label">선택 · {selectedNodes.length}개</span>
          <div className="empty-hint">
            {isSingleWholeGroup
              ? '묶여 있는 노드들이에요. 하나를 움직이면 함께 움직입니다. Alt+클릭하면 파츠 하나만 선택해 피벗·개별 애니메이션을 줄 수 있어요.'
              : '캔버스에서 함께 드래그해 옮길 수 있어요.'}
          </div>
          {!isSingleWholeGroup && (
            <button className="btn" onClick={() => store().groupSelectedNodes()}>
              🔗 묶기
            </button>
          )}
          {grouped && (
            <button className="btn" onClick={() => store().ungroupSelectedNodes()}>
              묶기 해제
            </button>
          )}
          <div className="prop-row prop-row--simple">
            <label>불투명</label>
            <NumberInput
              value={primary?.base.opacity ?? 1}
              step={0.05}
              onCommit={(v) => store().setNodesOpacity(selectedNodeIds, v)}
            />
          </div>
        </div>
        {advancedMode ? (
          <ScenePresetSection nodeIds={selectedNodeIds} />
        ) : (
          <BlockPresetSection nodeIds={selectedNodeIds} />
        )}
        <OutlineSection nodeIds={selectedNodeIds} />
      </>
    );
  }

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
          <label>피벗 X</label>
          <NumberInput value={node.pivot.x} step={1} onCommit={(v) => store().setNodePivot(node.id, 'x', v)} />
        </div>
        <div className="prop-row">
          <span />
          <label>피벗 Y</label>
          <NumberInput value={node.pivot.y} step={1} onCommit={(v) => store().setNodePivot(node.id, 'y', v)} />
        </div>
      </div>

      {advancedMode ? <ScenePresetSection nodeIds={[node.id]} /> : <BlockPresetSection nodeIds={[node.id]} />}
      <OutlineSection nodeIds={[node.id]} />

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

/**
 * 기본 모드: 프리셋과 숨김을 "선택된 장면"에만 적용한다 (스토리보드 → 키프레임 컴파일).
 * 여러 노드(그룹 선택)를 받으면 전체에 함께 적용되고, 전부 켜져 있을 때만 켜짐으로 표시한다.
 */
const BlockPresetSection: React.FC<{ nodeIds: string[] }> = ({ nodeIds }) => {
  const document = useEditorStore((s) => s.document)!;
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const store = useEditorStore.getState;

  const storyboard = document.storyboard;
  const blockIndex = storyboard?.blocks.findIndex((b) => b.id === selectedBlockId) ?? -1;
  if (!storyboard || blockIndex < 0 || nodeIds.length === 0) return null;
  const block = storyboard.blocks[blockIndex]!;
  const activeForAll = (presetId: string) =>
    nodeIds.every((id) => block.nodes[id]?.presetIds?.includes(presetId) ?? false);
  const anyPresets = nodeIds.some((id) => (block.nodes[id]?.presetIds?.length ?? 0) > 0);
  const singleNodeId = nodeIds.length === 1 ? nodeIds[0]! : null;
  const hidden = singleNodeId ? block.nodes[singleNodeId]?.hidden === true : false;
  const blockStart = blockRanges(storyboard)[blockIndex]!.start;

  // 바꾸자마자 그 장면부터 재생해 결과를 바로 보여준다
  const previewBlock = () => {
    playerController.current?.seekTo(blockStart);
    playerController.current?.play();
  };

  return (
    <div className="panel-section">
      <div className="panel-section-head">
        <span className="panel-label">
          애니메이션 · 장면 {blockIndex + 1}
          {nodeIds.length > 1 ? ` · ${nodeIds.length}개` : ''}
        </span>
        {anyPresets && (
          <button className="icon-btn" onClick={() => store().clearBlockPresetsForNodes(block.id, nodeIds)}>
            지우기
          </button>
        )}
      </div>
      {singleNodeId && (
        <label className="block-visibility">
          <input
            type="checkbox"
            checked={!hidden}
            onChange={(e) => {
              store().setBlockNodeHidden(block.id, singleNodeId, !e.target.checked);
              playerController.current?.seekTo(blockStart);
            }}
          />
          이 장면에서 보이기
        </label>
      )}
      <div className="preset-grid">
        {ANIMATION_PRESETS.map((preset) => (
          <button
            key={preset.id}
            className="preset-chip"
            data-active={activeForAll(preset.id)}
            title={preset.description}
            onClick={() => {
              store().toggleBlockPresetForNodes(block.id, nodeIds, preset.id);
              previewBlock();
            }}
          >
            <span className="preset-emoji">{preset.emoji}</span>
            {preset.label}
          </button>
        ))}
      </div>
      <div className="empty-hint">
        {nodeIds.length > 1
          ? `묶인 파츠 ${nodeIds.length}개에 함께 적용돼요. 장면 ${blockIndex + 1}에서만 움직입니다.`
          : `장면 ${blockIndex + 1}에서만 움직여요. 다시 누르면 꺼지고, 겹쳐 쓸 수도 있어요 (숨쉬기 + 끄덕끄덕).`}
      </div>
    </div>
  );
};

/** 고급 모드: 프리셋을 장면 전체 길이에 적용한다. 여러 노드(그룹)면 전체에 함께 적용 */
const ScenePresetSection: React.FC<{ nodeIds: string[] }> = ({ nodeIds }) => {
  const document = useEditorStore((s) => s.document)!;
  const store = useEditorStore.getState;
  const anyAnimations = nodeIds.some((id) => Object.keys(document.animations[id] ?? {}).length > 0);

  return (
    <div className="panel-section">
      <div className="panel-section-head">
        <span className="panel-label">애니메이션{nodeIds.length > 1 ? ` · ${nodeIds.length}개` : ''}</span>
        {anyAnimations && (
          <button className="icon-btn" onClick={() => store().clearNodesAnimation(nodeIds)}>
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
              store().applyPresetToNodes(nodeIds, preset.id);
              playerController.current?.seekTo(0);
              playerController.current?.play();
            }}
          >
            <span className="preset-emoji">{preset.emoji}</span>
            {preset.label}
          </button>
        ))}
      </div>
      <div className="empty-hint">
        {nodeIds.length > 1
          ? `묶인 파츠 ${nodeIds.length}개에 함께 적용돼요. 누르면 바로 재생됩니다.`
          : '누르면 바로 재생됩니다. 겹쳐 쓸 수도 있어요 (숨쉬기 + 끄덕끄덕).'}
      </div>
    </div>
  );
};

const OUTLINE_STYLES: { value: OutlineStyle; label: string }[] = [
  { value: 'none', label: '없음' },
  { value: 'solid', label: '실선' },
  { value: 'dashed', label: '점선' },
  { value: 'dotted', label: '도트' },
  { value: 'longdash', label: '긴 점선' },
];

/** 실루엣 테두리 선 종류. 트레이싱된(outline 보유) 파츠가 선택에 있을 때만 보인다 */
const OutlineSection: React.FC<{ nodeIds: string[] }> = ({ nodeIds }) => {
  const document = useEditorStore((s) => s.document)!;
  const store = useEditorStore.getState;

  const outlined = document.nodes.filter((n) => nodeIds.includes(n.id) && n.outline);
  if (outlined.length === 0) return null;
  const styles = new Set(outlined.map((n) => n.outline!.style));
  const current = styles.size === 1 ? [...styles][0] : null;

  return (
    <div className="panel-section">
      <span className="panel-label">테두리{outlined.length > 1 ? ` · ${outlined.length}개` : ''}</span>
      <div className="preset-grid">
        {OUTLINE_STYLES.map((s) => (
          <button
            key={s.value}
            className="preset-chip"
            data-active={current === s.value}
            onClick={() =>
              store().setOutlineStyle(
                outlined.map((n) => n.id),
                s.value,
              )
            }
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="empty-hint">캐릭터 실루엣을 따라 그려져요. PNG를 SVG로 변환해 올린 파츠에만 있습니다.</div>
    </div>
  );
};
