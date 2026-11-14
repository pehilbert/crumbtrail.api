import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import type { Env } from '../config/env.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: toExpiresIn(config.get('JWT_EXPIRES_IN', { infer: true })),
        },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  providers: [PasswordService, TokenService],
  exports: [PasswordService, TokenService],
})
export class SecurityModule {}

/** Plain numbers are seconds; anything else was checked against ms's format in env.ts. */
function toExpiresIn(value: string): number | StringValue {
  return /^\d+$/.test(value) ? Number(value) : (value as StringValue);
}
