import { Boxes, FileTerminal, ScrollText, Sparkles } from 'lucide-react';
import type { CatalogReport } from '../lib/api';

type CatalogViewProps = {
  readonly report: CatalogReport;
};

export function CatalogView({ report }: CatalogViewProps) {
  return (
    <section className="grid grid-cols-2 gap-4">
      <Card icon={<Boxes className="w-4 h-4" />} title="Presets" count={report.presets.length}>
        {report.presets.length === 0 ? (
          <EmptyHint label="No presets defined" />
        ) : (
          report.presets.map((p) => (
            <div key={p.name} className="text-sm">
              <span className="font-semibold text-zinc-100">{p.name}</span>
              {p.extends.length > 0 && (
                <span className="text-zinc-500"> ← {p.extends.join(', ')}</span>
              )}
              <div className="text-xs text-zinc-500 mt-0.5">
                {summarizePresetCounts(p.agents.length, p.skills.length, p.commands.length)}
              </div>
            </div>
          ))
        )}
      </Card>

      <Card icon={<Sparkles className="w-4 h-4" />} title="Agents" count={report.agents.length}>
        {report.agents.length === 0 ? (
          <EmptyHint label="No agents in the catalog" />
        ) : (
          report.agents.map((a) => <Artifact key={a.id} id={a.id} description={a.description} />)
        )}
      </Card>

      <Card icon={<ScrollText className="w-4 h-4" />} title="Skills" count={report.skills.length}>
        {report.skills.length === 0 ? (
          <EmptyHint label="No skills in the catalog" />
        ) : (
          report.skills.map((s) => <Artifact key={s.id} id={s.id} description={s.description} />)
        )}
      </Card>

      <Card
        icon={<FileTerminal className="w-4 h-4" />}
        title="Commands"
        count={report.commands.length}
      >
        {report.commands.length === 0 ? (
          <EmptyHint label="No commands in the catalog" />
        ) : (
          report.commands.map((c) => <Artifact key={c.id} id={c.id} description={c.description} />)
        )}
      </Card>
    </section>
  );
}

type CardProps = {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly count: number;
  readonly children: React.ReactNode;
};

function Card({ icon, title, count, children }: CardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 text-zinc-400">
        {icon}
        <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
        <span className="text-xs text-zinc-600 ml-auto">{count}</span>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

type ArtifactProps = {
  readonly id: string;
  readonly description: string;
};

function Artifact({ id, description }: ArtifactProps) {
  return (
    <div className="text-sm">
      <div className="font-semibold text-zinc-100">{id}</div>
      {description && <p className="text-xs text-zinc-500 line-clamp-2 mt-0.5">{description}</p>}
    </div>
  );
}

function EmptyHint({ label }: { label: string }) {
  return <p className="text-xs text-zinc-600 italic">{label}</p>;
}

function summarizePresetCounts(agents: number, skills: number, commands: number): string {
  const parts: string[] = [];
  if (agents > 0) parts.push(`${agents} agent${agents === 1 ? '' : 's'}`);
  if (skills > 0) parts.push(`${skills} skill${skills === 1 ? '' : 's'}`);
  if (commands > 0) parts.push(`${commands} command${commands === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(', ') : 'empty';
}
