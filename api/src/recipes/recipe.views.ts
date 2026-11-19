import { z } from 'zod';
import type { User } from '../users/user.schema.js';
import { type JournalView, journalViewSchema } from './journal.views.js';
import type { Recipe } from './recipe.schema.js';

const recipeAuthorSchema = z
  .object({ id: z.uuid(), username: z.string() })
  .meta({ id: 'RecipeAuthor' });

const ingredientViewSchema = z
  .object({
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    ingredient: z.string(),
    adjective: z.string().nullable(),
  })
  .meta({ id: 'Ingredient' });

const recipeViewSchema = z.object({
  id: z.uuid(),
  author: recipeAuthorSchema,
  title: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  timeEstimateMinutes: z.int().nullable(),
  ingredients: z.array(ingredientViewSchema),
  steps: z.array(z.string()),
  publishedAt: z.iso.datetime(),
  editedAt: z.iso.datetime().nullable(),
});
type RecipeView = z.infer<typeof recipeViewSchema>;

/** GET by ID, POST and PATCH: the recipe with its journal entries, newest first. */
export const fullRecipeSchema = recipeViewSchema
  .extend({ journals: z.array(journalViewSchema) })
  .meta({ id: 'Recipe' });
export type FullRecipe = z.infer<typeof fullRecipeSchema>;

/** GET /recipes/me: the recipe with a count of its journal entries. */
export const recipeSummarySchema = recipeViewSchema
  .extend({ journalCount: z.int() })
  .meta({ id: 'RecipeSummary' });
export type RecipeSummary = z.infer<typeof recipeSummarySchema>;

/** Response to DELETE /recipes/{id}. */
export const archivedRecipeSchema = z
  .object({ id: z.uuid(), archived: z.literal(true) })
  .meta({ id: 'ArchivedRecipe' });
export type ArchivedRecipe = z.infer<typeof archivedRecipeSchema>;

function toRecipeView(recipe: Recipe, author: User): RecipeView {
  return {
    id: recipe._id,
    author: { id: author._id, username: author.username },
    title: recipe.title,
    description: recipe.description ?? null,
    tags: recipe.tags,
    timeEstimateMinutes: recipe.timeEstimateMinutes ?? null,
    ingredients: recipe.ingredients.map((i) => ({
      quantity: i.quantity ?? null,
      unit: i.unit ?? null,
      ingredient: i.ingredient,
      adjective: i.adjective ?? null,
    })),
    steps: recipe.steps,
    publishedAt: recipe.publishedAt.toISOString(),
    editedAt: recipe.editedAt?.toISOString() ?? null,
  };
}

export function toFullRecipe(
  recipe: Recipe,
  author: User,
  journals: JournalView[],
): FullRecipe {
  return { ...toRecipeView(recipe, author), journals };
}

export function toRecipeSummary(
  recipe: Recipe,
  author: User,
  journalCount: number,
): RecipeSummary {
  return { ...toRecipeView(recipe, author), journalCount };
}
