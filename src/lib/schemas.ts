import { z } from 'zod';

/**
 * Wire and storage shapes shared by the browser and the local server. Pure Zod, no DOM or Node
 * APIs, so both sides import the same definitions.
 */
const num = z.number();
const nullableNum = z.number().nullable();

export const goalSchema = z.object({ target: num, targetDay: z.string().nullable() });

export const pillarSchema = z.object({ id: z.string(), name: z.string(), slot: num });

export const calendarEntrySchema = z.object({
  id: z.string(),
  day: z.string().nullable(),
  title: z.string(),
  notes: z.string(),
  format: z.enum(['testo', 'immagine', 'carosello', 'video', 'sondaggio', 'articolo']),
  pillarId: z.string().nullable(),
  status: z.enum(['idea', 'bozza', 'programmato', 'pubblicato']),
  postUrl: z.string().nullable(),
});

export const calendarSchema = z.object({
  postsPerWeek: num,
  pillars: z.array(pillarSchema),
  entries: z.array(calendarEntrySchema),
});

const dailyPointSchema = z.object({ date: z.string(), impressions: num, engagements: num });
const followerPointSchema = z.object({ date: z.string(), newFollowers: num });
const demographicSchema = z.object({ category: z.string(), value: z.string(), percentage: num });

export const historySchema = z.object({
  engagement: z.array(dailyPointSchema),
  followers: z.array(followerPointSchema),
  followerTotals: z.array(z.object({ day: z.string(), total: num })),
  posts: z.array(
    z.object({
      url: z.string(),
      day: z.string(),
      engagements: nullableNum,
      impressions: nullableNum,
    }),
  ),
  demographics: z.array(demographicSchema),
  imports: z.array(
    z.object({
      fileName: z.string(),
      importedAt: z.string(),
      rangeLabel: z.string().nullable(),
      firstDay: z.string().nullable(),
      lastDay: z.string().nullable(),
      impressions: nullableNum,
      membersReached: nullableNum,
    }),
  ),
});

export const appStateSchema = z.object({
  version: z.literal(1),
  history: historySchema,
  goal: goalSchema,
  calendar: calendarSchema,
});

const topPostSchema = z.object({ url: z.string(), date: z.string(), value: num });

/** A parsed LinkedIn export, as produced by `parseLinkedInExport` in the browser. */
export const linkedInExportSchema = z.object({
  rangeLabel: z.string().nullable(),
  impressions: nullableNum,
  membersReached: nullableNum,
  totalFollowers: nullableNum,
  totalFollowersAsOf: z.string().nullable(),
  engagement: z.array(dailyPointSchema),
  followers: z.array(followerPointSchema),
  topByEngagement: z.array(topPostSchema),
  topByImpressions: z.array(topPostSchema),
  demographics: z.array(demographicSchema),
});

export const importRequestSchema = z.object({
  fileName: z.string().min(1),
  data: linkedInExportSchema,
});
