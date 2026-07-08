import { create } from 'zustand';
import { tryRefresh } from '../api/client';
import * as endpoints from '../api/endpoints';
import type { UserSummary } from '../api/types';

type AuthStatus = 'unknown' | 'authed' | 'guest';

interface AuthState {
  status: AuthStatus;
  user: UserSummary | null;
  /** 앱 시작 시 refresh 쿠키로 세션 복원을 시도한다 */
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  user: null,

  bootstrap: async () => {
    const ok = await tryRefresh();
    // refresh 응답에는 user가 없으므로(accessToken만 갱신) 상태만 전환한다.
    // user 표시가 필요한 화면은 login 시점의 정보를 쓰고, 복원 세션은 nickname 없이 동작한다.
    set({ status: ok ? 'authed' : 'guest' });
  },

  login: async (email, password) => {
    const result = await endpoints.login(email, password);
    set({ status: 'authed', user: result.user });
  },

  logout: async () => {
    await endpoints.logout().catch(() => {});
    set({ status: 'guest', user: null });
  },
}));
