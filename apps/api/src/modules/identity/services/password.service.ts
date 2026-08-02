import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** OWASP-recommended argon2id parameters (matches the db seed fixtures). */
const ARGON2_OPTIONS = {
  // Algorithm.Argon2id — literal because @node-rs/argon2 ships an ambient
  // const enum, which isolatedModules cannot import at runtime.
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  private dummyHashPromise: Promise<string> | null = null;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(secretHash: string, password: string): Promise<boolean> {
    try {
      return await verify(secretHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Constant-shape work for unknown emails: verifying against a real hash
   * keeps login timing indistinguishable (no account enumeration).
   */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHashPromise ??= this.hash('tatame-dummy-password-for-timing');
    const dummyHash = await this.dummyHashPromise;
    await this.verify(dummyHash, password);
  }
}
