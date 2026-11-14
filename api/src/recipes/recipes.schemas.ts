import { z } from 'zod';

export const recipeIdSchema = z.uuid({ error: 'id must be a valid GUID' });

const title = z.string().trim().min(1).max(120);
const description = z.string().trim().min(1).max(2000).nullable();
const tags = z
  .array(z.string().trim().toLowerCase().min(1).max(30))
  .max(20)
  .transform((values) => [...new Set(values)]);
const timeEstimateMinutes = z.int().min(1).max(10_080).nullable();

const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional().default(null);

const ingredient = z.strictObject({
  quantity: z.number().positive().nullable().optional().default(null),
  unit: optionalText(30),
  ingredient: z.string().trim().min(1).max(100),
  adjective: optionalText(50),
});
const ingredients = z.array(ingredient).min(1).max(100);
const steps = z.array(z.string().trim().min(1).max(5000)).min(1).max(100);

export const createRecipeSchema = z.strictObject({
  title,
  description: description.optional().default(null),
  tags: tags.optional().default([]),
  timeEstimateMinutes: timeEstimateMinutes.optional().default(null),
  ingredients,
  steps,
});
export type CreateRecipeDto = z.infer<typeof createRecipeSchema>;

export const updateRecipeSchema = z
  .strictObject({
    title,
    description,
    tags,
    timeEstimateMinutes,
    ingredients,
    steps,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    error: 'At least one field must be provided',
  });
export type UpdateRecipeDto = z.infer<typeof updateRecipeSchema>;
