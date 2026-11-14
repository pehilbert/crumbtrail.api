import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PasswordService } from '../security/password.service.js';
import { CASE_INSENSITIVE, User } from './user.schema.js';
import type { CreateUserDto, UpdateUserDto } from './users.schemas.js';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly passwords: PasswordService,
  ) {}

  /** Make sure the unique indexes exist before any request is served. */
  async onModuleInit(): Promise<void> {
    await this.userModel.init();
  }

  async create(dto: CreateUserDto): Promise<User> {
    const { password, ...profile } = dto;
    const passwordHash = await this.passwords.hash(password);
    try {
      const created = await this.userModel.create({ ...profile, passwordHash });
      return this.withoutPassword(created.toObject());
    } catch (error) {
      throw toConflict(error);
    }
  }

  findActiveById(id: string): Promise<User | null> {
    return this.userModel.findOne({ _id: id, active: true }).lean<User>();
  }

  /**
   * Finds an active user by username or email (an "@" means email), including
   * the password hash, for checking credentials.
   */
  findActiveForLogin(login: string): Promise<User | null> {
    if (login.includes('@')) {
      return this.userModel
        .findOne({ email: login.toLowerCase(), active: true })
        .select('+passwordHash')
        .lean<User>();
    }
    return this.userModel
      .findOne({ username: login, active: true })
      .collation(CASE_INSENSITIVE)
      .select('+passwordHash')
      .lean<User>();
  }

  /** Applies a partial update. Returns null if no active user has that ID. */
  async update(id: string, dto: UpdateUserDto): Promise<User | null> {
    try {
      return await this.userModel
        .findOneAndUpdate(
          { _id: id, active: true },
          { $set: dto },
          { returnDocument: 'after', runValidators: true },
        )
        .lean<User>();
    } catch (error) {
      throw toConflict(error);
    }
  }

  /** Soft-deletes a user. Returns false if no active user has that ID. */
  async deactivate(id: string): Promise<boolean> {
    const result = await this.userModel.updateOne(
      { _id: id, active: true },
      { $set: { active: false } },
    );
    return result.matchedCount === 1;
  }

  private withoutPassword(user: User): User {
    const { passwordHash: _omit, ...rest } = user;
    return rest as User;
  }
}

/** Turns a Mongo duplicate key error into a 409; rethrows anything else. */
function toConflict(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  ) {
    const keyPattern =
      'keyPattern' in error && typeof error.keyPattern === 'object'
        ? (error.keyPattern as Record<string, unknown>)
        : {};
    const field = Object.keys(keyPattern)[0] ?? 'value';
    return new ConflictException(`${field} is already taken`);
  }
  return error;
}
