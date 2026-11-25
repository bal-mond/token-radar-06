// Token Launch Radar, radar-6: the entrypoint (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>),
// scores every launch candidate with the model in lib/model.ts, writes the ranked board to
// /output/board.json, writes the dashboard's data beside the page as data.js, copies this
// repository's dashboard/ and screenshots/ to /output, and writes /output/dossier.json with
// the vendored make.fun library. The dashboard is a static page, no framework and no network.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import type { RadarData } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written from the output directory, then rebuilt and compared byte for byte:
// the integrity strip on the dashboard shows this check as passed only when it matches.
const dossierCaps = { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } };
const dossierBytes = buildDossier(out, dossierCaps);
writeFileSync(join(out, 'dossier.json'), dossierBytes);
const dossierAgain = buildDossier(out, dossierCaps);
const dossierOnDisk = readFileSync(join(out, 'dossier.json'));
const dossierMatches =
  Buffer.from(dossierBytes).equals(Buffer.from(dossierAgain)) && Buffer.from(dossierBytes).equals(dossierOnDisk);

/** The build-time checks the dashboard's integrity strip shows, with pass/fail. */
function integrityChecks(radarData: RadarData): RadarData['integrity'] {
  const rows = radarData.rows;
  const watchlistHit = rows.filter((r) => snapshot.watchlist.includes(r.slug)).length;
  const ranksOk = rows.every((r, i) => r.rank === i + 1);
  const sortedOk = rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1]!.implied_value_usd);
  const stepsOk = rows.every((r) => r.farm_steps.length === 6 && r.farm_steps.every((s) => s.length >= 20 && s.length <= 600));
  const bandOk = rows.every((r) => r.p10_usd < r.p90_usd);
  const variedOk = rows.length < 2 || rows[0]!.implied_value_usd !== rows[rows.length - 1]!.implied_value_usd;
  return [
    { name: 'Watchlist covered', passed: watchlistHit === snapshot.watchlist.length, detail: `${watchlistHit}/${snapshot.watchlist.length}` },
    { name: 'Ranks are 1..N', passed: ranksOk, detail: `${rows.length} rows` },
    { name: 'Expected value non-increasing with rank', passed: sortedOk, detail: sortedOk ? 'holds' : 'violated' },
    { name: 'Every row has 6 farm steps of 20-600 chars', passed: stepsOk, detail: stepsOk ? 'holds' : 'violated' },
    { name: 'P10 < P90 on every row', passed: bandOk, detail: bandOk ? 'holds' : 'violated' },
    { name: 'Implied values vary', passed: variedOk, detail: variedOk ? 'holds' : 'all equal' },
    { name: 'Dossier matches buildDossier', passed: dossierMatches, detail: dossierMatches ? 'byte for byte' : 'mismatch' },
  ];
}

radar.integrity = integrityChecks(radar);
writeFileSync(join(out, 'data.js'), dataScript(radar));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored\n` +
    `token radar: live comps ${radar.live_curve.n}, LOO x${radar.live_curve.looFactor.toFixed(2)}, walk-forward x${radar.live_curve.wf25.factor.toFixed(2)} / x${radar.live_curve.wf24.factor.toFixed(2)}; all-128 LOO x${radar.all_curve.looFactor.toFixed(2)}\n` +
    `token radar: odds 5-fold log-loss ${radar.odds_cv.logLoss.toFixed(3)}, AUC ${radar.odds_cv.auc.toFixed(3)}; band x${radar.band.half_width_x} holds ${Math.round(radar.band.wf_cov_2025 * 100)}% / ${Math.round(radar.band.wf_cov_2024 * 100)}% walk-forward\n` +
    `token radar: top 3 by expected value: ${board.slice(0, 3).map((r) => `${r.slug} ($${r.implied_value_usd.toLocaleString('en-US')})`).join(', ')}\n` +
    `token radar: verdicts FARM ${radar.verdicts.FARM}, THIN ${radar.verdicts.THIN}, SKIP ${radar.verdicts.SKIP}; dossier matches: ${dossierMatches}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')}, ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
