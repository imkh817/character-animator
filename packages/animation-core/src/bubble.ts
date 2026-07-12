import type { BubbleShape, BubbleSpec } from './types';

/**
 * 말풍선 레이아웃 계산.
 * CharacterScene(미리보기·최종 렌더)과 에디터(선택 박스, 인라인 편집기)가
 * 같은 수치를 쓰기 위해 여기에 둔다.
 */

/** 기준 크기(fontSize 36) 기준 수치. 실제 값은 fontSize에 비례해 커진다 */
const BASE = {
  fontSize: 36,
  lineHeight: 48,
  paddingX: 40,
  paddingY: 30,
  stroke: 4,
  tailHeight: 36,
  maxLineWidth: 380,
  minBodyWidth: 140,
  cornerRadius: 24,
} as const;

export interface BubbleMetrics {
  fontSize: number;
  lineHeight: number;
  paddingX: number;
  paddingY: number;
  stroke: number;
  tailHeight: number;
  maxLineWidth: number;
  minBodyWidth: number;
  cornerRadius: number;
}

export function bubbleMetrics(spec: Pick<BubbleSpec, 'fontSize'>): BubbleMetrics {
  const k = spec.fontSize / BASE.fontSize;
  return {
    fontSize: spec.fontSize,
    lineHeight: BASE.lineHeight * k,
    paddingX: BASE.paddingX * k,
    paddingY: BASE.paddingY * k,
    stroke: Math.max(2, BASE.stroke * k),
    tailHeight: BASE.tailHeight * k,
    maxLineWidth: BASE.maxLineWidth * k,
    minBodyWidth: BASE.minBodyWidth * k,
    cornerRadius: BASE.cornerRadius * k,
  };
}

/** 대략적인 렌더 폭 추정: CJK는 1em, 그 외(라틴/숫자/공백)는 0.55em */
function estimateWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of text) {
    units += ch.charCodeAt(0) > 0x2000 ? 1 : 0.55;
  }
  return units * fontSize;
}

/** 공백 단위로 줄바꿈하되, 한 단어가 최대 폭을 넘으면 글자 단위로 자른다 */
function wrapText(text: string, fontSize: number, maxLineWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (estimateWidth(candidate, fontSize) <= maxLineWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // 단어 자체가 한 줄보다 길면 글자 단위로 강제 분할
      line = '';
      for (const ch of word) {
        if (estimateWidth(line + ch, fontSize) > maxLineWidth) {
          lines.push(line);
          line = ch;
        } else {
          line += ch;
        }
      }
    }
    lines.push(line);
  }
  const filtered = lines.filter((l, i, all) => l !== '' || (i > 0 && i < all.length - 1));
  // 빈 문구도 한 줄짜리 빈 말풍선으로 그린다 (막 만든 직후 상태)
  return filtered.length > 0 ? filtered : [''];
}

export interface BubbleLayout {
  shape: BubbleShape;
  /** 노드 크기(px). 에디터가 node.size로 기록한다 */
  width: number;
  height: number;
  /** 문구가 들어가는 본체 영역. 에디터의 인라인 입력창이 여기에 겹친다 */
  body: { x: number; y: number; width: number; height: number };
  /** 문구 배치 기준: x는 중앙 정렬 축, y는 첫 줄 상단 */
  textCenterX: number;
  textTop: number;
  /** 줄바꿈이 적용된 문구 */
  lines: string[];
  metrics: BubbleMetrics;
}

export function layoutBubble(spec: BubbleSpec): BubbleLayout {
  const shape = spec.shape ?? 'speech';
  const m = bubbleMetrics(spec);
  const lines = wrapText(spec.text, m.fontSize, m.maxLineWidth);
  const textWidth = Math.max(m.minBodyWidth, ...lines.map((l) => estimateWidth(l, m.fontSize)));
  const textHeight = lines.length * m.lineHeight;

  if (shape === 'shout') {
    // 문구 상자를 감싸는 타원에 뾰족한 스파이크를 두른다 — 타원이 넉넉해야 글자가 안 삐져나온다
    const rx = textWidth / 2 + m.paddingX * 1.6;
    const ry = textHeight / 2 + m.paddingY * 1.6;
    const spike = 1.22;
    const width = Math.ceil(rx * 2 * spike);
    const height = Math.ceil(ry * 2 * spike);
    return {
      shape,
      width,
      height,
      body: {
        x: width / 2 - textWidth / 2 - m.paddingX / 2,
        y: height / 2 - textHeight / 2 - m.paddingY / 2,
        width: textWidth + m.paddingX,
        height: textHeight + m.paddingY,
      },
      textCenterX: width / 2,
      textTop: height / 2 - textHeight / 2,
      lines,
      metrics: m,
    };
  }

  const width = Math.ceil(textWidth + m.paddingX * 2);
  const bodyHeight = Math.ceil(textHeight + m.paddingY * 2);
  // speech/thought는 아래에 꼬리 공간, plain(자막 박스)은 꼬리 없음
  const height = shape === 'plain' ? bodyHeight : Math.ceil(bodyHeight + m.tailHeight);
  return {
    shape,
    width,
    height,
    body: { x: 0, y: 0, width, height: bodyHeight },
    textCenterX: width / 2,
    textTop: m.paddingY,
    lines,
    metrics: m,
  };
}
