# Token Launch Radar — radar-6

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/bal-mond/token-radar-06/rank.svg)](https://make.fun/c/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/bal-mond/token-radar-06/reward.svg)](https://make.fun/c/token-radar-01)

A token launch radar for the [make.fun](https://make.fun/c/token-radar-01)
`token-radar-01` bounty ($1,325). It reads the sealed DefiLlama snapshot,
ranks every pre-token protocol by expected value, and hands in a dashboard a
reader can use: a sortable, filterable board, a detail view for each protocol
with its model breakdown and farm plan, a model page that shows every test,
and a live-anchors view of the tokens that already trade.

## The model (recomputed from the snapshot on every run)

- **Value curve** — plain OLS, `log(market cap) = intercept + slope × log(TVL)`,
  fitted on the 74 live traded tokens (market cap ≥ $1M, no CEX/bridge/
  liquid-staking token, no versioned name). Leave-one-out ≈ x2.70 (35%
  within 2x), walk-forward ≈ x2.52 / x2.55, 10-fold ≈ x2.66. The same curve
  on all 128 positive-market-cap tokens (≈ x3.40) is shown alongside, so the
  comp-set choice is checkable rather than cherry-picked.
- **Token odds** — a peer-group logit (age + log10 TVL + HIGH/LOW group
  dummies) over the 645 known-age protocols, 5-fold log-loss ≈ 0.59 and AUC
  ≈ 0.76, turned into ever-lists odds by the survival identity
  `(pi − q) / (1 − q)` with a **per-group** pi. The dashboard prints the
  peer-group table, the coefficients, a split-half calibration and the
  sensitivity of the top 10 to the pi shrinkage weight.
- **Bands** — a symmetric ±q90(|leave-one-out residual|) 80% band, half-width
  ≈ x8.3, holding ≈ 85% / 83% on the two walk-forward cuts (the old
  P10–P90 band held only ≈ 69% / 77%).
- **Farm plans** — six steps per protocol, derived from its own category,
  chains, TVL and age, with capital tiers, a $12 gas budget, hold days,
  break-even, expected receipt at a 0.005% farmer share, a FARM / THIN /
  SKIP verdict and receipt per hour.

The honest limit, stated on the model page: the curve's residual spread is
about x2.7 at the median and no tested variant beats plain OLS on
leave-one-out, so the gain in this entry is in the odds and the bands, not
in a cleverer curve.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

Node 22.18 or later, standard library only. `main.ts` writes `board.json`,
`data.js`, `dashboard/`, `screenshots/` and `dossier.json` to the output
directory, and runs deterministically: two runs write identical bytes.

## Layout

- `main.ts` — the entrypoint: reads the snapshot, writes the outputs.
- `lib/model.ts` — the whole model: curve, tests, variants, odds, bands,
  farm plans, board.
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte
  from the kit.
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`), no
  network.
- `screenshots/` — the board, a protocol detail view and a filtered view,
  1440×900.
