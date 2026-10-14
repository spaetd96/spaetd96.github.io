'use strict';

// SPARTACUS daily observations (GeoSphere Austria):
//  - "Past" tab: observed temperature, precipitation and sunshine for a point
//  - climate context for forecasts: daily max vs. 1991–2020 at the same point
// Loaded after forecasts.js and uses its globals (MODELS, API_BASE, fetchJSON, …).

const SPARTACUS_BBOX = { latMin: 46.16, latMax: 49.18, lonMin: 9.39, lonMax: 17.38 };
const PAST_PERIODS = [
  { days: 30,  label: '30 days' },
  { days: 90,  label: '90 days' },
  { days: 365, label: '1 year' },
];
const REF_PERIODS = [
  { key: '1991_2020', label: '1991–2020' },
  { key: '1961_1990', label: '1961–1990' },
];
const CLIMATE_WINDOW_DAYS = 7;   // ± days around the date pooled into the normal
const MONTH_CUMDAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

let pastPeriodDays = 30;
let pastRefPeriod = loadPref('fc.refPeriod', REF_PERIODS.map(r => r.key)) || REF_PERIODS[0].key;
let pastRequestId = 0;
const climateCache = new Map();  // rounded lat/lon → Promise<normals | null>

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

async function fetchSpartacus(lat, lng, params, start, end) {
  const url = `${API_BASE}/timeseries/historical/${MODELS.spartacus.resource}` +
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

// ── Past tab ─────────────────────────────────────────────────────────────────

function showPanelMessage(msg) {
  const loading = document.getElementById('fc-forecast-loading');
  loading.classList.remove('hidden');
  loading.querySelector('.fc-spin-ring').style.display = 'none';
  loading.querySelector('span').textContent = msg;
}

/** Called by fetchAndShowForecast() when the SPARTACUS model is active. */
async function fetchAndShowPast(lat, lng) {
  const reqId = ++pastRequestId;
  const loading = document.getElementById('fc-forecast-loading');
  const period = PAST_PERIODS.find(p => p.days === pastPeriodDays) || PAST_PERIODS[0];
  const label = `Observations · last ${period.label}`;
  setForecastLocationEl(lat, lng, null, label);

  if (!inSpartacusBBox(lat, lng)) {
    showPanelMessage('SPARTACUS observations only cover Austria and its border areas. Pick a location inside Austria.');
    return;
  }
  loading.querySelector('span').textContent = 'Loading observations…';

  // The API clamps the end date to the latest available day (usually yesterday)
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - period.days);
  // Both reference periods are fetched so switching between them needs no new request
  const anomParams = REF_PERIODS.map(r => `TM24a_${r.key}`).join(',');
  const raw = await fetchSpartacus(lat, lng, `TN,TX,RR,SA,${anomParams}`, isoDate(start), isoDate(end));
  if (reqId !== pastRequestId || !MODELS[currentModel].isHistorical) return;

  const col = key => raw.p[key]?.data || [];
  const data = {
    isPast: true, lat, lng,
    times: raw.times,
    tn: col('TN'), tx: col('TX'), rr: col('RR'),
    sun: col('SA').map(v => (v === null ? null : v / 3600)),
    anom: Object.fromEntries(REF_PERIODS.map(r => [r.key, col(`TM24a_${r.key}`)])),
    gridLat: raw.gridLat, gridLon: raw.gridLon,
  };
  if (!data.tx.some(v => v !== null && isFinite(v))) {
    showPanelMessage('No observations for this point. SPARTACUS covers Austria and its border areas only.');
    return;
  }

  lastForecastData = data;
  setForecastLocationEl(lat, lng, data, label);
  loading.classList.add('hidden');
  document.getElementById('fc-forecast-panel').classList.add('fc-panel-past');
  renderPast(data);
}

function renderPast(data) {
  const el = document.getElementById('fc-past-data');
  el.innerHTML = '';
  el.classList.remove('hidden');

  // Period and reference-period pickers
  const controls = document.createElement('div');
  controls.className = 'fc-past-controls';
  const chipGroup = (label, items, isActive, onPick) => {
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
  };
  controls.appendChild(chipGroup('Period', PAST_PERIODS, p => p.days === pastPeriodDays, p => {
    pastPeriodDays = p.days;
    fetchAndShowForecast(data.lat, data.lng);
  }));
  controls.appendChild(chipGroup('Compare with', REF_PERIODS, r => r.key === pastRefPeriod, r => {
    pastRefPeriod = r.key;
    savePref('fc.refPeriod', r.key);
    renderPast(data);
  }));
  el.appendChild(controls);

  const ref = REF_PERIODS.find(r => r.key === pastRefPeriod) || REF_PERIODS[0];
  const anom = data.anom[ref.key] || [];

  el.appendChild(buildPastSummary(data, anom, ref.label));

  const charts = document.createElement('div');
  charts.className = 'fc-past-charts';
  charts.appendChild(makeDailyChart({
    title: 'Temperature min / max', unit: '°C', times: data.times,
    band: { lo: data.tn, hi: data.tx, fill: 'rgba(239,154,154,0.22)', loColor: '#64b5f6', hiColor: '#ef9a9a' },
    tickFmt: v => Math.round(v) + '°',
  }));
  charts.appendChild(makeDailyChart({
    title: `Daily mean temperature vs ${ref.label}`, unit: '°C', times: data.times,
    bars: { values: anom, color: v => (v >= 0 ? 'rgba(239,83,80,0.75)' : 'rgba(66,165,245,0.75)') },
    symmetric: true,
    tickFmt: v => (v > 0 ? '+' : '') + v.toFixed(0) + '°',
  }));
  charts.appendChild(makeDailyChart({
    title: 'Precipitation', unit: 'mm', times: data.times,
    bars: { values: data.rr, color: () => 'rgba(30,136,229,0.75)' },
    yMin0: true, yMinSpan: 5,
    tickFmt: v => v.toFixed(0),
  }));
  charts.appendChild(makeDailyChart({
    title: 'Sunshine', unit: 'h', times: data.times,
    bars: { values: data.sun, color: () => 'rgba(255,202,40,0.75)' },
    yMin0: true, yMinSpan: 4,
    tickFmt: v => v.toFixed(0),
  }));
  el.appendChild(charts);

  const credit = document.createElement('div');
  credit.className = 'fc-station-credit';
  credit.innerHTML = `Data: <a href="${MODELS.spartacus.dataUrl}" target="_blank" rel="noopener">GeoSphere Austria SPARTACUS v3</a> ` +
    `(CC BY 4.0) · gridded from station observations, 1 km`;
  el.appendChild(credit);
}

function buildPastSummary(data, anomValues, refLabel) {
  const finite = arr => arr.filter(v => v !== null && isFinite(v));
  const fmtDate = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const argExt = (arr, cmp) => {
    let best = -1;
    arr.forEach((v, i) => {
      if (v !== null && isFinite(v) && (best < 0 || cmp(v, arr[best]))) best = i;
    });
    return best;
  };

  const cards = [];
  const anom = finite(anomValues);
  if (anom.length) {
    const mean = anom.reduce((a, b) => a + b, 0) / anom.length;
    cards.push({
      icon: mean >= 0 ? '🔺' : '🔻',
      val: `${mean >= 0 ? '+' : '−'}${Math.abs(mean).toFixed(1)} °C`,
      label: `vs ${refLabel}`,
      color: mean >= 0 ? 'rgba(239,83,80,0.35)' : 'rgba(66,165,245,0.35)',
    });
  }
  const iMax = argExt(data.tx, (a, b) => a > b);
  if (iMax >= 0) cards.push({ icon: '🌡️', val: `${data.tx[iMax].toFixed(1)}°`, label: `Warmest · ${fmtDate(data.times[iMax])}`, color: tempColor(data.tx[iMax]) });
  const iMin = argExt(data.tn, (a, b) => a < b);
  if (iMin >= 0) cards.push({ icon: '❄️', val: `${data.tn[iMin].toFixed(1)}°`, label: `Coldest · ${fmtDate(data.times[iMin])}`, color: tempColor(data.tn[iMin]) });

  const rr = finite(data.rr);
  if (rr.length) {
    const total = rr.reduce((a, b) => a + b, 0);
    const wet = rr.filter(v => v >= 1).length;
    cards.push({ icon: '🌧️', val: `${Math.round(total)} mm`, label: `${wet} wet day${wet === 1 ? '' : 's'} (≥1 mm)` });
  }
  const sun = finite(data.sun);
  if (sun.length) {
    cards.push({ icon: '☀️', val: `${Math.round(sun.reduce((a, b) => a + b, 0))} h`, label: 'Sunshine' });
  }
  const frost = finite(data.tn).filter(v => v < 0).length;
  if (frost) cards.push({ icon: '🧊', val: String(frost), label: 'Frost days (min < 0°)' });
  const hot = finite(data.tx).filter(v => v >= 30).length;
  if (hot) cards.push({ icon: '🔥', val: String(hot), label: 'Hot days (max ≥ 30°)' });

  const grid = document.createElement('div');
  grid.className = 'fc-station-grid fc-past-summary';
  for (const c of cards) {
    const card = document.createElement('div');
    card.className = 'fc-station-param';
    card.innerHTML = `<span class="fc-sp-icon">${c.icon}</span>` +
      `<span class="fc-sp-val"${c.color ? ` style="background:${c.color}"` : ''}>${c.val}</span>` +
      `<span class="fc-sp-label">${c.label}</span>`;
    grid.appendChild(card);
  }
  return grid;
}

/**
 * Small SVG chart for daily values: either a lo/hi band or bars.
 * Styled like the ensemble/history charts in forecasts.js.
 */
function makeDailyChart({ title, unit, times, band = null, bars = null, yMin0 = false, yMinSpan = 0, symmetric = false, tickFmt = v => v }) {
  const W = 640, H = 150;
  const ML = 40, MR = 12, MT = 22, MB = 28;
  const CW = W - ML - MR, CH = H - MT - MB;
  const n = times.length;

  const vals = (band ? [...band.lo, ...band.hi] : bars.values).filter(v => v !== null && isFinite(v));
  let lo = vals.length ? Math.min(...vals) : 0;
  let hi = vals.length ? Math.max(...vals) : 1;
  if (symmetric) {
    // Round to an even number so the ±half ticks are whole degrees
    const m = Math.ceil(Math.max(Math.abs(lo), Math.abs(hi), 1) / 2) * 2;
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
  const yOf = v => MT + CH - ((v - lo) / (hi - lo)) * CH;

  const svgNS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', style: 'display:block;overflow:visible' });

  svg.appendChild(el('text', {
    x: ML, y: 13, fill: '#e0e0e0', 'font-size': '12', 'font-family': 'inherit', 'font-weight': '600',
  }, `${title} (${unit})`));

  for (let i = 0; i <= 4; i++) {
    const v = lo + (hi - lo) * (i / 4);
    const y = yOf(v);
    svg.appendChild(el('line', { x1: ML, x2: ML + CW, y1: y, y2: y, stroke: 'rgba(255,255,255,0.07)', 'stroke-width': '1' }));
    svg.appendChild(el('text', {
      x: ML - 6, y: y + 3.5, 'text-anchor': 'end', fill: '#9e9e9e', 'font-size': '10', 'font-family': 'inherit',
    }, tickFmt(v)));
  }

  // X labels: weekly for short periods, month starts for long ones
  const fmtDay = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const fmtMonth = d => d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
    + (d.getUTCMonth() === 0 ? ` ${d.getUTCFullYear()}` : '');
  for (let i = 0; i < n; i++) {
    const d = times[i];
    let text = null;
    if (n <= 100) {
      if ((n - 1 - i) % (n <= 45 ? 7 : 14) === 0) text = fmtDay(d);
    } else if (d.getUTCDate() === 1) {
      text = fmtMonth(d);
    }
    if (!text) continue;
    const x = xOf(i);
    svg.appendChild(el('line', { x1: x, x2: x, y1: MT + CH, y2: MT + CH + 4, stroke: 'rgba(255,255,255,0.2)', 'stroke-width': '1' }));
    svg.appendChild(el('text', {
      x, y: MT + CH + 16, 'text-anchor': 'middle', fill: '#9e9e9e', 'font-size': '10', 'font-family': 'inherit',
    }, text));
  }

  if (bars) {
    const y0 = yOf(Math.max(lo, Math.min(hi, 0)));
    const bw = Math.max(1, slot * 0.75);
    bars.values.forEach((v, i) => {
      if (v === null || !isFinite(v) || v === 0) return;
      const y = yOf(v);
      svg.appendChild(el('rect', {
        x: (xOf(i) - bw / 2).toFixed(1), y: Math.min(y, y0).toFixed(1),
        width: bw.toFixed(1), height: Math.max(0.5, Math.abs(y0 - y)).toFixed(1),
        fill: bars.color(v),
      }));
    });
    if (symmetric) {
      svg.appendChild(el('line', { x1: ML, x2: ML + CW, y1: y0, y2: y0, stroke: 'rgba(255,255,255,0.3)', 'stroke-width': '1' }));
    }
  }

  if (band) {
    const ok = i => [band.lo[i], band.hi[i]].every(v => v !== null && isFinite(v));
    const idx = times.map((_, i) => i).filter(ok);
    if (idx.length) {
      const pts = arr => idx.map(i => `${xOf(i).toFixed(1)},${yOf(arr[i]).toFixed(1)}`);
      const hiPts = pts(band.hi), loPts = pts(band.lo);
      svg.appendChild(el('path', { d: `M ${hiPts.join(' L ')} L ${loPts.reverse().join(' L ')} Z`, fill: band.fill, stroke: 'none' }));
      svg.appendChild(el('path', { d: `M ${pts(band.hi).join(' L ')}`, fill: 'none', stroke: band.hiColor, 'stroke-width': '1.4', 'stroke-linejoin': 'round' }));
      svg.appendChild(el('path', { d: `M ${pts(band.lo).join(' L ')}`, fill: 'none', stroke: band.loColor, 'stroke-width': '1.4', 'stroke-linejoin': 'round' }));
    }
  }

  svg.appendChild(el('rect', { x: ML, y: MT, width: CW, height: CH, fill: 'none', stroke: 'rgba(255,255,255,0.08)', 'stroke-width': '1' }));

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
