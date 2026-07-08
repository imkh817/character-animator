import React from 'react';
import { Composition, type CalculateMetadataFunction } from 'remotion';
import {
  CharacterScene,
  createEmptySceneDocument,
  type CharacterSceneProps,
} from '@charanim/animation-core';

/**
 * 영상의 크기/길이/fps는 코드가 아니라 Scene Document(settings)가 결정한다.
 * calculateMetadata가 job마다 inputProps로 받은 문서에서 메타데이터를 읽는다.
 */
const calculateMetadata: CalculateMetadataFunction<CharacterSceneProps> = ({ props }) => ({
  durationInFrames: props.document.settings.durationInFrames,
  fps: props.document.settings.fps,
  width: props.document.settings.width,
  height: props.document.settings.height,
  props,
});

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CharacterScene"
      component={CharacterScene}
      durationInFrames={150}
      fps={30}
      width={1080}
      height={1080}
      defaultProps={{ document: createEmptySceneDocument(), assetUrls: {} }}
      calculateMetadata={calculateMetadata}
    />
  );
};
