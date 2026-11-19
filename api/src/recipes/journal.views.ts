import { z } from 'zod';
import type { Journal } from './journal.schema.js';

export const journalViewSchema = z
  .object({
    id: z.uuid(),
    recipeId: z.uuid(),
    content: z.string(),
    postedAt: z.iso.datetime(),
    editedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'JournalEntry' });
export type JournalView = z.infer<typeof journalViewSchema>;

export function toJournalView(journal: Journal): JournalView {
  return {
    id: journal._id,
    recipeId: journal.recipeId,
    content: journal.content,
    postedAt: journal.postedAt.toISOString(),
    editedAt: journal.editedAt?.toISOString() ?? null,
  };
}
