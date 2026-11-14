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
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import type { User } from '../users/user.schema.js';
import type { Journal } from './journal.schema.js';
import { type JournalView, toJournalView } from './journal.views.js';
import {
  type JournalContentDto,
  journalContentSchema,
  journalIdSchema,
} from './journals.schemas.js';
import { JournalsService } from './journals.service.js';
import { recipeIdSchema } from './recipes.schemas.js';
import { RecipesService } from './recipes.service.js';

/**
 * Creating and listing entries goes through their recipe
 * (/recipes/{recipeId}/journals); changing one entry goes to /journals/{id}.
 */
@Controller({ version: '1' })
export class JournalsController {
  constructor(
    private readonly journals: JournalsService,
    private readonly recipes: RecipesService,
  ) {}

  @Public()
  @Get('recipes/:recipeId/journals')
  async listForRecipe(
    @Param('recipeId', { schema: recipeIdSchema }) recipeId: string,
  ): Promise<JournalView[]> {
    await this.recipes.getLive(recipeId);
    const journals = await this.journals.listForRecipe(recipeId);
    return journals.map(toJournalView);
  }

  @Post('recipes/:recipeId/journals')
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
  async findOne(
    @Param('id', { schema: journalIdSchema }) id: string,
  ): Promise<JournalView> {
    const journal = await this.getJournal(id);
    await this.recipes.getLive(journal.recipeId);
    return toJournalView(journal);
  }

  @Patch('journals/:id')
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
