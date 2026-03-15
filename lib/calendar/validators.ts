import { z } from 'zod';

export const isoDateSchema = z.string().datetime({ offset: true });

export const dateRangeSchema = z
  .object({
    startAt: isoDateSchema,
    endAt: isoDateSchema,
  })
  .refine((v) => new Date(v.startAt).getTime() < new Date(v.endAt).getTime(), {
    message: 'startAt must be before endAt',
  });

export const calendarProviderSchema = z.enum(['blackwaves', 'microsoft', 'google', 'manual', 'hplus']);
export const syncModeSchema = z.enum(['read', 'read_write']);

export const eventInputSchema = z
  .object({
    title: z.string().min(1).max(240),
    description: z.string().max(5000).nullish(),
    location: z.string().max(500).nullish(),
    start_at: isoDateSchema,
    end_at: isoDateSchema,
    timezone: z.string().max(80).nullish(),
    all_day: z.boolean().optional(),
    status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
    visibility: z.string().max(80).optional(),
    meeting_url: z.string().max(500).nullish(),
    organizer_email: z.string().email().nullish(),
    attendees: z
      .array(
        z.object({
          email: z.string().email().optional(),
          name: z.string().max(180).optional(),
          response: z.string().max(60).optional(),
        })
      )
      .optional(),
    category: z.string().max(120).nullish(),
    event_type: z.string().max(120).nullish(),
    priority: z.number().int().min(1).max(4).optional(),
    is_blocking: z.boolean().optional(),
    source_id: z.string().uuid().nullish(),
    source_provider: calendarProviderSchema.optional(),
    source_event_id: z.string().max(240).nullish(),
  })
  .refine((v) => new Date(v.start_at).getTime() < new Date(v.end_at).getTime(), {
    message: 'start_at must be before end_at',
  });

export const sourceCreateSchema = z.object({
  provider: calendarProviderSchema,
  label: z.string().min(1).max(180),
  sync_mode: syncModeSchema.default('read'),
  is_enabled: z.boolean().default(true),
  external_calendar_id: z.string().max(240).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const availabilityRequestSchema = z.object({
  range: dateRangeSchema,
  durationMinutes: z.number().int().min(15).max(480),
  limit: z.number().int().min(1).max(50).optional(),
  intent: z
    .object({
      preferredMoments: z.array(z.string()).optional(),
      avoidLateMeetings: z.boolean().optional(),
    })
    .optional(),
});

export const scheduleRequestSchema = z.object({
  requestText: z.string().min(3).max(2000),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const confirmScheduleSchema = z.object({
  selectedSlot: z.object({
    startAt: isoDateSchema,
    endAt: isoDateSchema,
  }),
  targetMode: z.enum(['internal_only', 'external', 'dual']).default('dual'),
  targetSourceId: z.string().uuid().optional(),
});

export const sourceSyncRequestSchema = z.object({
  range: dateRangeSchema.optional(),
});
