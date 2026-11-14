import type { User } from '../users/user.schema.js';
import type { JournalView } from './journal.views.js';
import type { Ingredient, Recipe } from './recipe.schema.js';

export interface RecipeAuthor {
  id: string;
  username: string;
}

export interface RecipeView {
  id: string;
  author: RecipeAuthor;
  title: string;
  description: string | null;
  tags: string[];
  timeEstimateMinutes: number | null;
  ingredients: Ingredient[];
  steps: string[];
  publishedAt: Date;
  editedAt: Date | null;
}

/** GET by ID, POST and PATCH. */
export interface FullRecipe extends RecipeView {
  journals: JournalView[];
}

/** GET /recipes/me. */
export interface RecipeSummary extends RecipeView {
  journalCount: number;
}

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
    publishedAt: recipe.publishedAt,
    editedAt: recipe.editedAt ?? null,
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
