// The ledger is an append-only JSONL record of every implementer run. It is committed, so the
// team can see which implementer is worth using for which kind of work.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const OUTCOMES = ['accepted', 'rejected', 'failed', 'quota'];

export function ledgerPath(root, config) {
  return join(root, config.ledger ?? 'factory/ledger.jsonl');
}

export function readLedger(root, config) {
  const file = ledgerPath(root, config);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        throw new Error(`${file}:${i + 1} is not valid JSON`);
      }
    });
}

export function appendLedger(root, config, entry) {
  if (!OUTCOMES.includes(entry.outcome)) throw new Error(`outcome must be one of ${OUTCOMES.join(', ')}`);
  for (const k of ['feature', 'brief', 'implementer']) if (!entry[k]) throw new Error(`ledger entry needs "${k}"`);
  const file = ledgerPath(root, config);
  mkdirSync(dirname(file), { recursive: true });
  const row = { at: new Date().toISOString(), ...entry };
  appendFileSync(file, JSON.stringify(row) + '\n');
  return row;
}

export function summarize(entries) {
  const by = new Map();
  for (const e of entries) {
    const key = e.model ? `${e.implementer} (${e.model})` : e.implementer;
    const s = by.get(key) ?? { runs: 0, accepted: 0, rejected: 0, failed: 0, quota: 0, minutes: 0, cost: 0, findings: 0 };
    s.runs++;
    s[e.outcome]++;
    s.minutes += Number(e.minutes ?? 0);
    s.cost += Number(e.cost_usd ?? 0);
    s.findings += Number(e.review_findings ?? 0);
    by.set(key, s);
  }
  return [...by.entries()]
    .map(([name, s]) => ({
      name,
      ...s,
      acceptRate: s.runs ? s.accepted / s.runs : 0,
      avgMinutes: s.runs ? s.minutes / s.runs : 0,
      costPerAccepted: s.accepted ? s.cost / s.accepted : null,
    }))
    .sort((a, b) => b.acceptRate - a.acceptRate || a.avgMinutes - b.avgMinutes);
}

// Accept rate with and without each handbook part. Only runs that recorded a `handbook` field
// count, and quota rows are left out: running out of quota says nothing about the context.
// This is correlation, not proof: a part is injected for certain areas of the code, and those
// areas may simply be easier or harder. Use `factory eval --handbook off` for a controlled test.
export function summarizeHandbook(entries) {
  const runs = entries.filter((e) => Array.isArray(e.handbook) && e.outcome !== 'quota');
  const rate = (rows) => (rows.length ? rows.filter((e) => e.outcome === 'accepted').length / rows.length : null);
  const parts = [...new Set(runs.flatMap((e) => e.handbook))].sort();
  return parts
    .map((part) => {
      const withPart = runs.filter((e) => e.handbook.includes(part));
      const without = runs.filter((e) => !e.handbook.includes(part));
      const a = rate(withPart);
      const b = rate(without);
      return { part, runsWith: withPart.length, rateWith: a, runsWithout: without.length, rateWithout: b, delta: a != null && b != null ? a - b : null };
    })
    .sort((x, y) => (y.delta ?? -2) - (x.delta ?? -2));
}
