import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Env } from '../config/env.js';
import { RefreshToken } from './refresh-token.schema.js';

/**
 * A spent token presented again within this window is taken to be a second
 * tab refreshing at the same time, not theft.
 */
export const REUSE_GRACE_MS = 10_000;

/**
 * Refresh tokens and the sessions they belong to. Tokens are random values
 * stored only as SHA-256 hashes; each refresh spends one and issues its
 * successor in the same session.
 */
@Injectable()
export class SessionsService implements OnModuleInit {
  constructor(
    @InjectModel(RefreshToken.name)
    private readonly tokenModel: Model<RefreshToken>,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Make sure the unique and TTL indexes exist before any request is served. */
  async onModuleInit(): Promise<void> {
    await this.tokenModel.init();
  }

  /** Starts a new session for a user and returns its first refresh token. */
  start(userId: string): Promise<string> {
    return this.issue(userId, randomUUID());
  }

  /**
   * Spends a refresh token and returns its successor, or null if the token is
   * unknown, expired or already spent. Reuse of a spent token outside the
   * grace window ends its whole session.
   */
  async rotate(
    token: string,
  ): Promise<{ userId: string; refreshToken: string } | null> {
    const tokenHash = hash(token);
    const now = new Date();

    // Atomic, so two requests cannot both spend the same token.
    const spent = await this.tokenModel
      .findOneAndUpdate(
        { tokenHash, spentAt: null, expiresAt: { $gt: now } },
        { $set: { spentAt: now } },
      )
      .lean<RefreshToken>();
    const record =
      spent ??
      (await this.tokenModel.findOne({ tokenHash }).lean<RefreshToken>());
    if (!record || record.expiresAt <= now) return null;

    const concurrent =
      record.spentAt !== null &&
      now.getTime() - record.spentAt.getTime() <= REUSE_GRACE_MS;
    if (!spent && !concurrent) {
      await this.tokenModel.deleteMany({ sessionId: record.sessionId });
      return null;
    }
    return {
      userId: record.userId,
      refreshToken: await this.issue(record.userId, record.sessionId),
    };
  }

  /** Ends the session a refresh token belongs to. Unknown tokens are ignored. */
  async end(token: string): Promise<void> {
    const record = await this.tokenModel
      .findOne({ tokenHash: hash(token) })
      .lean<RefreshToken>();
    if (record)
      await this.tokenModel.deleteMany({ sessionId: record.sessionId });
  }

  /** Ends every session of a user. */
  async endAllForUser(userId: string): Promise<void> {
    await this.tokenModel.deleteMany({ userId });
  }

  private async issue(userId: string, sessionId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const lifetimeSeconds = this.config.get('REFRESH_TOKEN_EXPIRES_IN', {
      infer: true,
    });
    await this.tokenModel.create({
      userId,
      sessionId,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + lifetimeSeconds * 1000),
    });
    return token;
  }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
