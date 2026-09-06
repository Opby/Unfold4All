import { getPool, indexAvailable } from "@/lib/pg";

export const dynamic = "force-dynamic";

interface LogRow {
  created_at: Date;
  query: string;
  paths: string[];
  tier_mix: { summary?: string; honestFailure?: boolean };
  latency_ms: number | null;
}

async function fetchLogs(): Promise<LogRow[]> {
  const { rows } = await getPool().query<LogRow>(
    `SELECT created_at, query, paths, tier_mix, latency_ms
     FROM query_logs ORDER BY id DESC LIMIT 50`,
  );
  return rows;
}

export default async function LogsPage() {
  if (!indexAvailable()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-sm text-zinc-500">
        No database configured — query logging is off (set DATABASE_URL to enable).
      </main>
    );
  }
  const logs = await fetchLogs();
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-1 text-xl font-semibold">Query log</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Last {logs.length} answered queries — retrieval paths, tier mix, latency (FR9).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700">
              <th className="py-2 pr-4">When</th>
              <th className="py-2 pr-4">Query</th>
              <th className="py-2 pr-4">Paths</th>
              <th className="py-2 pr-4">Tier mix</th>
              <th className="py-2">ms</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <tr key={i} className="border-b border-zinc-200 align-top dark:border-zinc-800">
                <td className="whitespace-nowrap py-2 pr-4 text-zinc-500">
                  {log.created_at.toISOString().slice(0, 16).replace("T", " ")}
                </td>
                <td className="max-w-md py-2 pr-4">{log.query}</td>
                <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs">
                  {log.paths.join("+")}
                </td>
                <td className="max-w-sm py-2 pr-4 text-zinc-600 dark:text-zinc-400">
                  {log.tier_mix.honestFailure ? "⚠ honest failure — " : ""}
                  {log.tier_mix.summary ?? ""}
                </td>
                <td className="py-2 text-zinc-500">{log.latency_ms ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
