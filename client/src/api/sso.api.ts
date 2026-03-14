import apiClient from './client';
import type { User, ApiResponse } from '@oblimap/shared';

export const ssoApi = {
  /**
   * Generate a one-time 60s switch token for the current user.
   * Call this before redirecting to the other app's /auth/foreign page.
   */
  async generateSwitchToken(): Promise<string> {
    const res = await apiClient.post<ApiResponse<{ token: string }>>('/sso/generate-token');
    return res.data.data!.token;
  },

  /**
   * Exchange an incoming token from another app.
   * Called by ForeignAuthPage after arriving from Obliguard.
   * Creates a local session and returns the user.
   */
  async exchange(
    token: string,
    from: string,
  ): Promise<
    | { user: User; isFirstLogin: boolean }
    | { needsLinking: true; linkToken: string; conflictingUsername: string }
  > {
    const res = await apiClient.post<ApiResponse<
      | { user: User; isFirstLogin: boolean }
      | { needsLinking: true; linkToken: string; conflictingUsername: string }
    >>('/sso/exchange', { token, from });
    return res.data.data!;
  },

  /**
   * Complete the account-linking flow after verifying local password.
   * Returns either the linked user (no 2FA) or { requires2fa, methods } if 2FA is enabled.
   */
  async completeLink(
    linkToken: string,
    password: string,
  ): Promise<
    | { user: User; isFirstLogin: boolean }
    | { requires2fa: true; methods: { totp: boolean; email: boolean } }
  > {
    const res = await apiClient.post<ApiResponse<
      | { user: User; isFirstLogin: boolean }
      | { requires2fa: true; methods: { totp: boolean; email: boolean } }
    >>('/sso/complete-link', { linkToken, password });
    return res.data.data!;
  },

  /**
   * Second step of account linking when 2FA is required.
   * Pass resend: true to resend the email OTP without a code.
   */
  async verifyLink2fa(
    code: string,
    method: 'totp' | 'email',
  ): Promise<{ user: User; isFirstLogin: boolean }> {
    const res = await apiClient.post<ApiResponse<{ user: User; isFirstLogin: boolean }>>(
      '/sso/verify-link-2fa',
      { code, method },
    );
    return res.data.data!;
  },

  async resendLink2faEmail(): Promise<void> {
    await apiClient.post('/sso/verify-link-2fa', { resend: true });
  },

  /**
   * Set a local password for the current user (SSO-only accounts only).
   * Called after first SSO login when user opts into local login.
   */
  async setLocalPassword(password: string): Promise<void> {
    await apiClient.post('/sso/set-password', { password });
  },
};
