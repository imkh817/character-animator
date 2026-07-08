import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { buildSceneTree, getLocalTransform, type SceneTreeNode } from '../interpolate';
import type { SceneDocument } from '../types';

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
  const assetUrl = assetUrls[node.assetId];

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
      {assetUrl ? (
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
