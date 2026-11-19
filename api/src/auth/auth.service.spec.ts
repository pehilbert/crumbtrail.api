import { UnauthorizedException } from '@nestjs/common';
import type { PasswordService } from '../security/password.service.js';
import type { TokenService } from '../security/token.service.js';
import type { SessionsService } from '../sessions/sessions.service.js';
import type { User } from '../users/user.schema.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const user = { _id: 'user-1', passwordHash: 'hash' } as User;
  let users: {
    findActiveForLogin: ReturnType<typeof vi.fn>;
    findActiveById: ReturnType<typeof vi.fn>;
  };
  let passwords: { verify: ReturnType<typeof vi.fn> };
  let tokens: { issue: ReturnType<typeof vi.fn> };
  let sessions: {
    start: ReturnType<typeof vi.fn>;
    rotate: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    endAllForUser: ReturnType<typeof vi.fn>;
  };
  let service: AuthService;

  beforeEach(() => {
    users = { findActiveForLogin: vi.fn(), findActiveById: vi.fn() };
    passwords = { verify: vi.fn() };
    tokens = { issue: vi.fn().mockResolvedValue('token') };
    sessions = {
      start: vi.fn().mockResolvedValue('refresh'),
      rotate: vi.fn(),
      end: vi.fn(),
      endAllForUser: vi.fn(),
    };
    service = new AuthService(
      users as unknown as UsersService,
      passwords as unknown as PasswordService,
      tokens as unknown as TokenService,
      sessions as unknown as SessionsService,
    );
  });

  it('returns the user id, an access token and a new session for valid credentials', async () => {
    users.findActiveForLogin.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(true);

    await expect(
      service.login({ login: 'johnny', password: 'pw' }),
    ).resolves.toEqual({
      id: 'user-1',
      accessToken: 'token',
      refreshToken: 'refresh',
    });
    expect(tokens.issue).toHaveBeenCalledWith('user-1');
    expect(sessions.start).toHaveBeenCalledWith('user-1');
  });

  it('rejects a wrong password', async () => {
    users.findActiveForLogin.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ login: 'johnny', password: 'bad' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('still verifies a password when no user matches, then rejects', async () => {
    users.findActiveForLogin.mockResolvedValue(null);
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ login: 'nobody', password: 'pw' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(passwords.verify).toHaveBeenCalledWith(undefined, 'pw');
  });

  describe('refresh', () => {
    it('rejects a missing cookie without touching sessions', async () => {
      await expect(service.refresh(undefined)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(sessions.rotate).not.toHaveBeenCalled();
    });

    it('rejects a token that cannot be rotated', async () => {
      sessions.rotate.mockResolvedValue(null);
      await expect(service.refresh('old')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(tokens.issue).not.toHaveBeenCalled();
    });

    it('ends every session of a user who is no longer active', async () => {
      sessions.rotate.mockResolvedValue({
        userId: 'user-1',
        refreshToken: 'next',
      });
      users.findActiveById.mockResolvedValue(null);
      await expect(service.refresh('old')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(sessions.endAllForUser).toHaveBeenCalledWith('user-1');
      expect(tokens.issue).not.toHaveBeenCalled();
    });

    it('returns a new access token and the rotated refresh token', async () => {
      sessions.rotate.mockResolvedValue({
        userId: 'user-1',
        refreshToken: 'next',
      });
      users.findActiveById.mockResolvedValue(user);
      await expect(service.refresh('old')).resolves.toEqual({
        id: 'user-1',
        accessToken: 'token',
        refreshToken: 'next',
      });
    });
  });
});
