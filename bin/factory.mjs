#!/usr/bin/env node
// factory: the command line for the Software Factory pipeline. Zero dependencies.
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LANES,
  STAGES,
  appendLedger,
  changedFiles,
  git,
  enforcedFor,
  hooksDir,
  hooksInstalled,
  installHooks,
  isAgent,
  parsePrePush,
  prePushViolations,
  uninstallHooks,
  isRisky,
  renderHandbook,
  selectHandbook,
  listFeatures,
  loadConfig,
  readLedger,
  repoRoot,
  scopeCheck,
  stampPath,
  stampStatus,
  stagesFor,
  summarize,
  summarizeHandbook,
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

function blockers(root, config, feature, stage, lane = 'full') {
  const dir = join(root, config.specsDir, feature);
  return CHECKS[stage]({ root, config, feature, dir, lane });
}

const IMPLEMENTER_RULES = `You are an implementer in a software factory. Follow these standing rules exactly:

1. Edit only the files listed in \`allowed_files\`. Creating or changing any other file fails the run.
2. Do not run shell commands. Do not install packages. If a dependency is missing, say so in your report.
3. Do not commit, branch, or touch git.
4. Read the existing code named in Context before writing. Imitate its patterns. Never invent an
   API: if a function you need does not exist, say so instead of calling it.
5. Do not read or write .env files or credentials.
6. Finish with the report described in the brief's Report section. A run without a report counts as failed.
7. If a project handbook section follows, its rules are this repository's conventions. Follow them;
   where the brief and the handbook disagree, the brief wins and you say so in your report.

`;

// ---------------------------------------------------------------------------- commands

const commands = {
  help() {
    out(`factory <command>

Pipeline
  feature new <slug>              Create specs/NNN-slug with state.json at stage "intake"
        --lane full|quick         quick: intake, brief, implement, gates, review, ship
                                  (no spec/design stages; risky paths are refused)
  status [feature]                Show every feature, its stage and what blocks it
  check [feature]                 List the exit-criteria failures of the current stage
  advance [feature]               Move to the next stage if the current one is satisfied
        --override "<reason>"     Advance anyway; the reason is written to the history

Briefs and scope
  brief new <feature> <id>        Scaffold briefs/<id>.md from the brief template
  brief check <file...>           Validate brief frontmatter and required sections
  scope <brief> [--base REF]      Fail if the diff touches files outside allowed_files
  risk [--base REF]               List changed files that match riskyPaths
  delegate <brief> [--only name]  Send a brief to the implementer lanes in order; quota falls through
  handbook <brief>                Show which handbook parts delegate injects for this brief
  review <feature> [--base REF]   Free read-only first pass; findings go to review.md unchecked

Evals
  eval [dir] [--only name] [--case name] [--repeat N] [--handbook off] [--min-pass 0.8] [--keep]
                                  Run evals/<case>/case.md on each lane in a fresh worktree;
                                  score: completed, in scope, gates green, case check passes
  report --by handbook            Accept rate with vs without each injected handbook part

Gates and ledger
  gates [--only name]             Run every configured gate; stamp the tree when all pass
  stamp-check                     Exit 0 if the last green gate run matches the current tree
  githooks install|uninstall      Real git pre-commit and pre-push hooks for this clone (init installs them)
  ledger add --feature F --brief B --implementer I --outcome accepted|rejected|failed|quota
             [--model M] [--minutes N] [--cost N] [--findings N] [--note "..."]
  report [--html file]            Implementer scorecard from the ledger

Setup
  init [dir] [--force]            Install the factory kit into a repository
        --plugin                  Use the Claude Code plugin for hooks, agents and skills;
                                  install only the CLI, config, templates and deny list
  doctor                          Check that the kit is installed and wired`);
  },

  feature([sub, slug], flags) {
    if (sub !== 'new' || !slug) die('usage: factory feature new <slug> [--lane full|quick]');
    const lane = flags.lane ? String(flags.lane) : 'full';
    if (!LANES[lane]) die(`unknown lane "${lane}"; use one of: ${Object.keys(LANES).join(', ')}`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) die('slug must be kebab-case');
    const { root, config } = ctx();
    const existing = listFeatures(root, config);
    const next = String(existing.reduce((m, f) => Math.max(m, parseInt(f, 10) || 0), 0) + 1).padStart(3, '0');
    const name = `${next}-${slug}`;
    const dir = join(root, config.specsDir, name);
    mkdirSync(join(dir, 'briefs'), { recursive: true });
    const now = new Date().toISOString();
    writeState(root, config, name, { feature: name, lane, stage: 'intake', created: now, history: [{ stage: 'intake', at: now }] });
    const tpl = join(templatesDir(root), 'intake.md');
    if (existsSync(tpl)) writeFileSync(join(dir, 'intake.md'), readFileSync(tpl, 'utf8').replaceAll('{{feature}}', name));
    out(`created ${config.specsDir}/${name} at stage intake (${lane} lane)`);
  },

  status([id]) {
    const { root, config } = ctx();
    const list = id ? [resolveFeature(root, config, id)] : listFeatures(root, config);
    if (!list.length) return out('no features');
    for (const f of list) {
      const s = readState(root, config, f);
      const b = s.stage === 'done' ? [] : blockers(root, config, f, s.stage, s.lane);
      const stages = stagesFor(s);
      const n = stages.indexOf(s.stage) + 1;
      out(`${f.padEnd(32)} ${s.stage.padEnd(10)} ${s.stage === 'done' ? 'done' : `${n}/${stages.length}${s.lane === 'quick' ? ' quick' : ''}`}  ${b.length ? `${b.length} blocker(s)` : 'ready to advance'}`);
    }
  },

  check([id]) {
    const { root, config } = ctx();
    const f = resolveFeature(root, config, id);
    const s = readState(root, config, f);
    if (s.stage === 'done') return out(`${f} is done`);
    const b = blockers(root, config, f, s.stage, s.lane);
    out(`${f} @ ${s.stage}${s.lane === 'quick' ? ' (quick lane)' : ''}`);
    if (!b.length) return out('  ready to advance');
    for (const x of b) out(`  - ${x}`);
    process.exitCode = 1;
  },

  advance([id], flags) {
    const { root, config } = ctx();
    const f = resolveFeature(root, config, id);
    const s = readState(root, config, f);
    if (s.stage === 'done') die(`${f} is already done`);
    const b = blockers(root, config, f, s.stage, s.lane);
    if (b.length && !flags.override) {
      err(`cannot leave "${s.stage}":`);
      for (const x of b) err(`  - ${x}`);
      die('fix the blockers, or pass --override "<reason>" to record a deliberate exception');
    }
    const prev = s.stage;
    const stages = stagesFor(s);
    const next = stages[stages.indexOf(prev) + 1] ?? 'done';
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

  // Entry point for the installed git hooks. A pre-existing hook kept as <name>.local runs first.
  githook([name, ...args]) {
    const { root, config } = ctx();
    const stdin = name === 'pre-push' ? readFileSync(0, 'utf8') : '';
    const local = join(hooksDir(root), `${name}.local`);
    if (existsSync(local)) {
      const r = spawnSync('sh', [local, ...args], { cwd: root, input: stdin, stdio: ['pipe', 'inherit', 'inherit'] });
      if (r.status !== 0) process.exit(r.status ?? 1);
    }
    const strict = enforcedFor(config);
    const who = isAgent() ? 'agent' : 'everyone';
    const blocked = (problems, hint) => {
      err(`software-factory ${name}: blocked (${who} rule)`);
      for (const p of problems) err(`  - ${p}`);
      if (hint) err(hint);
      process.exit(1);
    };

    if (name === 'pre-commit') {
      if (!strict || !(config.gates ?? []).length) return;
      const s = stampStatus(root, config);
      if (!s.valid) blocked([`gates are not green for this tree: ${s.reason}`], 'Run `node factory/cli/bin/factory.mjs gates` and commit after every gate passes.');
      return;
    }
    if (name === 'pre-push') {
      const isAncestor = (a, b) => {
        if (spawnSync('git', ['cat-file', '-e', `${a}^{commit}`], { cwd: root }).status !== 0) return null;
        return spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: root }).status === 0;
      };
      const problems = prePushViolations(parsePrePush(stdin), {
        protectedBranches: config.protectedBranches ?? ['main', 'master'],
        strict,
        isAncestor,
      });
      if (problems.length) blocked(problems);
      return;
    }
    die(`unknown git hook "${name}"`);
  },

  githooks([sub], flags) {
    const { root } = ctx();
    if (sub === 'install') {
      const r = installHooks(root, { force: Boolean(flags.force) });
      for (const l of r.log) out(l);
      return out(`git hooks installed in ${relPath(root, r.dir) || r.dir}`);
    }
    if (sub === 'uninstall') {
      const r = uninstallHooks(root);
      for (const l of r.log) out(l);
      return out(r.log.length ? 'git hooks removed' : 'no factory git hooks installed');
    }
    die('usage: factory githooks install [--force] | uninstall');
  },

  'stamp-check'() {
    const { root, config } = ctx();
    const s = stampStatus(root, config);
    if (s.valid) return out('gates: green for the current tree');
    err(`gates: ${s.reason}`);
    process.exitCode = 1;
  },

  // Dispatch one brief to the implementers in factory.config.json, in order, until one completes.
  // Adapter contract: args --prompt FILE --out DIR [--model M], cwd = repo root, writes
  // DIR/report.md and DIR/log.txt; exit 0 completed, 75 quota (try the next lane), else failed.
  // .sh adapters run under bash, .mjs/.js under node, anything else is executed directly.
  delegate([file], flags) {
    if (!file) die('usage: factory delegate <brief.md> [--only <implementer>]');
    const { root, config } = ctx();
    const briefPath = resolve(file);
    const r = validateBrief(readFileSync(briefPath, 'utf8'));
    if (!r.data) {
      for (const e of r.errors) err(`  ${e}`);
      die('brief is invalid; fix it with `factory brief check`');
    }
    const feature = basename(dirname(dirname(briefPath)));
    const id = String(r.data.id);
    const ledgerFile = config.ledger ?? 'factory/ledger.jsonl';
    const dirty = git(['status', '--porcelain', '--', '.', `:!${config.stateDir}`, `:!${ledgerFile}`], root).trim();
    if (dirty) die("working tree is not clean. Commit or stash first so the implementer's diff is reviewable on its own.");

    const stamp = runStamp();
    const runDir = join(root, config.stateDir, 'runs', feature, `${id}-${stamp}`);
    mkdirSync(runDir, { recursive: true });
    const prompt = join(runDir, 'prompt.md');
    const handbook = selectHandbook(root, config, r.data.allowed_files ?? []);
    writeFileSync(prompt, buildPrompt(handbook, readFileSync(briefPath, 'utf8')));
    const injected = handbook.parts.map((p) => p.source);
    if (handbook.dir) out(`delegate: handbook context: ${injected.length ? injected.join(', ') : 'none matched'}${handbook.skipped.length ? ` (${handbook.skipped.length} over budget)` : ''}`);

    const lanes = (config.implementers ?? []).filter((i) => !flags.only || i.name === flags.only);
    if (!lanes.length) die(flags.only ? `no implementer named "${flags.only}"` : 'no implementers configured');
    const record = (lane, outcome, minutes, note) =>
      appendLedger(root, config, { feature, brief: id, implementer: lane.name, model: lane.model, outcome, minutes, note, handbook: injected });

    for (const lane of lanes) {
      const outDir = join(runDir, lane.name);
      mkdirSync(outDir, { recursive: true });
      out(`delegate: ${id} -> ${lane.name}${lane.model ? ` (${lane.model})` : ''}`);
      const { code, minutes, report, hasReport, error } = runAdapter(root, lane, prompt, outDir);
      const run = { error };

      if (code === 75) {
        // Discard partial edits first, then record the attempt, so the rollback cannot erase the row.
        spawnSync('git', ['checkout', '--', '.'], { cwd: root, stdio: 'ignore' });
        spawnSync('git', ['clean', '-fdq', '--', '.'], { cwd: root, stdio: 'ignore' });
        record(lane, 'quota', minutes);
        out(`delegate: ${lane.name} is out of quota; falling through to the next implementer`);
        continue;
      }
      if (code !== 0 || !hasReport) {
        record(lane, 'failed', minutes, run.error ? `spawn: ${run.error.message}` : `exit ${code}`);
        die(`${lane.name} failed (exit ${code}, report ${hasReport ? 'present' : 'missing'}). Log: ${join(outDir, 'log.txt')}`);
      }

      // The orchestrator records accepted/rejected later with `ledger add`; leave it what this run had.
      const note = lastRunPath(root, config, feature, id);
      mkdirSync(dirname(note), { recursive: true });
      writeFileSync(note, JSON.stringify({ implementer: lane.name, model: lane.model, handbook: injected }));

      out(`\n== implementer report (${report})`);
      out(readFileSync(report, 'utf8').trimEnd());
      out('\n== scope');
      commands.scope([briefPath], {});
      out('\nNext: read the full diff (git diff; git status), fix or revert, then record the outcome:');
      out(`  factory ledger add --feature ${feature} --brief ${id} --implementer ${lane.name}${lane.model ? ` --model ${lane.model}` : ''} --minutes ${minutes} --outcome accepted|rejected [--findings N]`);
      return;
    }
    die(`no implementer completed ${id}`);
  },

  // Run fixed cases against implementer lanes, each in a fresh worktree of HEAD, and score them
  // without a human: the run completed, the diff stays in scope, the gates pass, and the case's
  // hidden `check` command passes. Nothing touches your working tree or the ledger.
  eval([dir = 'evals'], flags) {
    const { root, config } = ctx();
    const casesDir = resolve(root, dir);
    if (!existsSync(casesDir)) die(`no eval cases at ${dir}/ (one folder per case, each with case.md)`);
    const cases = readdirSync(casesDir)
      .filter((c) => existsSync(join(casesDir, c, 'case.md')))
      .filter((c) => !flags.case || c === flags.case)
      .sort();
    if (!cases.length) die(flags.case ? `no case named "${flags.case}"` : `no cases in ${dir}/`);
    const lanes = (config.implementers ?? []).filter((i) => !flags.only || i.name === flags.only);
    if (!lanes.length) die(flags.only ? `no implementer named "${flags.only}"` : 'no implementers configured');
    const repeat = Math.max(1, Number(flags.repeat ?? 1));
    const useHandbook = flags.handbook !== 'off';
    if (git(['status', '--porcelain', '--', dir], root).trim()) err(`eval: ${dir}/ has uncommitted changes; cases run from HEAD, so commit them first`);

    const stamp = runStamp();
    const evalDir = join(root, config.stateDir, 'evals', stamp);
    mkdirSync(evalDir, { recursive: true });
    const results = [];

    for (const name of cases) {
      const text = readFileSync(join(casesDir, name, 'case.md'), 'utf8');
      const r = validateBrief(text);
      if (!r.data) die(`${dir}/${name}/case.md is not a valid brief: ${r.errors.join('; ')}`);
      for (const lane of lanes) {
        for (let i = 1; i <= repeat; i++) {
          const label = `${name}/${lane.name}${repeat > 1 ? `#${i}` : ''}`;
          const tag = `${name}--${lane.name}--${i}`;
          const wt = join(evalDir, 'wt', tag);
          const outDir = join(evalDir, 'out', tag);
          mkdirSync(outDir, { recursive: true });
          git(['worktree', 'add', '-q', '--detach', wt, 'HEAD'], root);
          const result = { case: name, implementer: lane.name, model: lane.model, run: i, handbook: useHandbook };
          try {
            const handbook = useHandbook ? selectHandbook(wt, config, r.data.allowed_files ?? []) : { parts: [], skipped: [] };
            const prompt = join(outDir, 'prompt.md');
            // The check is the grader's, not the implementer's: keep it out of the prompt.
            writeFileSync(prompt, buildPrompt(handbook, text.replace(/^check:.*\r?\n/m, '')));
            if (config.evalSetup) {
              const setup = spawnSync(config.evalSetup, { cwd: wt, shell: true, stdio: 'ignore' });
              if (setup.status !== 0) throw Object.assign(new Error('setup'), { evalReason: `evalSetup failed: ${config.evalSetup}` });
            }
            out(`\n== eval ${label}`);
            const run = runAdapter(wt, lane, prompt, outDir);
            result.seconds = run.seconds;
            if (run.code === 75) result.outcome = 'quota';
            else if (run.code !== 0 || !run.hasReport) {
              result.outcome = 'fail';
              result.reason = `adapter exit ${run.code}${run.hasReport ? '' : ', no report'}`;
            } else {
              const changed = changedFiles(wt, 'HEAD');
              const scope = scopeCheck(changed, r.data);
              const gate = (config.gates ?? []).find((g) => spawnSync(g.run, { cwd: wt, shell: true, stdio: 'ignore' }).status !== 0);
              const check = r.data.check ? spawnSync(String(r.data.check), { cwd: wt, shell: true, stdio: 'ignore' }).status === 0 : true;
              result.changed = changed;
              if (!changed.length) result.reason = 'no changes';
              else if (!scope.ok) result.reason = `out of scope: ${[...scope.outside, ...scope.violations].join(', ')}`;
              else if (gate) result.reason = `gate ${gate.name} failed`;
              else if (!check) result.reason = 'check failed';
              result.outcome = result.reason ? 'fail' : 'pass';
            }
          } catch (e) {
            if (!e.evalReason) throw e;
            result.outcome = 'error';
            result.reason = e.evalReason;
          } finally {
            if (!flags.keep) {
              git(['worktree', 'remove', '--force', wt], root);
            }
          }
          out(`eval: ${label} ${result.outcome}${result.reason ? ` (${result.reason})` : ''}`);
          results.push(result);
          appendFileSync(join(evalDir, 'results.jsonl'), JSON.stringify(result) + '\n');
        }
      }
    }
    if (!flags.keep) git(['worktree', 'prune'], root);

    out(`\n| implementer | passed | failed | quota | pass rate |\n|---|---|---|---|---|`);
    let worst = 1;
    for (const lane of lanes) {
      const rows = results.filter((x) => x.implementer === lane.name);
      const n = (o) => rows.filter((x) => x.outcome === o).length;
      const scored = n('pass') + n('fail');
      const rate = scored ? n('pass') / scored : null;
      if (rate != null) worst = Math.min(worst, rate);
      out(`| ${lane.name}${lane.model ? ` (${lane.model})` : ''} | ${n('pass')} | ${n('fail')} | ${n('quota')} | ${rate == null ? '-' : `${Math.round(rate * 100)}%`} |`);
    }
    out(`\nhandbook ${useHandbook ? 'on' : 'off'}; results: ${relPath(root, join(evalDir, 'results.jsonl'))}`);
    if (flags['min-pass'] != null && worst < Number(flags['min-pass'])) {
      err(`eval: pass rate ${Math.round(worst * 100)}% is below --min-pass ${flags['min-pass']}`);
      process.exitCode = 1;
    }
  },

  // First-pass review by a cheap model, read-only. Findings are appended to review.md as unchecked
  // UNVERIFIED items, so the review stage cannot be left until the orchestrator triages each one.
  // The reviewer lane is config.reviewer ({ adapter, model }); the default is OpenCode with its
  // read-only permission set. Every reviewer adapter gets FACTORY_READONLY=1 and must honour it.
  review([id], flags) {
    if (!id) die('usage: factory review <feature> [--base REF]');
    const { root, config } = ctx();
    const feature = resolveFeature(root, config, id);
    const base = flags.base ? String(flags.base) : 'HEAD';
    const maxBytes = Number(config.reviewMaxBytes ?? 150000);
    const excludes = [':!*.lock', ':!*-lock.yaml', ':!*-lock.json', `:!${config.stateDir}`];
    let diff = git(['diff', base, '--', '.', ...excludes], root);
    const untracked = git(['ls-files', '--others', '--exclude-standard'], root)
      .split('\n')
      .filter((f) => f && !f.startsWith(config.stateDir + '/'));
    if (!diff.trim() && !untracked.length) return out(`review: nothing to review against ${base}`);
    const truncated = Buffer.byteLength(diff) > maxBytes;
    if (truncated) diff = Buffer.from(diff).subarray(0, maxBytes).toString('utf8');

    // The reviewer judges against the same conventions the implementer was given.
    const handbook = selectHandbook(root, config, changedFiles(root, base));
    const stamp = runStamp();
    const outDir = join(root, config.stateDir, `review-${stamp}`);
    mkdirSync(outDir, { recursive: true });
    const prompt = join(outDir, 'prompt.md');
    writeFileSync(
      prompt,
      `You are a strict senior reviewer. Do not edit anything; only report.
Read AGENTS.md and any engineering handbook it points to, then the briefs in ${config.specsDir}/${feature}/briefs/.
Review the diff below against them. Open changed files for context when the diff is not enough.

Report only real problems, most severe first, one per line, in exactly this format:
- [ ] UNVERIFIED <high|medium|low>  <file>:<line>  <what is wrong and a concrete failure>.  Fix: <one sentence>.

Look for: correctness bugs, files outside the brief's allowed_files, invented APIs, missing tests for
new behaviour, security issues, secrets, dead code. Skip style nits and anything you are unsure of.
If there is nothing real, print exactly: No findings.

${renderHandbook(handbook)}Untracked files to read as well:
${untracked.length ? untracked.join('\n') : 'none'}

## Diff against ${base}${truncated ? ` (truncated at ${maxBytes} bytes: open the remaining changed files yourself)` : ''}
\`\`\`diff
${diff}
\`\`\`
`,
    );

    const lane = {
      name: 'reviewer',
      adapter: config.reviewer?.adapter ?? 'scripts/factory/adapters/opencode.sh',
      model: process.env.REVIEW_MODEL || config.reviewer?.model,
    };
    const run = runAdapter(root, lane, prompt, outDir, { OPENCODE_PERMISSIONS: 'readonly', FACTORY_READONLY: '1' });
    if (run.code !== 0 || !run.hasReport) {
      // A missing free pass is not a blocker; the reviewer subagent is the real review.
      err(`review: free review unavailable (exit ${run.code}${run.hasReport ? '' : ', no report'}); continue with the reviewer subagent`);
      return;
    }

    const findings = readFileSync(run.report, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^- \[ \] UNVERIFIED/.test(l));
    const reviewFile = join(root, config.specsDir, feature, 'review.md');
    const existing = existsSync(reviewFile) ? readFileSync(reviewFile, 'utf8') : '';
    const block = [
      ...(existing.trim() ? [] : [`# Review: ${feature}`]),
      '',
      `## Free first pass (${new Date().toISOString().slice(0, 10)}, unverified)`,
      '',
      ...(findings.length ? findings : ['No findings. (Not proof: run the reviewer subagent.)']),
      '',
    ];
    appendFileSync(reviewFile, (existing && !existing.endsWith('\n') ? '\n' : '') + block.join('\n'));
    out(`review: ${findings.length} finding(s) appended to ${config.specsDir}/${feature}/review.md`);
  },

  handbook([file]) {
    if (!file) die('usage: factory handbook <brief.md>');
    const { root, config } = ctx();
    const r = validateBrief(readFileSync(file, 'utf8'));
    if (!r.data) die(`invalid brief: ${r.errors.join('; ')}`);
    const s = selectHandbook(root, config, r.data.allowed_files ?? []);
    if (!s.dir) return out('no handbook found (set "handbook" in factory.config.json, or add .claude/skills/<project>-engineering/)');
    out(`handbook: ${relPath(root, s.dir)}`);
    let chars = 0;
    for (const p of s.parts) {
      out(`  inject  ${p.source} (${p.text.length} chars)`);
      chars += p.text.length;
    }
    for (const x of s.skipped) out(`  skip    ${x.source}: ${x.reason}`);
    if (!s.parts.length) out('  nothing matches; tag references with `applies_to:` globs in their frontmatter');
    out(`  total   ${chars} chars`);
  },

  ledger([sub], flags) {
    if (sub !== 'add') die('usage: factory ledger add --feature F --brief B --implementer I --outcome O');
    const { root, config } = ctx();
    // Carry over what the delegated run was given, so outcomes can be compared by handbook part.
    let handbook;
    const note = flags.feature && flags.brief ? lastRunPath(root, config, flags.feature, flags.brief) : null;
    if (note && existsSync(note)) {
      const last = JSON.parse(readFileSync(note, 'utf8'));
      if (last.implementer === flags.implementer) handbook = last.handbook;
    }
    const row = appendLedger(root, config, {
      handbook,
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
    if (flags.by === 'handbook') {
      const rows = summarizeHandbook(readLedger(root, config));
      if (!rows.length) return out('no ledger rows record handbook context yet (delegate records it from now on)');
      const pct = (x) => (x == null ? '-' : `${Math.round(x * 100)}%`);
      const pts = (x) => (x == null ? '-' : `${x >= 0 ? '+' : ''}${Math.round(x * 100)} pts`);
      out('| handbook part | runs with | accept with | runs without | accept without | delta |');
      out('|---|---|---|---|---|---|');
      for (const r of rows) out(`| ${r.part} | ${r.runsWith} | ${pct(r.rateWith)} | ${r.runsWithout} | ${pct(r.rateWithout)} | ${pts(r.delta)} |`);
      if (rows.some((r) => r.runsWith < 10 || r.runsWithout < 10)) out('\nFewer than 10 runs on a side: read the delta as a hint, not a result.');
      out('Correlation only. For a controlled comparison run `factory eval --handbook off` against the default.');
      return;
    }
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
    const plugin = Boolean(flags.plugin);
    if (plugin && hasHooks(target))
      die('this repo already has the factory hooks in .claude/settings.json; remove them before switching to the plugin, or they run twice');
    const kitDirs = plugin ? ['scripts/factory'] : ['.claude/hooks', '.claude/agents', '.claude/skills/software-factory', 'scripts/factory'];
    for (const d of kitDirs) copy(join(kit, d === 'scripts/factory' ? 'scripts' : d), d);
    copy(join(PKG, 'bin'), 'factory/cli/bin');
    copy(join(PKG, 'lib'), 'factory/cli/lib');
    copy(join(PKG, 'templates'), 'factory/templates');
    if (existsSync(join(PKG, 'docs', '12-failure-catalog.md'))) copy(join(PKG, 'docs', '12-failure-catalog.md'), 'factory/FAILURES.md');
    for (const f of ['AGENTS.md', 'CLAUDE.md']) {
      if (!existsSync(join(target, f))) copy(join(PKG, 'templates', 'project', f), f);
      else out(`skip  ${f} (exists; merge templates/project/${f} by hand)`);
    }
    if (plugin) pluginSettings(target);
    else mergeSettings(target);
    try {
      for (const l of installHooks(target).log) out(`${l} (git)`);
    } catch (e) {
      out(`skip  git hooks (${e.message}); run \`factory githooks install\` later`);
    }
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
    if (plugin)
      out(`\nEach person who clones this repo installs the plugin once:\n  claude plugin marketplace add ameenmv/software-factory\n  claude plugin install ${PLUGIN_ID} --scope project`);
    out('\nNext: edit factory.config.json, fill AGENTS.md, then `node factory/cli/bin/factory.mjs doctor`.');
  },

  doctor() {
    const { root, config } = ctx();
    const checks = [
      ['node >= 20', Number(process.versions.node.split('.')[0]) >= 20],
      ['factory.config.json present', !config._missing],
      ['at least one gate configured', config.gates.length > 0],
      [
        hasPlugin(root) ? `plugin ${PLUGIN_ID} enabled (hooks come from the plugin)` : '.claude/settings.json has factory hooks',
        hasPlugin(root) !== hasHooks(root),
      ],
      ['git hooks installed (pre-commit, pre-push; per clone: `factory githooks install`)', hooksInstalled(root)],
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

const PLUGIN_ID = 'software-factory@software-factory';

// Plugin mode: the plugin brings hooks, agents and skills. The project gets the secret deny list
// (plugins cannot ship permissions) and asks teammates to install the plugin when they trust the repo.
function pluginSettings(target) {
  const file = join(target, '.claude', 'settings.json');
  const ours = JSON.parse(readFileSync(join(PKG, 'kit', '.claude', 'settings.json'), 'utf8'));
  const theirs = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  theirs.permissions ??= {};
  theirs.permissions.deny = [...new Set([...(theirs.permissions.deny ?? []), ...(ours.permissions?.deny ?? [])])];
  theirs.extraKnownMarketplaces ??= {};
  theirs.extraKnownMarketplaces['software-factory'] ??= { source: { source: 'github', repo: 'ameenmv/software-factory' } };
  theirs.enabledPlugins ??= {};
  theirs.enabledPlugins[PLUGIN_ID] ??= true;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(theirs, null, 2) + '\n');
  out(`${existsSync(file) ? 'edit ' : 'add  '} .claude/settings.json (deny list + ${PLUGIN_ID})`);
}

function hasPlugin(root) {
  const f = join(root, '.claude', 'settings.json');
  if (!existsSync(f)) return false;
  try {
    return JSON.parse(readFileSync(f, 'utf8')).enabledPlugins?.[PLUGIN_ID] === true;
  } catch {
    return false;
  }
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

function buildPrompt(handbook, briefText) {
  return IMPLEMENTER_RULES + renderHandbook(handbook) + 'The brief follows.\n\n---\n\n' + briefText;
}

// Run one adapter. cwd is the tree the implementer edits: the repo root, or an eval worktree.
function runAdapter(cwd, lane, prompt, outDir, env) {
  const adapter = join(cwd, lane.adapter);
  const args = ['--prompt', prompt, '--out', outDir, ...(lane.model ? ['--model', lane.model] : [])];
  const [bin, argv] = /\.sh$/.test(adapter) ? ['bash', [adapter, ...args]] : /\.m?js$/.test(adapter) ? [process.execPath, [adapter, ...args]] : [adapter, args];
  const start = Date.now();
  const run = spawnSync(bin, argv, { cwd, stdio: 'inherit', env: env ? { ...process.env, ...env } : process.env });
  const report = join(outDir, 'report.md');
  return {
    code: run.error ? 127 : (run.status ?? 1),
    error: run.error,
    seconds: Math.round((Date.now() - start) / 1000),
    minutes: Math.ceil((Date.now() - start) / 60000),
    report,
    hasReport: existsSync(report) && readFileSync(report, 'utf8').trim().length > 0,
  };
}

function lastRunPath(root, config, feature, brief) {
  return join(root, config.stateDir, 'last-run', `${feature}__${brief}.json`);
}

function relPath(root, p) {
  return relative(root, p).split('\\').join('/');
}

// A unique, sortable name for a run folder. Seconds alone collide when two runs start in the
// same second, and the second run would then read the first run's report.md as its own.
function runStamp() {
  const t = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace('.', '');
  return `${t.slice(0, 18)}-${process.pid}-${Math.random().toString(36).slice(2, 6)}`;
}
