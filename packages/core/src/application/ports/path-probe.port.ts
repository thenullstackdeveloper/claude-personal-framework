export type PathKind = 'file' | 'directory' | 'missing';

/**
 * Inspects whether a path (base + segment) exists and what kind of node it is.
 * Lets the detect-path use case reason about layout without knowing how the
 * filesystem joins or stats paths.
 */
export interface PathProbePort {
  inspect(base: string, segment: string): Promise<PathKind>;
}
