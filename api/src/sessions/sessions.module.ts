import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RefreshCookie } from './refresh-cookie.js';
import { RefreshToken, RefreshTokenSchema } from './refresh-token.schema.js';
import { SessionsService } from './sessions.service.js';

/** Refresh tokens and their cookie. Used by auth (login, refresh, logout) and users (registration, deactivation). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
  ],
  providers: [SessionsService, RefreshCookie],
  exports: [SessionsService, RefreshCookie],
})
export class SessionsModule {}
