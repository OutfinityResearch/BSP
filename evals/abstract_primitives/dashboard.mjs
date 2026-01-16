/**
 * Abstract Primitives Dashboard (no external dependencies)
 *
 * Generates a static HTML dashboard from saved evaluation results.
 *
 * Usage:
 *   node evals/abstract_primitives/dashboard.mjs --seed=1
 *   node evals/abstract_primitives/dashboard.mjs --input=evals/abstract_primitives/results/seed_1/results.json
 */

import fs from 'node:fs';
import path from 'node:path';

import { normalizeSeed } from './rng.mjs';

const TIERS = {
  1: ['01_convergence', '02_divergence', '03_cycles', '04_hierarchy', '05_composition'],
  2: ['06_negation', '07_conditional_gates', '08_analogy', '09_context_switching', '10_chunking',
      '11_reversibility', '12_temporal_order', '13_exceptions', '14_interpolation', '15_counting'],
  3: ['16_recursion', '17_inhibition', '18_noise_robustness', '19_memory_decay', '20_transfer']
};

const __dirname = new URL('.', import.meta.url).pathname;

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function clampScore(score) {
  const v = Number(score);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function mean(scores) {
  if (!Array.isArray(scores) || scores.length === 0) return 0;
  let sum = 0;
  for (const s of scores) sum += Number(s) || 0;
  return sum / scores.length;
}

function tierOf(systemId) {
  for (const [tier, ids] of Object.entries(TIERS)) {
    if (ids.includes(systemId)) return Number(tier);
  }
  return 0;
}

function stableSortByScoreAsc(items) {
  return [...items].sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return String(a.systemId).localeCompare(String(b.systemId));
  });
}

function stableSortByScoreDesc(items) {
  return [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.systemId).localeCompare(String(b.systemId));
  });
}

function simplifyDiagnostics(diagnostics) {
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) return null;
  const last = [...diagnostics].reverse().find((d) => d && d.window);
  if (!last) return null;

  const pick = (obj, path) => {
    let cur = obj;
    for (const key of path) {
      if (!cur || typeof cur !== 'object') return null;
      cur = cur[key];
    }
    return cur;
  };

  return {
    step: last.step,
    window: {
      candidateFanoutMean: pick(last, ['window', 'candidateFanout', 'mean']),
      candidateFanoutP90: pick(last, ['window', 'candidateFanout', 'p90']),
      activeGroupsMean: pick(last, ['window', 'activeGroups', 'mean']),
      surpriseRatioMean: pick(last, ['window', 'surpriseRatio', 'mean']),
      hallucinationRatioMean: pick(last, ['window', 'hallucinationRatio', 'mean']),
    },
    deltaPerStep: {
      groupsCreated: pick(last, ['delta', 'perStep', 'groupsCreated']),
      groupsPruned: pick(last, ['delta', 'perStep', 'groupsPruned']),
      strengthenOps: pick(last, ['delta', 'perStep', 'strengthenOps']),
    }
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    seed: null,
    input: null,
    out: null,
    weakCount: 5,
    strongCount: 5,
  };

  for (const arg of args) {
    if (arg.startsWith('--seed=')) config.seed = normalizeSeed(arg.split('=')[1]);
    else if (arg.startsWith('--input=')) config.input = arg.slice('--input='.length);
    else if (arg.startsWith('--out=')) config.out = arg.slice('--out='.length);
    else if (arg.startsWith('--weak=')) config.weakCount = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--strong=')) config.strongCount = parseInt(arg.split('=')[1], 10);
  }

  return config;
}

function resolveInputPath(config) {
  if (config.input) return path.resolve(process.cwd(), config.input);
  if (config.seed !== null) {
    return path.join(__dirname, 'results', `seed_${normalizeSeed(config.seed)}`, 'results.json');
  }
  throw new Error('Missing --input=... or --seed=...');
}

function renderTierSummary(systems) {
  const tiers = [1, 2, 3].map((tier) => {
    const inTier = systems.filter((s) => s.tier === tier);
    return {
      tier,
      count: inTier.length,
      avgScore: mean(inTier.map((s) => s.score)),
    };
  });

  const rows = tiers.map((t) => `
    <tr>
      <td><span class="tierTag">Tier ${t.tier}</span></td>
      <td>${t.count}</td>
      <td><code>${t.avgScore.toFixed(1)}%</code></td>
    </tr>
  `.trim()).join('\n');

  return `
    <section class="card">
      <div class="cardHead">
        <div class="title">Tier Summary</div>
      </div>
      <table style="width:100%; border-collapse: collapse; margin-top:10px; font-size:13px;">
        <thead>
          <tr style="color: var(--muted); text-align:left;">
            <th style="padding:6px 4px;">Tier</th>
            <th style="padding:6px 4px;">Systems</th>
            <th style="padding:6px 4px;">Avg Score</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>
  `.trim();
}

function renderListCard(title, items) {
  const li = items.map((s) => `
    <li>
      <span class="muted">${escapeHtml(s.systemId)}</span>
      &nbsp;${escapeHtml(s.systemName)} — <code>${s.score.toFixed(1)}%</code>
    </li>
  `.trim()).join('\n');

  return `
    <section class="card">
      <div class="cardHead">
        <div class="title">${escapeHtml(title)}</div>
      </div>
      <ul style="margin: 10px 0 0 18px; padding: 0; color: var(--text);">
        ${li}
      </ul>
    </section>
  `.trim();
}

function renderSystemCard(system) {
  const score = clampScore(system.score);
  const pct = `${score.toFixed(1)}%`;
  const tier = system.tier || 0;

  const t50 = system.ttc50 === null ? 'null' : String(system.ttc50);
  const t80 = system.ttc80 === null ? 'null' : String(system.ttc80);
  const aulc = system.aulc === null ? 'null' : String(system.aulc.toFixed(4));

  const diag = system.diagnostics;
  const diagText = diag ? JSON.stringify(diag, null, 2) : null;
  const metricsText = system.metrics ? JSON.stringify(system.metrics, null, 2) : null;

  const search = `${system.systemId} ${system.systemName}`.toLowerCase();
  return `
    <section
      class="card systemCard"
      data-id="${escapeHtml(system.systemId)}"
      data-tier="${tier}"
      data-score="${score.toFixed(4)}"
      data-search="${escapeHtml(search)}"
    >
      <div class="cardHead">
        <div class="title">
          ${escapeHtml(system.systemName)}
          <span class="muted">(${escapeHtml(system.systemId)})</span>
          ${tier ? `<span class="tierTag">Tier ${tier}</span>` : ''}
        </div>
        <div class="metrics">
          <span class="pill">score <b>${pct}</b></span>
          <span class="pill">ttc50 <b>${escapeHtml(t50)}</b></span>
          <span class="pill">ttc80 <b>${escapeHtml(t80)}</b></span>
          <span class="pill">aulc <b>${escapeHtml(aulc)}</b></span>
        </div>
      </div>
      <div class="bar"><div style="width:${score.toFixed(2)}%"></div></div>
      <details>
        <summary>Details</summary>
        ${diagText ? `<pre>${escapeHtml(diagText)}</pre>` : `<pre>null</pre>`}
        ${metricsText ? `<pre>${escapeHtml(metricsText)}</pre>` : `<pre>null</pre>`}
      </details>
    </section>
  `.trim();
}

function main() {
  const config = parseArgs();
  const inputPath = resolveInputPath(config);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  if (payload?.schema !== 'bsp_abstract_primitives_evaluation') {
    throw new Error(`Unsupported schema: ${String(payload?.schema)}`);
  }

  const evaluated = (payload.results || []).filter((r) => r && r.status === 'evaluated');
  if (evaluated.length === 0) {
    throw new Error('No evaluated results found in input JSON');
  }

  const systems = evaluated.map((r) => ({
    systemId: r.systemId,
    systemName: r.systemName || r.systemId,
    tier: tierOf(r.systemId),
    score: clampScore(r.score),
    ttc50: r.stepsTo?.steps_to_50 ?? null,
    ttc80: r.stepsTo?.steps_to_80 ?? null,
    aulc: Number.isFinite(r.aulc) ? r.aulc : null,
    diagnostics: simplifyDiagnostics(r.diagnostics),
    metrics: r.metrics || null,
  }));

  const avgScore = mean(systems.map((s) => s.score));
  const strongest = stableSortByScoreDesc(systems).slice(0, Math.max(1, config.strongCount | 0));
  const weakest = stableSortByScoreAsc(systems).slice(0, Math.max(1, config.weakCount | 0));

  const body = `
    <header>
      <h1>BSP Abstract Primitives — Profile Dashboard</h1>
      <div class="meta">
        seed=<code>${escapeHtml(payload.baseSeed)}</code> · avgScore=<code>${avgScore.toFixed(1)}%</code> ·
        source=<code>${escapeHtml(inputPath)}</code>
      </div>
    </header>
    <main>
      <div class="controls">
        <label for="search">Search</label>
        <input id="search" placeholder="system id / name" />
        <label for="sort">Sort</label>
        <select id="sort">
          <option value="tier_score">tier → score</option>
          <option value="score_desc">score ↓</option>
          <option value="score_asc">score ↑</option>
          <option value="id">id</option>
        </select>
      </div>
      <div class="grid">
        ${renderTierSummary(systems)}
        ${renderListCard('Strengths (Top)', strongest)}
        ${renderListCard('Weaknesses (Bottom)', weakest)}
      </div>
      <div style="height: 14px;"></div>
      <div id="systems" class="grid">
        ${systems.map(renderSystemCard).join('\n')}
      </div>
    </main>
  `.trim();

  const templatePath = path.join(__dirname, 'templates', 'profile.html');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  const template = fs.readFileSync(templatePath, 'utf-8');
  const html = template
    .replace('{{TITLE}}', 'BSP Abstract Primitives Dashboard')
    .replace('{{BODY}}', body);

  const outPath = config.out
    ? path.resolve(process.cwd(), config.out)
    : path.join(path.dirname(inputPath), 'dashboard.html');
  ensureDirSync(path.dirname(outPath));
  fs.writeFileSync(outPath, html);

  console.log(`Dashboard written to: ${outPath}`);
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}

