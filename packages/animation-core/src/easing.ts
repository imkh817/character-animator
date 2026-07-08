import type { Easing } from './types';

/**
 * cubic-bezier(x1, y1, x2, y2) 곡선에서 x=progress일 때의 y를 구한다.
 * CSS transition-timing-function과 동일한 의미론.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;

  const sampleX = (t: number) => bezierAxis(t, x1, x2);
  const sampleY = (t: number) => bezierAxis(t, y1, y2);

  // x(t) = progress를 만족하는 t를 찾는다: Newton-Raphson → 실패 시 이분법
  let t = progress;
  for (let i = 0; i < 8; i++) {
    const x = sampleX(t) - progress;
    if (Math.abs(x) < 1e-6) return sampleY(t);
    const dx = bezierAxisDerivative(t, x1, x2);
    if (Math.abs(dx) < 1e-6) break;
    t -= x / dx;
  }

  let lo = 0;
  let hi = 1;
  t = progress;
  while (hi - lo > 1e-6) {
    if (sampleX(t) < progress) {
      lo = t;
    } else {
      hi = t;
    }
    t = (lo + hi) / 2;
  }
  return sampleY(t);
}

function bezierAxis(t: number, p1: number, p2: number): number {
  const inv = 1 - t;
  return 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t;
}

function bezierAxisDerivative(t: number, p1: number, p2: number): number {
  const inv = 1 - t;
  return 3 * inv * inv * p1 + 6 * inv * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

const PRESETS: Record<'easeIn' | 'easeOut' | 'easeInOut', [number, number, number, number]> = {
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
};

/** 구간 진행도(0~1)에 easing을 적용한다. hold는 호출부에서 처리되므로 여기서는 0을 반환한다. */
export function applyEasing(easing: Easing, progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  switch (easing.type) {
    case 'linear':
      return t;
    case 'hold':
      return 0;
    case 'bezier': {
      const [x1, y1, x2, y2] = easing.values;
      return cubicBezier(x1, y1, x2, y2, t);
    }
    default: {
      const [x1, y1, x2, y2] = PRESETS[easing.type];
      return cubicBezier(x1, y1, x2, y2, t);
    }
  }
}
