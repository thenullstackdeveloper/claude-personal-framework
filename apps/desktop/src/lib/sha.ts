const DEFAULT_LEN = 12;

/**
 * Truncate a SHA-256 hex string for display. Matches the CLI's human-readable
 * output (12 chars + ellipsis), keeping the two ports visually aligned.
 */
export const shortenSha = (sha: string, len: number = DEFAULT_LEN): string => {
  if (sha.length <= len) return sha;
  return `${sha.slice(0, len)}…`;
};
