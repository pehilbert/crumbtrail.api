import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

@Injectable()
export class PasswordService {
  /** Hash checked when no user matched, so a miss takes as long as a hit. */
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  /**
   * Verifies a password against a stored hash. With no hash (unknown user) it
   * still does a full verification against a dummy hash and returns false, so
   * response times do not reveal which usernames or emails exist.
   */
  async verify(
    storedHash: string | undefined,
    password: string,
  ): Promise<boolean> {
    if (!storedHash) {
      this.dummyHash ??= this.hash('crumbtrail-dummy-password');
      await this.safeVerify(await this.dummyHash, password);
      return false;
    }
    return this.safeVerify(storedHash, password);
  }

  private async safeVerify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
