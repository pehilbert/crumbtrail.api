import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module.js';
import { Journal, JournalSchema } from './journal.schema.js';
import { JournalsController } from './journals.controller.js';
import { JournalsService } from './journals.service.js';
import { Recipe, RecipeSchema } from './recipe.schema.js';
import { RecipesController } from './recipes.controller.js';
import { RecipesService } from './recipes.service.js';

/** Recipes and their journal entries, which only exist as part of a recipe. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Recipe.name, schema: RecipeSchema },
      { name: Journal.name, schema: JournalSchema },
    ]),
    UsersModule,
  ],
  controllers: [RecipesController, JournalsController],
  providers: [RecipesService, JournalsService],
})
export class RecipesModule {}
