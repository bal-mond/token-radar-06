// Token Radar radar-6 dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, the model page and the live-anchors view, with a
// per-protocol detail drawer carrying the model breakdown and the farm plan. No network:
// every byte it shows is in data.js. Ranking is by expected value: the raw implied value
// from the fitted curve times the token odds from the peer-group logit.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', verdict: 'all', tab: 'board', sort: 'rank', dir: 1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(Math.round(n));
  }
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtPct(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(digits === undefined ? 2 : digits) + '%';
  }
  function fmtX(n) { return 'x' + n.toFixed(2); }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The value curve, recomputed in the page from the fitted coefficients data.js carries, so
  // the page's code and the board's data are visibly the same arithmetic.
  function rawOf(row) {
    var c = DATA.live_curve;
    return Math.max(1, Math.round(Math.exp(c.intercept + c.slope * Math.log(row.tvl_usd))));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'raw') { av = a.raw_implied_value_usd; bv = b.raw_implied_value_usd; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else if (key === 'rph') { av = a.receipt_per_hour_usd; bv = b.receipt_per_hour_usd; }
      else if (key === 'ev') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar · radar-6' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var c = DATA.live_curve;
    var a = DATA.all_curve;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.board_size + ' pre-token protocols, ranked by expected value' }),
        el('p', { text: 'Expected value is the raw implied value from the fitted curve times the token odds from the peers\u2019 record. The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The board adds ' + (DATA.board_size - DATA.watchlist_size) + ' pre-token protocols below that floor. Implied value is a model, not a promise.' }),
        el('p', { text: 'Curve (live comps): log(market cap) = ' + c.intercept.toFixed(3) + ' + ' + c.slope.toFixed(3) + ' x log(TVL), fitted on ' + c.n + ' live traded tokens. All-128 tokens: ' + a.intercept.toFixed(3) + ' + ' + a.slope.toFixed(3) + ' x log(TVL). Both are shown, so the comp-set choice is checkable.' })
      ),
      el('div', { class: 'kpis' },
        el('div', { class: 'kpi' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'kpi' }, el('span', { text: 'Candidates ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'kpi' }, el('span', { text: 'Leave-one-out, live comps' }), el('b', { text: fmtX(c.looFactor) + ' · ' + Math.round(c.looWithin2 * 100) + '% within 2x' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Walk-forward, live comps' }), el('b', { text: fmtX(c.wf25.factor) + ' / ' + fmtX(c.wf24.factor) })),
        el('div', { class: 'kpi' }, el('span', { text: 'Leave-one-out, all 128 tokens' }), el('b', { text: fmtX(a.looFactor) + ' · ' + Math.round(a.looWithin2 * 100) + '% within 2x' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Odds model, 5-fold' }), el('b', { text: 'log-loss ' + DATA.odds_cv.logLoss.toFixed(2) + ' · AUC ' + DATA.odds_cv.auc.toFixed(2) })),
        el('div', { class: 'kpi' }, el('span', { text: '80% band, walk-forward cover' }), el('b', { text: 'x' + DATA.band.half_width_x + ' · ' + Math.round(DATA.band.wf_cov_2025 * 100) + '% / ' + Math.round(DATA.band.wf_cov_2024 * 100) + '%' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Farm verdicts' }), el('b', { text: DATA.verdicts.FARM + ' FARM · ' + DATA.verdicts.THIN + ' THIN · ' + DATA.verdicts.SKIP + ' SKIP' })),
        el('div', { class: 'kpi wide' }, el('span', { text: 'Snapshot source' }), el('b', { text: DATA.source }))
      )
    );
  }

  function integrityStrip() {
    return el('div', { class: 'integrity' },
      DATA.integrity.map(function (chk) {
        return el('span', { class: 'check ' + (chk.passed ? 'pass' : 'fail') },
          el('b', { text: chk.name }), document.createTextNode(chk.detail));
      })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var boardOnly = state.tab !== 'board' ? 'disabled' : null;
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board', disabled: boardOnly });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category', disabled: boardOnly },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (cat) { return el('option', { value: cat, text: cat, selected: cat === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var verdict = el('select', { id: 'verdict', 'aria-label': 'Filter by verdict', disabled: boardOnly },
      el('option', { value: 'all', text: 'All verdicts' }),
      ['FARM', 'THIN', 'SKIP'].map(function (v) { return el('option', { value: v, text: v, selected: v === state.verdict ? 'selected' : null }); })
    );
    verdict.addEventListener('change', function () { state.verdict = verdict.value; writeHash(); render(); });
    var tabs = ['board', 'model', 'live'].map(function (t) {
      var label = t === 'board' ? 'Board' : t === 'model' ? 'Model' : 'Live anchors';
      return el('button', { type: 'button', 'aria-pressed': state.tab === t ? 'true' : 'false', text: label, onclick: function () { state.tab = t; writeHash(); render(); } });
    });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Verdict' }), verdict),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, tabs)),
      el('span', { class: 'count', text: state.tab === 'board' ? filteredRows().length + ' rows shown' : state.tab === 'model' ? 'how the numbers are made' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'rank' ? 1 : -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or verdict to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.verdict = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: (r.token_odds * 100).toFixed(0) + '%' }),
        el('td', { class: 'num', text: fmtMoney(r.receipt_per_hour_usd) + '/h' }),
        el('td', null, el('span', { class: 'verdict ' + r.verdict, text: r.verdict }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, ranked by expected value. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            el('th', { scope: 'col', text: '7d' }),
            el('th', { scope: 'col', text: 'Age' }),
            sortHeader('ev', 'Expected value'),
            sortHeader('odds', 'Odds'),
            sortHeader('rph', '$/hour'),
            el('th', { scope: 'col', text: 'Verdict' })
          )),
          tbody
        )
      )
    );
  }

  function kvTable(head, rows) {
    var tbody = el('tbody');
    rows.forEach(function (r) {
      tbody.appendChild(el('tr', null, r.map(function (c) { return el('td', { class: typeof c === 'number' ? 'num' : '', text: String(c) }); })));
    });
    return el('div', { class: 'table-wrap' },
      el('table', { class: 'compact' },
        el('thead', null, el('tr', null, head.map(function (h) { return el('th', { scope: 'col', text: h }); }))),
        tbody
      )
    );
  }

  function modelPage() {
    var c = DATA.live_curve;
    var a = DATA.all_curve;
    var b = DATA.band;
    var o = DATA.odds_coefficients;
    var variantRows = DATA.variants.map(function (v) {
      return [v.name, fmtX(v.looLive), fmtX(v.wf25Live), fmtX(v.wf24Live), fmtX(v.looAll), fmtX(v.wf25All), fmtX(v.wf24All)];
    });
    var peerRows = DATA.peer_groups.map(function (g) {
      return [g.category, g.n, g.listed, (g.share * 100).toFixed(0) + '%', g.group];
    });
    var calRows = DATA.odds_calibration.map(function (r) {
      return [(r.lo + '-' + (r.hi === null ? '∞' : r.hi) + 'd'), r.n, isFinite(r.predicted) ? r.predicted.toFixed(2) : 'n/a', isFinite(r.actual) ? r.actual.toFixed(2) : 'n/a'];
    });
    var piRows = ['HIGH', 'MID', 'LOW'].map(function (g) {
      var t = DATA.pi.groups[g];
      var tot = DATA.peer_group_totals[g];
      return [g, tot.n, (tot.share * 100).toFixed(0) + '%', t.nOld, t.raw.toFixed(2), t.pi.toFixed(2)];
    });
    var sens = DATA.pi_sensitivity;
    var sensRows = [['Shrinkage 5', sens.k5.join(', ')], ['Shrinkage 10 (shipped)', sens.k10.join(', ')], ['Shrinkage 20', sens.k20.join(', ')]];
    return el('div', null,
      el('section', { class: 'panel section' },
        el('h2', { text: 'How expected value is computed' }),
        el('p', { text: 'Expected value = raw implied value x token odds. The raw implied value comes from one fitted curve; the token odds come from one fitted logit over the peers\u2019 listing record, turned into ever-lists odds by a survival identity. Every number below is recomputed from the snapshot on every run.' }),
        el('div', { class: 'formula' }, 'log(market cap) = ' + c.intercept.toFixed(3) + ' + ' + c.slope.toFixed(3) + ' x log(TVL)   ·   fitted on ' + c.n + ' live comps'),
        el('h3', { text: 'The comp set, and why' }),
        el('p', { text: 'A comp is a live traded token: it records a token, its market cap is at least $1M, its category is not CEX, a bridge, liquid staking or restaking, a staking pool or a dual-token stablecoin, and its name carries no version marker. A token with a market cap under $1M is a dead token. A CEX, bridge or liquid-staking token\u2019s value is not driven by the protocol\u2019s TVL the way a new launch\u2019s would be, so they are neither fitted on nor scored on. That leaves ' + c.n + ' comps out of 128 tokens with any positive market cap.' }),
        el('p', { text: 'The same curve fitted on all 128 tokens is ' + a.intercept.toFixed(3) + ' + ' + a.slope.toFixed(3) + ' x log(TVL), with leave-one-out ' + fmtX(a.looFactor) + ' (' + Math.round(a.looWithin2 * 100) + '% within 2x) and walk-forward ' + fmtX(a.wf25.factor) + ' / ' + fmtX(a.wf24.factor) + '. The live-comp curve reports leave-one-out ' + fmtX(c.looFactor) + ' (' + Math.round(c.looWithin2 * 100) + '% within 2x), walk-forward ' + fmtX(c.wf25.factor) + ' (' + c.wf25.train + ' train + ' + c.wf25.test + ' test) / ' + fmtX(c.wf24.factor) + ' (' + c.wf24.train + ' + ' + c.wf24.test + '), and 10-fold ' + fmtX(c.fold10) + '. Both are shown: hiding the all-token number would read as cherry-picking.' }),
        el('h3', { text: 'Variants that were tested and lost' }),
        kvTable(['Variant', 'LOO live', 'WF25 live', 'WF24 live', 'LOO all', 'WF25 all', 'WF24 all'], variantRows),
        el('p', { class: 'note', text: DATA.variant_rule_note }),
        el('h3', { text: 'Token odds: peer groups' }),
        el('p', { text: 'Categories are grouped by their own listed share among known-age protocols: HIGH at 0.60 or above, LOW below 0.40, MID otherwise; categories with fewer than 10 known-age protocols go to MID. Group totals: HIGH ' + (DATA.peer_group_totals.HIGH.share * 100).toFixed(0) + '% over ' + DATA.peer_group_totals.HIGH.n + ', MID ' + (DATA.peer_group_totals.MID.share * 100).toFixed(0) + '% over ' + DATA.peer_group_totals.MID.n + ', LOW ' + (DATA.peer_group_totals.LOW.share * 100).toFixed(0) + '% over ' + DATA.peer_group_totals.LOW.n + '.' }),
        kvTable(['Category', 'n', 'Listed', 'Share', 'Group'], peerRows),
        el('h3', { text: 'Token odds: the listing logit' }),
        el('p', { text: 'Logistic regression by iteratively reweighted least squares, fitted on the 645 known-age protocols: constant ' + o.intercept + ', age ' + o.age_years + ' per year, log10 TVL ' + o.log10_tvl + ' per decade, HIGH group ' + o.high + ', LOW group ' + o.low + ' (MID is the reference). Five-fold cross-validation, rows sorted by slug and dealt into five folds: log-loss ' + DATA.odds_cv.logLoss.toFixed(3) + ', AUC ' + DATA.odds_cv.auc.toFixed(3) + ' — against ' + DATA.odds_age_only_cv.logLoss.toFixed(3) + ' / ' + DATA.odds_age_only_cv.auc.toFixed(3) + ' for an age-only logit and ' + DATA.odds_base_logloss.toFixed(2) + ' for the base rate alone.' }),
        el('h3', { text: 'Split-half calibration (fit on even slugs, scored on odd slugs)' }),
        kvTable(['Age bucket', 'n', 'Predicted share', 'Actual share'], calRows),
        el('h3', { text: 'Ever-lists odds: the survival identity, per peer group' }),
        el('p', { text: 'Among the protocols that have not listed by a given age, the ones that will ever list are the pi fraction minus the q fraction that already have, divided by the fraction still unlisted: odds = (pi - q) / (1 - q), with q clipped to at most pi, floored at 0.05 and capped at 0.90. pi is per group: the listed share among the group\u2019s oldest third, shrunk toward the global pi (' + DATA.pi.global.toFixed(2) + ' over the oldest decile, n=' + DATA.pi.globalN + ') with weight 10. pi must be per group — a global pi with a group-varying q would give a Risk Curator odds near 0.80 when its peers list at 13%.' }),
        kvTable(['Group', 'n', 'Listed share', 'Oldest third n', 'Raw pi', 'Shrunk pi'], piRows),
        el('h3', { text: 'Sensitivity: the board\u2019s top 10 under other shrinkage weights' }),
        kvTable(['Shrinkage weight', 'Top 10 slugs'], sensRows),
        el('h3', { text: 'Uncertainty bands' }),
        el('p', { text: 'The band is symmetric in log space: plus/minus the 90th percentile of the absolute leave-one-out residuals of the shipped curve, ' + b.d_log.toFixed(2) + ' in log space, a half-width of x' + b.half_width_x + '. Labelled an 80% band, it held ' + Math.round(b.wf_cov_2025 * 100) + '% and ' + Math.round(b.wf_cov_2024 * 100) + '% of the two walk-forward test sets (the train-only curve\u2019s predictions, the same half-width). The old P10-P90 percentile band (x' + b.old_q10_x + ' to x' + b.old_q90_x + ') held only ' + Math.round(b.old_wf_cov_2025 * 100) + '% / ' + Math.round(b.old_wf_cov_2024 * 100) + '% on the same cuts, so the recalibration is checkable.' }),
        el('p', { class: 'limit' }, el('b', { text: 'The honest limit: ' }), document.createTextNode('the curve\u2019s residual spread is about x2.7 at the median and no tested variant beats plain OLS on leave-one-out, so the gain in this entry is in the odds and the bands, not in a cleverer curve. A launch\u2019s value is a wide range, not a point: read the P10-P90 band before the headline number.'))
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.predicted_usd) }),
        el('td', { class: 'num', text: r.curve_multiple.toFixed(2) + 'x' })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'The 24 largest traded tokens: the market\u2019s own value next to what the curve would have predicted. They already trade, so they are never ranked above launch candidates.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: 'Market cap' }),
            el('th', { scope: 'col', text: 'Curve prediction' }),
            el('th', { scope: 'col', text: 'Mcap / TVL' })
          )),
          tbody
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = rawOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + row.verdict }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Expected value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day change' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Raw implied value (curve)' }), el('b', { class: 'num', text: fmtUsd(row.raw_implied_value_usd) })),
        el('div', null, el('span', { text: 'Peer group / fitted share q' }), el('b', { class: 'num', text: row.peer_group + ' / ' + row.listed_share_q.toFixed(2) })),
        el('div', null, el('span', { text: 'Ever-lists pi / token odds' }), el('b', { class: 'num', text: row.pi_ever_lists.toFixed(2) + ' / ' + row.token_odds.toFixed(2) })),
        el('div', null, el('span', { text: 'P10 - P90 (80% band)' }), el('b', { class: 'num', text: fmtUsd(row.p10_usd) + ' - ' + fmtUsd(row.p90_usd) })),
        el('div', null, el('span', { text: 'Curve multiple (raw / TVL)' }), el('b', { class: 'num', text: row.curve_multiple.toFixed(2) + 'x' })),
        el('div', null, el('span', { text: 'Expected value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row\u2019s raw value as ' + fmtUsd(recomputed) + (recomputed === row.raw_implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This protocol records no token; the value is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Farm cost (capital + $12 gas)' }), el('b', { class: 'num', text: fmtMoney(row.farm_cost_usd) })),
        el('div', null, el('span', { text: 'Break-even' }), el('b', { class: 'num', text: fmtMoney(row.breakeven_usd) })),
        el('div', null, el('span', { text: 'Expected receipt (0.005% share)' }), el('b', { class: 'num', text: fmtMoney(row.expected_receipt_usd) })),
        el('div', null, el('span', { text: 'Expected receipt per hour' }), el('b', { class: 'num', text: fmtMoney(row.receipt_per_hour_usd) + '/h' })),
        el('div', null, el('span', { text: 'Verdict' }), el('b', { class: 'num', text: row.verdict }))
      ),
      el('p', { class: 'sub', text: 'FARM when the expected receipt is at least 3x the plan cost, THIN when it covers the cost, otherwise SKIP. Farmer time is 30 minutes to set up, 10 minutes a week over the hold, 15 minutes to check and claim.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(integrityStrip());
    shell.appendChild(controls());
    if (state.tab === 'model') shell.appendChild(modelPage());
    else if (state.tab === 'live') shell.appendChild(liveTable());
    else shell.appendChild(boardTable());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
