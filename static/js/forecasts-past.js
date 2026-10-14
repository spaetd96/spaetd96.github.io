'use strict';

// "Past" tab, all from GeoSphere Austria gridded data (1 km, Austria + border areas):
//  - Recent days:  SPARTACUS daily observations (+ SNOWGRID snow depth)
//  - Climate:      SPARTACUS monthly since 1961 (stripes, trends, recent months)
//  - Snow:         SNOWGRID-CL daily snow depth since 1961 (season vs normal)
// Also provides the "vs normal" climate context for forecasts.
// Loaded after forecasts.js and uses its globals (MODELS, API_BASE, fetchJSON, …).

const SPARTACUS_BBOX = { latMin: 46.16, latMax: 49.18, lonMin: 9.39, lonMax: 17.38 };
const PAST_PERIODS = [
  { days: 30,  label: '30 days' },
  { days: 90,  label: '90 days' },
  { days: 365, label: '1 year' },
];
const REF_PERIODS = [
  { key: '1991_2020', label: '1991–2020', start: 1991, end: 2020 },
  { key: '1961_1990', label: '1961–1990', start: 1961, end: 1990 },
];
const CLIMATE_WINDOW_DAYS = 7;   // ± days around the date pooled into the normal
const MONTH_CUMDAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SNOWGRID_RESOURCE = 'snowgrid_cl-v2-1d-1km';
const SPARTACUS_MONTHLY_RESOURCE = 'spartacus-v3-1m-1km';
const SNOW_COVER_CM = 1;          // a "snow day" has at least this much snow on the ground
const SEASON_START_DOS = 92;      // day of season (from 1 Jul) of 1 Oct; snow charts start here

let pastPeriodDays = 30;
let pastRefPeriod = loadPref('fc.refPeriod', REF_PERIODS.map(r => r.key)) || REF_PERIODS[0].key;
let pastRequestId = 0;
const climateCache = new Map();  // rounded lat/lon → Promise<normals | null>
const longSeriesCache = new Map(); // `${resource}|lat,lon` → Promise<series>

function inSpartacusBBox(lat, lng) {
  const b = SPARTACUS_BBOX;
  return lat >= b.latMin && lat <= b.latMax && lng >= b.lonMin && lng <= b.lonMax;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/** Day of year 0–364 ignoring leap days (29 Feb folds onto 28 Feb). */
function dayOfYear(month, day) {
  return MONTH_CUMDAYS[month] + Math.min(day, month === 1 ? 28 : 31) - 1;
}

function currentRef() {
  return REF_PERIODS.find(r => r.key === pastRefPeriod) || REF_PERIODS[0];
}

const isNum = v => v !== null && v !== undefined && isFinite(v);
const mean = arr => {
  const v = arr.filter(isNum);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const signed = (v, digits = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}`;

/** Least-squares slope of ys over xs (nulls skipped). */
function linearTrend(xs, ys) {
  const pts = xs.map((x, i) => [x, ys[i]]).filter(([, y]) => isNum(y));
  if (pts.length < 10) return null;
  const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
  let num = 0, den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  const slope = num / den;
  return { slope, at: x => my + slope * (x - mx) };
}

async function fetchHistorical(resource, lat, lng, params, start, end) {
  const url = `${API_BASE}/timeseries/historical/${resource}` +
              `?parameters=${params}&lat_lon=${lat.toFixed(4)},${lng.toFixed(4)}&start=${start}&end=${end}`;
  const json = await fetchJSON(url);
  const feature = json.features[0];
  const coords = feature.geometry?.coordinates;
  return {
    times: json.timestamps.map(t => new Date(t)),
    p: feature.properties.parameters,
    gridLat: coords ? coords[1] : undefined,
    gridLon: coords ? coords[0] : undefined,
  };
}

function fetchSpartacus(lat, lng, params, start, end) {
  return fetchHistorical(MODELS.spartacus.resource, lat, lng, params, start, end);
}

/** Cached full-length (since 1961) series for a point; failed requests are not cached. */
function loadLongSeries(resource, lat, lng, params) {
  const key = `${resource}|${params}|${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (!longSeriesCache.has(key)) {
    const req = fetchHistorical(resource, lat, lng, params, '1961-01-01', isoDate(new Date()))
      .catch(err => { longSeriesCache.delete(key); throw err; });
    longSeriesCache.set(key, req);
  }
  return longSeriesCache.get(key);
}

// ── Past tab: loading ────────────────────────────────────────────────────────

function showPanelMessage(msg) {
  const loading = document.getElementById('fc-forecast-loading');
  loading.classList.remove('hidden');
  loading.querySelector('.fc-spin-ring').style.display = 'none';
  loading.querySelector('span').textContent = msg;
}

const PAST_LOADERS = {
  daily:   { load: loadDailyView,   message: 'Loading observations…' },
  monthly: { load: loadMonthlyView, message: 'Loading monthly climate data since 1961…' },
  snow:    { load: loadSnowView,    message: 'Loading snow data since 1961 — this takes a few seconds…' },
};

function pastViewLabel(view) {
  if (view === 'monthly') return 'Monthly climate since 1961';
  if (view === 'snow') return 'Snow depth (SNOWGRID model)';
  const period = PAST_PERIODS.find(p => p.days === pastPeriodDays) || PAST_PERIODS[0];
  return `Observations · last ${period.label}`;
}

/** Called by fetchAndShowForecast() when a Past model is active. */
async function fetchAndShowPast(lat, lng) {
  const reqId = ++pastRequestId;
  const model = currentModel;
  const view = MODELS[model].pastView;
  const loading = document.getElementById('fc-forecast-loading');
  setForecastLocationEl(lat, lng, null, pastViewLabel(view));

  if (!inSpartacusBBox(lat, lng)) {
    showPanelMessage('These datasets only cover Austria and its border areas. Pick a location inside Austria.');
    return;
  }
  loading.querySelector('span').textContent = PAST_LOADERS[view].message;

  const data = await PAST_LOADERS[view].load(lat, lng);
  if (reqId !== pastRequestId || currentModel !== model) return;
  if (!data) {
    showPanelMessage('No data for this point. The datasets cover Austria and its border areas only.');
    return;
  }

  Object.assign(data, { isPast: true, view, lat, lng });
  lastForecastData = data;
  setForecastLocationEl(lat, lng, data, pastViewLabel(view));
  loading.classList.add('hidden');
  document.getElementById('fc-forecast-panel').classList.add('fc-panel-past');
  renderPast(data);
}

async function loadDailyView(lat, lng) {
  // The API clamps the end date to the latest available day (usually yesterday)
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - pastPeriodDays);
  // Both reference periods are fetched so switching between them needs no new request
  const anomParams = REF_PERIODS.map(r => `TM24a_${r.key}`).join(',');
  const [raw, snow] = await Promise.all([
    fetchSpartacus(lat, lng, `TN,TX,RR,SA,${anomParams}`, isoDate(start), isoDate(end)),
    fetchHistorical(SNOWGRID_RESOURCE, lat, lng, 'snow_depth', isoDate(start), isoDate(end)).catch(() => null),
  ]);

  const col = key => raw.p[key]?.data || [];
  if (!col('TX').some(isNum)) return null;

  // Align snow depth (m → cm) to the SPARTACUS dates
  let snowCm = null;
  if (snow) {
    const byDay = new Map(snow.times.map((t, i) => [isoDate(t), snow.p.snow_depth?.data[i]]));
    snowCm = raw.times.map(t => {
      const v = byDay.get(isoDate(t));
      return isNum(v) ? v * 100 : null;
    });
  }
  return {
    times: raw.times,
    tn: col('TN'), tx: col('TX'), rr: col('RR'),
    sun: col('SA').map(v => (v === null ? null : v / 3600)),
    anom: Object.fromEntries(REF_PERIODS.map(r => [r.key, col(`TM24a_${r.key}`)])),
    snowCm,
    gridLat: raw.gridLat, gridLon: raw.gridLon,
  };
}

/**
 * Monthly TM24/RR/SA since 1961. Each parameter is its own request: the API
 * time grows with the number of parameters, so parallel requests are faster.
 * Anomalies are computed here (identical to GeoSphere's) so both reference
 * periods work without extra requests.
 */
async function loadMonthlyView(lat, lng) {
  const [tm, rr, sa] = await Promise.all(['TM24', 'RR', 'SA'].map(p =>
    loadLongSeries(SPARTACUS_MONTHLY_RESOURCE, lat, lng, p)));
  const col = (raw, key) => raw.p[key]?.data || [];
  if (!col(tm, 'TM24').some(isNum)) return null;

  // Drop the running month: its values only cover the month so far
  const now = new Date();
  const keep = tm.times.map((t, i) => i).filter(i =>
    tm.times[i].getUTCFullYear() * 12 + tm.times[i].getUTCMonth() < now.getUTCFullYear() * 12 + now.getUTCMonth());
  return {
    times: keep.map(i => tm.times[i]),
    tm: keep.map(i => col(tm, 'TM24')[i]),
    rr: keep.map(i => col(rr, 'RR')[i]),
    sun: keep.map(i => { const v = col(sa, 'SA')[i]; return isNum(v) ? v / 3600 : null; }),
    gridLat: tm.gridLat, gridLon: tm.gridLon,
  };
}

async function loadSnowView(lat, lng) {
  const raw = await loadLongSeries(SNOWGRID_RESOURCE, lat, lng, 'snow_depth');
  const depth = (raw.p.snow_depth?.data || []).map(v => (isNum(v) ? v * 100 : null));
  if (!depth.some(isNum)) return null;
  return { times: raw.times, depth, gridLat: raw.gridLat, gridLon: raw.gridLon };
}

// ── Past tab: rendering ──────────────────────────────────────────────────────

function renderPast(data) {
  const el = document.getElementById('fc-past-data');
  el.innerHTML = '';
  el.classList.remove('hidden');

  const controls = document.createElement('div');
  controls.className = 'fc-past-controls';
  if (data.view === 'daily') {
    controls.appendChild(chipGroup('Period', PAST_PERIODS, p => p.days === pastPeriodDays, p => {
      pastPeriodDays = p.days;
      fetchAndShowForecast(data.lat, data.lng);
    }));
  }
  controls.appendChild(chipGroup('Compare with', REF_PERIODS, r => r.key === pastRefPeriod, r => {
    pastRefPeriod = r.key;
    savePref('fc.refPeriod', r.key);
    renderPast(data);
  }));
  el.appendChild(controls);

  if (data.view === 'monthly') renderMonthlyView(el, data);
  else if (data.view === 'snow') renderSnowView(el, data);
  else renderDailyView(el, data);
}

function chipGroup(label, items, isActive, onPick) {
  const group = document.createElement('div');
  group.className = 'fc-past-periods';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  const lbl = document.createElement('span');
  lbl.className = 'fc-past-group-label';
  lbl.textContent = label;
  group.appendChild(lbl);
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const active = isActive(item);
    btn.className = 'fc-chip' + (active ? ' active' : '');
    btn.setAttribute('aria-pressed', String(active));
    btn.textContent = item.label;
    btn.addEventListener('click', () => { if (!isActive(item)) onPick(item); });
    group.appendChild(btn);
  }
  return group;
}

function summaryCards(cards) {
  const grid = document.createElement('div');
  grid.className = 'fc-station-grid fc-past-summary';
  for (const c of cards) {
    const card = document.createElement('div');
    card.className = 'fc-station-param';
    if (c.title) card.title = c.title;
    card.innerHTML = `<span class="fc-sp-icon">${c.icon}</span>` +
      `<span class="fc-sp-val"${c.color ? ` style="background:${c.color}"` : ''}>${c.val}</span>` +
      `<span class="fc-sp-label">${c.label}</span>`;
    grid.appendChild(card);
  }
  return grid;
}

function creditLine(html) {
  const credit = document.createElement('div');
  credit.className = 'fc-station-credit';
  credit.innerHTML = html;
  return credit;
}

function datasetLink(url, name) {
  return `<a href="${url}" target="_blank" rel="noopener">${name}</a>`;
}

const anomColor = v => (v >= 0 ? 'rgba(239,83,80,0.35)' : 'rgba(66,165,245,0.35)');
const fmtDayMonth = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtMonthYear = d => `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

// ── Recent days (SPARTACUS daily) ────────────────────────────────────────────

function renderDailyView(el, data) {
  const ref = currentRef();
  const anom = data.anom[ref.key] || [];
  const hasSnow = data.snowCm && data.snowCm.some(v => isNum(v) && v >= SNOW_COVER_CM);

  el.appendChild(summaryCards(dailySummary(data, anom, ref.label, hasSnow)));

  const dayHover = (fmt) => i => `${fmtDayMonth(data.times[i])} · ${fmt(i)}`;
  const charts = document.createElement('div');
  charts.className = 'fc-past-charts';
  charts.appendChild(makeDailyChart({
    title: 'Temperature min / max', unit: '°C', times: data.times,
    band: { lo: data.tn, hi: data.tx, fill: 'rgba(239,154,154,0.22)', loColor: '#64b5f6', hiColor: '#ef9a9a' },
    tickFmt: v => Math.round(v) + '°',
    hover: dayHover(i => `${isNum(data.tn[i]) ? data.tn[i].toFixed(1) : '–'}° / ${isNum(data.tx[i]) ? data.tx[i].toFixed(1) : '–'}°`),
  }));
  charts.appendChild(makeDailyChart({
    title: `Daily mean temperature vs ${ref.label}`, unit: '°C', times: data.times,
    bars: { values: anom, color: v => (v >= 0 ? 'rgba(239,83,80,0.75)' : 'rgba(66,165,245,0.75)') },
    symmetric: true,
    tickFmt: v => (v > 0 ? '+' : '') + v.toFixed(0) + '°',
    hover: dayHover(i => (isNum(anom[i]) ? `${signed(anom[i])} °C` : 'no data')),
  }));
  charts.appendChild(makeDailyChart({
    title: 'Precipitation', unit: 'mm', times: data.times,
    bars: { values: data.rr, color: () => 'rgba(30,136,229,0.75)' },
    yMin0: true, yMinSpan: 4,
    tickFmt: v => v.toFixed(0),
    hover: dayHover(i => (isNum(data.rr[i]) ? `${data.rr[i].toFixed(1)} mm` : 'no data')),
  }));
  charts.appendChild(makeDailyChart({
    title: 'Sunshine', unit: 'h', times: data.times,
    bars: { values: data.sun, color: () => 'rgba(255,202,40,0.75)' },
    yMin0: true, yMinSpan: 4,
    tickFmt: v => v.toFixed(0),
    hover: dayHover(i => (isNum(data.sun[i]) ? `${data.sun[i].toFixed(1)} h` : 'no data')),
  }));
  if (hasSnow) {
    charts.appendChild(makeDailyChart({
      title: 'Snow depth (modelled)', unit: 'cm', times: data.times,
      bars: { values: data.snowCm, color: () => 'rgba(179,229,252,0.8)' },
      yMin0: true, yMinSpan: 8,
      tickFmt: v => v.toFixed(0),
      hover: dayHover(i => (isNum(data.snowCm[i]) ? `${Math.round(data.snowCm[i])} cm` : 'no data')),
    }));
  }
  el.appendChild(charts);

  el.appendChild(creditLine(
    `Data: ${datasetLink(MODELS.spartacus.dataUrl, 'GeoSphere Austria SPARTACUS v3')} (CC BY 4.0) · gridded from station observations, 1 km` +
    (hasSnow ? ` · snow: ${datasetLink(MODELS.snowgrid.dataUrl, 'SNOWGRID-CL')} (CC BY 4.0)` : '')));
}

function dailySummary(data, anomValues, refLabel, hasSnow) {
  const argExt = (arr, cmp) => {
    let best = -1;
    arr.forEach((v, i) => { if (isNum(v) && (best < 0 || cmp(v, arr[best]))) best = i; });
    return best;
  };
  const sum = arr => arr.filter(isNum).reduce((a, b) => a + b, 0);

  const cards = [];
  const m = mean(anomValues);
  if (m !== null) cards.push({ icon: m >= 0 ? '🔺' : '🔻', val: `${signed(m)} °C`, label: `vs ${refLabel}`, color: anomColor(m) });
  const iMax = argExt(data.tx, (a, b) => a > b);
  if (iMax >= 0) cards.push({ icon: '🌡️', val: `${data.tx[iMax].toFixed(1)}°`, label: `Warmest · ${fmtDayMonth(data.times[iMax])}`, color: tempColor(data.tx[iMax]) });
  const iMin = argExt(data.tn, (a, b) => a < b);
  if (iMin >= 0) cards.push({ icon: '❄️', val: `${data.tn[iMin].toFixed(1)}°`, label: `Coldest · ${fmtDayMonth(data.times[iMin])}`, color: tempColor(data.tn[iMin]) });
  if (data.rr.some(isNum)) {
    const wet = data.rr.filter(v => isNum(v) && v >= 1).length;
    cards.push({ icon: '🌧️', val: `${Math.round(sum(data.rr))} mm`, label: `${wet} wet day${wet === 1 ? '' : 's'} (≥1 mm)` });
  }
  if (data.sun.some(isNum)) cards.push({ icon: '☀️', val: `${Math.round(sum(data.sun))} h`, label: 'Sunshine' });
  const frost = data.tn.filter(v => isNum(v) && v < 0).length;
  if (frost) cards.push({ icon: '🧊', val: String(frost), label: 'Frost days (min < 0°)' });
  const hot = data.tx.filter(v => isNum(v) && v >= 30).length;
  if (hot) cards.push({ icon: '🔥', val: String(hot), label: 'Hot days (max ≥ 30°)' });
  if (hasSnow) {
    const iSnow = argExt(data.snowCm, (a, b) => a > b);
    cards.push({ icon: '⛄', val: `${Math.round(data.snowCm[iSnow])} cm`, label: `Max snow · ${fmtDayMonth(data.times[iSnow])}` });
  }
  return cards;
}

// ── Climate since 1961 (SPARTACUS monthly) ───────────────────────────────────

/** Per-calendar-month normals over a reference period. */
function monthlyNormals(times, values, ref) {
  const sums = new Array(12).fill(0), counts = new Array(12).fill(0);
  times.forEach((t, i) => {
    const y = t.getUTCFullYear();
    if (y >= ref.start && y <= ref.end && isNum(values[i])) {
      sums[t.getUTCMonth()] += values[i];
      counts[t.getUTCMonth()]++;
    }
  });
  return sums.map((s, m) => (counts[m] ? s / counts[m] : null));
}

function computeMonthlyClimate(data, ref) {
  const nT = monthlyNormals(data.times, data.tm, ref);
  const nR = monthlyNormals(data.times, data.rr, ref);
  const nS = monthlyNormals(data.times, data.sun, ref);
  const month = i => data.times[i].getUTCMonth();
  const tA = data.tm.map((v, i) => (isNum(v) && isNum(nT[month(i)]) ? v - nT[month(i)] : null));
  const rP = data.rr.map((v, i) => (isNum(v) && nR[month(i)] ? 100 * v / nR[month(i)] : null));
  const sP = data.sun.map((v, i) => (isNum(v) && nS[month(i)] ? 100 * v / nS[month(i)] : null));

  // Complete calendar years only
  const years = [];
  const byYear = new Map();
  data.times.forEach((t, i) => {
    const y = t.getUTCFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(i);
  });
  const sumN = arr => arr.reduce((a, b) => a + (b || 0), 0);
  for (const [y, idx] of byYear) {
    if (idx.length !== 12 || idx.some(i => !isNum(data.tm[i]))) continue;
    years.push({
      year: y,
      tm: mean(idx.map(i => data.tm[i])),
      tA: mean(idx.map(i => tA[i])),
      rP: 100 * sumN(idx.map(i => data.rr[i])) / sumN(nR),
      sP: 100 * sumN(idx.map(i => data.sun[i])) / sumN(nS),
    });
  }

  // Rolling last 12 months
  const n = data.times.length;
  const last12 = Array.from({ length: Math.min(12, n) }, (_, k) => n - 1 - k);
  const l12 = {
    tA: mean(last12.map(i => tA[i])),
    rP: 100 * sumN(last12.map(i => data.rr[i])) / sumN(last12.map(i => nR[month(i)])),
    sP: 100 * sumN(last12.map(i => data.sun[i])) / sumN(last12.map(i => nS[month(i)])),
    from: data.times[last12[last12.length - 1]], to: data.times[n - 1],
  };
  const trend = linearTrend(years.map(y => y.year), years.map(y => y.tm));
  return { tA, rP, sP, years, l12, trend };
}

/** Diverging blue–red colour for a temperature anomaly (warming-stripes style). */
const STRIPE_COLORS = ['#08306b', '#08519c', '#2171b5', '#4292c6', '#6baed6', '#9ecae1', '#c6dbef', '#deebf7',
                       '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d'];
function stripeColor(anom, range = 2.5) {
  const f = Math.max(0, Math.min(0.9999, (anom + range) / (2 * range)));
  return STRIPE_COLORS[Math.floor(f * STRIPE_COLORS.length)];
}

function renderMonthlyView(el, data) {
  const ref = currentRef();
  const c = computeMonthlyClimate(data, ref);
  const ys = c.years;
  const cards = [];
  if (c.trend) {
    cards.push({
      icon: '📈', val: `${signed(c.trend.slope * 10, 2)} °C`, label: `per decade · ${ys[0].year}–${ys[ys.length - 1].year}`,
      color: anomColor(c.trend.slope),
      title: 'Linear trend of the annual mean temperature',
    });
  }
  if (isNum(c.l12.tA)) {
    cards.push({ icon: c.l12.tA >= 0 ? '🔺' : '🔻', val: `${signed(c.l12.tA)} °C`, label: `Last 12 months vs ${ref.label}`, color: anomColor(c.l12.tA),
      title: `${fmtMonthYear(c.l12.from)} – ${fmtMonthYear(c.l12.to)}` });
  }
  if (ys.length) {
    const warm = ys.reduce((a, b) => (b.tA > a.tA ? b : a));
    const cold = ys.reduce((a, b) => (b.tA < a.tA ? b : a));
    cards.push({ icon: '🔥', val: String(warm.year), label: `Warmest year · ${signed(warm.tA)} °C`, color: anomColor(warm.tA) });
    cards.push({ icon: '🧊', val: String(cold.year), label: `Coldest year · ${signed(cold.tA)} °C`, color: anomColor(cold.tA) });
  }
  if (isNum(c.l12.rP)) cards.push({ icon: '🌧️', val: `${Math.round(c.l12.rP)} %`, label: 'Precipitation, last 12 months (of normal)' });
  if (isNum(c.l12.sP)) cards.push({ icon: '☀️', val: `${Math.round(c.l12.sP)} %`, label: 'Sunshine, last 12 months (of normal)' });
  el.appendChild(summaryCards(cards));

  const charts = document.createElement('div');
  charts.className = 'fc-past-charts';

  // Warming stripes: one stripe per year
  if (ys.length) {
    const stripes = makeStripes({
      title: `Annual mean temperature vs ${ref.label} · one stripe per year`,
      labels: ys.map(y => y.year), values: ys.map(y => y.tA),
      hover: i => `${ys[i].year} · ${ys[i].tm.toFixed(1)} °C (${signed(ys[i].tA)} °C)`,
    });
    stripes.classList.add('fc-chart-wide');
    charts.appendChild(stripes);
  }

  const yearTimes = ys.map(y => new Date(Date.UTC(y.year, 0, 1)));
  const yearLabel = (i, d) => (d.getUTCFullYear() % 10 === 0 ? String(d.getUTCFullYear()) : null);
  const trendLine = c.trend ? ys.map(y => c.trend.at(y.year) - (y.tm - y.tA)) : null;
  charts.appendChild(makeDailyChart({
    title: `Annual temperature vs ${ref.label}`, unit: '°C', times: yearTimes,
    bars: { values: ys.map(y => y.tA), color: v => (v >= 0 ? 'rgba(239,83,80,0.8)' : 'rgba(66,165,245,0.8)') },
    lines: trendLine ? [{ values: trendLine, color: '#fff', width: 1.6, dash: '5,3' }] : [],
    symmetric: true, xLabel: yearLabel,
    tickFmt: v => (v > 0 ? '+' : '') + v.toFixed(0) + '°',
    hover: i => `${ys[i].year} · ${signed(ys[i].tA)} °C`,
  }));
  charts.appendChild(makeDailyChart({
    title: `Annual precipitation vs ${ref.label}`, unit: '% of normal', times: yearTimes,
    bars: { values: ys.map(y => y.rP - 100), color: v => (v >= 0 ? 'rgba(66,165,245,0.8)' : 'rgba(188,143,90,0.85)') },
    symmetric: true, symmetricStep: 20, xLabel: yearLabel,
    tickFmt: v => `${Math.round(v + 100)}%`,
    hover: i => `${ys[i].year} · ${Math.round(ys[i].rP)}% of normal`,
  }));

  // Last 24 months
  const n = data.times.length;
  const from = Math.max(0, n - 24);
  const mTimes = data.times.slice(from);
  const sl = arr => arr.slice(from);
  const monthLabel = (i, d) => (d.getUTCMonth() % 3 === 0
    ? (d.getUTCMonth() === 0 ? `Jan ${d.getUTCFullYear()}` : MONTH_ABBR[d.getUTCMonth()]) : null);
  const monthHover = (fmt) => i => `${fmtMonthYear(mTimes[i])} · ${fmt(i)}`;
  const tA = sl(c.tA), rP = sl(c.rP), sP = sl(c.sP);
  charts.appendChild(makeDailyChart({
    title: `Monthly temperature vs ${ref.label} · last 24 months`, unit: '°C', times: mTimes,
    bars: { values: tA, color: v => (v >= 0 ? 'rgba(239,83,80,0.8)' : 'rgba(66,165,245,0.8)') },
    symmetric: true, xLabel: monthLabel,
    tickFmt: v => (v > 0 ? '+' : '') + v.toFixed(0) + '°',
    hover: monthHover(i => (isNum(tA[i]) ? `${signed(tA[i])} °C` : 'no data')),
  }));
  // Precipitation can't drop below 0 % of normal: axis from 0 % up to a multiple of 200 %
  const rMax = Math.max(100, ...rP.filter(isNum));
  charts.appendChild(makeDailyChart({
    title: 'Monthly precipitation · last 24 months', unit: '% of normal', times: mTimes,
    bars: { values: rP.map(v => (isNum(v) ? v - 100 : null)), color: v => (v >= 0 ? 'rgba(66,165,245,0.8)' : 'rgba(188,143,90,0.85)') },
    yRange: [-100, -100 + Math.ceil(rMax / 200) * 200], xLabel: monthLabel,
    tickFmt: v => `${Math.round(v + 100)}%`,
    hover: monthHover(i => (isNum(rP[i]) ? `${Math.round(rP[i])}% of normal (${Math.round(sl(data.rr)[i])} mm)` : 'no data')),
  }));
  charts.appendChild(makeDailyChart({
    title: 'Monthly sunshine · last 24 months', unit: '% of normal', times: mTimes,
    bars: { values: sP.map(v => (isNum(v) ? v - 100 : null)), color: v => (v >= 0 ? 'rgba(255,202,40,0.85)' : 'rgba(144,164,174,0.8)') },
    symmetric: true, symmetricStep: 20, xLabel: monthLabel,
    tickFmt: v => `${Math.round(v + 100)}%`,
    hover: monthHover(i => (isNum(sP[i]) ? `${Math.round(sP[i])}% of normal (${Math.round(sl(data.sun)[i])} h)` : 'no data')),
  }));
  charts.appendChild(makeDailyChart({
    title: `Annual sunshine vs ${ref.label}`, unit: '% of normal', times: yearTimes,
    bars: { values: ys.map(y => y.sP - 100), color: v => (v >= 0 ? 'rgba(255,202,40,0.85)' : 'rgba(144,164,174,0.8)') },
    symmetric: true, symmetricStep: 10, xLabel: yearLabel,
    tickFmt: v => `${Math.round(v + 100)}%`,
    hover: i => `${ys[i].year} · ${Math.round(ys[i].sP)}% of normal`,
  }));
  el.appendChild(charts);

  el.appendChild(creditLine(
    `Data: ${datasetLink(MODELS.spartacus_m.dataUrl, 'GeoSphere Austria SPARTACUS v3 monthly')} (CC BY 4.0) · ` +
    `${ys.length ? `complete years ${ys[0].year}–${ys[ys.length - 1].year}, ` : ''}months up to ${fmtMonthYear(data.times[n - 1])} · ` +
    `normals are ${ref.label} means for this 1 km cell`));
}

// ── Snow (SNOWGRID-CL) ───────────────────────────────────────────────────────

/** Season start year (seasons run 1 Jul – 30 Jun) and day of season 0–364. */
function seasonOf(t) {
  const m = t.getUTCMonth();
  const doy = dayOfYear(m, t.getUTCDate());
  return { season: m >= 6 ? t.getUTCFullYear() : t.getUTCFullYear() - 1, dos: (doy - 181 + 365) % 365 };
}

const seasonLabel = s => `${s}/${String((s + 1) % 100).padStart(2, '0')}`;

function computeSnowClimate(data, ref) {
  const seasons = new Map();  // season → Array(365) of cm
  data.times.forEach((t, i) => {
    const { season, dos } = seasonOf(t);
    if (!seasons.has(season)) seasons.set(season, new Array(365).fill(null));
    seasons.get(season)[dos] = data.depth[i];
  });
  const last = data.times[data.times.length - 1];
  const { season: curSeason, dos: curDos } = seasonOf(last);

  // Snow-cover days per complete season (first season starts mid-winter 1961, skip it)
  const perSeason = [];
  for (const [s, arr] of seasons) {
    if (s < 1961 || s >= curSeason) continue;
    if (arr.filter(isNum).length < 300) continue;
    const vals = arr.filter(isNum);
    let maxI = 0;
    arr.forEach((v, i) => { if (isNum(v) && v > (arr[maxI] ?? -1)) maxI = i; });
    perSeason.push({ season: s, days: vals.filter(v => v >= SNOW_COVER_CM).length, max: Math.max(...vals), maxDos: maxI });
  }

  // Daily percentiles over the reference winters (season s covers Jul s – Jun s+1)
  const refSeasons = [...seasons.keys()].filter(s => s + 1 >= ref.start && s + 1 <= ref.end && s >= 1961);
  const p10 = new Array(365).fill(null), p50 = new Array(365).fill(null), p90 = new Array(365).fill(null);
  for (let d = 0; d < 365; d++) {
    const pool = [];
    for (const s of refSeasons) {
      for (let k = -3; k <= 3; k++) {
        const v = seasons.get(s)[(d + k + 365) % 365];
        if (isNum(v)) pool.push(v);
      }
    }
    if (pool.length < 20) continue;
    pool.sort((a, b) => a - b);
    const q = f => pool[Math.min(pool.length - 1, Math.floor(f * pool.length))];
    p10[d] = q(0.1); p50[d] = q(0.5); p90[d] = q(0.9);
  }
  const refDays = mean(perSeason.filter(p => p.season + 1 >= ref.start && p.season + 1 <= ref.end).map(p => p.days));
  const trend = linearTrend(perSeason.map(p => p.season), perSeason.map(p => p.days));
  return { seasons, curSeason, curDos, last, perSeason, p10, p50, p90, refDays, trend };
}

function renderSnowView(el, data) {
  const ref = currentRef();
  const c = computeSnowClimate(data, ref);
  const cur = c.seasons.get(c.curSeason);
  const prevSeason = c.curSeason - 1;
  const prev = c.seasons.get(prevSeason);
  const lastFull = c.perSeason[c.perSeason.length - 1];
  const inWinter = c.curDos >= SEASON_START_DOS;  // Oct–Jun

  const cards = [];
  const nowDepth = data.depth[data.depth.length - 1];
  cards.push({ icon: '⛄', val: isNum(nowDepth) ? `${Math.round(nowDepth)} cm` : '–', label: `Snow depth · ${fmtDayMonth(c.last)}` });
  if (inWinter && cur) {
    const soFar = cur.filter(v => isNum(v) && v >= SNOW_COVER_CM).length;
    cards.push({ icon: '📅', val: String(soFar), label: `Snow days so far · ${seasonLabel(c.curSeason)}` });
  }
  if (lastFull) {
    cards.push({
      icon: '❄️', val: String(lastFull.days), label: `Snow days · ${seasonLabel(lastFull.season)}`,
      color: isNum(c.refDays) ? anomColor(c.refDays - lastFull.days) : null,
      title: `Days with at least ${SNOW_COVER_CM} cm of snow on the ground`,
    });
    cards.push({ icon: '📏', val: `${Math.round(lastFull.max)} cm`, label: `Max depth · ${seasonLabel(lastFull.season)}` });
  }
  if (isNum(c.refDays)) cards.push({ icon: '📊', val: String(Math.round(c.refDays)), label: `Normal snow days · ${ref.label}` });
  if (c.trend) {
    cards.push({ icon: '📉', val: `${signed(c.trend.slope * 10, 0)} days`, label: `per decade · since ${seasonLabel(c.perSeason[0].season)}`,
      color: anomColor(-c.trend.slope), title: 'Linear trend of snow-cover days per winter' });
  }
  el.appendChild(summaryCards(cards));

  const maxEver = Math.max(0, ...c.perSeason.map(p => p.max));
  if (maxEver < SNOW_COVER_CM && !(cur || []).some(v => isNum(v) && v >= SNOW_COVER_CM)) {
    const note = document.createElement('div');
    note.className = 'fc-hist-note';
    note.textContent = 'There is hardly ever lying snow at this point.';
    el.appendChild(note);
  }

  const charts = document.createElement('div');
  charts.className = 'fc-past-charts';

  // Season chart: Oct 1 – Jun 30, current & previous season against the normal range
  const dos = Array.from({ length: 365 - SEASON_START_DOS }, (_, k) => SEASON_START_DOS + k);
  const dosTimes = dos.map(d => new Date(Date.UTC(2001, 6, 1) + d * 86400000));  // non-leap reference year
  const pick = arr => dos.map(d => (arr ? arr[d] : null));
  const curVals = inWinter && cur ? dos.map(d => (d <= c.curDos ? cur[d] : null)) : null;
  const shown = curVals ? c.curSeason : prevSeason;
  const lines = [{ values: pick(c.p50), color: '#b0bec5', width: 1.4, dash: '4,3' }];
  if (curVals) lines.push({ values: pick(prev), color: 'rgba(224,224,224,0.55)', width: 1.2 });
  lines.push({ values: curVals || pick(prev), color: '#4dd0e1', width: 2.4 });
  const chart = makeDailyChart({
    wide: true,
    title: `Snow depth ${seasonLabel(shown)}${curVals ? ` (and ${seasonLabel(prevSeason)}, grey)` : ''} vs ${ref.label}`, unit: 'cm', times: dosTimes,
    band: { lo: pick(c.p10), hi: pick(c.p90), fill: 'rgba(176,190,197,0.22)', loColor: null, hiColor: null },
    lines, yMin0: true, yMinSpan: 8,
    xLabel: (i, d) => (d.getUTCDate() === 1 ? MONTH_ABBR[d.getUTCMonth()] : null),
    tickFmt: v => v.toFixed(0),
    hover: i => {
      const d = dos[i];
      const fmt = v => (isNum(v) ? `${Math.round(v)} cm` : '–');
      const parts = [`${fmtDayMonth(dosTimes[i])}`];
      if (curVals) parts.push(`${seasonLabel(c.curSeason)}: ${fmt(curVals[i])}`);
      parts.push(`${seasonLabel(prevSeason)}: ${fmt(prev ? prev[d] : null)}`);
      if (isNum(c.p50[d])) parts.push(`normal ${fmt(c.p50[d])} (${fmt(c.p10[d])}–${fmt(c.p90[d])})`);
      return parts.join(' · ');
    },
  });
  charts.appendChild(chart);

  const legend = document.createElement('div');
  legend.className = 'fc-ens-legend fc-chart-wide';
  legend.innerHTML =
    `<span class="fc-ens-key"><span class="fc-ens-swatch-line" style="border-color:#4dd0e1"></span>${seasonLabel(shown)}</span>` +
    (curVals ? `<span class="fc-ens-key"><span class="fc-ens-swatch-line" style="border-color:rgba(224,224,224,0.55)"></span>${seasonLabel(prevSeason)}</span>` : '') +
    `<span class="fc-ens-key"><span class="fc-ens-swatch-line" style="border-top-style:dashed;border-color:#b0bec5"></span>median ${ref.label}</span>` +
    `<span class="fc-ens-key"><span class="fc-ens-swatch-band"></span>10th–90th percentile ${ref.label}</span>`;
  charts.appendChild(legend);

  // Snow-cover days per winter
  if (c.perSeason.length) {
    const sTimes = c.perSeason.map(p => new Date(Date.UTC(p.season, 0, 1)));
    const trendLine = c.trend ? c.perSeason.map(p => c.trend.at(p.season)) : null;
    const lines2 = [];
    if (isNum(c.refDays)) lines2.push({ values: c.perSeason.map(() => c.refDays), color: '#b0bec5', width: 1.2, dash: '4,3' });
    if (trendLine) lines2.push({ values: trendLine, color: '#fff', width: 1.6, dash: '5,3' });
    const daysChart = makeDailyChart({
      wide: true,
      title: `Snow days per winter (≥${SNOW_COVER_CM} cm) · trend and ${ref.label} mean dashed`, unit: 'days', times: sTimes,
      bars: { values: c.perSeason.map(p => p.days), color: v => (isNum(c.refDays) && v < c.refDays ? 'rgba(179,229,252,0.45)' : 'rgba(179,229,252,0.85)') },
      lines: lines2, yMin0: true, yMinSpan: 8,
      xLabel: (i, d) => (d.getUTCFullYear() % 10 === 0 ? seasonLabel(d.getUTCFullYear()) : null),
      tickFmt: v => v.toFixed(0),
      hover: i => `${seasonLabel(c.perSeason[i].season)} · ${c.perSeason[i].days} snow days · max ${Math.round(c.perSeason[i].max)} cm`,
    });
    charts.appendChild(daysChart);
  }
  el.appendChild(charts);

  el.appendChild(creditLine(
    `Data: ${datasetLink(MODELS.snowgrid.dataUrl, 'GeoSphere Austria SNOWGRID-CL v2')} (CC BY 4.0) · ` +
    `modelled daily snow depth on a 1 km grid, driven by observed weather · up to ${fmtDayMonth(c.last)} ${c.last.getUTCFullYear()}`));
}

// ── Charts ───────────────────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, text) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Hover/tap readout: a guide line plus a text box, driven by a slot index. */
function attachHover(svg, { W, ML, MT, CW, CH, n, xOf, text }) {
  const g = svgEl('g', { visibility: 'hidden', 'pointer-events': 'none' });
  const line = svgEl('line', { y1: MT, y2: MT + CH, stroke: 'rgba(255,255,255,0.55)', 'stroke-width': '1', 'stroke-dasharray': '3,2' });
  const bg = svgEl('rect', { rx: '4', ry: '4', fill: 'rgba(15,15,15,0.92)', stroke: 'rgba(255,255,255,0.2)', 'stroke-width': '1' });
  const txt = svgEl('text', { fill: '#f5f5f5', 'font-size': '10.5', 'font-family': 'inherit' });
  g.append(line, bg, txt);
  svg.appendChild(g);
  const overlay = svgEl('rect', { x: ML, y: MT, width: CW, height: CH, fill: 'transparent', style: 'cursor:crosshair' });
  svg.appendChild(overlay);
  const showAt = e => {
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const sx = (e.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(n - 1, Math.floor((sx - ML) / CW * n)));
    const x = xOf(i);
    line.setAttribute('x1', x); line.setAttribute('x2', x);
    txt.textContent = text(i);
    const tw = txt.getComputedTextLength ? txt.getComputedTextLength() : txt.textContent.length * 5.6;
    const tx = x + 10 + tw > ML + CW ? Math.max(ML + 2, x - tw - 10) : x + 10;
    txt.setAttribute('x', tx); txt.setAttribute('y', MT + 14);
    bg.setAttribute('x', tx - 5); bg.setAttribute('y', MT + 2);
    bg.setAttribute('width', tw + 10); bg.setAttribute('height', 17);
    g.setAttribute('visibility', 'visible');
  };
  overlay.addEventListener('pointermove', showAt);
  overlay.addEventListener('pointerdown', showAt);
  overlay.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') g.setAttribute('visibility', 'hidden'); });
}

/**
 * Small SVG chart for a series of periods (days, months, years): bars,
 * a lo/hi band and/or lines, with optional hover readout.
 * Styled like the ensemble/history charts in forecasts.js.
 */
function makeDailyChart({ title, unit, times, band = null, bars = null, lines = [], yMin0 = false, yMinSpan = 0,
                          symmetric = false, symmetricStep = 2, yRange = null, tickFmt = v => v, xLabel = null,
                          hover = null, wide = false }) {
  // Wide charts span the full grid row: draw them wider rather than scaling text up
  const W = wide ? 1280 : 640, H = wide ? 190 : 150;
  const ML = 40, MR = 12, MT = 22, MB = 28;
  const CW = W - ML - MR, CH = H - MT - MB;
  const n = times.length;

  const vals = [
    ...(band ? [...band.lo, ...band.hi] : []),
    ...(bars ? bars.values : []),
    ...lines.flatMap(l => l.values),
  ].filter(isNum);
  let lo = vals.length ? Math.min(...vals) : 0;
  let hi = vals.length ? Math.max(...vals) : 1;
  if (yRange) {
    [lo, hi] = yRange;
  } else if (symmetric) {
    // Round to a multiple of 2·step so the ±half ticks are round numbers
    const m = Math.ceil(Math.max(Math.abs(lo), Math.abs(hi), symmetricStep / 2) / symmetricStep) * symmetricStep;
    lo = -m; hi = m;
  } else if (yMin0) {
    lo = 0;
    // Top at a multiple of 4 so the four grid steps fall on whole numbers
    hi = Math.ceil(Math.max(hi, yMinSpan) / 4) * 4;
  } else {
    const pad = (hi - lo || 1) * 0.1;
    lo -= pad; hi += pad;
  }

  const slot = CW / Math.max(n, 1);
  const xOf = i => ML + (i + 0.5) * slot;
  const yOf = v => MT + CH - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * CH;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', style: 'display:block;overflow:visible;touch-action:pan-y' });
  svg.appendChild(svgEl('text', {
    x: ML, y: 13, fill: '#e0e0e0', 'font-size': '12', 'font-family': 'inherit', 'font-weight': '600',
  }, `${title} (${unit})`));

  for (let i = 0; i <= 4; i++) {
    const v = lo + (hi - lo) * (i / 4);
    const y = yOf(v);
    svg.appendChild(svgEl('line', { x1: ML, x2: ML + CW, y1: y, y2: y, stroke: 'rgba(255,255,255,0.07)', 'stroke-width': '1' }));
    svg.appendChild(svgEl('text', {
      x: ML - 6, y: y + 3.5, 'text-anchor': 'end', fill: '#9e9e9e', 'font-size': '10', 'font-family': 'inherit',
    }, tickFmt(v)));
  }

  // X labels: custom, or weekly/fortnightly for short daily periods and month starts for long ones
  const defaultLabel = (i, d) => {
    if (n <= 100) return (n - 1 - i) % (n <= 45 ? 7 : 14) === 0 ? fmtDayMonth(d) : null;
    return d.getUTCDate() === 1 ? MONTH_ABBR[d.getUTCMonth()] + (d.getUTCMonth() === 0 ? ` ${d.getUTCFullYear()}` : '') : null;
  };
  const labelOf = xLabel || defaultLabel;
  for (let i = 0; i < n; i++) {
    const text = labelOf(i, times[i]);
    if (!text) continue;
    const x = xOf(i);
    svg.appendChild(svgEl('line', { x1: x, x2: x, y1: MT + CH, y2: MT + CH + 4, stroke: 'rgba(255,255,255,0.2)', 'stroke-width': '1' }));
    svg.appendChild(svgEl('text', {
      x, y: MT + CH + 16, 'text-anchor': 'middle', fill: '#9e9e9e', 'font-size': '10', 'font-family': 'inherit',
    }, text));
  }

  if (band) {
    const ok = i => isNum(band.lo[i]) && isNum(band.hi[i]);
    const idx = times.map((_, i) => i).filter(ok);
    if (idx.length) {
      const pts = arr => idx.map(i => `${xOf(i).toFixed(1)},${yOf(arr[i]).toFixed(1)}`);
      svg.appendChild(svgEl('path', { d: `M ${pts(band.hi).join(' L ')} L ${pts(band.lo).reverse().join(' L ')} Z`, fill: band.fill, stroke: 'none' }));
      if (band.hiColor) svg.appendChild(svgEl('path', { d: `M ${pts(band.hi).join(' L ')}`, fill: 'none', stroke: band.hiColor, 'stroke-width': '1.4', 'stroke-linejoin': 'round' }));
      if (band.loColor) svg.appendChild(svgEl('path', { d: `M ${pts(band.lo).join(' L ')}`, fill: 'none', stroke: band.loColor, 'stroke-width': '1.4', 'stroke-linejoin': 'round' }));
    }
  }

  if (bars) {
    const y0 = yOf(Math.max(lo, Math.min(hi, 0)));
    const bw = Math.max(1, slot * 0.75);
    bars.values.forEach((v, i) => {
      if (!isNum(v) || v === 0) return;
      const y = yOf(v);
      svg.appendChild(svgEl('rect', {
        x: (xOf(i) - bw / 2).toFixed(1), y: Math.min(y, y0).toFixed(1),
        width: bw.toFixed(1), height: Math.max(0.5, Math.abs(y0 - y)).toFixed(1),
        fill: bars.color(v),
      }));
    });
    if (symmetric || yRange) {
      svg.appendChild(svgEl('line', { x1: ML, x2: ML + CW, y1: y0, y2: y0, stroke: 'rgba(255,255,255,0.3)', 'stroke-width': '1' }));
    }
  }

  // Lines, broken at missing values
  for (const l of lines) {
    let d = '', pen = false;
    l.values.forEach((v, i) => {
      if (!isNum(v)) { pen = false; return; }
      d += `${pen ? ' L' : ' M'} ${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`;
      pen = true;
    });
    if (d) {
      svg.appendChild(svgEl('path', {
        d, fill: 'none', stroke: l.color, 'stroke-width': String(l.width || 1.6),
        'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...(l.dash ? { 'stroke-dasharray': l.dash } : {}),
      }));
    }
  }

  svg.appendChild(svgEl('rect', { x: ML, y: MT, width: CW, height: CH, fill: 'none', stroke: 'rgba(255,255,255,0.08)', 'stroke-width': '1' }));
  if (hover) attachHover(svg, { W, ML, MT, CW, CH, n, xOf, text: hover });

  const wrapper = document.createElement('div');
  wrapper.className = 'fc-ens-chart' + (wide ? ' fc-chart-wide' : '');
  wrapper.appendChild(svg);
  return wrapper;
}

/** Warming stripes: one coloured stripe per period, labels every decade. */
function makeStripes({ title, labels, values, hover }) {
  const W = 1280, H = 96;
  const ML = 8, MR = 8, MT = 22, MB = 22;
  const CW = W - ML - MR, CH = H - MT - MB;
  const n = values.length;
  const slot = CW / Math.max(n, 1);
  const xOf = i => ML + (i + 0.5) * slot;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', style: 'display:block;overflow:visible;touch-action:pan-y' });
  svg.appendChild(svgEl('text', {
    x: ML, y: 14, fill: '#e0e0e0', 'font-size': '13', 'font-family': 'inherit', 'font-weight': '600',
  }, title));
  values.forEach((v, i) => {
    svg.appendChild(svgEl('rect', {
      x: (ML + i * slot).toFixed(2), y: MT, width: (slot + 0.6).toFixed(2), height: CH,
      fill: isNum(v) ? stripeColor(v) : 'transparent',
    }));
    if (labels[i] % 10 === 0) {
      svg.appendChild(svgEl('text', {
        x: xOf(i), y: MT + CH + 16, 'text-anchor': 'middle', fill: '#9e9e9e', 'font-size': '12', 'font-family': 'inherit',
      }, String(labels[i])));
    }
  });
  if (hover) attachHover(svg, { W, ML, MT, CW, CH, n, xOf, text: hover });

  const wrapper = document.createElement('div');
  wrapper.className = 'fc-ens-chart';
  wrapper.appendChild(svg);
  return wrapper;
}

// ── Climate context for forecasts ────────────────────────────────────────────

/** Daily-max samples grouped by day of year, from 1991–2020 SPARTACUS TX. */
function loadNormals(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (!climateCache.has(key)) {
    const req = fetchSpartacus(lat, lng, 'TX', '1991-01-01', '2020-12-31').then(raw => {
      const tx = raw.p.TX?.data || [];
      const byDoy = Array.from({ length: 365 }, () => []);
      raw.times.forEach((t, i) => {
        const v = tx[i];
        if (v !== null && isFinite(v)) byDoy[dayOfYear(t.getUTCMonth(), t.getUTCDate())].push(v);
      });
      if (!byDoy.some(a => a.length)) return null;  // inside bbox but outside Austria
      return { byDoy, windows: new Map() };
    }).catch(err => {
      console.warn('Climate normals unavailable:', err);
      climateCache.delete(key);  // allow a retry on the next click
      return null;
    });
    climateCache.set(key, req);
  }
  return climateCache.get(key);
}

/** Sorted samples within ±CLIMATE_WINDOW_DAYS of a day of year. */
function normalsWindow(normals, doy) {
  if (!normals.windows.has(doy)) {
    const samples = [];
    for (let k = -CLIMATE_WINDOW_DAYS; k <= CLIMATE_WINDOW_DAYS; k++) {
      samples.push(...normals.byDoy[(doy + k + 365) % 365]);
    }
    normals.windows.set(doy, samples.sort((a, b) => a - b));
  }
  return normals.windows.get(doy);
}

/**
 * Compare a forecast daily max with the 1991–2020 distribution.
 * Used by renderForecastTableInto() in forecasts.js. Returns { text, title, color } or null.
 */
function climateComparison(normals, date, tMax) {
  const utc = displayTZ === 'UTC';
  const month = utc ? date.getUTCMonth() : date.getMonth();
  const day   = utc ? date.getUTCDate()  : date.getDate();
  const samples = normalsWindow(normals, dayOfYear(month, day));
  if (samples.length < 100) return null;

  const median = samples[Math.floor(samples.length / 2)];
  const below = samples.filter(v => v < tMax).length + 0.5 * samples.filter(v => v === tMax).length;
  const pct = 100 * below / samples.length;
  const diff = Math.round(tMax - median);

  let text = diff === 0 ? 'about normal' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)}° vs normal`;
  if (pct >= 95) text += ' · very warm';
  else if (pct <= 5) text += ' · very cold';

  const strength = Math.min(1, Math.abs(tMax - median) / 8);
  const color = diff === 0 ? 'transparent'
    : diff > 0 ? `rgba(239,83,80,${(0.1 + strength * 0.45).toFixed(2)})`
    : `rgba(66,165,245,${(0.1 + strength * 0.45).toFixed(2)})`;

  const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: utc ? 'UTC' : undefined });
  const title = `Forecast max ${Math.round(tMax)}° vs a typical ${Math.round(median)}° around ${dateStr} in 1991–2020 ` +
    `(observed, SPARTACUS). Warmer than ${Math.round(pct)}% of those days. ` +
    `Model and observation grids differ, so small offsets are expected.`;
  return { text, title, color };
}

/** Fetch normals for a forecast point in the background and re-render the table with a "vs normal" row. */
function addClimateContext(lat, lng, data) {
  if (!data || !data.times || !inSpartacusBBox(lat, lng)) return;
  loadNormals(lat, lng).then(normals => {
    if (!normals || lastForecastData !== data) return;
    data.climate = normals;
    renderForecastTable(data);
  });
}
