/**
 * SVG의 실제 픽셀 크기를 알아낸다.
 * width/height가 절대값이면 그것을, 아니면(100%, 생략 등) viewBox의 크기를 쓴다.
 * DOMParser 대신 정규식을 쓰는 이유: 테스트 환경(node)에서도 동작하고, 필요한 건 루트 속성뿐이다.
 */
export function parseSvgSize(svgText: string): { width: number; height: number } {
  const openTag = svgText.match(/<svg[^>]*>/i)?.[0] ?? '';

  const absolute = (name: string): number | null => {
    const raw = openTag.match(new RegExp(`${name}="([^"]+)"`, 'i'))?.[1];
    if (!raw) return null;
    const value = parseFloat(raw);
    // "100%" 같은 상대값은 크기가 아니다
    return raw.includes('%') || !Number.isFinite(value) || value <= 0 ? null : value;
  };

  const width = absolute('width');
  const height = absolute('height');
  if (width && height) return { width, height };

  const viewBox = openTag.match(/viewBox="([^"]+)"/i)?.[1];
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2]! > 0 && parts[3]! > 0) {
      return { width: parts[2]!, height: parts[3]! };
    }
  }
  return { width: width ?? 200, height: height ?? 200 };
}

export async function fetchSvgSize(url: string): Promise<{ width: number; height: number }> {
  try {
    const response = await fetch(url);
    return parseSvgSize(await response.text());
  } catch {
    return { width: 200, height: 200 };
  }
}

/** 래스터 이미지(PNG/JPG/WebP)의 원본 크기 */
export function loadRasterSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 200, height: 200 });
    image.src = url;
  });
}

export async function getFileImageSize(file: File): Promise<{ width: number; height: number }> {
  if (file.type === 'image/svg+xml') {
    return parseSvgSize(await file.text());
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    return await loadRasterSize(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function getUrlImageSize(
  url: string,
  contentType: string,
): Promise<{ width: number; height: number }> {
  return contentType === 'image/svg+xml' ? fetchSvgSize(url) : loadRasterSize(url);
}
