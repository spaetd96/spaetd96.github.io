/* global L, Chart */
'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const API_BASE   = 'https://dataset.api.hub.geosphere.at/v1';
const RESOURCE   = 'nowcast-v1-15min-1km';
const AUSTRIA_BOUNDS = [[45.5028, 8.0981], [49.4782, 17.7423]];  // SW, NE WGS84

const VAR_META = {
  t2m: {
    label:  'Air Temperature 2 m above ground',
    unit:   '°C',
    min:    -20,
    max:    40,
    stops:  [
      [0.00, [  0,   0, 180]],  // deep blue
      [0.25, [  0, 140, 220]],  // sky blue
      [0.50, [ 60, 200,  60]],  // green
      [0.75, [240, 210,   0]],  // yellow
      [1.00, [220,   0,   0]],  // red
    ],
  },
  rr: {
    label:  'Precipitation Sum',
    unit:   'kg m⁻²',
    min:    0,
    max:    10,
    stops:  [
      [0.00, [240, 240, 255]],  // near-white
      [0.30, [100, 160, 240]],  // sky blue
      [0.65, [ 20,  80, 200]],  // blue
      [1.00, [  0,  20, 100]],  // dark navy
    ],
  },
  ff: {
    label:  'Wind Speed 10 m above ground',
    unit:   'm s⁻¹',
    min:    0,
    max:    30,
    stops:  [
      [0.00, [240, 240, 240]],  // near-white
      [0.33, [240, 200,  50]],  // yellow
      [0.67, [230, 100,  10]],  // orange
      [1.00, [180,   0,   0]],  // dark red
    ],
  },
};

// ── State ────────────────────────────────────────────────────────────────────

let map;
let overlayLayer    = null;
let pinMarker       = null;
let chartInstance   = null;
let gridCache       = null;    // { variable, data3d, nx, ny, missing }
let timestamps      = [];      // ISO strings for each timestep
let currentTimestep = 0;
let currentVar      = 't2m';

// ── Initialise ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initControls();
  loadForecast('t2m');
});

function initMap() {
  map = L.map('fc-map', {
    center: [47.5, 13.0],
    zoom: 7,
    minZoom: 5,
    maxZoom: 12,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map);

  map.on('click', onMapClick);
}

function initControls() {
  document.getElementById('fc-var-select').addEventListener('change', (e) => {
    currentVar      = e.target.value;
    currentTimestep = 0;
    document.getElementById('fc-time-slider').value = 0;
    loadForecast(currentVar);
  });

  document.getElementById('fc-time-slider').addEventListener('input', (e) => {
    currentTimestep = parseInt(e.target.value, 10);
    if (gridCache) renderOverlay(currentTimestep);
    updateTimeLabel();
  });

  document.getElementById('fc-chart-close').addEventListener('click', () => {
    document.getElementById('fc-chart-panel').classList.add('hidden');
    if (pinMarker) { pinMarker.remove(); pinMarker = null; }
  });
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadForecast(variable) {
  setLoading(true);
  try {
    // 1. Fetch metadata for latest reference time
    const meta = await fetchJSON(`${API_BASE}/grid/forecast/${RESOURCE}/metadata`);
    const reftime = meta.last_forecast_reftime;
    buildTimestamps(reftime, meta.forecast_length);
    updateInfoBox(variable, reftime);

    // 2. Try NetCDF first; fall back to per-timestep GeoJSON if parsing fails
    const bbox = '45.5,8.0981,49.4782,17.7423';
    const url  = `${API_BASE}/grid/forecast/${RESOURCE}` +
                 `?parameters=${variable}&bbox=${bbox}&output_format=netcdf`;

    const buffer = await fetchBinary(url);
    const parsed = await tryParseNetCDF(buffer, variable);

    if (parsed) {
      gridCache = parsed;
    } else {
      // Fallback: fetch GeoJSON for timestep 0 only
      gridCache = await fetchGeoJSONSlice(variable, 0);
    }

    currentTimestep = 0;
    document.getElementById('fc-time-slider').value = 0;
    renderOverlay(0);
    drawColorbar(variable);
    updateTimeLabel();
  } catch (err) {
    console.error('Forecast load error:', err);
  } finally {
    setLoading(false);
  }
}

async function tryParseNetCDF(buffer, variable) {
  try {
    const { NetCDFReader } = await import('https://esm.sh/netcdfjs@2.0.0');
    const reader = new NetCDFReader(buffer);
    const varObj = reader.getDataVariable(variable);
    if (!varObj) return null;

    // Dimensions: time × y × x  (or y × x if only one timestep)
    const dims = reader.variables.find(v => v.name === variable).dimensions;
    const dimSizes = dims.map(d => reader.dimensions.find(dim => dim.name === d).size);

    let nx, ny, nt;
    if (dimSizes.length === 3) {
      [nt, ny, nx] = dimSizes;
    } else {
      nt = 1;
      [ny, nx] = dimSizes;
    }

    // Locate fill/missing value
    const attrs = reader.variables.find(v => v.name === variable).attributes;
    const missingAttr = attrs.find(a => a.name === '_FillValue' || a.name === 'missing_value');
    const missing = missingAttr ? missingAttr.value : null;

    // Build 3D array (nt × ny × nx)  flat Float32 slices
    const flat = Array.from(varObj);
    const sliceSize = ny * nx;
    const data3d = [];
    for (let t = 0; t < nt; t++) {
      data3d.push(flat.slice(t * sliceSize, (t + 1) * sliceSize));
    }

    return { variable, data3d, nx, ny, missing };
  } catch (e) {
    console.warn('NetCDF parse failed, will fall back to GeoJSON:', e.message);
    return null;
  }
}

async function fetchGeoJSONSlice(variable, timestepIndex) {
  // Fetch single timestep as GeoJSON (fallback path)
  const bbox  = '45.5,8.0981,49.4782,17.7423';
  const start = timestamps[timestepIndex];
  const end   = start;
  const url   = `${API_BASE}/grid/forecast/${RESOURCE}` +
                `?parameters=${variable}&bbox=${bbox}&output_format=geojson` +
                `&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

  const json = await fetchJSON(url);

  // Convert GeoJSON FeatureCollection to a 2D flat array
  // GeoJSON grid from GeoSphere: each Feature is one cell; value in properties[variable][0]
  const features = json.features;
  if (!features || features.length === 0) throw new Error('Empty GeoJSON');

  // Determine grid size from bounding box
  const lats = [...new Set(features.map(f => f.geometry.coordinates[1]))].sort((a, b) => b - a);
  const lons = [...new Set(features.map(f => f.geometry.coordinates[0]))].sort((a, b) => a - b);
  const ny = lats.length;
  const nx = lons.length;

  const flat = new Float32Array(ny * nx).fill(NaN);
  for (const f of features) {
    const [lon, lat] = f.geometry.coordinates;
    const yi = lats.indexOf(lat);
    const xi = lons.indexOf(lon);
    if (yi >= 0 && xi >= 0) flat[yi * nx + xi] = f.properties[variable][0];
  }

  return { variable, data3d: [flat], nx, ny, missing: null };
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderOverlay(timestepIndex) {
  if (!gridCache) return;
  const { data3d, nx, ny, missing } = gridCache;

  // Choose slice; if only 1 timestep cached (GeoJSON fallback) always use 0
  const slice = data3d[Math.min(timestepIndex, data3d.length - 1)];
  const meta  = VAR_META[currentVar];

  const canvas = document.createElement('canvas');
  canvas.width  = nx;
  canvas.height = ny;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(nx, ny);

  for (let i = 0; i < ny * nx; i++) {
    const val = slice[i];
    const isMissing = (missing !== null && val === missing) || !isFinite(val);
    const idx = i * 4;
    if (isMissing) {
      img.data[idx + 3] = 0;   // transparent
    } else {
      const t = Math.max(0, Math.min(1, (val - meta.min) / (meta.max - meta.min)));
      const [r, g, b] = interpolateColor(meta.stops, t);
      img.data[idx]     = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 200;  // semi-transparent
    }
  }

  ctx.putImageData(img, 0, 0);
  const dataURL = canvas.toDataURL();

  if (overlayLayer) {
    overlayLayer.setUrl(dataURL);
  } else {
    overlayLayer = L.imageOverlay(dataURL, AUSTRIA_BOUNDS, { opacity: 0.85 }).addTo(map);
  }
}

// ── Colorbar ─────────────────────────────────────────────────────────────────

function drawColorbar(variable) {
  const meta   = VAR_META[variable];
  const canvas = document.getElementById('fc-colorbar-canvas');
  const width  = canvas.width;
  const height = canvas.height;
  const ctx    = canvas.getContext('2d');

  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    const [r, g, b] = interpolateColor(meta.stops, t);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, 0, 1, height);
  }

  // Tick labels
  const ticksContainer = document.getElementById('fc-colorbar-ticks');
  ticksContainer.innerHTML = '';
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const t   = i / tickCount;
    const val = meta.min + t * (meta.max - meta.min);
    const span = document.createElement('span');
    span.textContent = Number.isInteger(val) ? val : val.toFixed(1);
    ticksContainer.appendChild(span);
  }

  document.getElementById('fc-colorbar-unit').textContent = meta.unit;
}

// ── Info box ─────────────────────────────────────────────────────────────────

function updateInfoBox(variable, reftime) {
  const meta = VAR_META[variable];
  document.getElementById('fc-info-variable').textContent = meta.label;
  const d = new Date(reftime);
  document.getElementById('fc-info-reftime').textContent =
    `Reference time: ${d.toISOString().replace('T', ' ').replace('+00:00', ' UTC')}`;
}

// ── Time helpers ─────────────────────────────────────────────────────────────

function buildTimestamps(reftime, forecastLength) {
  const base = new Date(reftime).getTime();
  timestamps = [];
  for (let i = 0; i < forecastLength; i++) {
    timestamps.push(new Date(base + i * 15 * 60 * 1000).toISOString());
  }
  const slider = document.getElementById('fc-time-slider');
  slider.max = forecastLength - 1;
}

function updateTimeLabel() {
  if (!timestamps.length) return;
  const iso = timestamps[currentTimestep] || '';
  if (!iso) return;
  const d = new Date(iso);
  const hhmm = d.toISOString().slice(11, 16);
  const dd   = d.toISOString().slice(0, 10);
  const offsetMin = currentTimestep * 15;
  const label = `${dd} ${hhmm} UTC  (+${offsetMin} min)`;
  document.getElementById('fc-time-label').textContent = label;
}

// ── Map click → timeseries chart ─────────────────────────────────────────────

async function onMapClick(e) {
  const { lat, lng } = e.latlng;

  if (pinMarker) pinMarker.remove();
  pinMarker = L.circleMarker([lat, lng], {
    radius: 6,
    color: '#26a69a',
    fillColor: '#26a69a',
    fillOpacity: 0.9,
    weight: 2,
  }).addTo(map);

  document.getElementById('fc-chart-location').textContent =
    `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E`;
  document.getElementById('fc-chart-panel').classList.remove('hidden');

  try {
    const url = `${API_BASE}/timeseries/forecast/${RESOURCE}` +
                `?lat_lon=${lat.toFixed(4)},${lng.toFixed(4)}` +
                `&parameters=t2m,rr,ff`;
    const json = await fetchJSON(url);
    renderChart(json);
  } catch (err) {
    console.error('Timeseries fetch error:', err);
  }
}

function renderChart(json) {
  // GeoSphere timeseries response: json.timestamps [], json.features[0].properties.parameters
  const times = json.timestamps.map(t => new Date(t).toISOString().slice(11, 16) + ' UTC');
  const params = json.features[0].properties.parameters;

  const t2mVals = (params.t2m && params.t2m.data) ? params.t2m.data : [];
  const rrVals  = (params.rr  && params.rr.data)  ? params.rr.data  : [];
  const ffVals  = (params.ff  && params.ff.data)  ? params.ff.data  : [];

  const canvas = document.getElementById('fc-chart');

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: times,
      datasets: [
        {
          label: 'Temperature (°C)',
          data: t2mVals,
          borderColor: '#e53935',
          backgroundColor: 'rgba(229,57,53,0.1)',
          yAxisID: 'yT',
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: 'Precipitation (kg m⁻²)',
          data: rrVals,
          borderColor: '#1e88e5',
          backgroundColor: 'rgba(30,136,229,0.15)',
          yAxisID: 'yR',
          tension: 0.3,
          pointRadius: 2,
          fill: true,
        },
        {
          label: 'Wind Speed (m s⁻¹)',
          data: ffVals,
          borderColor: '#fb8c00',
          backgroundColor: 'rgba(251,140,0,0.1)',
          yAxisID: 'yW',
          tension: 0.3,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          labels: { color: '#bdbdbd', font: { size: 10 }, boxWidth: 12 },
        },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: {
          ticks: { color: '#9e9e9e', font: { size: 9 }, maxTicksLimit: 7 },
          grid:  { color: 'rgba(255,255,255,0.06)' },
        },
        yT: {
          type: 'linear', position: 'left',
          ticks: { color: '#e53935', font: { size: 9 } },
          grid:  { color: 'rgba(255,255,255,0.06)' },
          title: { display: true, text: '°C', color: '#e53935', font: { size: 9 } },
        },
        yR: {
          type: 'linear', position: 'right',
          ticks: { color: '#1e88e5', font: { size: 9 } },
          grid:  { drawOnChartArea: false },
          title: { display: true, text: 'kg m⁻²', color: '#1e88e5', font: { size: 9 } },
        },
        yW: {
          type: 'linear', position: 'right',
          ticks: { color: '#fb8c00', font: { size: 9 } },
          grid:  { drawOnChartArea: false },
          title: { display: true, text: 'm s⁻¹', color: '#fb8c00', font: { size: 9 } },
          offset: true,
        },
      },
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function interpolateColor(stops, t) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + f * (c1[0] - c0[0])),
        Math.round(c0[1] + f * (c1[1] - c0[1])),
        Math.round(c0[2] + f * (c1[2] - c0[2])),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function fetchBinary(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.arrayBuffer();
}

function setLoading(on) {
  const spinner  = document.getElementById('fc-spinner');
  const slider   = document.getElementById('fc-time-slider');
  const selector = document.getElementById('fc-var-select');
  if (on) {
    spinner.classList.remove('hidden');
    slider.disabled   = true;
    selector.disabled = true;
  } else {
    spinner.classList.add('hidden');
    slider.disabled   = false;
    selector.disabled = false;
  }
}
