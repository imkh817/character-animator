import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { layoutBubble } from '../bubble';
import { buildSceneTree, getLocalTransform, type SceneTreeNode } from '../interpolate';
import type { BubbleSpec, SceneDocument } from '../types';

/** assetId → 실제 SVG URL. 에디터는 presigned URL, 워커는 다운로드 URL을 넣는다. */
export type AssetUrlMap = Record<string, string>;

// interface가 아닌 type 별칭이어야 Remotion Composition의 Record<string, unknown> 제약을 만족한다
export type CharacterSceneProps = {
  document: SceneDocument;
  assetUrls: AssetUrlMap;
};

/**
 * Scene Document를 그리는 유일한 컴포넌트.
 * 에디터 미리보기(@remotion/player)와 최종 렌더(renderMedia)가 똑같이 이것을 사용한다
 * — WYSIWYG은 이 파일이 하나뿐이라는 사실에서 나온다.
 *
 * 부모-자식 트랜스폼 상속은 DOM 중첩으로 구현한다: 자식을 부모의 div 안에 렌더링하면
 * CSS transform이 자연스럽게 합성된다 (별도의 행렬 계산이 필요 없다).
 */
export const CharacterScene: React.FC<CharacterSceneProps> = ({ document, assetUrls }) => {
  const frame = useCurrentFrame();
  const tree = buildSceneTree(document.nodes);
  const { backgroundColor } = document.settings;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: backgroundColor === 'transparent' ? undefined : backgroundColor,
      }}
    >
      {tree.map((root) => (
        <NodeView key={root.node.id} treeNode={root} document={document} assetUrls={assetUrls} frame={frame} />
      ))}
    </AbsoluteFill>
  );
};

interface NodeViewProps {
  treeNode: SceneTreeNode;
  document: SceneDocument;
  assetUrls: AssetUrlMap;
  frame: number;
}

const NodeView: React.FC<NodeViewProps> = ({ treeNode, document, assetUrls, frame }) => {
  const { node, children } = treeNode;
  if (!node.visible) {
    // 부모가 보이지 않으면 자식도 그리지 않는다
    return null;
  }

  const t = getLocalTransform(node, document.animations[node.id], frame);
  const assetUrl = node.assetId ? assetUrls[node.assetId] : undefined;

  return (
    <div
      // 에디터가 DOM 기반 히트테스트(클릭 선택/드래그)에 사용한다. 렌더 결과에는 영향 없음
      data-node-id={node.id}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${t.x}px, ${t.y}px) rotate(${t.rotation}deg) scale(${t.scaleX}, ${t.scaleY})`,
        transformOrigin: `${node.pivot.x}px ${node.pivot.y}px`,
        opacity: t.opacity,
      }}
    >
      {node.bubble ? (
        <BubbleView spec={node.bubble} />
      ) : assetUrl ? (
        <Img
          src={assetUrl}
          style={{
            display: 'block',
            // 명시적 크기 필수: width="100%"인 SVG는 크기를 지정하지 않으면 0으로 붕괴한다
            width: node.size?.width ?? 200,
            height: node.size?.height ?? 200,
          }}
        />
      ) : null}
      {children.map((child) => (
        <NodeView key={child.node.id} treeNode={child} document={document} assetUrls={assetUrls} frame={frame} />
      ))}
    </div>
  );
};

const FILL = '#ffffff';
const INK = '#1a1a1a';

/**
 * 말풍선: 에셋 없이 spec만으로 그린다. 문구 수정 = 문서 수정이라 업로드가 필요 없다.
 * 에디터의 말풍선 팔레트도 이 컴포넌트를 미리보기로 재사용한다.
 */
export const BubbleView: React.FC<{ spec: BubbleSpec }> = ({ spec }) => {
  const layout = layoutBubble(spec);
  const { width, height, lines, metrics: m } = layout;
  const fontFamily = `'${spec.fontFamily}', sans-serif`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <BubbleOutline layout={layout} />
      {lines.map((line, i) => (
        <text
          key={i}
          x={layout.textCenterX}
          y={layout.textTop + i * m.lineHeight + m.lineHeight / 2 + m.fontSize * 0.35}
          fontFamily={fontFamily}
          fontSize={m.fontSize}
          fontWeight={600}
          fill={INK}
          textAnchor="middle"
        >
          {line}
        </text>
      ))}
    </svg>
  );
};

const BubbleOutline: React.FC<{ layout: ReturnType<typeof layoutBubble> }> = ({ layout }) => {
  const { shape, width, height, body, metrics: m } = layout;
  const bodyHeight = body.height;

  if (shape === 'plain') {
    // 자막 박스: 꼬리 없는 각진 사각형
    return (
      <rect
        x={m.stroke / 2}
        y={m.stroke / 2}
        width={width - m.stroke}
        height={height - m.stroke}
        rx={m.cornerRadius * 0.3}
        fill={FILL}
        stroke={INK}
        strokeWidth={m.stroke}
      />
    );
  }

  if (shape === 'shout') {
    // 외침: 타원 둘레를 따라 바깥/안쪽 반지름을 번갈아 찍은 뾰족한 폴리곤
    const cx = width / 2;
    const cy = height / 2;
    const rx = width / 2 - m.stroke;
    const ry = height / 2 - m.stroke;
    const spikes = 14;
    const points: string[] = [];
    for (let i = 0; i < spikes * 2; i++) {
      const angle = (i * Math.PI) / spikes;
      const k = i % 2 === 0 ? 1 : 0.78;
      points.push(`${cx + Math.cos(angle) * rx * k},${cy + Math.sin(angle) * ry * k}`);
    }
    return <polygon points={points.join(' ')} fill={FILL} stroke={INK} strokeWidth={m.stroke} />;
  }

  // 꼬리는 왼쪽 아래. 본체와 겹치는 밑변은 흰 사각형으로 덮어 이음새를 없앤다
  const tailLeft = Math.min(52, width * 0.2);
  const tailWidth = m.tailHeight * 0.95;
  const tail =
    shape === 'thought' ? null : (
      <>
        <path
          d={`M ${tailLeft} ${bodyHeight - m.stroke} L ${tailLeft + tailWidth} ${bodyHeight - m.stroke} L ${tailLeft + tailWidth * 0.18} ${height - m.stroke / 2} Z`}
          fill={FILL}
          stroke={INK}
          strokeWidth={m.stroke}
          strokeLinejoin="round"
        />
        <rect x={tailLeft + 2} y={bodyHeight - m.stroke * 2} width={tailWidth - 4} height={m.stroke * 2} fill={FILL} />
      </>
    );

  return (
    <>
      <rect
        x={m.stroke / 2}
        y={m.stroke / 2}
        width={width - m.stroke}
        height={bodyHeight - m.stroke}
        // 생각 풍선은 모서리를 크게 굴려 구름 느낌을 낸다
        rx={shape === 'thought' ? Math.min(m.cornerRadius * 2.4, bodyHeight / 2) : m.cornerRadius}
        fill={FILL}
        stroke={INK}
        strokeWidth={m.stroke}
      />
      {tail}
      {shape === 'thought' && (
        <>
          <circle
            cx={tailLeft + m.tailHeight * 0.35}
            cy={bodyHeight + m.tailHeight * 0.28}
            r={m.tailHeight * 0.2}
            fill={FILL}
            stroke={INK}
            strokeWidth={m.stroke * 0.8}
          />
          <circle
            cx={tailLeft}
            cy={bodyHeight + m.tailHeight * 0.68}
            r={m.tailHeight * 0.12}
            fill={FILL}
            stroke={INK}
            strokeWidth={m.stroke * 0.7}
          />
        </>
      )}
    </>
  );
};
