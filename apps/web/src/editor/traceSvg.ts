import ImageTracer from 'imagetracerjs';

/**
 * 래스터 이미지 → 벡터 SVG 자동 변환 (트레이싱).
 * 배경 제거된 캐릭터 일러스트처럼 색 경계가 뚜렷한 그림을 대상으로 하며,
 * 변환된 파츠는 캔버스에서 아무리 확대해도 깨지지 않는다.
 */

const TRACE_ENABLED_KEY = 'charanim.traceToSvg';
const OUTLINE_ENABLED_KEY = 'charanim.traceOutline';

/** 업로드 시 자동 변환 여부 (기본 켬). 에셋 패널의 토글이 이 값을 바꾼다 */
export function isTraceEnabled(): boolean {
  return localStorage.getItem(TRACE_ENABLED_KEY) !== '0';
}

export function setTraceEnabled(enabled: boolean): void {
  localStorage.setItem(TRACE_ENABLED_KEY, enabled ? '1' : '0');
}

/** 변환 시 실루엣 점선 테두리 추가 여부 (기본 켬). SVG 안에 들어가므로 렌더 영상에도 나온다 */
export function isOutlineEnabled(): boolean {
  return localStorage.getItem(OUTLINE_ENABLED_KEY) !== '0';
}

export function setOutlineEnabled(enabled: boolean): void {
  localStorage.setItem(OUTLINE_ENABLED_KEY, enabled ? '1' : '0');
}

/** 변환 대상: 투명 배경을 가질 수 있는 래스터. JPEG는 사진일 가능성이 높아 제외 */
export function isTraceable(file: File): boolean {
  return file.type === 'image/png' || file.type === 'image/webp';
}

/** 트레이싱 전 축소 상한. 이보다 크면 변환이 수 초씩 걸리고, SVG는 어차피 확대에 강하다 */
const MAX_TRACE_DIMENSION = 1200;

/** 일러스트(뚜렷한 색 경계) 기준 옵션. viewbox는 svgSize의 크기 계산이 의존한다 */
const TRACE_OPTIONS = {
  viewbox: true,
  numberofcolors: 16,
  colorsampling: 2,
  pathomit: 8,
  ltres: 1,
  qtres: 1,
  roundcoords: 1,
} as const;

/** 실루엣 추출용: 불투명/투명 2색만 남긴 마스크를 트레이싱한다 */
const MASK_TRACE_OPTIONS = {
  viewbox: true,
  numberofcolors: 2,
  colorsampling: 2,
  pathomit: 16,
  ltres: 1,
  qtres: 1,
  roundcoords: 1,
} as const;

/**
 * 알파 채널로 만든 흑백 마스크를 트레이싱해 실루엣 윤곽 패스(d 문자열)를 뽑는다.
 * 좌표계는 트레이싱된 SVG(= 노드 size)와 같다. 스타일은 노드 속성으로 렌더러가 입힌다.
 */
function extractSilhouettePaths(imageData: ImageData): string[] {
  const { width, height, data } = imageData;
  const mask = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! >= 128) mask[i + 3] = 255; // rgb(0,0,0) 불투명
  }
  const maskSvg = ImageTracer.imagedataToSVG(new ImageData(mask, width, height), {
    ...MASK_TRACE_OPTIONS,
  });
  // 불투명(검정) 쪽 패스만 실루엣이다. 투명 쪽(opacity 0)은 버린다
  const outlines: string[] = [];
  for (const m of maskSvg.matchAll(/<path[^>]*\bopacity="([^"]+)"[^>]*\bd="([^"]+)"[^>]*\/>/g)) {
    if (parseFloat(m[1]!) >= 0.5) outlines.push(m[2]!);
  }
  return outlines;
}

export interface TraceResult {
  file: File;
  /** 실루엣 윤곽. 노드의 outline 속성으로 저장돼 테두리 스타일 변경에 쓰인다 */
  silhouette: { paths: string[]; strokeWidth: number };
}

/** 실패하면 throw — 호출부가 원본 파일 업로드로 폴백한다 */
export async function traceFileToSvg(file: File): Promise<TraceResult> {
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, MAX_TRACE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D 컨텍스트를 만들 수 없습니다');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const svg = stripInvisiblePaths(ImageTracer.imagedataToSVG(imageData, { ...TRACE_OPTIONS }));
    const name = `${file.name.replace(/\.[^.]+$/, '')}.svg`;
    return {
      file: new File([svg], name, { type: 'image/svg+xml' }),
      silhouette: {
        paths: extractSilhouettePaths(imageData),
        strokeWidth: Math.max(2, Math.round(Math.max(width, height) / 150)),
      },
    };
  } finally {
    bitmap.close();
  }
}

/** 투명 배경이 만드는 opacity≈0 패스 제거 — 보이지 않으면서 파일만 키운다 */
function stripInvisiblePaths(svg: string): string {
  return svg.replace(/<path[^>]*\bopacity="([^"]+)"[^>]*\/>/g, (match, opacity: string) =>
    parseFloat(opacity) < 0.05 ? '' : match,
  );
}
