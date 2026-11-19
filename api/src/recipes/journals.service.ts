import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Journal } from './journal.schema.js';

@Injectable()
export class JournalsService {
  constructor(
    @InjectModel(Journal.name) private readonly journalModel: Model<Journal>,
  ) {}

  async create(recipeId: string, content: string): Promise<Journal> {
    const created = await this.journalModel.create({ recipeId, content });
    return created.toObject();
  }

  findById(id: string): Promise<Journal | null> {
    return this.journalModel.findById(id).lean<Journal>();
  }

  /** A recipe's entries, newest first. */
  listForRecipe(recipeId: string): Promise<Journal[]> {
    return this.journalModel
      .find({ recipeId })
      .sort({ postedAt: -1 })
      .lean<Journal[]>();
  }

  /** Number of entries per recipe ID. Recipes without entries are left out. */
  async countForRecipes(recipeIds: string[]): Promise<Map<string, number>> {
    if (recipeIds.length === 0) return new Map();
    const rows = await this.journalModel.aggregate<{
      _id: string;
      count: number;
    }>([
      { $match: { recipeId: { $in: recipeIds } } },
      { $group: { _id: '$recipeId', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [row._id, row.count]));
  }

  /** Returns null if the entry no longer exists. */
  update(id: string, content: string): Promise<Journal | null> {
    return this.journalModel
      .findByIdAndUpdate(
        id,
        { $set: { content, editedAt: new Date() } },
        { returnDocument: 'after', runValidators: true },
      )
      .lean<Journal>();
  }

  /** Hard delete. Returns false if the entry no longer exists. */
  async delete(id: string): Promise<boolean> {
    const result = await this.journalModel.deleteOne({ _id: id });
    return result.deletedCount === 1;
  }
}
