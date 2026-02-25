import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [serverVersion, setServerVersion] = useState<string | null>(null);

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
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-sm space-y-8 relative">
        {/* Logo / Title */}
        <div className="text-center">
          <img src="/logo.webp" alt="Obliview" className="mx-auto h-16 w-16 mb-3" />
          <h1 className="text-3xl font-bold text-text-primary">
            Obliview
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Monitoring Dashboard
          </p>
        </div>

        {/* Login Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-lg border border-border bg-bg-secondary p-6"
        >
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

          <Button
            type="submit"
            className="w-full"
            loading={isLoading}
          >
            Sign in
          </Button>
        </form>
      </div>

      {/* Version footer */}
      <p className="fixed bottom-3 left-0 right-0 text-center text-xs text-text-secondary/50 select-none">
        client v{__APP_VERSION__}
        {serverVersion && ` · server v${serverVersion}`}
      </p>
    </div>
  );
}
