import { useState } from 'react';
import { type CatalogReport, listCatalog } from './lib/api';

const DEFAULT_FRAMEWORK_ROOT = '/home/angelm/Projects/claude-personal-framework';

function App() {
  const [frameworkRoot, setFrameworkRoot] = useState(DEFAULT_FRAMEWORK_ROOT);
  const [report, setReport] = useState<CatalogReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCatalog(frameworkRoot);
      setReport(data);
    } catch (e) {
      setError(typeof e === 'string' ? e : (e as Error).message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Claude Framework</h1>
        <p className="text-sm text-zinc-400">
          Bridge smoke test — frontend invokes Rust → Rust spawns CLI → JSON back to UI.
        </p>
      </header>

      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={frameworkRoot}
          onChange={(e) => setFrameworkRoot(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm font-mono"
          placeholder="Framework root path"
        />
        <button
          type="button"
          onClick={handleLoad}
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium transition-colors"
        >
          {loading ? 'Loading…' : 'Load catalog'}
        </button>
      </div>

      {error && (
        <pre className="bg-red-950 border border-red-900 text-red-200 p-3 rounded text-xs whitespace-pre-wrap">
          {error}
        </pre>
      )}

      {report && (
        <section className="grid grid-cols-2 gap-4">
          <Card title={`Presets (${report.presets.length})`}>
            {report.presets.map((p) => (
              <div key={p.name} className="text-sm">
                <span className="font-semibold">{p.name}</span>
                {p.extends.length > 0 && (
                  <span className="text-zinc-500"> ← {p.extends.join(', ')}</span>
                )}
              </div>
            ))}
          </Card>
          <Card title={`Agents (${report.agents.length})`}>
            {report.agents.map((a) => (
              <div key={a.id} className="text-sm">
                <span className="font-semibold">{a.id}</span>
                {a.description && (
                  <p className="text-xs text-zinc-500 line-clamp-2">{a.description}</p>
                )}
              </div>
            ))}
          </Card>
          <Card title={`Skills (${report.skills.length})`}>
            {report.skills.map((s) => (
              <div key={s.id} className="text-sm">
                <span className="font-semibold">{s.id}</span>
                {s.description && (
                  <p className="text-xs text-zinc-500 line-clamp-2">{s.description}</p>
                )}
              </div>
            ))}
          </Card>
          <Card title={`Commands (${report.commands.length})`}>
            {report.commands.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">none</p>
            ) : (
              report.commands.map((c) => (
                <div key={c.id} className="text-sm">
                  <span className="font-semibold">{c.id}</span>
                </div>
              ))
            )}
          </Card>
        </section>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
      <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export default App;
