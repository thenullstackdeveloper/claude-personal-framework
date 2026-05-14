import type { Composition } from '../../../domain/model/composition.js';
import type { DriftReport } from '../../../domain/model/drift-report.js';
import type { ProjectManifest } from '../../../domain/model/project-manifest.js';
import { computeDrift } from '../../../domain/services/compute-drift.js';
import type { CatalogPort, LockfileStorePort } from '../../ports/index.js';
import { buildComposition } from '../../services/build-composition.js';

export type CheckStatusInput = {
  readonly manifest: ProjectManifest;
  readonly projectPath: string;
  readonly catalog: CatalogPort;
  readonly lockfileStore: LockfileStorePort;
};

export type CheckStatusResult = {
  readonly composition: Composition;
  readonly drift: DriftReport;
  readonly hasLockfile: boolean;
};

export const checkStatus = async (input: CheckStatusInput): Promise<CheckStatusResult> => {
  const { manifest, projectPath, catalog, lockfileStore } = input;

  const composition = await buildComposition({ manifest, projectPath, catalog });
  const lockfile = await lockfileStore.read();
  const drift = computeDrift(lockfile, composition);

  return { composition, drift, hasLockfile: lockfile !== null };
};
