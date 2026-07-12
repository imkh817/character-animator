import type { BubbleShape, BubbleSpec } from '@charanim/animation-core';

export const DEFAULT_BUBBLE_SPEC: BubbleSpec = {
  text: '',
  fontSize: 36,
  fontFamily: 'Malgun Gothic',
  shape: 'speech',
};

/** 말풍선 팔레트에 보여줄 모양 목록 */
export const BUBBLE_SHAPES: readonly { shape: BubbleShape; label: string }[] = [
  { shape: 'speech', label: '대사' },
  { shape: 'thought', label: '생각' },
  { shape: 'shout', label: '외침' },
  { shape: 'plain', label: '자막' },
];

/** 글꼴 선택지: 윈도우 기본 폰트 */
export const BUBBLE_FONTS: readonly { label: string; value: string }[] = [
  { label: '맑은 고딕', value: 'Malgun Gothic' },
  { label: '굴림', value: 'Gulim' },
  { label: '돋움', value: 'Dotum' },
  { label: '바탕', value: 'Batang' },
  { label: '궁서', value: 'Gungsuh' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Impact', value: 'Impact' },
  { label: 'Comic Sans', value: 'Comic Sans MS' },
];
