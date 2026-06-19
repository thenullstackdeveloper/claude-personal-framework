/**
 * Pure transformation that maintains a marker-delimited "managed block"
 * inside a project's `.gitignore`. The adapter is responsible for I/O;
 * this module only knows strings.
 *
 * Contract:
 * - `existingContent === null` represents "file does not exist". The
 *   transform creates a new file consisting of the managed block.
 * - When the existing content already carries the exact byte sequence
 *   of the desired block, the result is `unchanged` and `nextContent
 *   === existingContent` so callers can skip the write entirely.
 * - When markers are present once and content differs, the block is
 *   replaced; lines outside the markers are preserved verbatim.
 * - Two or more pairs of markers signal that something else (or a
 *   prior bug) has written conflicting blocks; the transform refuses
 *   to write and returns `block-conflict`.
 *
 * CRLF input is normalized to LF so the output is POSIX-canonical
 * regardless of the host platform; `.gitignore` is a POSIX-defined
 * format on every git implementation.
 */

export const GITIGNORE_START_MARKER = '# >>> claude-fw managed (do not edit) >>>';
export const GITIGNORE_END_MARKER = '# <<< claude-fw managed <<<';

export type GitignoreBlockStatus = 'unchanged' | 'created' | 'updated' | 'block-conflict';

export interface GitignoreBlockResult {
  readonly nextContent: string;
  readonly status: GitignoreBlockStatus;
}

const buildBlock = (entries: readonly string[]): string =>
  [GITIGNORE_START_MARKER, ...entries, GITIGNORE_END_MARKER].join('\n');

const normalize = (content: string): string => content.replace(/\r\n/g, '\n');

const ensureSingleTrailingNewline = (content: string): string => {
  const trimmed = content.replace(/\n+$/, '');
  return `${trimmed}\n`;
};

const countOccurrences = (haystack: string, needle: string): number => {
  let count = 0;
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) return count;
    count++;
    from = idx + needle.length;
  }
};

export const computeGitignoreBlock = (
  existingContent: string | null,
  entries: readonly string[],
): GitignoreBlockResult => {
  const desiredBlock = buildBlock(entries);

  if (existingContent === null) {
    return {
      nextContent: ensureSingleTrailingNewline(desiredBlock),
      status: 'created',
    };
  }

  const normalized = normalize(existingContent);

  const startCount = countOccurrences(normalized, GITIGNORE_START_MARKER);
  const endCount = countOccurrences(normalized, GITIGNORE_END_MARKER);

  if (startCount > 1 || endCount > 1 || startCount !== endCount) {
    return { nextContent: existingContent, status: 'block-conflict' };
  }

  if (startCount === 0) {
    // No managed block yet — append with a blank-line separator. If the
    // file is empty (or only newlines), the separator collapses to a
    // single newline so we don't emit `\n\n# >>>` against nothing.
    const trimmed = normalized.replace(/\n+$/, '');
    const separator = trimmed.length === 0 ? '' : '\n\n';
    const next = ensureSingleTrailingNewline(`${trimmed}${separator}${desiredBlock}`);
    return { nextContent: next, status: 'updated' };
  }

  // Exactly one managed block. Locate and decide unchanged vs replace.
  const startIdx = normalized.indexOf(GITIGNORE_START_MARKER);
  const endStart = normalized.indexOf(GITIGNORE_END_MARKER, startIdx);
  const endIdx = endStart + GITIGNORE_END_MARKER.length;

  const before = normalized.slice(0, startIdx);
  const after = normalized.slice(endIdx);
  const currentBlock = normalized.slice(startIdx, endIdx);

  if (currentBlock === desiredBlock) {
    // Block is correct; preserve the caller's original content verbatim
    // (including its line-ending style) so an unchanged result causes
    // no write at all.
    return { nextContent: existingContent, status: 'unchanged' };
  }

  const next = ensureSingleTrailingNewline(`${before}${desiredBlock}${after}`);
  return { nextContent: next, status: 'updated' };
};
