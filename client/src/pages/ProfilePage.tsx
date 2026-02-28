import { useState, useEffect, type FormEvent } from 'react';
import { User, Save, KeyRound } from 'lucide-react';
import { profileApi } from '@/api/profile.api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import toast from 'react-hot-toast';

export function ProfilePage() {
  const { user: sessionUser } = useAuthStore();
  const [displayName, setDisplayName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    profileApi.get().then((profile) => {
      setDisplayName(profile.displayName || '');
    });
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

  return (
    <div className="p-6 max-w-2xl mx-auto">
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
      <form onSubmit={handlePasswordSubmit}>
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
    </div>
  );
}
