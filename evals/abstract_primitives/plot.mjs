/**
 * Abstract Primitives Plotter (no external dependencies)
 *
 * Reads saved discovery results JSON and produces:
 * - ASCII sparklines in the terminal
 * - a static HTML report with inline SVG charts
 *
 * Usage:
 *   node evals/abstract_primitives/plot.mjs --input=evals/abstract_primitives/results/seed_1/results.json
 *   node evals/abstract_primitives/plot.mjs --seed=1
 */

import fs from 'node:fs';
import path from 'node:path';

import { normalizeSeed } from './rng.mjs';

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

function clamp01(x) {
  return Math.max(0, Math.min(1, Number(x) || 0));
}

function clampScore(score) {
  const v = Number(score);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function sampleToWidth(values, width) {
  const w = Math.max(1, Number(width) || 1);
  if (values.length <= w) return values;
  const out = [];
  for (let i = 0; i < w; i++) {
    const t = w === 1 ? 0 : i / (w - 1);
    const idx = Math.round(t * (values.length - 1));
    out.push(values[idx]);
  }
  return out;
}

function sparkline(values, width = 32) {
  const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const sampled = sampleToWidth(values, width);
  return sampled.map((v) => {
    const s = clampScore(v) / 100;
    const idx = Math.round(s * (blocks.length - 1));
    return blocks[idx];
  }).join('');
}

function mean(scores) {
  if (!Array.isArray(scores) || scores.length === 0) return 0;
  let sum = 0;
  for (const s of scores) sum += Number(s) || 0;
  return sum / scores.length;
}

function buildSvgPolyline(curve, { width, height, pad }) {
  const points = Array.isArray(curve) ? curve : [];
  const maxStep = Math.max(1, ...points.map((p) => Number(p.step) || 0));
  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);

  const coords = points.map((p) => {
    const x = pad + innerW * clamp01((Number(p.step) || 0) / maxStep);
    const y = pad + innerH * (1 - clamp01(clampScore(p.score) / 100));
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return coords.join(' ');
}

function renderHtmlReport(payload, inputPath) {
  const evaluated = (payload.results || []).filter((r) => r && r.status === 'evaluated');
  const avg = mean(evaluated.map((r) => r.score));
  const seed = payload.baseSeed;

  const cards = evaluated.map((r) => {
    const curve = Array.isArray(r.curve) ? r.curve : [];
    const poly = buildSvgPolyline(curve, { width: 520, height: 120, pad: 12 });
    const name = escapeHtml(r.systemName || r.systemId);
    const id = escapeHtml(r.systemId);
    const score = clampScore(r.score).toFixed(1);
    const t50 = r.stepsTo?.steps_to_50 ?? null;
    const t80 = r.stepsTo?.steps_to_80 ?? null;
    const aulc = Number.isFinite(r.aulc) ? r.aulc.toFixed(4) : 'null';

    return `
      <section class="card">
        <div class="cardHead">
          <div class="title">${name} <span class="muted">(${id})</span></div>
          <div class="metrics">
            <span class="pill">score <b>${score}%</b></span>
            <span class="pill">ttc50 <b>${t50 === null ? 'null' : t50}</b></span>
            <span class="pill">ttc80 <b>${t80 === null ? 'null' : t80}</b></span>
            <span class="pill">aulc <b>${aulc}</b></span>
          </div>
        </div>
        <svg class="chart" viewBox="0 0 520 120" width="520" height="120" role="img" aria-label="Learning curve">
          <rect x="0" y="0" width="520" height="120" fill="#0b1220"></rect>
          <line x1="12" y1="108" x2="508" y2="108" stroke="#20304a" stroke-width="1"></line>
          <line x1="12" y1="12" x2="508" y2="12" stroke="#20304a" stroke-width="1"></line>
          <polyline points="${poly}" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>
        </svg>
      </section>
    `.trim();
  }).join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BSP Abstract Primitives Plot</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #070b12;
        --panel: #0b1220;
        --text: #e5e7eb;
        --muted: #9ca3af;
        --border: #1f2a3a;
        --pill: #0f1a2d;
      }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        background: var(--bg);
        color: var(--text);
      }
      header {
        padding: 16px 18px;
        border-bottom: 1px solid var(--border);
        background: linear-gradient(180deg, #0b1220 0%, #070b12 100%);
      }
      h1 { font-size: 18px; margin: 0 0 6px 0; }
      .meta { color: var(--muted); font-size: 13px; }
      main { padding: 16px 18px; max-width: 1100px; margin: 0 auto; }
      .grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
      .card {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 12px;
        background: var(--panel);
      }
      .cardHead { display: flex; gap: 10px; align-items: baseline; justify-content: space-between; flex-wrap: wrap; }
      .title { font-size: 14px; font-weight: 700; }
      .muted { color: var(--muted); font-weight: 500; }
      .metrics { display: flex; flex-wrap: wrap; gap: 8px; }
      .pill {
        border: 1px solid var(--border);
        background: var(--pill);
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 12px;
        color: var(--muted);
      }
      .pill b { color: var(--text); font-weight: 700; }
      .chart { margin-top: 10px; border-radius: 8px; display: block; width: 100%; height: auto; border: 1px solid var(--border); }
      code { color: #a7f3d0; }
    </style>
  </head>
  <body>
    <header>
      <h1>BSP Abstract Primitives — Learning Curves</h1>
      <div class="meta">
        seed=<code>${escapeHtml(seed)}</code> · avgScore=<code>${avg.toFixed(1)}%</code> · source=<code>${escapeHtml(inputPath)}</code>
      </div>
    </header>
    <main>
      <div class="grid">
        ${cards}
      </div>
    </main>
  </body>
</html>
`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    seed: null,
    input: null,
    out: null,
    sparkWidth: 32,
  };

  for (const arg of args) {
    if (arg.startsWith('--seed=')) config.seed = normalizeSeed(arg.split('=')[1]);
    else if (arg.startsWith('--input=')) config.input = arg.slice('--input='.length);
    else if (arg.startsWith('--out=')) config.out = arg.slice('--out='.length);
    else if (arg.startsWith('--spark-width=')) config.sparkWidth = parseInt(arg.split('=')[1], 10);
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

  console.log('=== Abstract Primitives — Sparklines ===');
  console.log(`seed=${payload.baseSeed}`);
  console.log('');

  for (const r of evaluated) {
    const curve = Array.isArray(r.curve) ? r.curve : [];
    const series = curve.map((p) => p.score);
    const sl = sparkline(series, config.sparkWidth);
    const score = clampScore(r.score).toFixed(1);
    const t50 = r.stepsTo?.steps_to_50 ?? null;
    const t80 = r.stepsTo?.steps_to_80 ?? null;
    const aulc = Number.isFinite(r.aulc) ? r.aulc.toFixed(4) : 'null';
    console.log(
      `${r.systemId} ${r.systemName} ` +
      `score=${score}% ttc50=${t50 === null ? 'null' : t50} ttc80=${t80 === null ? 'null' : t80} aulc=${aulc} ` +
      `${sl}`
    );
  }

  const html = renderHtmlReport(payload, inputPath);
  const outPath = config.out
    ? path.resolve(process.cwd(), config.out)
    : path.join(path.dirname(inputPath), 'plot.html');
  ensureDirSync(path.dirname(outPath));
  fs.writeFileSync(outPath, html);

  console.log('');
  console.log(`HTML written to: ${outPath}`);
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}

