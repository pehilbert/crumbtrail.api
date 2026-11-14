import type { Journal } from './journal.schema.js';

export interface JournalView {
  id: string;
  recipeId: string;
  content: string;
  postedAt: Date;
  editedAt: Date | null;
}

export function toJournalView(journal: Journal): JournalView {
  return {
    id: journal._id,
    recipeId: journal.recipeId,
    content: journal.content,
    postedAt: journal.postedAt,
    editedAt: journal.editedAt ?? null,
  };
}
