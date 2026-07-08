import React, { useState } from 'react';
import { ApiError } from '../api/client';
import { signup } from '../api/endpoints';
import { useAuthStore } from '../stores/authStore';

export const AuthPage: React.FC = () => {
  const login = useAuthStore((s) => s.login);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        await signup(email, password, nickname);
      }
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="atelier">
      <form className="auth-card" onSubmit={submit}>
        <div className="logotype">
          CHAR<span className="tick">◆</span>ANIM
        </div>
        <div>
          <h1>{mode === 'login' ? '다시 오셨군요' : '작업실 만들기'}</h1>
          <div className="sub">SVG 파츠로 캐릭터를 만들고, 타임라인으로 살아 움직이게.</div>
        </div>
        {mode === 'signup' && (
          <input
            placeholder="닉네임"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
            maxLength={50}
          />
        )}
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="비밀번호 (8자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn--primary" type="submit" disabled={busy} style={{ justifyContent: 'center' }}>
          {busy ? '...' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
        </button>
        <div className="auth-switch">
          {mode === 'login' ? '처음이신가요?' : '이미 계정이 있나요?'}
          <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? '회원가입' : '로그인'}
          </button>
        </div>
      </form>
    </div>
  );
};
