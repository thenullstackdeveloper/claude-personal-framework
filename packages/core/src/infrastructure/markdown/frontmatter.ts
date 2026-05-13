import { parse as parseYaml } from 'yaml';

const FRONTMATTER_PATTERN = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;

export const extractFrontmatterDescription = (markdown: string): string => {
  const match = markdown.match(FRONTMATTER_PATTERN);
  if (!match) return '';
  const yamlBody = match[1];
  if (!yamlBody) return '';
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlBody);
  } catch {
    return '';
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return '';
  }
  const description = (parsed as Record<string, unknown>)['description'];
  return typeof description === 'string' ? description.trim() : '';
};
