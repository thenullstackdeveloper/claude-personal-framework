import type { AgentId, CommandId, HookName, SkillId } from './identifiers.js';

export type ArtifactRef =
  | { readonly type: 'agent'; readonly id: AgentId }
  | { readonly type: 'skill'; readonly id: SkillId }
  | { readonly type: 'command'; readonly id: CommandId }
  | { readonly type: 'git-hook'; readonly hookName: HookName };

export const ArtifactRef = {
  agent: (id: AgentId): ArtifactRef => ({ type: 'agent', id }),
  skill: (id: SkillId): ArtifactRef => ({ type: 'skill', id }),
  command: (id: CommandId): ArtifactRef => ({ type: 'command', id }),
  gitHook: (hookName: HookName): ArtifactRef => ({ type: 'git-hook', hookName }),

  equals(a: ArtifactRef, b: ArtifactRef): boolean {
    if (a.type === 'agent' && b.type === 'agent') return a.id.equals(b.id);
    if (a.type === 'skill' && b.type === 'skill') return a.id.equals(b.id);
    if (a.type === 'command' && b.type === 'command') return a.id.equals(b.id);
    if (a.type === 'git-hook' && b.type === 'git-hook') return a.hookName === b.hookName;
    return false;
  },
} as const;
