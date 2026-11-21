#!/usr/bin/env node
// factory: the command line for the Software Factory pipeline. Zero dependencies.
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STAGES,
  appendLedger,
  changedFiles,
  isRisky,
  listFeatures,
  loadConfig,
  readLedger,
  repoRoot,
  scopeCheck,
  stampPath,
  stampStatus,
  summarize,
  treeFingerprint,
  validateBrief,
} from '../lib/index.mjs';
import { CHECKS } from '../lib/stages.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');

const out = (s = '') => process.stdout.write(s + '\n');
const err = (s) => process.stderr.write(s + '\n');
function die(msg, code = 1) {
  err(`factory: ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

function ctx() {
  const root = repoRoot();
  const config = loadConfig(root);
  return { root, config };
}

function resolveFeature(root, config, id) {
  const all = listFeatures(root, config);
  if (!id) {
    if (all.length === 1) return all[0];
    die(all.length ? `name a feature: ${all.join(', ')}` : 'no features yet; run `factory feature new <slug>`');
  }
  const hit = all.find((f) => f === id || f.endsWith('-' + id) || f.startsWith(id + '-'));
  if (!hit) die(`no feature matching "${id}"`);
  return hit;
}

function readState(root, config, feature) {
  return JSON.parse(readFileSync(join(root, config.specsDir, feature, 'state.json'), 'utf8'));
}

function writeState(root, config, feature, state) {
  writeFileSync(join(root, config.specsDir, feature, 'state.json'), JSON.stringify(state, null, 2) + '\n');
}

function blockers(root, config, feature, stage) {
  const dir = join(root, config.specsDir, feature);
  return CHECKS[stage]({ root, config, feature, dir });
}

// ---------------------------------------------------------------------------- commands

const commands = {
  help() {
    out(`factory <command>

Pipeline
  feature new <slug>              Create specs/NNN-slug with state.json at stage "intake"
  status [feature]                Show every feature, its stage and what blocks it
  check [feature]                 List the exit-criteria failures of the current stage
  advance [feature]               Move to the next stage if the current one is satisfied
        --override "<reason>"     Advance anyway; the reason is written to the history

Briefs and scope
  brief new <feature> <id>        Scaffold briefs/<id>.md from the brief template
  brief check <file...>           Validate brief frontmatter and required sections
  scope <brief> [--base REF]      Fail if the diff touches files outside allowed_files
  risk [--base REF]               List changed files that match riskyPaths

Gates and ledger
  gates [--only name]             Run every configured gate; stamp the tree when all pass
  stamp-check                     Exit 0 if the last green gate run matches the current tree
  ledger add --feature F --brief B --implementer I --outcome accepted|rejected|failed|quota
             [--model M] [--minutes N] [--cost N] [--findings N] [--note "..."]
  report [--html file]            Implementer scorecard from the ledger

Setup
  init [dir] [--force]            Install the factory kit into a repository
  doctor                          Check that the kit is installed and wired`);
  },

  feature([sub, slug]) {
    if (sub !== 'new' || !slug) die('usage: factory feature new <slug>');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) die('slug must be kebab-case');
    const { root, config } = ctx();
    const existing = listFeatures(root, config);
    const next = String(existing.reduce((m, f) => Math.max(m, parseInt(f, 10) || 0), 0) + 1).padStart(3, '0');
    const name = `${next}-${slug}`;
    const dir = join(root, config.specsDir, name);
    mkdirSync(join(dir, 'briefs'), { recursive: true });
    const now = new Date().toISOString();
    writeState(root, config, name, { feature: name, stage: 'intake', created: now, history: [{ stage: 'intake', at: now }] });
    const tpl = join(templatesDir(root), 'intake.md');
    if (existsSync(tpl)) writeFileSync(join(dir, 'intake.md'), readFileSync(tpl, 'utf8').replaceAll('{{feature}}', name));
    out(`created ${config.specsDir}/${name} at stage intake`);
  },

  status([id]) {
    const { root, config } = ctx();
    const list = id ? [resolveFeature(root, config, id)] : listFeatures(root, config);
    if (!list.length) return out('no features');
    for (const f of list) {
      const s = readState(root, config, f);
      const b = s.stage === 'done' ? [] : blockers(root, config, f, s.stage);
      const n = STAGES.indexOf(s.stage) + 1;
      out(`${f.padEnd(32)} ${s.stage.padEnd(10)} ${s.stage === 'done' ? 'done' : `${n}/${STAGES.length}`}  ${b.length ? `${b.length} blocker(s)` : 'ready to advance'}`);
    }
  },

  check([id]) {
    const { root, config } = ctx();
    const f = resolveFeature(root, config, id);
    const s = readState(root, config, f);
    if (s.stage === 'done') return out(`${f} is done`);
    const b = blockers(root, config, f, s.stage);
    out(`${f} @ ${s.stage}`);
    if (!b.length) return out('  ready to advance');
    for (const x of b) out(`  - ${x}`);
    process.exitCode = 1;
  },

  advance([id], flags) {
    const { root, config } = ctx();
    const f = resolveFeature(root, config, id);
    const s = readState(root, config, f);
    if (s.stage === 'done') die(`${f} is already done`);
    const b = blockers(root, config, f, s.stage);
    if (b.length && !flags.override) {
      err(`cannot leave "${s.stage}":`);
      for (const x of b) err(`  - ${x}`);
      die('fix the blockers, or pass --override "<reason>" to record a deliberate exception');
    }
    const prev = s.stage;
    const next = STAGES[STAGES.indexOf(prev) + 1] ?? 'done';
    const entry = { stage: next, at: new Date().toISOString() };
    if (b.length) entry.override = { from: s.stage, reason: String(flags.override), blockers: b };
    s.stage = next;
    s.history.push(entry);
    writeState(root, config, f, s);
    out(`${f}: ${entry.override ? 'overrode' : 'passed'} ${prev} -> ${next}`);
  },

  brief([sub, ...rest]) {
    const { root, config } = ctx();
    if (sub === 'new') {
      const [id, bid] = rest;
      if (!id || !bid) die('usage: factory brief new <feature> <brief-id>');
      const f = resolveFeature(root, config, id);
      const file = join(root, config.specsDir, f, 'briefs', `${bid}.md`);
      if (existsSync(file)) die(`${file} exists`);
      const tpl = readFileSync(join(templatesDir(root), 'brief.md'), 'utf8');
      writeFileSync(file, tpl.replaceAll('{{id}}', bid).replaceAll('{{feature}}', f));
      return out(`created ${file}`);
    }
    if (sub === 'check') {
      if (!rest.length) die('usage: factory brief check <file...>');
      let bad = 0;
      for (const file of rest) {
        const r = validateBrief(readFileSync(file, 'utf8'));
        out(`${r.ok ? 'ok  ' : 'FAIL'} ${file}`);
        for (const e of r.errors) out(`     - ${e}`);
        if (!r.ok) bad++;
      }
      if (bad) process.exitCode = 1;
      return;
    }
    die('usage: factory brief new|check ...');
  },

  scope([file], flags) {
    if (!file) die('usage: factory scope <brief> [--base REF]');
    const { root, config } = ctx();
    const r = validateBrief(readFileSync(file, 'utf8'));
    if (!r.data) die(`invalid brief: ${r.errors.join('; ')}`);
    // Factory bookkeeping is the orchestrator's, not the implementer's.
    const ledgerFile = config.ledger ?? 'factory/ledger.jsonl';
    const files = changedFiles(root, flags.base ?? 'HEAD').filter((f) => f !== ledgerFile && !f.startsWith(config.stateDir + '/'));
    const s = scopeCheck(files, r.data);
    out(`${files.length} changed file(s) checked against ${r.data.id}`);
    for (const f of s.outside) out(`  outside allowed_files: ${f}`);
    for (const f of s.violations) out(`  touches forbidden_files: ${f}`);
    if (!s.ok) {
      err('scope: FAIL. Revert the extra files or widen the brief deliberately and re-review.');
      process.exitCode = 2;
    } else out('scope: ok');
  },

  risk(_, flags) {
    const { root, config } = ctx();
    const risky = isRisky(changedFiles(root, flags.base ?? 'HEAD'), config);
    if (!risky.length) return out('no risky paths changed');
    out('risky paths changed (run the specialist review):');
    for (const f of risky) out(`  ${f}`);
    process.exitCode = 3;
  },

  gates(_, flags) {
    const { root, config } = ctx();
    const gates = flags.only ? config.gates.filter((g) => g.name === flags.only) : config.gates;
    if (!gates.length) die('no gates configured in factory.config.json');
    const results = [];
    for (const g of gates) {
      out(`\n== gate: ${g.name} (${g.run})`);
      const t0 = Date.now();
      const r = spawnSync(g.run, { cwd: root, shell: true, stdio: 'inherit' });
      results.push({ name: g.name, code: r.status, seconds: Math.round((Date.now() - t0) / 1000) });
      if (r.status !== 0) break;
    }
    out('\n' + results.map((r) => `${r.code === 0 ? 'pass' : 'FAIL'}  ${r.name}  ${r.seconds}s`).join('\n'));
    const passed = !flags.only && results.length === gates.length && results.every((r) => r.code === 0);
    if (!flags.only) {
      const file = stampPath(root, config);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ passed, at: new Date().toISOString(), fingerprint: treeFingerprint(root, config.stateDir), results }, null, 2));
    }
    if (!results.every((r) => r.code === 0)) process.exitCode = 1;
    else if (flags.only) out('(single gate: no stamp written)');
  },

  'stamp-check'() {
    const { root, config } = ctx();
    const s = stampStatus(root, config);
    if (s.valid) return out('gates: green for the current tree');
    err(`gates: ${s.reason}`);
    process.exitCode = 1;
  },

  ledger([sub], flags) {
    if (sub !== 'add') die('usage: factory ledger add --feature F --brief B --implementer I --outcome O');
    const { root, config } = ctx();
    const row = appendLedger(root, config, {
      feature: flags.feature,
      brief: flags.brief,
      implementer: flags.implementer,
      model: flags.model,
      outcome: flags.outcome,
      minutes: flags.minutes ? Number(flags.minutes) : undefined,
      cost_usd: flags.cost ? Number(flags.cost) : undefined,
      review_findings: flags.findings ? Number(flags.findings) : undefined,
      note: flags.note,
    });
    out(`ledger: ${row.brief} ${row.outcome} by ${row.implementer}`);
  },

  report(_, flags) {
    const { root, config } = ctx();
    const rows = summarize(readLedger(root, config));
    if (!rows.length) return out('ledger is empty');
    const pct = (x) => `${Math.round(x * 100)}%`;
    const money = (x) => (x == null ? '-' : `$${x.toFixed(2)}`);
    const head = ['implementer', 'runs', 'accepted', 'rejected', 'failed', 'quota', 'accept rate', 'avg min', 'cost/accepted', 'findings'];
    const body = rows.map((r) => [r.name, r.runs, r.accepted, r.rejected, r.failed, r.quota, pct(r.acceptRate), r.avgMinutes.toFixed(1), money(r.costPerAccepted), r.findings]);
    out('| ' + head.join(' | ') + ' |');
    out('|' + head.map(() => '---').join('|') + '|');
    for (const b of body) out('| ' + b.join(' | ') + ' |');
    if (flags.html) {
      const tpl = readFileSync(join(templatesDir(root), 'report.html'), 'utf8');
      writeFileSync(flags.html, tpl.replace('__DATA__', JSON.stringify(rows).replace(/</g, '\\u003c')));
      out(`\nwrote ${flags.html}`);
    }
  },

  init([dir = '.'], flags) {
    const target = resolve(dir);
    if (!existsSync(join(target, '.git'))) die(`${target} is not a git repository`);
    const kit = join(PKG, 'kit');
    const copy = (from, to) => {
      const dest = join(target, to);
      if (existsSync(dest) && !flags.force) return out(`skip  ${to} (exists; --force to overwrite)`);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(from, dest, { recursive: true });
      out(`add   ${to}`);
    };
    for (const d of ['.claude/hooks', '.claude/agents', '.claude/skills/software-factory', 'scripts/factory']) {
      copy(join(kit, d === 'scripts/factory' ? 'scripts' : d), d);
    }
    copy(join(PKG, 'bin'), 'factory/cli/bin');
    copy(join(PKG, 'lib'), 'factory/cli/lib');
    copy(join(PKG, 'templates'), 'factory/templates');
    if (existsSync(join(PKG, 'docs', '12-failure-catalog.md'))) copy(join(PKG, 'docs', '12-failure-catalog.md'), 'factory/FAILURES.md');
    for (const f of ['AGENTS.md', 'CLAUDE.md']) {
      if (!existsSync(join(target, f))) copy(join(PKG, 'templates', 'project', f), f);
      else out(`skip  ${f} (exists; merge templates/project/${f} by hand)`);
    }
    mergeSettings(target);
    if (!existsSync(join(target, 'factory.config.json'))) {
      writeFileSync(join(target, 'factory.config.json'), JSON.stringify(detectConfig(target), null, 2) + '\n');
      out('add   factory.config.json (review the detected gates)');
    }
    const gi = join(target, '.gitignore');
    const ignore = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
    if (!/^\.factory\/?$/m.test(ignore)) {
      appendFileSync(gi, (ignore && !ignore.endsWith('\n') ? '\n' : '') + '.factory/\n');
      out('edit  .gitignore (+ .factory/)');
    }
    const ga = join(target, '.gitattributes');
    const attrs = existsSync(ga) ? readFileSync(ga, 'utf8') : '';
    if (!attrs.includes('ledger.jsonl')) {
      appendFileSync(ga, (attrs && !attrs.endsWith('\n') ? '\n' : '') + 'factory/ledger.jsonl merge=union\n');
      out('edit  .gitattributes (+ ledger merge=union)');
    }
    out('\nNext: edit factory.config.json, fill AGENTS.md, then `node factory/cli/bin/factory.mjs doctor`.');
  },

  doctor() {
    const { root, config } = ctx();
    const checks = [
      ['node >= 20', Number(process.versions.node.split('.')[0]) >= 20],
      ['factory.config.json present', !config._missing],
      ['at least one gate configured', config.gates.length > 0],
      ['.claude/settings.json has factory hooks', hasHooks(root)],
      ['AGENTS.md present', existsSync(join(root, 'AGENTS.md'))],
      ['.factory/ is git-ignored', existsSync(join(root, '.gitignore')) && /^\.factory\/?$/m.test(readFileSync(join(root, '.gitignore'), 'utf8'))],
      ['at least one implementer configured', config.implementers.length > 0],
    ];
    let bad = 0;
    for (const [name, ok] of checks) {
      out(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
      if (!ok) bad++;
    }
    if (bad) process.exitCode = 1;
  },
};

// ---------------------------------------------------------------------------- helpers

function templatesDir(root) {
  const local = join(root, 'factory', 'templates');
  return existsSync(local) ? local : join(PKG, 'templates');
}

function hasHooks(root) {
  const f = join(root, '.claude', 'settings.json');
  return existsSync(f) && readFileSync(f, 'utf8').includes('.claude/hooks/guard-bash.mjs');
}

function mergeSettings(target) {
  const file = join(target, '.claude', 'settings.json');
  const ours = JSON.parse(readFileSync(join(PKG, 'kit', '.claude', 'settings.json'), 'utf8'));
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(ours, null, 2) + '\n');
    return out('add   .claude/settings.json');
  }
  const theirs = JSON.parse(readFileSync(file, 'utf8'));
  if (JSON.stringify(theirs).includes('.claude/hooks/guard-bash.mjs')) return out('skip  .claude/settings.json (hooks already wired)');
  theirs.hooks ??= {};
  for (const [event, groups] of Object.entries(ours.hooks)) theirs.hooks[event] = [...(theirs.hooks[event] ?? []), ...groups];
  theirs.permissions ??= {};
  theirs.permissions.deny = [...new Set([...(theirs.permissions.deny ?? []), ...(ours.permissions?.deny ?? [])])];
  writeFileSync(file, JSON.stringify(theirs, null, 2) + '\n');
  out('edit  .claude/settings.json (hooks merged)');
}

function detectConfig(target) {
  const config = {
    specsDir: 'specs',
    ledger: 'factory/ledger.jsonl',
    gates: [],
    implementers: [
      { name: 'opencode', adapter: 'scripts/factory/adapters/opencode.sh', model: 'opencode/big-pickle' },
      { name: 'claude-headless', adapter: 'scripts/factory/adapters/claude.sh', model: 'claude-sonnet-5-5' },
    ],
    riskyPaths: ['**/auth/**', '**/payments/**', '**/billing/**', '**/migrations/**', '**/*.sql'],
    lockedPaths: [],
    protectedBranches: ['main', 'master'],
    stopRequiresGates: true,
    formatOnEdit: null,
  };
  const pkg = join(target, 'package.json');
  if (existsSync(pkg)) {
    const scripts = JSON.parse(readFileSync(pkg, 'utf8')).scripts ?? {};
    const pm = existsSync(join(target, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(target, 'yarn.lock')) ? 'yarn' : 'npm run';
    for (const name of ['lint', 'typecheck', 'test', 'test:e2e', 'build']) if (scripts[name]) config.gates.push({ name, run: `${pm} ${name}` });
  } else if (existsSync(join(target, 'pyproject.toml'))) {
    config.gates.push({ name: 'lint', run: 'ruff check .' }, { name: 'typecheck', run: 'mypy .' }, { name: 'test', run: 'pytest -q' });
  } else if (existsSync(join(target, 'go.mod'))) {
    config.gates.push({ name: 'vet', run: 'go vet ./...' }, { name: 'test', run: 'go test ./...' });
  } else if (existsSync(join(target, 'Cargo.toml'))) {
    config.gates.push({ name: 'clippy', run: 'cargo clippy -- -D warnings' }, { name: 'test', run: 'cargo test' });
  }
  return config;
}

// ---------------------------------------------------------------------------- main

const [cmd = 'help', ...argv] = process.argv.slice(2);
const { pos, flags } = parseArgs(argv);
const fn = commands[cmd] ?? (cmd === '--help' || cmd === '-h' ? commands.help : null);
if (!fn) die(`unknown command "${cmd}"; run \`factory help\``);
try {
  fn(pos, flags);
} catch (e) {
  die(e.message);
}

