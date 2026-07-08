import type { PlayerRef } from '@remotion/player';

/**
 * Player의 명령형 API(play/pause/seek)를 타임라인 등 다른 패널과 공유하기 위한
 * 얇은 홀더. React 상태가 아닌 이유: 재생 제어는 렌더링과 무관한 명령이다.
 */
export const playerController: { current: PlayerRef | null } = { current: null };
