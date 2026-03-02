import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { twoFactorApi } from '@/api/twoFactor.api';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';

type Step = 'credentials' | '2fa';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, checkSession } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [serverVersion, setServerVersion] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('credentials');
  const [mfaMethods, setMfaMethods] = useState<{ totp: boolean; email: boolean }>({ totp: false, email: false });
  const [mfaTab, setMfaTab] = useState<'totp' | 'email'>('totp');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  useEffect(() => {
    fetch('/health')
      .then((r) => r.json())
      .then((data: { version?: string }) => setServerVersion(data.version ?? null))
      .catch(() => { /* ignore */ });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const result = await login(username, password);
      if (result.requires2fa) {
        setMfaMethods(result.methods);
        setMfaTab(result.methods.totp ? 'totp' : 'email');
        setMfaCode('');
        setStep('2fa');
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const handleMfaSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMfaLoading(true);
    try {
      await twoFactorApi.verify(mfaCode, mfaTab);
      await checkSession();
      navigate('/', { replace: true });
    } catch {
      setError('Invalid code. Please try again.');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleResendEmail = async () => {
    try {
      await twoFactorApi.resendEmail();
    } catch {
      setError('Failed to resend code');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-sm space-y-8 relative">
        <div className="text-center">
          <img src="/logo.webp" alt="Obliview" className="mx-auto h-16 w-16 mb-3" />
          <h1 className="text-3xl font-bold text-text-primary">Obliview</h1>
          <p className="mt-2 text-sm text-text-secondary">Monitoring Dashboard</p>
        </div>

        {step === 'credentials' ? (
          <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-border bg-bg-secondary p-6">
            <Input
              label="Username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              autoFocus
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
            {error && (
              <div className="rounded-md bg-status-down-bg border border-status-down/30 p-3">
                <p className="text-sm text-status-down">{error}</p>
              </div>
            )}
            <Button type="submit" className="w-full" loading={isLoading}>
              Sign in
            </Button>
          </form>
        ) : (
          <form onSubmit={handleMfaSubmit} className="space-y-5 rounded-lg border border-border bg-bg-secondary p-6">
            <div>
              <p className="text-sm font-medium text-text-primary mb-1">Two-Factor Authentication</p>
              <p className="text-xs text-text-muted">Enter the verification code to continue.</p>
            </div>

            {mfaMethods.totp && mfaMethods.email && (
              <div className="flex rounded-md border border-border overflow-hidden text-sm">
                <button
                  type="button"
                  onClick={() => setMfaTab('totp')}
                  className={`flex-1 py-1.5 transition-colors ${mfaTab === 'totp' ? 'bg-primary text-white' : 'text-text-secondary hover:bg-bg-hover'}`}
                >
                  Authenticator App
                </button>
                <button
                  type="button"
                  onClick={() => setMfaTab('email')}
                  className={`flex-1 py-1.5 transition-colors ${mfaTab === 'email' ? 'bg-primary text-white' : 'text-text-secondary hover:bg-bg-hover'}`}
                >
                  Email Code
                </button>
              </div>
            )}

            {mfaTab === 'email' && (
              <p className="text-xs text-text-muted">A code was sent to your email address.</p>
            )}

            <Input
              label={mfaTab === 'totp' ? 'Authenticator code' : 'Email code'}
              type="text"
              inputMode="numeric"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              autoFocus
              required
            />

            {error && (
              <div className="rounded-md bg-status-down-bg border border-status-down/30 p-3">
                <p className="text-sm text-status-down">{error}</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Button type="submit" className="w-full" loading={mfaLoading}>Verify</Button>
              {mfaTab === 'email' && (
                <button type="button" onClick={handleResendEmail} className="text-xs text-text-muted hover:text-text-primary text-center">
                  Resend code
                </button>
              )}
              <button type="button" onClick={() => { setStep('credentials'); setError(''); }} className="text-xs text-text-muted hover:text-text-primary text-center">
                ← Back to login
              </button>
            </div>
          </form>
        )}
      </div>

      <p className="fixed bottom-3 left-0 right-0 text-center text-xs text-text-secondary/50 select-none">
        client v{__APP_VERSION__}
        {serverVersion && ` · server v${serverVersion}`}
      </p>
    </div>
  );
}
