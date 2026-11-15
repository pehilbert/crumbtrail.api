import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';

/**
 * One refresh token. Only its SHA-256 hash is stored. Every token rotated
 * from one login shares a sessionId.
 */
@Schema({
  collection: 'refreshTokens',
  timestamps: { createdAt: 'createdAt', updatedAt: false },
  versionKey: false,
})
export class RefreshToken {
  @Prop({ type: String, default: () => randomUUID() })
  _id: string;

  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ type: String, required: true, index: true })
  sessionId: string;

  @Prop({ type: String, required: true, unique: true })
  tokenHash: string;

  // Mongo's TTL monitor deletes the record once this passes (it runs about
  // once a minute, so lookups also check expiresAt themselves).
  @Prop({ type: Date, required: true, expires: 0 })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  spentAt: Date | null;

  createdAt: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
