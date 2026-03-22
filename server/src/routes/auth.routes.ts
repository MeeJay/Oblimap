import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { enrollmentController } from '../controllers/enrollment.controller';
import { passwordResetController } from '../controllers/passwordReset.controller';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimiter';
import { loginSchema } from '../validators/auth.schema';

const router = Router();

router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/logout', requireAuth, authController.logout);
router.get('/me', requireAuth, authController.me);
router.get('/permissions', requireAuth, authController.permissions);

// Enrollment (requires auth — user must be logged in)
router.post('/enrollment', requireAuth, enrollmentController.complete);

// Set local password for SSO-provisioned accounts (no current password required)
router.post('/set-password', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
    const { password } = req.body as { password?: string };
    if (!password || password.length < 8) { res.status(400).json({ success: false, error: 'Password must be at least 8 characters' }); return; }
    const { hashPassword } = await import('../utils/crypto');
    const hash = await hashPassword(password);
    const { db } = await import('../db');
    await db('users').where({ id: userId }).update({ password_hash: hash, updated_at: new Date() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to set password' });
  }
});

// Password reset (public)
router.post('/forgot-password', authLimiter, passwordResetController.forgot);
router.post('/reset-password/validate', passwordResetController.validate);
router.post('/reset-password', passwordResetController.reset);

export default router;
