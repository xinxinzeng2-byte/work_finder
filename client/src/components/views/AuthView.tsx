import React, { useState } from 'react';
import { authRequest } from '../../utils/storage';

const EMAIL_PATTERN = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

interface Props {
  onAuthenticated: (user: { id: string; email: string }) => void;
}

export const AuthView: React.FC<Props> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const normalizedEmail = normalizeEmail(email);
    setEmail(normalizedEmail);
    if (!isValidEmail(normalizedEmail)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (mode === 'register' && password.length < 8) {
      setError('密码至少 8 位');
      return;
    }
    setLoading(true);
    try {
      const result = await authRequest<{ token: string; user: { id: string; email: string } }>(`/auth/${mode}`, { email: normalizedEmail, password });
      localStorage.setItem('auth_token', result.token);
      onAuthenticated(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
    <div className="card w-full max-w-md p-8">
      <div className="mb-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-terra text-xl font-bold text-white">W</div>
        <h1 className="mt-4 font-serif text-2xl font-semibold">AI 求职助手</h1>
        <p className="mt-2 text-sm text-ink-secondary">登录后在不同设备继续管理你的简历和岗位。</p>
      </div>
      <div className="mb-6 flex border-b border-line">
        <button onClick={() => { setMode('login'); setError(''); }} className={`flex-1 border-b-2 pb-3 text-sm ${mode === 'login' ? 'border-terra font-medium text-terra' : 'border-transparent text-ink-secondary'}`}>登录</button>
        <button onClick={() => { setMode('register'); setError(''); }} className={`flex-1 border-b-2 pb-3 text-sm ${mode === 'register' ? 'border-terra font-medium text-terra' : 'border-transparent text-ink-secondary'}`}>注册</button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block"><span className="label">邮箱</span><input className="input mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required /></label>
        <label className="block">
          <span className="label">密码</span>
          <div className="relative mt-2">
            <input className="input mt-0 pr-10" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" minLength={mode === 'register' ? 8 : undefined} required />
            <button
              type="button"
              className="absolute bottom-2 right-0 rounded p-1 text-ink-secondary transition-colors hover:text-terra focus:outline-none focus:ring-2 focus:ring-terra/30"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              aria-pressed={showPassword}
              title={showPassword ? '隐藏密码' : '显示密码'}
            >
              {showPassword ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.3A10.8 10.8 0 0 1 12 4c5.2 0 8.5 4 9.5 6a16 16 0 0 1-3.2 3.8M6.2 6.2C3.9 7.7 2.8 9.4 2.5 10c1 2 4.3 6 9.5 6 1 0 1.9-.2 2.7-.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
              )}
            </button>
          </div>
        </label>
        {error && <p className="rounded-lg border border-terra-border bg-terra-light px-3 py-2 text-sm text-terra">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>{loading ? '处理中...' : mode === 'login' ? '登录' : '创建账号'}</button>
      </form>
    </div>
  </div>;
};

export default AuthView;
