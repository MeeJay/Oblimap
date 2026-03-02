import { useState, useEffect, type FormEvent } from 'react';
import { User, Save, KeyRound, Bell, CheckCircle2, AlertTriangle, QrCode, Mail } from 'lucide-react';
import { profileApi } from '@/api/profile.api';
import { appConfigApi } from '@/api/appConfig.api';
import { twoFactorApi, type TwoFactorStatus } from '@/api/twoFactor.api';
import { useAuthStore } from '@/store/authStore';
import { useLiveAlertsStore } from '@/store/liveAlertsStore';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import toast from 'react-hot-toast';

export function ProfilePage() {
  const { user: sessionUser, requires2faSetup } = useAuthStore();
  const { enabled: alertEnabled, position: alertPosition, setEnabled, setPosition } = useLiveAlertsStore();

  const [displayName, setDisplayName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [savingPrefs, setSavingPrefs] = useState(false);

  // 2FA state
  const [allow2fa, setAllow2fa] = useState(false);
  const [tfaStatus, setTfaStatus] = useState<TwoFactorStatus | null>(null);

  // TOTP setup flow
  const [totpSetupData, setTotpSetupData] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpSaving, setTotpSaving] = useState(false);

  // Email OTP setup flow
  const [emailSetupStep, setEmailSetupStep] = useState<'idle' | 'sent'>('idle');
  const [emailInput, setEmailInput] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);

  useEffect(() => {
    profileApi.get().then((profile) => {
      setDisplayName(profile.displayName || '');
    });
    appConfigApi.getConfig().then((cfg) => {
      setAllow2fa(cfg.allow_2fa);
    }).catch(() => {});
    twoFactorApi.getStatus().then(setTfaStatus).catch(() => {});
  }, []);

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await profileApi.update({ displayName: displayName || null });
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setSavingPassword(true);
    try {
      await profileApi.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to change password';
      toast.error(msg);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    try {
      await profileApi.update({
        preferences: {
          toastEnabled: alertEnabled,
          toastPosition: alertPosition,
        },
      });
      toast.success('Preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl min-w-0 mx-auto">
      <h1 className="text-2xl font-semibold text-text-primary mb-6">My Profile</h1>

      {/* Profile section */}
      <form onSubmit={handleProfileSubmit} className="mb-8">
        <div className="rounded-lg border border-border bg-bg-secondary p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <User size={18} className="text-accent" />
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
              Display Name
            </h2>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-text-secondary">Username</label>
            <p className="text-sm text-text-primary font-mono bg-bg-tertiary rounded-md px-3 py-2">
              {sessionUser?.username}
            </p>
          </div>

          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
          />

          <Button type="submit" loading={savingProfile}>
            <Save size={16} className="mr-1.5" />
            Save Profile
          </Button>
        </div>
      </form>

      {/* Password section */}
      <form onSubmit={handlePasswordSubmit} className="mb-8">
        <div className="rounded-lg border border-border bg-bg-secondary p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound size={18} className="text-accent" />
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
              Change Password
            </h2>
          </div>

          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
            required
          />

          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password (min 6 characters)"
            required
          />

          <Input
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            required
          />

          <Button type="submit" loading={savingPassword}>
            <KeyRound size={16} className="mr-1.5" />
            Change Password
          </Button>
        </div>
      </form>

      {/* Live Alert Notifications section */}
      <div className="mb-8">
        <div className="rounded-lg border border-border bg-bg-secondary p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Bell size={18} className="text-accent" />
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
              Live Alert Notifications
            </h2>
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Enable live alerts</p>
              <p className="text-xs text-text-muted mt-0.5">
                Show floating toast notifications when monitors change status
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!alertEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                alertEnabled ? 'bg-accent' : 'bg-bg-tertiary'
              }`}
              aria-pressed={alertEnabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  alertEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Position selector */}
          <div>
            <p className="text-sm font-medium text-text-primary mb-2">Notification position</p>
            <div className="flex flex-col gap-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="alertPosition"
                  value="bottom-right"
                  checked={alertPosition === 'bottom-right'}
                  onChange={() => setPosition('bottom-right')}
                  className="accent-accent mt-0.5"
                />
                <div>
                  <span className="text-sm text-text-primary">Bottom right — stack, auto-dismiss after 1 min</span>
                  <p className="text-xs text-text-muted">
                    Up to 5 alerts stacked in the bottom-right corner. Older alerts fade out gradually.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="alertPosition"
                  value="top-center"
                  checked={alertPosition === 'top-center'}
                  onChange={() => setPosition('top-center')}
                  className="accent-accent mt-0.5"
                />
                <div>
                  <span className="text-sm text-text-primary">Top center — latest only, auto-dismiss after 10 sec</span>
                  <p className="text-xs text-text-muted">
                    Only the most recent alert is shown, centered at the top of the page.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <Button type="button" onClick={handleSavePreferences} loading={savingPrefs}>
            <Save size={16} className="mr-1.5" />
            Save Preferences
          </Button>
        </div>
      </div>

      {/* Security / 2FA section */}
      {(allow2fa || requires2faSetup) && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Security</h2>

          {requires2faSetup && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-300">
                Your administrator requires Two-Factor Authentication. Please enable a method below.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-border bg-bg-secondary divide-y divide-border">
            {/* TOTP */}
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <QrCode size={16} className="text-text-muted" />
                  <p className="text-sm font-medium text-text-primary">Authenticator App (TOTP)</p>
                  {tfaStatus?.totpEnabled && <CheckCircle2 size={14} className="text-green-400" />}
                </div>
                {tfaStatus?.totpEnabled ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await twoFactorApi.totpDisable();
                        setTfaStatus((s) => s ? { ...s, totpEnabled: false } : s);
                        toast.success('TOTP disabled');
                      } catch { toast.error('Failed to disable TOTP'); }
                    }}
                  >
                    Disable
                  </Button>
                ) : !totpSetupData ? (
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        const data = await twoFactorApi.totpSetup();
                        setTotpSetupData(data);
                        setTotpCode('');
                      } catch { toast.error('Failed to start TOTP setup'); }
                    }}
                  >
                    Enable
                  </Button>
                ) : null}
              </div>

              {!tfaStatus?.totpEnabled && totpSetupData && (
                <div className="space-y-3">
                  <p className="text-xs text-text-muted">Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.</p>
                  <img src={totpSetupData.qrDataUrl} alt="TOTP QR Code" className="w-40 h-40 rounded-lg border border-border" />
                  <p className="text-xs text-text-muted font-mono break-all">Secret: {totpSetupData.secret}</p>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Input
                        label="Verification code"
                        type="text"
                        inputMode="numeric"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                      />
                    </div>
                    <Button
                      disabled={totpCode.length !== 6 || totpSaving}
                      loading={totpSaving}
                      onClick={async () => {
                        setTotpSaving(true);
                        try {
                          await twoFactorApi.totpEnable(totpCode);
                          setTfaStatus((s) => s ? { ...s, totpEnabled: true } : s);
                          setTotpSetupData(null);
                          setTotpCode('');
                          toast.success('TOTP enabled');
                        } catch { toast.error('Invalid code'); }
                        finally { setTotpSaving(false); }
                      }}
                    >
                      Confirm
                    </Button>
                    <Button variant="ghost" onClick={() => { setTotpSetupData(null); setTotpCode(''); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Email OTP */}
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail size={16} className="text-text-muted" />
                  <p className="text-sm font-medium text-text-primary">Email OTP</p>
                  {tfaStatus?.emailOtpEnabled && (
                    <>
                      <CheckCircle2 size={14} className="text-green-400" />
                      <span className="text-xs text-text-muted">{tfaStatus.email}</span>
                    </>
                  )}
                </div>
                {tfaStatus?.emailOtpEnabled ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await twoFactorApi.emailDisable();
                        setTfaStatus((s) => s ? { ...s, emailOtpEnabled: false, email: null } : s);
                        toast.success('Email OTP disabled');
                      } catch { toast.error('Failed to disable Email OTP'); }
                    }}
                  >
                    Disable
                  </Button>
                ) : emailSetupStep === 'idle' ? (
                  <Button size="sm" onClick={() => setEmailSetupStep('sent')}>Enable</Button>
                ) : null}
              </div>

              {!tfaStatus?.emailOtpEnabled && emailSetupStep === 'sent' && (
                <div className="space-y-3">
                  {emailSetupStep === 'sent' && !emailInput && (
                    <>
                      <Input
                        label="Your email address"
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="you@example.com"
                      />
                      <div className="flex gap-2">
                        <Button
                          disabled={!emailInput || emailSaving}
                          loading={emailSaving}
                          onClick={async () => {
                            setEmailSaving(true);
                            try {
                              await twoFactorApi.emailSetup(emailInput);
                              toast.success('Code sent to your email');
                            } catch { toast.error('Failed to send code'); setEmailInput(''); }
                            finally { setEmailSaving(false); }
                          }}
                        >
                          Send code
                        </Button>
                        <Button variant="ghost" onClick={() => { setEmailSetupStep('idle'); setEmailInput(''); setEmailCode(''); }}>Cancel</Button>
                      </div>
                    </>
                  )}
                  {emailInput && (
                    <>
                      <p className="text-xs text-text-muted">Enter the code sent to <strong>{emailInput}</strong></p>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <Input
                            label="Verification code"
                            type="text"
                            inputMode="numeric"
                            value={emailCode}
                            onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000000"
                          />
                        </div>
                        <Button
                          disabled={emailCode.length !== 6 || emailSaving}
                          loading={emailSaving}
                          onClick={async () => {
                            setEmailSaving(true);
                            try {
                              await twoFactorApi.emailEnable(emailCode);
                              const status = await twoFactorApi.getStatus();
                              setTfaStatus(status);
                              setEmailSetupStep('idle');
                              setEmailInput('');
                              setEmailCode('');
                              toast.success('Email OTP enabled');
                            } catch { toast.error('Invalid code'); }
                            finally { setEmailSaving(false); }
                          }}
                        >
                          Confirm
                        </Button>
                        <Button variant="ghost" onClick={() => { setEmailSetupStep('idle'); setEmailInput(''); setEmailCode(''); }}>Cancel</Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
