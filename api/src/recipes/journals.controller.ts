import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { ApiErrors } from '../openapi/openapi.js';
import type { User } from '../users/user.schema.js';
import type { Journal } from './journal.schema.js';
import {
  type JournalView,
  journalViewSchema,
  toJournalView,
} from './journal.views.js';
import {
  type JournalContentDto,
  journalContentSchema,
  journalIdSchema,
} from './journals.schemas.js';
import { JournalsService } from './journals.service.js';
import { recipeIdSchema } from './recipes.schemas.js';
import { RecipesService } from './recipes.service.js';

const RECIPE_NOT_FOUND =
  'Recipe does not exist, is archived, or its author is deactivated';
const ENTRY_NOT_FOUND =
  'Entry does not exist, or its recipe is archived or its author deactivated';

/**
 * Creating and listing entries goes through their recipe
 * (/recipes/{recipeId}/journals); changing one entry goes to /journals/{id}.
 */
@ApiTags('journals')
@Controller({ version: '1' })
export class JournalsController {
  constructor(
    private readonly journals: JournalsService,
    private readonly recipes: RecipesService,
  ) {}

  @Public()
  @Get('recipes/:recipeId/journals')
  @ApiOperation({
    summary: "List a recipe's journal entries",
    description: 'Newest first. No pagination yet.',
  })
  @ApiOkResponse({
    description: 'The entries',
    standardSchema: z.array(journalViewSchema),
  })
  @ApiErrors({ 400: 'Invalid recipe ID' }, { 404: RECIPE_NOT_FOUND })
  async listForRecipe(
    @Param('recipeId', { schema: recipeIdSchema }) recipeId: string,
  ): Promise<JournalView[]> {
    await this.recipes.getLive(recipeId);
    const journals = await this.journals.listForRecipe(recipeId);
    return journals.map(toJournalView);
  }

  @Post('recipes/:recipeId/journals')
  @ApiOperation({
    summary: 'Add a journal entry to a recipe',
    description: "Only the recipe's author may add entries.",
  })
  @ApiCreatedResponse({
    description: 'The new entry',
    standardSchema: journalViewSchema,
  })
  @ApiErrors(
    { 400: 'Invalid recipe ID or body' },
    401,
    { 403: 'Not the recipe author' },
    { 404: RECIPE_NOT_FOUND },
  )
  async create(
    @Param('recipeId', { schema: recipeIdSchema }) recipeId: string,
    @CurrentUser() user: User,
    @Body({ schema: journalContentSchema }) dto: JournalContentDto,
  ): Promise<JournalView> {
    await this.recipes.getOwned(recipeId, user);
    return toJournalView(await this.journals.create(recipeId, dto.content));
  }

  @Public()
  @Get('journals/:id')
  @ApiOperation({ summary: 'Get a journal entry' })
  @ApiOkResponse({
    description: 'The entry',
    standardSchema: journalViewSchema,
  })
  @ApiErrors({ 400: 'Invalid journal ID' }, { 404: ENTRY_NOT_FOUND })
  async findOne(
    @Param('id', { schema: journalIdSchema }) id: string,
  ): Promise<JournalView> {
    const journal = await this.getJournal(id);
    await this.recipes.getLive(journal.recipeId);
    return toJournalView(journal);
  }

  @Patch('journals/:id')
  @ApiOperation({
    summary: 'Edit a journal entry',
    description:
      "Replaces the content. Only the recipe's author may edit. Sets editedAt.",
  })
  @ApiOkResponse({
    description: 'The updated entry',
    standardSchema: journalViewSchema,
  })
  @ApiErrors(
    { 400: 'Invalid journal ID or body' },
    401,
    { 403: 'Not the recipe author' },
    { 404: ENTRY_NOT_FOUND },
  )
  async update(
    @Param('id', { schema: journalIdSchema }) id: string,
    @CurrentUser() user: User,
    @Body({ schema: journalContentSchema }) dto: JournalContentDto,
  ): Promise<JournalView> {
    const journal = await this.getJournal(id);
    await this.recipes.getOwned(journal.recipeId, user);
    const updated = await this.journals.update(id, dto.content);
    if (!updated) throw notFound();
    return toJournalView(updated);
  }

  @Delete('journals/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a journal entry',
    description:
      "Permanent (hard delete). Only the recipe's author may delete.",
  })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(
    { 400: 'Invalid journal ID' },
    401,
    { 403: 'Not the recipe author' },
    { 404: ENTRY_NOT_FOUND },
  )
  async delete(
    @Param('id', { schema: journalIdSchema }) id: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    const journal = await this.getJournal(id);
    await this.recipes.getOwned(journal.recipeId, user);
    if (!(await this.journals.delete(id))) throw notFound();
  }

  private async getJournal(id: string): Promise<Journal> {
    const journal = await this.journals.findById(id);
    if (!journal) throw notFound();
    return journal;
  }
}

function notFound(): NotFoundException {
  return new NotFoundException('Journal entry not found');
}
