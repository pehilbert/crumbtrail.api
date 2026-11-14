import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import type { User } from '../users/user.schema.js';
import { toJournalView } from './journal.views.js';
import { JournalsService } from './journals.service.js';
import type { Recipe } from './recipe.schema.js';
import {
  type FullRecipe,
  type RecipeSummary,
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

@Controller({ path: 'recipes', version: '1' })
export class RecipesController {
  constructor(
    private readonly recipes: RecipesService,
    private readonly journals: JournalsService,
  ) {}

  // Declared before ':id' so "me" is not treated as an ID.
  @Get('me')
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
  async findOne(
    @Param('id', { schema: recipeIdSchema }) id: string,
  ): Promise<FullRecipe> {
    const { recipe, author } = await this.recipes.getLive(id);
    return this.withJournals(recipe, author);
  }

  @Post()
  async create(
    @CurrentUser() user: User,
    @Body({ schema: createRecipeSchema }) dto: CreateRecipeDto,
  ): Promise<FullRecipe> {
    const recipe = await this.recipes.create(user._id, dto);
    return toFullRecipe(recipe, user, []);
  }

  @Patch(':id')
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
  async archive(
    @Param('id', { schema: recipeIdSchema }) id: string,
    @CurrentUser() user: User,
  ): Promise<{ id: string; archived: true }> {
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
