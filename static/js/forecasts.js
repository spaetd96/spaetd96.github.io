/* global L */
'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const API_BASE = 'https://dataset.api.hub.geosphere.at/v1';

const MODELS = {
  arome: {
    resource: 'nwp-v1-1h-2500m',
    label:    'AROME NWP',
    desc:     '1-hour steps · 60-hour horizon · 2.5 km resolution',
    params:   't2m,rr_acc,u10m,v10m,tcc,ugust,vgust',
    dataUrl:  'https://data.hub.geosphere.at/dataset/nwp-v1-1h-2500m',
    doi:      '10.60669/9zm8-s664',
    doiUrl:   'https://doi.org/10.60669/9zm8-s664',
    hasCloudCover: true,
    accumulated:   true,
    hasUV:         true,
    hasUVgust:     true,
  },
  inca: {
    resource: 'nowcast-v1-15min-1km',
    label:    'INCA Nowcast',
    desc:     '15-minute steps · 3-hour horizon · 1 km resolution',
    params:   't2m,rr,ff,dd,fx',
    dataUrl:  'https://data.hub.geosphere.at/dataset/nowcast-v1-15min-1km',
    doi:      '10.60669/ahad-4y43',
    doiUrl:   'https://doi.org/10.60669/ahad-4y43',
    hasCloudCover: false,
    accumulated:   false,
    hasUV:         false,
    hasUVgust:     false,
  },
  ensemble: {
    resource: 'ensemble-v1-1h-2500m',
    label:    'Ensemble',
    desc:     '1-hour steps · 60-hour horizon · 2.5 km resolution',
    params:   't2m_p10,t2m_p50,t2m_p90,rr_p10,rr_p50,rr_p90,u10m_p10,u10m_p50,u10m_p90,v10m_p10,v10m_p50,v10m_p90',
    dataUrl:  'https://data.hub.geosphere.at/dataset/ensemble-v1-1h-2500m',
    doi:      null,
    doiUrl:   null,
    isEnsemble: true,
  },
};

const MS_TO_KT = 1.94384;

// Temperature colour stops (value → [r,g,b])
const TEMP_STOPS = [
  [-20, [ 30,  60, 180]],
  [ -5, [ 60, 140, 220]],
  [  5, [ 80, 190, 160]],
  [ 15, [140, 200,  60]],
  [ 22, [240, 210,  40]],
  [ 30, [230, 120,  20]],
  [ 40, [200,  30,  30]],
];

// Wind speed colour stops (m/s → [r,g,b])
const WIND_STOPS = [
  [ 0, [200, 200, 200]],
  [ 5, [240, 200,  50]],
  [15, [230, 100,  10]],
  [30, [180,   0,   0]],
];

// ── State ────────────────────────────────────────────────────────────────────

let map, pinMarker = null, currentModel = 'arome', windUnit = 'kt', displayTZ = 'local';
let lastForecastData = null;

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initControls();
  updateInfoBox();
});

function initMap() {
  map = L.map('fc-map', {
    center:   [47.5, 13.0],
    zoom:     7,
    minZoom:  7,
    maxZoom:  12,
    zoomControl: false,
    maxBounds: [[44.0, 6.0], [51.5, 20.5]],
    maxBoundsViscosity: 1.0,
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> · &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    subdomains: 'abcd',
    maxZoom: 20,
    className: 'fc-map-tiles',
  }).addTo(map);

  map.on('click', onMapClick);
}

function initControls() {
  document.getElementById('fc-model-select').addEventListener('change', e => {
    currentModel = e.target.value;
    updateInfoBox();
    // Re-fetch if panel is open
    if (!document.getElementById('fc-forecast-panel').classList.contains('hidden') && pinMarker) {
      const ll = pinMarker.getLatLng();
      fetchAndShowForecast(ll.lat, ll.lng);
    }
  });

  document.getElementById('fc-forecast-close').addEventListener('click', () => {
    document.getElementById('fc-forecast-panel').classList.add('hidden');
    if (pinMarker) { pinMarker.remove(); pinMarker = null; }
    document.getElementById('fc-click-hint').classList.remove('hidden');
  });

  document.getElementById('fc-unit-toggle').addEventListener('click', () => {
    windUnit = windUnit === 'ms' ? 'kt' : 'ms';
    document.getElementById('fc-unit-toggle').textContent = windUnit === 'ms' ? 'm/s' : 'kt';
    if (lastForecastData) {
      if (lastForecastData.isEnsemble) renderEnsembleCharts(lastForecastData);
      else renderForecastTable(lastForecastData);
    }
  });

  document.getElementById('fc-tz-toggle').addEventListener('click', () => {
    displayTZ = displayTZ === 'UTC' ? 'local' : 'UTC';
    document.getElementById('fc-tz-toggle').textContent = displayTZ === 'UTC' ? 'UTC' : 'Local';
    if (lastForecastData) {
      if (lastForecastData.isEnsemble) renderEnsembleCharts(lastForecastData);
      else renderForecastTable(lastForecastData);
    }
  });
}

function updateInfoBox() {
  const m = MODELS[currentModel];
  document.getElementById('fc-info-title').textContent = m.label;
  document.getElementById('fc-info-resolution').textContent = m.desc;
  const doiPart = m.doi ? ` · <a href="${m.doiUrl}" target="_blank" rel="noopener">doi:${m.doi}</a>` : '';
  document.getElementById('fc-info-credit').innerHTML =
    `Data: <a href="${m.dataUrl}" target="_blank" rel="noopener">GeoSphere Austria ${m.label}</a> ` +
    `(CC BY 4.0)${doiPart}`;
}

// ── Map click ────────────────────────────────────────────────────────────────

function onMapClick(e) {
  const { lat, lng } = e.latlng;

  if (pinMarker) pinMarker.remove();
  pinMarker = L.circleMarker([lat, lng], {
    radius: 6, color: '#26a69a', fillColor: '#26a69a', fillOpacity: 0.9, weight: 2,
  }).addTo(map);

  document.getElementById('fc-click-hint').classList.add('hidden');
  fetchAndShowForecast(lat, lng);
}

// ── Fetch + render forecast ──────────────────────────────────────────────────

async function fetchAndShowForecast(lat, lng) {
  const panel   = document.getElementById('fc-forecast-panel');
  const loading = document.getElementById('fc-forecast-loading');
  const scroll         = document.getElementById('fc-forecast-scroll');
  const ensembleScroll = document.getElementById('fc-ensemble-scroll');

  panel.classList.remove('hidden');
  loading.classList.remove('hidden');
  scroll.classList.add('hidden');
  ensembleScroll.classList.add('hidden');

  // Reset loading UI in case of previous error
  const loadingSpan = loading.querySelector('span');
  loadingSpan.textContent = 'Loading forecast data — this may take a few seconds…';
  const spinner = loading.querySelector('.fc-spin-ring');
  spinner.style.display = '';

  document.getElementById('fc-forecast-location').textContent =
    `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E · ${MODELS[currentModel].label}`;

  const m   = MODELS[currentModel];
  const url = `${API_BASE}/timeseries/forecast/${m.resource}` +
              `?lat_lon=${lat.toFixed(4)},${lng.toFixed(4)}&parameters=${m.params}`;

  try {
    const json = await fetchJSON(url);
    if (m.isEnsemble) {
      lastForecastData = processEnsembleTimeseries(json);
      ensembleScroll.classList.remove('hidden');
      renderEnsembleCharts(lastForecastData);
    } else {
      lastForecastData = processTimeseries(json);
      lastForecastData.isEnsemble = false;
      scroll.classList.remove('hidden');
      renderForecastTable(lastForecastData);
    }
    loading.classList.add('hidden');
  } catch (err) {
    console.error('Forecast fetch error:', err);
    spinner.style.display = 'none';
    loadingSpan.textContent = 'Error loading forecast data. The location may be outside the model domain.';
  }
}

// ── Process API response ─────────────────────────────────────────────────────

function processTimeseries(json) {
  const timestamps = json.timestamps.map(t => new Date(t));
  const p = json.features[0].properties.parameters;
  const m = MODELS[currentModel];

  const temp = p.t2m ? p.t2m.data : [];

  let rain;
  if (m.accumulated) {
    const acc = p.rr_acc ? p.rr_acc.data : [];
    rain = acc.map((v, i) => i === 0 ? Math.max(0, v) : Math.max(0, v - acc[i - 1]));
  } else {
    rain = p.rr ? p.rr.data : [];
  }

  let windSpeed, windDir;
  if (m.hasUV) {
    const u = p.u10m ? p.u10m.data : [];
    const v = p.v10m ? p.v10m.data : [];
    windSpeed = u.map((ui, i) => Math.sqrt(ui * ui + v[i] * v[i]));
    windDir   = u.map((ui, i) => (Math.atan2(-ui, -v[i]) * 180 / Math.PI + 360) % 360);
  } else {
    windSpeed = p.ff ? p.ff.data : [];
    windDir   = p.dd ? p.dd.data : [];
  }

  let gustSpeed = null;
  if (m.hasUVgust && p.ugust && p.vgust) {
    const ug = p.ugust.data;
    const vg = p.vgust.data;
    gustSpeed = ug.map((ui, i) => Math.sqrt(ui * ui + vg[i] * vg[i]));
  } else if (!m.hasUVgust && p.fx) {
    gustSpeed = p.fx.data;
  }

  const cloudCover = m.hasCloudCover && p.tcc ? p.tcc.data : null;

  return { times: timestamps, temp, rain, windSpeed, windDir, gustSpeed, cloudCover };
}

// ── Render Windy-style forecast table ────────────────────────────────────────

function renderForecastTable(data) {
  const { times, temp, rain, windSpeed, windDir, gustSpeed, cloudCover } = data;
  const useKt = windUnit === 'kt';
  const unitLabel = useKt ? 'kt' : 'm/s';
  const toUnit = v => isFinite(v) ? (useKt ? v * MS_TO_KT : v) : v;
  const n = times.length;
  const table = document.getElementById('fc-forecast-table');
  table.innerHTML = '';

  // Time helpers — respect displayTZ setting
  const tz     = displayTZ === 'UTC' ? 'UTC' : undefined; // undefined → browser local
  const getH   = d => displayTZ === 'UTC' ? d.getUTCHours()   : d.getHours();
  const getMin = d => displayTZ === 'UTC' ? d.getUTCMinutes() : d.getMinutes();
  const dayKey = d => d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
  const tzSuffix = displayTZ === 'UTC' ? 'UTC' : 'local';

  // Group timesteps by calendar day
  const dayGroups = [];
  let currentDay = null;
  for (let i = 0; i < n; i++) {
    const k = dayKey(times[i]);
    if (k !== currentDay) {
      dayGroups.push({ label: k, count: 1 });
      currentDay = k;
    } else {
      dayGroups[dayGroups.length - 1].count++;
    }
  }

  // ── Row 1: Day headers ──
  const dayRow = document.createElement('tr');
  dayRow.className = 'fc-row-days';
  const dayLabel = document.createElement('td');
  dayLabel.className = 'fc-label';
  dayRow.appendChild(dayLabel);
  for (const g of dayGroups) {
    const td = document.createElement('td');
    td.className = 'fc-day-cell';
    td.colSpan = g.count;
    td.textContent = g.label;
    dayRow.appendChild(td);
  }
  table.appendChild(dayRow);

  // ── Row 2: Hours ──
  const subHourly = times.some(t => getMin(t) !== 0);
  const hourRow = document.createElement('tr');
  hourRow.className = 'fc-row-hours';
  const hourLabel = document.createElement('td');
  hourLabel.className = 'fc-label';
  hourLabel.textContent = subHourly ? `Time (${tzSuffix})` : `Hour (${tzSuffix})`;
  hourRow.appendChild(hourLabel);
  for (let i = 0; i < n; i++) {
    const td = document.createElement('td');
    const hh = String(getH(times[i])).padStart(2, '0');
    const mm = String(getMin(times[i])).padStart(2, '0');
    td.textContent = subHourly ? `${hh}:${mm}` : hh;
    hourRow.appendChild(td);
  }
  table.appendChild(hourRow);

  // ── Row 3: Weather icons (AROME only) ──
  if (cloudCover) {
    const iconRow = document.createElement('tr');
    iconRow.className = 'fc-row-icons';
    const iconLabel = document.createElement('td');
    iconLabel.className = 'fc-label';
    iconRow.appendChild(iconLabel);
    for (let i = 0; i < n; i++) {
      const td = document.createElement('td');
      td.textContent = weatherIcon(cloudCover[i], rain[i], getH(times[i]));
      iconRow.appendChild(td);
    }
    table.appendChild(iconRow);
  }

  // ── Row 4: Temperature ──
  const tempRow = document.createElement('tr');
  tempRow.className = 'fc-row-temp';
  const tempLabel = document.createElement('td');
  tempLabel.className = 'fc-label';
  tempLabel.innerHTML = 'Temp&nbsp;°C';
  tempRow.appendChild(tempLabel);
  for (let i = 0; i < n; i++) {
    const td = document.createElement('td');
    td.className = 'fc-temp-cell';
    const val = temp[i];
    if (isFinite(val)) {
      td.textContent = Math.round(val) + '°';
      td.style.backgroundColor = tempColor(val);
    } else {
      td.textContent = '—';
    }
    tempRow.appendChild(td);
  }
  table.appendChild(tempRow);

  // ── Row 5: Rain ──
  const rainRow = document.createElement('tr');
  rainRow.className = 'fc-row-rain';
  const rainLabel = document.createElement('td');
  rainLabel.className = 'fc-label';
  rainLabel.innerHTML = 'Rain&nbsp;mm';
  rainRow.appendChild(rainLabel);
  for (let i = 0; i < n; i++) {
    const td = document.createElement('td');
    td.className = 'fc-rain-cell';
    const val = rain[i];
    if (isFinite(val) && val > 0.05) {
      td.textContent = val < 10 ? val.toFixed(1) : Math.round(val);
      const intensity = Math.min(1, val / 10);
      td.style.backgroundColor = `rgba(30, 136, 229, ${(0.15 + intensity * 0.55).toFixed(2)})`;
      td.style.color = '#fff';
    }
    rainRow.appendChild(td);
  }
  table.appendChild(rainRow);

  // ── Row 6: Wind ──
  const windRow = document.createElement('tr');
  windRow.className = 'fc-row-wind';
  const windLabel = document.createElement('td');
  windLabel.className = 'fc-label';
  windLabel.innerHTML = `Wind&nbsp;${unitLabel}`;
  windRow.appendChild(windLabel);
  for (let i = 0; i < n; i++) {
    const td = document.createElement('td');
    td.className = 'fc-wind-cell';
    const speed = windSpeed[i];
    const dir   = windDir[i];
    if (isFinite(speed)) {
      td.appendChild(windArrowSVG(speed, dir));
      const span = document.createElement('span');
      span.textContent = Math.round(toUnit(speed));
      td.appendChild(span);
    }
    windRow.appendChild(td);
  }
  table.appendChild(windRow);

  // ── Row 7: Wind gusts ──
  if (gustSpeed) {
    const gustRow = document.createElement('tr');
    gustRow.className = 'fc-row-gusts';
    const gustLabel = document.createElement('td');
    gustLabel.className = 'fc-label';
    gustLabel.innerHTML = `Gusts&nbsp;${unitLabel}`;
    gustRow.appendChild(gustLabel);
    for (let i = 0; i < n; i++) {
      const td = document.createElement('td');
      td.className = 'fc-gust-cell';
      const gust = gustSpeed[i];
      if (isFinite(gust) && gust > 0) {
        td.textContent = Math.round(toUnit(gust));
        td.style.color = windColor(gust);
      }
      gustRow.appendChild(td);
    }
    table.appendChild(gustRow);
  }
}

// ── Process ensemble API response ────────────────────────────────────────────

function processEnsembleTimeseries(json) {
  const timestamps = json.timestamps.map(t => new Date(t));
  const p = json.features[0].properties.parameters;

  const tempP10 = p.t2m_p10 ? p.t2m_p10.data : [];
  const tempP50 = p.t2m_p50 ? p.t2m_p50.data : [];
  const tempP90 = p.t2m_p90 ? p.t2m_p90.data : [];

  const rainP10 = p.rr_p10 ? p.rr_p10.data : [];
  const rainP50 = p.rr_p50 ? p.rr_p50.data : [];
  const rainP90 = p.rr_p90 ? p.rr_p90.data : [];

  const u10 = p.u10m_p10 ? p.u10m_p10.data : [];
  const u50 = p.u10m_p50 ? p.u10m_p50.data : [];
  const u90 = p.u10m_p90 ? p.u10m_p90.data : [];
  const v10 = p.v10m_p10 ? p.v10m_p10.data : [];
  const v50 = p.v10m_p50 ? p.v10m_p50.data : [];
  const v90 = p.v10m_p90 ? p.v10m_p90.data : [];

  const windP10 = u10.map((u, i) => Math.sqrt(u * u + v10[i] * v10[i]));
  const windP50 = u50.map((u, i) => Math.sqrt(u * u + v50[i] * v50[i]));
  const windP90 = u90.map((u, i) => Math.sqrt(u * u + v90[i] * v90[i]));

  return { isEnsemble: true, times: timestamps, tempP10, tempP50, tempP90, rainP10, rainP50, rainP90, windP10, windP50, windP90 };
}

// ── Render ensemble uncertainty charts ───────────────────────────────────────

function renderEnsembleCharts(data) {
  const container = document.getElementById('fc-ensemble-scroll');
  container.innerHTML = '';

  const useKt = windUnit === 'kt';
  const toWind = v => isFinite(v) ? (useKt ? v * MS_TO_KT : v) : v;

  container.appendChild(makeEnsembleChart({
    title: 'Temperature', yUnit: '°C',
    times: data.times,
    p10: data.tempP10, p50: data.tempP50, p90: data.tempP90,
    color: '#ef9a9a', bandFill: 'rgba(239,154,154,0.2)',
    yTickFmt: v => Math.round(v) + '°',
  }));

  container.appendChild(makeEnsembleChart({
    title: 'Precipitation', yUnit: 'mm',
    times: data.times,
    p10: data.rainP10, p50: data.rainP50, p90: data.rainP90,
    color: '#64b5f6', bandFill: 'rgba(100,181,246,0.22)',
    yMin0: true, yTickFmt: v => v.toFixed(1),
  }));

  container.appendChild(makeEnsembleChart({
    title: 'Wind Speed', yUnit: useKt ? 'kt' : 'm/s',
    times: data.times,
    p10: data.windP10.map(toWind), p50: data.windP50.map(toWind), p90: data.windP90.map(toWind),
    color: '#80cbc4', bandFill: 'rgba(128,203,196,0.2)',
    yMin0: true, yTickFmt: v => Math.round(v),
  }));
}

function makeEnsembleChart({ title, yUnit, times, p10, p50, p90, color, bandFill, yMin0 = false, yTickFmt = v => v }) {
  const W = 700, H = 155;
  const ML = 46, MR = 10, MT = 22, MB = 32;
  const CW = W - ML - MR, CH = H - MT - MB;
  const n = times.length;

  const allVals = [...p10, ...p50, ...p90].filter(isFinite);
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const span = rawMax - rawMin || 1;
  let yLo = yMin0 ? 0 : rawMin - span * 0.12;
  let yHi = rawMax + span * 0.12;
  if (yHi <= yLo) { yLo -= 1; yHi += 1; }

  const xOf = i => ML + (i / Math.max(n - 1, 1)) * CW;
  const clamp = v => Math.max(yLo, Math.min(yHi, v));
  const yOf = v => MT + CH - ((v - yLo) / (yHi - yLo)) * CH;

  const svgNS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', style: 'display:block;overflow:visible' });

  // Title
  svg.appendChild(el('text', {
    x: ML + CW / 2, y: 14, 'text-anchor': 'middle',
    fill: '#bdbdbd', 'font-size': '11', 'font-family': 'inherit', 'font-weight': '600',
  }, `${title} (${yUnit})`));

  // Y-axis grid + ticks
  for (let i = 0; i <= 4; i++) {
    const v = yLo + (yHi - yLo) * (i / 4);
    const y = yOf(v);
    svg.appendChild(el('line', { x1: ML, x2: ML + CW, y1: y, y2: y, stroke: 'rgba(255,255,255,0.07)', 'stroke-width': '1' }));
    svg.appendChild(el('text', {
      x: ML - 5, y: y + 3.5, 'text-anchor': 'end',
      fill: '#7a7a7a', 'font-size': '9', 'font-family': 'inherit',
    }, yTickFmt(v)));
  }

  // X-axis time marks
  const tzOpt = displayTZ === 'UTC' ? 'UTC' : undefined;
  const getH  = d => displayTZ === 'UTC' ? d.getUTCHours()   : d.getHours();
  const getDK = d => d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tzOpt });
  let lastDK = null;
  for (let i = 0; i < n; i++) {
    const h  = getH(times[i]);
    const dk = getDK(times[i]);
    const x  = xOf(i);
    if (dk !== lastDK) {
      svg.appendChild(el('line', { x1: x, x2: x, y1: MT, y2: MT + CH + 5, stroke: 'rgba(255,255,255,0.22)', 'stroke-width': '1' }));
      svg.appendChild(el('text', {
        x: x + 3, y: MT + CH + 18,
        fill: '#bdbdbd', 'font-size': '9', 'font-family': 'inherit', 'font-weight': '600',
      }, dk));
      lastDK = dk;
    } else if (h % 6 === 0) {
      svg.appendChild(el('line', { x1: x, x2: x, y1: MT + CH, y2: MT + CH + 4, stroke: 'rgba(255,255,255,0.12)', 'stroke-width': '1' }));
      svg.appendChild(el('text', {
        x, y: MT + CH + 15, 'text-anchor': 'middle',
        fill: '#5a5a5a', 'font-size': '8', 'font-family': 'inherit',
      }, String(h).padStart(2, '0')));
    }
  }

  // Helper: build SVG path string from a percentile array
  const mkPath = arr => 'M ' + arr.map((v, i) => `${xOf(i).toFixed(1)},${yOf(isFinite(v) ? clamp(v) : yLo).toFixed(1)}`).join(' L ');

  // Shaded band: p10 (left→right) then p90 reversed (right→left)
  const bandPts = [
    ...p10.map((v, i) => `${xOf(i).toFixed(1)},${yOf(isFinite(v) ? clamp(v) : yLo).toFixed(1)}`),
    ...[...p90].reverse().map((v, i) => `${xOf(n - 1 - i).toFixed(1)},${yOf(isFinite(v) ? clamp(v) : yLo).toFixed(1)}`),
  ];
  svg.appendChild(el('path', { d: `M ${bandPts.join(' L ')} Z`, fill: bandFill, stroke: 'none' }));

  // P10 / P90 dashed boundary lines
  svg.appendChild(el('path', { d: mkPath(p10), fill: 'none', stroke: color, 'stroke-width': '0.7', 'stroke-opacity': '0.4', 'stroke-dasharray': '3,2' }));
  svg.appendChild(el('path', { d: mkPath(p90), fill: 'none', stroke: color, 'stroke-width': '0.7', 'stroke-opacity': '0.4', 'stroke-dasharray': '3,2' }));

  // Median line (p50)
  svg.appendChild(el('path', { d: mkPath(p50), fill: 'none', stroke: color, 'stroke-width': '1.8', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  // Chart border
  svg.appendChild(el('rect', { x: ML, y: MT, width: CW, height: CH, fill: 'none', stroke: 'rgba(255,255,255,0.08)', 'stroke-width': '1' }));

  const wrapper = document.createElement('div');
  wrapper.className = 'fc-ens-chart';
  wrapper.appendChild(svg);
  return wrapper;
}

// ── Weather icon helper ──────────────────────────────────────────────────────

function weatherIcon(tcc, rain, hour) {
  const isNight = hour < 6 || hour >= 21;
  if (isFinite(rain) && rain > 0.1) {
    if (rain > 5) return '⛈️';
    if (tcc < 0.5) return '🌦️';
    return '🌧️';
  }
  if (!isFinite(tcc)) return '';
  if (tcc < 0.2)  return isNight ? '🌙' : '☀️';
  if (tcc < 0.5)  return isNight ? '🌙' : '🌤️';
  if (tcc < 0.75) return '⛅';
  if (tcc < 0.9)  return '🌥️';
  return '☁️';
}

// ── Temperature colour ───────────────────────────────────────────────────────

function tempColor(val) {
  const stops = TEMP_STOPS;
  if (val <= stops[0][0]) {
    const [r, g, b] = stops[0][1];
    return `rgba(${r},${g},${b},0.45)`;
  }
  for (let i = 0; i < stops.length - 1; i++) {
    if (val <= stops[i + 1][0]) {
      const f = (val - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      const r = Math.round(stops[i][1][0] + f * (stops[i + 1][1][0] - stops[i][1][0]));
      const g = Math.round(stops[i][1][1] + f * (stops[i + 1][1][1] - stops[i][1][1]));
      const b = Math.round(stops[i][1][2] + f * (stops[i + 1][1][2] - stops[i][1][2]));
      return `rgba(${r},${g},${b},0.45)`;
    }
  }
  const [r, g, b] = stops[stops.length - 1][1];
  return `rgba(${r},${g},${b},0.45)`;
}

// ── Wind arrow SVG ───────────────────────────────────────────────────────────

function windArrowSVG(speed, dir) {
  const svgNS = 'http://www.w3.org/2000/svg';
  // Arrow points in the direction wind blows TO (dir + 180)
  const toDeg = isFinite(dir) ? (dir + 180) % 360 : 0;

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '-7 -7 14 14');
  svg.style.transform = `rotate(${toDeg}deg)`;

  const color = windColor(speed);
  const poly = document.createElementNS(svgNS, 'polygon');
  poly.setAttribute('points', '0,-5 3,4 0,2 -3,4');
  poly.setAttribute('fill', color);
  svg.appendChild(poly);

  return svg;
}

function windColor(speed) {
  const stops = WIND_STOPS;
  if (speed <= stops[0][0]) return `rgb(${stops[0][1].join(',')})`;
  for (let i = 0; i < stops.length - 1; i++) {
    if (speed <= stops[i + 1][0]) {
      const f = (speed - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      const r = Math.round(stops[i][1][0] + f * (stops[i + 1][1][0] - stops[i][1][0]));
      const g = Math.round(stops[i][1][1] + f * (stops[i + 1][1][1] - stops[i][1][1]));
      const b = Math.round(stops[i][1][2] + f * (stops[i + 1][1][2] - stops[i][1][2]));
      return `rgb(${r},${g},${b})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1].join(',')})`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}
