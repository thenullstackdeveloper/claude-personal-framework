import { createHash } from 'node:crypto';
import { InvalidContentHashError } from '../errors/domain-error.js';

const SHA256_HEX = /^[a-f0-9]{64}$/;

export class ContentHash {
  private constructor(private readonly value: string) {}

  static of(content: string | Uint8Array): ContentHash {
    const hex = createHash('sha256').update(content).digest('hex');
    return new ContentHash(hex);
  }

  static fromHex(hex: string): ContentHash {
    if (!SHA256_HEX.test(hex)) {
      throw new InvalidContentHashError(`invalid sha256 hex: "${hex}"`);
    }
    return new ContentHash(hex);
  }

  equals(other: ContentHash): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
