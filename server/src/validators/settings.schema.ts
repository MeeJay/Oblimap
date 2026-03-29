import { z } from 'zod';
import { SETTINGS_KEYS } from '@oblimap/shared';

const settingsKeyValues = Object.values(SETTINGS_KEYS) as [string, ...string[]];

const settingValue = z.union([
  z.number(),
  z.boolean(),
  z.string(),
  z.array(z.union([z.string(), z.number()])),
]);

export const setSettingSchema = z.object({
  key: z.enum(settingsKeyValues),
  value: settingValue,
});

export const setSettingsBulkSchema = z.object({
  overrides: z.array(
    z.object({
      key: z.enum(settingsKeyValues),
      value: settingValue,
    }),
  ),
});

export const deleteSettingSchema = z.object({
  key: z.enum(settingsKeyValues),
});

export type SetSettingInput = z.infer<typeof setSettingSchema>;
export type SetSettingsBulkInput = z.infer<typeof setSettingsBulkSchema>;
export type DeleteSettingInput = z.infer<typeof deleteSettingSchema>;
