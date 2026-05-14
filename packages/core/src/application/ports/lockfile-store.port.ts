import type { Lockfile } from '../../domain/model/lockfile.js';

export interface LockfileStorePort {
  /** Returns null if no lockfile exists yet (first install). */
  read(): Promise<Lockfile | null>;

  write(lockfile: Lockfile): Promise<void>;
}
