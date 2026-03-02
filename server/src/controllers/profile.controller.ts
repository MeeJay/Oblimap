import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { comparePassword, hashPassword } from '../utils/crypto';
import { AppError } from '../middleware/errorHandler';
import type { UpdateProfileInput, ChangePasswordInput } from '../validators/profile.schema';

export const profileController = {
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const row = await db('users')
        .select('id', 'username', 'display_name', 'role', 'is_active', 'created_at', 'updated_at', 'preferences')
        .where({ id: req.session.userId })
        .first();

      if (!row) throw new AppError(404, 'User not found');

      res.json({
        success: true,
        data: {
          id: row.id,
          username: row.username,
          displayName: row.display_name,
          role: row.role,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          preferences: row.preferences ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body as UpdateProfileInput;

      const updatePayload: Record<string, unknown> = {
        updated_at: new Date(),
      };

      if ('displayName' in data) {
        updatePayload.display_name = data.displayName;
      }

      if ('preferences' in data) {
        updatePayload.preferences = data.preferences !== undefined ? JSON.stringify(data.preferences) : null;
      }

      const [row] = await db('users')
        .where({ id: req.session.userId })
        .update(updatePayload)
        .returning(['id', 'username', 'display_name', 'role', 'is_active', 'created_at', 'updated_at', 'preferences']);

      if (!row) throw new AppError(404, 'User not found');

      res.json({
        success: true,
        data: {
          id: row.id,
          username: row.username,
          displayName: row.display_name,
          role: row.role,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          preferences: row.preferences ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body as ChangePasswordInput;

      // Get current password hash
      const user = await db('users')
        .select('password_hash')
        .where({ id: req.session.userId })
        .first();

      if (!user) throw new AppError(404, 'User not found');

      // Verify current password
      const valid = await comparePassword(currentPassword, user.password_hash);
      if (!valid) {
        throw new AppError(400, 'Current password is incorrect');
      }

      // Hash and save new password
      const newHash = await hashPassword(newPassword);
      await db('users')
        .where({ id: req.session.userId })
        .update({ password_hash: newHash, updated_at: new Date() });

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
      next(err);
    }
  },
};
