import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { ApiErrors } from '../openapi/openapi.js';
import type { User } from '../users/user.schema.js';
import { toJournalView } from './journal.views.js';
import { JournalsService } from './journals.service.js';
import type { Recipe } from './recipe.schema.js';
import {
  type ArchivedRecipe,
  archivedRecipeSchema,
  type FullRecipe,
  fullRecipeSchema,
  type RecipeSummary,
  recipeSummarySchema,
  toFullRecipe,
  toRecipeSummary,
} from './recipe.views.js';
import {
  type CreateRecipeDto,
  createRecipeSchema,
  recipeIdSchema,
  type UpdateRecipeDto,
  updateRecipeSchema,
} from './recipes.schemas.js';
import { RecipesService } from './recipes.service.js';

const NOT_FOUND =
  'Recipe does not exist, is archived, or its author is deactivated';

@ApiTags('recipes')
@Controller({ path: 'recipes', version: '1' })
export class RecipesController {
  constructor(
    private readonly recipes: RecipesService,
    private readonly journals: JournalsService,
  ) {}

  // Declared before ':id' so "me" is not treated as an ID.
  @Get('me')
  @ApiOperation({
    summary: 'List my recipes',
    description:
      'Active recipes of the token user, newest first. No pagination yet.',
  })
  @ApiOkResponse({
    description: 'Recipe summaries (journalCount instead of journals)',
    standardSchema: z.array(recipeSummarySchema),
  })
  @ApiErrors(401)
  async mine(@CurrentUser() user: User): Promise<RecipeSummary[]> {
    const recipes = await this.recipes.listByAuthor(user._id);
    const counts = await this.journals.countForRecipes(
      recipes.map((r) => r._id),
    );
    return recipes.map((recipe) =>
      toRecipeSummary(recipe, user, counts.get(recipe._id) ?? 0),
    );
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a recipe with its journal entries' })
  @ApiOkResponse({
    description: 'The recipe, journal entries newest first',
    standardSchema: fullRecipeSchema,
  })
  @ApiErrors({ 400: 'Invalid recipe ID (not a GUID)' }, { 404: NOT_FOUND })
  async findOne(
    @Param('id', { schema: recipeIdSchema }) id: string,
  ): Promise<FullRecipe> {
    const { recipe, author } = await this.recipes.getLive(id);
    return this.withJournals(recipe, author);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a recipe',
    description:
      'The author is the token user. Tags are trimmed, lowercased and de-duplicated.',
  })
  @ApiCreatedResponse({
    description: 'The new recipe (journals is empty)',
    standardSchema: fullRecipeSchema,
  })
  @ApiErrors(400, 401)
  async create(
    @CurrentUser() user: User,
    @Body({ schema: createRecipeSchema }) dto: CreateRecipeDto,
  ): Promise<FullRecipe> {
    const recipe = await this.recipes.create(user._id, dto);
    return toFullRecipe(recipe, user, []);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a recipe',
    description:
      'Only the author may edit. Omitted fields are unchanged; null clears description or timeEstimateMinutes; ' +
      'ingredients, steps and tags replace the whole array. Sets editedAt.',
  })
  @ApiOkResponse({
    description: 'The updated recipe',
    standardSchema: fullRecipeSchema,
  })
  @ApiErrors(
    { 400: 'Invalid ID, or invalid or empty body' },
    401,
    { 403: 'Not the author' },
    { 404: NOT_FOUND },
  )
  async update(
    @Param('id', { schema: recipeIdSchema }) id: string,
    @CurrentUser() user: User,
    @Body({ schema: updateRecipeSchema }) dto: UpdateRecipeDto,
  ): Promise<FullRecipe> {
    await this.recipes.getOwned(id, user);
    const recipe = await this.recipes.update(id, dto);
    return this.withJournals(recipe, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Archive a recipe',
    description:
      'Soft delete. Only the author may archive. Afterwards the recipe and its journal entries return 404.',
  })
  @ApiOkResponse({
    description: 'Archived',
    standardSchema: archivedRecipeSchema,
  })
  @ApiErrors(
    { 400: 'Invalid recipe ID' },
    401,
    { 403: 'Not the author' },
    { 404: `${NOT_FOUND} (including already archived)` },
  )
  async archive(
    @Param('id', { schema: recipeIdSchema }) id: string,
    @CurrentUser() user: User,
  ): Promise<ArchivedRecipe> {
    await this.recipes.getOwned(id, user);
    await this.recipes.archive(id);
    return { id, archived: true };
  }

  private async withJournals(
    recipe: Recipe,
    author: User,
  ): Promise<FullRecipe> {
    const journals = await this.journals.listForRecipe(recipe._id);
    return toFullRecipe(recipe, author, journals.map(toJournalView));
  }
}
