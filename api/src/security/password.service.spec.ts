import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with argon2id and verifies the right password only', async () => {
    const hash = await service.hash('correct horse');
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(service.verify(hash, 'correct horse')).resolves.toBe(true);
    await expect(service.verify(hash, 'wrong horse')).resolves.toBe(false);
  });

  it('returns false when there is no stored hash', async () => {
    await expect(service.verify(undefined, 'anything')).resolves.toBe(false);
  });

  it('returns false for a malformed stored hash instead of throwing', async () => {
    await expect(service.verify('not-a-hash', 'anything')).resolves.toBe(false);
  });
});
