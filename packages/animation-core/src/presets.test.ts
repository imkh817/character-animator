import { describe, expect, it } from 'vitest';
import { ANIMATION_PRESETS } from './presets';
import { createDefaultTransform } from './types';

const ctx = { base: createDefaultTransform(), fps: 30, durationInFrames: 150 };

describe('ANIMATION_PRESETS', () => {
  for (const preset of ANIMATION_PRESETS) {
    it(`${preset.label}: 키프레임이 정렬돼 있고 장면 범위를 벗어나지 않는다`, () => {
      const generated = preset.generate(ctx);
      const properties = Object.entries(generated);
      expect(properties.length).toBeGreaterThan(0);

      for (const [, keyframes] of properties) {
        expect(keyframes!.length).toBeGreaterThanOrEqual(2);
        expect(keyframes![0]!.frame).toBe(0);
        for (let i = 1; i < keyframes!.length; i++) {
          expect(keyframes![i]!.frame).toBeGreaterThan(keyframes![i - 1]!.frame);
          expect(keyframes![i]!.frame).toBeLessThanOrEqual(ctx.durationInFrames - 1);
        }
      }
    });
  }

  it('반복형 프리셋은 기준값으로 복귀해 루프 이음새가 없다', () => {
    for (const id of ['breathe', 'nod', 'sway', 'bounce']) {
      const preset = ANIMATION_PRESETS.find((p) => p.id === id)!;
      const generated = preset.generate(ctx);
      for (const [property, keyframes] of Object.entries(generated)) {
        const first = keyframes![0]!.value;
        const last = keyframes![keyframes!.length - 1]!.value;
        expect(last, `${id}.${property}`).toBeCloseTo(first);
      }
    }
  });

  it('짧은 장면(10프레임)에서도 깨지지 않는다', () => {
    for (const preset of ANIMATION_PRESETS) {
      const generated = preset.generate({ ...ctx, durationInFrames: 10 });
      for (const keyframes of Object.values(generated)) {
        for (const kf of keyframes!) {
          expect(kf.frame).toBeLessThanOrEqual(9);
          expect(kf.frame).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
