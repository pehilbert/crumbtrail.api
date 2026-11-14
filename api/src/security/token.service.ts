import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface AccessTokenClaims {
  sub: string;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  /** Issues an access token whose `sub` claim is the user's ID. */
  issue(userId: string): Promise<string> {
    const claims: AccessTokenClaims = { sub: userId };
    return this.jwt.signAsync(claims);
  }

  /** Returns the user ID from a valid token, or null if it is invalid or expired. */
  async verify(token: string): Promise<string | null> {
    try {
      const claims =
        await this.jwt.verifyAsync<Partial<AccessTokenClaims>>(token);
      return typeof claims.sub === 'string' ? claims.sub : null;
    } catch {
      return null;
    }
  }
}
