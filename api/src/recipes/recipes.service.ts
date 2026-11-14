import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { User } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { Recipe } from './recipe.schema.js';
import type { CreateRecipeDto, UpdateRecipeDto } from './recipes.schemas.js';

/** A recipe that is not archived and whose author is active. */
export interface LiveRecipe {
  recipe: Recipe;
  author: User;
}

@Injectable()
export class RecipesService {
  constructor(
    @InjectModel(Recipe.name) private readonly recipeModel: Model<Recipe>,
    private readonly users: UsersService,
  ) {}

  async create(authorId: string, dto: CreateRecipeDto): Promise<Recipe> {
    const created = await this.recipeModel.create({ ...dto, authorId });
    return created.toObject();
  }

  /**
   * Finds a recipe that anyone may see: not archived, and its author is still
   * active. Throws 404 otherwise.
   */
  async getLive(id: string): Promise<LiveRecipe> {
    const recipe = await this.recipeModel
      .findOne({ _id: id, archived: false })
      .lean<Recipe>();
    const author = recipe
      ? await this.users.findActiveById(recipe.authorId)
      : null;
    if (!recipe || !author) throw new NotFoundException('Recipe not found');
    return { recipe, author };
  }

  /** Like getLive, but also throws 403 unless the user is the author. */
  async getOwned(id: string, user: User): Promise<LiveRecipe> {
    const live = await this.getLive(id);
    if (live.recipe.authorId !== user._id) {
      throw new ForbiddenException('You can only modify your own recipes');
    }
    return live;
  }

  /** An author's live recipes, newest first. */
  listByAuthor(authorId: string): Promise<Recipe[]> {
    return this.recipeModel
      .find({ authorId, archived: false })
      .sort({ publishedAt: -1 })
      .lean<Recipe[]>();
  }

  /** Applies a partial update. Throws 404 if the recipe was archived meanwhile. */
  async update(id: string, dto: UpdateRecipeDto): Promise<Recipe> {
    const recipe = await this.recipeModel
      .findOneAndUpdate(
        { _id: id, archived: false },
        { $set: { ...dto, editedAt: new Date() } },
        { returnDocument: 'after', runValidators: true },
      )
      .lean<Recipe>();
    if (!recipe) throw new NotFoundException('Recipe not found');
    return recipe;
  }

  /** Soft delete. Throws 404 if the recipe is already archived. */
  async archive(id: string): Promise<void> {
    const result = await this.recipeModel.updateOne(
      { _id: id, archived: false },
      { $set: { archived: true } },
    );
    if (result.matchedCount !== 1) {
      throw new NotFoundException('Recipe not found');
    }
  }
}
