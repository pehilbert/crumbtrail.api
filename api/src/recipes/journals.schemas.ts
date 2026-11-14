import { z } from 'zod';

export const journalIdSchema = z.uuid({ error: 'id must be a valid GUID' });

/** Used for both creating and editing an entry. */
export const journalContentSchema = z
  .strictObject({
    content: z.string().trim().min(1).max(10_000),
  })
  .meta({ id: 'JournalContentRequest' });
export type JournalContentDto = z.infer<typeof journalContentSchema>;
