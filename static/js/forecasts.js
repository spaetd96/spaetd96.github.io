/* global L, Chart */
'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const API_BASE    = 'https://dataset.api.hub.geosphere.at/v1';
const RESOURCE    = 'nowcast-v1-15min-1km';

// ── Eager preloads — start BEFORE DOM is ready ──────────────────────────────
// netcdfjs module download (~200 KB) and metadata API call run in parallel
// with page rendering, saving 1-2 s each.
const _netcdf = import('https://esm.sh/netcdfjs@2.0.0');
let _metaCache = null;  // filled by prefetch, consumed by loadForecast
const _metaPrefetch = fetch(`${API_BASE}/grid/forecast/${RESOURCE}/metadata`)
  .then(r => r.json())
  .then(m => { _metaCache = m; return m; })
  .catch(() => null);
const BBOX        = [[45.5028, 8.0981], [49.4782, 17.7423]];  // [[S,W],[N,E]] WGS84
const BBOX_PARAM  = '45.5028,8.0981,49.4782,17.7423';
const ARROW_STRIDE = 14;

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

// ── Custom Leaflet raster layer — draws ImageData directly, zero encoding ────

const RasterLayer = L.Layer.extend({
  initialize(bounds, opacity) {
    this._latlngBounds = L.latLngBounds(bounds);
    this._opacity = (opacity !== undefined) ? opacity : 0.85;
    this._canvas  = document.createElement('canvas');
    this._ctx     = this._canvas.getContext('2d');
    this._canvas.style.cssText = 'position:absolute;pointer-events:none;';
    this._canvas.style.opacity = String(this._opacity);
  },
  onAdd(map) {
    this._map = map;
    map.getPanes().overlayPane.appendChild(this._canvas);
    map.on('zoom viewreset moveend', this._reposition, this);
    this._reposition();
    return this;
  },
  onRemove(map) {
    if (this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    map.off('zoom viewreset moveend', this._reposition, this);
    return this;
  },
  _reposition() {
    const nw = this._map.latLngToLayerPoint(this._latlngBounds.getNorthWest());
    const se = this._map.latLngToLayerPoint(this._latlngBounds.getSouthEast());
    L.DomUtil.setPosition(this._canvas, nw);
    this._canvas.style.width  = (se.x - nw.x) + 'px';
    this._canvas.style.height = (se.y - nw.y) + 'px';
  },
  putFrame(imageData) {
    if (this._canvas.width  !== imageData.width)  this._canvas.width  = imageData.width;
    if (this._canvas.height !== imageData.height) this._canvas.height = imageData.height;
    this._ctx.putImageData(imageData, 0, 0);
    this._reposition();
  },
});

// ── State ────────────────────────────────────────────────────────────────────

let map;
let rasterLayer     = null;   // RasterLayer instance for variable raster
let arrowLayerObj   = null;   // RasterLayer instance for wind arrows
let pinMarker       = null;
let chartInstance   = null;
let gridCache       = null;   // { variable, data3d, nx, ny, missing, dirData }
let windDirCache    = null;   // typed array slices for dd per timestep
let imageDataCache  = [];     // ImageData per timestep (main raster)
let arrowDataCache  = [];     // ImageData per timestep (wind arrows)
let timestamps      = [];     // ISO strings for each timestep
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
    minZoom: 7,
    maxZoom: 12,
    zoomControl: false,
    maxBounds: [[44.0, 6.0], [51.5, 20.5]],
    maxBoundsViscosity: 1.0,
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

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
    showTimestep(currentTimestep);
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
  imageDataCache = [];
  arrowDataCache = [];
  if (rasterLayer)   { rasterLayer.remove();   rasterLayer   = null; }
  if (arrowLayerObj) { arrowLayerObj.remove();  arrowLayerObj = null; }

  try {
    // 1. Get metadata (likely already cached from prefetch)
    const meta = _metaCache || await _metaPrefetch || await fetchJSON(`${API_BASE}/grid/forecast/${RESOURCE}/metadata`);
    const reftime = meta.last_forecast_reftime;
    buildTimestamps(reftime, meta.forecast_length);
    updateInfoBox(variable, reftime);

    const params = variable === 'ff' ? 'ff,dd' : variable;

    // 2. Phase 1: fetch ONLY the first timestep — ~1/13th the data, much faster
    const t0Url = `${API_BASE}/grid/forecast/${RESOURCE}` +
                  `?parameters=${params}&bbox=${BBOX_PARAM}&output_format=netcdf` +
                  `&start=${encodeURIComponent(reftime)}&end=${encodeURIComponent(reftime)}`;

    const t0Buf = await fetchBinary(t0Url);
    const t0    = await tryParseNetCDF(t0Buf, variable);

    if (t0) {
      gridCache    = t0;
      windDirCache = t0.dirData || null;
    } else {
      gridCache    = await fetchGeoJSONSlice(variable, 0);
      windDirCache = null;
    }

    // 3. Render and show T0 immediately — user sees data NOW
    currentTimestep = 0;
    document.getElementById('fc-time-slider').value = 0;
    imageDataCache[0] = renderSliceToImageData(0, variable);
    if (variable === 'ff' && windDirCache) {
      arrowDataCache[0] = renderArrowsToImageData(0);
    }
    showTimestep(0);
    updateTimeLabel();
    drawColorbar(variable);
    setLoading(false);  // spinner gone, data visible

    // 4. Phase 2: fetch ALL timesteps in the background
    fetchRemainingTimesteps(variable, params);
  } catch (err) {
    console.error('Forecast load error:', err);
    setLoading(false);
  }
}

// Background: fetch full 13-timestep NetCDF, parse, render all frames.
async function fetchRemainingTimesteps(variable, params) {
  try {
    const fullUrl = `${API_BASE}/grid/forecast/${RESOURCE}` +
                    `?parameters=${params}&bbox=${BBOX_PARAM}&output_format=netcdf`;
    const fullBuf = await fetchBinary(fullUrl);
    const full    = await tryParseNetCDF(fullBuf, variable);
    if (!full) return;

    gridCache    = full;
    windDirCache = full.dirData || null;

    const nt = full.data3d.length;
    for (let t = 0; t < nt; t++) {
      imageDataCache[t] = renderSliceToImageData(t, variable);
      if (variable === 'ff' && windDirCache) {
        arrowDataCache[t] = renderArrowsToImageData(t);
      }
      if (t > 0) await yieldFrame();
    }
    // Refresh current view with potentially updated T0 from full dataset
    showTimestep(currentTimestep);
  } catch (err) {
    console.error('Background fetch error:', err);
  }
}

async function tryParseNetCDF(buffer, variable) {
  try {
    const { NetCDFReader } = await _netcdf;
    const reader = new NetCDFReader(buffer);
    const varObj = reader.getDataVariable(variable);
    if (!varObj) return null;

    const dims = reader.variables.find(v => v.name === variable).dimensions;
    const dimSizes = dims.map(d => reader.dimensions.find(dim => dim.name === d).size);

    let nx, ny, nt;
    if (dimSizes.length === 3) {
      [nt, ny, nx] = dimSizes;
    } else {
      nt = 1;
      [ny, nx] = dimSizes;
    }

    const attrs = reader.variables.find(v => v.name === variable).attributes;
    const missingAttr = attrs.find(a => a.name === '_FillValue' || a.name === 'missing_value');
    const missing = missingAttr ? missingAttr.value : null;

    // Use subarray to avoid copying the full typed array
    const flatSrc = varObj;
    const sliceSize = ny * nx;
    const data3d = [];
    for (let t = 0; t < nt; t++) {
      data3d.push(flatSrc.subarray
        ? flatSrc.subarray(t * sliceSize, (t + 1) * sliceSize)
        : flatSrc.slice(t * sliceSize, (t + 1) * sliceSize));
    }

    // Parse wind direction (dd) when variable is ff
    let dirData = null;
    if (variable === 'ff') {
      const ddObj = reader.getDataVariable('dd');
      if (ddObj) {
        dirData = [];
        for (let t = 0; t < nt; t++) {
          dirData.push(ddObj.subarray
            ? ddObj.subarray(t * sliceSize, (t + 1) * sliceSize)
            : ddObj.slice(t * sliceSize, (t + 1) * sliceSize));
        }
      }
    }

    return { variable, data3d, nx, ny, missing, dirData };
  } catch (e) {
    console.warn('NetCDF parse failed, will fall back to GeoJSON:', e.message);
    return null;
  }
}

async function fetchGeoJSONSlice(variable, timestepIndex) {
  // Fetch single timestep as GeoJSON (fallback path)
  const start = timestamps[timestepIndex];
  const end   = start;
  const url   = `${API_BASE}/grid/forecast/${RESOURCE}` +
                `?parameters=${variable}&bbox=${BBOX_PARAM}&output_format=geojson` +
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

// Build a 256-entry RGB lookup table for a given colour stop array (avoids
// calling interpolateColor for every pixel — big speedup for 172K cells).
function buildColorLUT(stops) {
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = interpolateColor(stops, i / 255);
    lut[i * 3]     = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
}

// Synchronous: pixel math only, no canvas encoding — returns ImageData directly.
function renderSliceToImageData(t, variable) {
  const { data3d, nx, ny, missing } = gridCache;
  const slice = data3d[Math.min(t, data3d.length - 1)];
  const meta  = VAR_META[variable];
  const lut   = buildColorLUT(meta.stops);
  const range = meta.max - meta.min;

  const imgData = new ImageData(nx, ny);
  const d = imgData.data;

  for (let i = 0; i < ny * nx; i++) {
    const val = slice[i];
    const idx = i * 4;
    if ((missing !== null && val === missing) || !isFinite(val)) {
      d[idx + 3] = 0;
    } else {
      const frac = Math.max(0, Math.min(1, (val - meta.min) / range));
      const li   = Math.round(frac * 255) * 3;
      d[idx]     = lut[li];
      d[idx + 1] = lut[li + 1];
      d[idx + 2] = lut[li + 2];
      d[idx + 3] = 200;
    }
  }
  return imgData;
}

// Synchronous: draw arrows on a hidden canvas, read back pixels via getImageData.
function renderArrowsToImageData(t) {
  const { nx, ny } = gridCache;
  const ffSlice = gridCache.data3d[Math.min(t, gridCache.data3d.length - 1)];
  const ddSlice = windDirCache[Math.min(t, windDirCache.length - 1)];
  const meta    = VAR_META['ff'];

  const canvas = document.createElement('canvas');
  canvas.width  = nx;
  canvas.height = ny;
  const ctx = canvas.getContext('2d');

  const stride   = ARROW_STRIDE;
  const arrowLen = stride * 0.7;

  for (let row = Math.floor(stride / 2); row < ny; row += stride) {
    for (let col = Math.floor(stride / 2); col < nx; col += stride) {
      const i     = row * nx + col;
      const speed = ffSlice[i];
      const dir   = ddSlice ? ddSlice[i] : NaN;
      if (!isFinite(speed) || !isFinite(dir) || speed < 0.3) continue;

      const frac = Math.max(0, Math.min(1, speed / meta.max));
      const [r, g, b] = interpolateColor(meta.stops, frac);
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.fillStyle   = `rgb(${r},${g},${b})`;
      ctx.lineWidth   = 1.4;

      const toRad = ((dir + 180) % 360) * Math.PI / 180;
      const dx = Math.sin(toRad) * arrowLen / 2;
      const dy = -Math.cos(toRad) * arrowLen / 2;

      const tx = col - dx;  const ty = row - dy;
      const hx = col + dx;  const hy = row + dy;

      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();

      const headLen = arrowLen * 0.35;
      const backAng = 0.45;
      const angle   = Math.atan2(hy - ty, hx - tx);
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - headLen * Math.cos(angle - backAng), hy - headLen * Math.sin(angle - backAng));
      ctx.lineTo(hx - headLen * Math.cos(angle + backAng), hy - headLen * Math.sin(angle + backAng));
      ctx.closePath();
      ctx.fill();
    }
  }

  return ctx.getImageData(0, 0, nx, ny);
}

function showTimestep(t) {
  const imgData = imageDataCache[t];
  if (!imgData) return;

  if (!rasterLayer) {
    rasterLayer = new RasterLayer(BBOX, 0.85).addTo(map);
  }
  rasterLayer.putFrame(imgData);

  if (currentVar === 'ff' && arrowDataCache[t]) {
    if (!arrowLayerObj) {
      arrowLayerObj = new RasterLayer(BBOX, 1.0).addTo(map);
    }
    arrowLayerObj.putFrame(arrowDataCache[t]);
  } else if (currentVar !== 'ff' && arrowLayerObj) {
    arrowLayerObj.remove();
    arrowLayerObj = null;
  }
}

function yieldFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
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
    const fetchParams = currentVar === 'ff' ? 'ff,dd' : currentVar;
    const url = `${API_BASE}/timeseries/forecast/${RESOURCE}` +
                `?lat_lon=${lat.toFixed(4)},${lng.toFixed(4)}` +
                `&parameters=${fetchParams}`;
    const json = await fetchJSON(url);
    renderChart(json, currentVar);
  } catch (err) {
    console.error('Timeseries fetch error:', err);
  }
}

function renderChart(json, variable) {
  // GeoSphere timeseries response: json.timestamps [], json.features[0].properties.parameters
  const times  = json.timestamps.map(t => new Date(t).toISOString().slice(11, 16) + ' UTC');
  const params = json.features[0].properties.parameters;

  const canvas = document.getElementById('fc-chart');
  if (chartInstance) chartInstance.destroy();

  if (variable === 't2m') {
    const vals = (params.t2m && params.t2m.data) ? params.t2m.data : [];
    chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: times,
        datasets: [{
          label: 'Temperature (°C)',
          data: vals,
          borderColor: '#e53935',
          backgroundColor: 'rgba(229,57,53,0.1)',
          tension: 0.3,
          pointRadius: 2,
          fill: true,
        }],
      },
      options: singleAxisOptions('°C', '#e53935', null),
    });
    document.getElementById('fc-compass-row').innerHTML = '';

  } else if (variable === 'rr') {
    const vals = (params.rr && params.rr.data) ? params.rr.data : [];
    chartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: times,
        datasets: [{
          label: 'Precipitation (kg m⁻²)',
          data: vals,
          backgroundColor: 'rgba(30,136,229,0.6)',
          borderColor: '#1e88e5',
          borderWidth: 1,
        }],
      },
      options: singleAxisOptions('kg m⁻²', '#1e88e5', 0),
    });
    document.getElementById('fc-compass-row').innerHTML = '';

  } else if (variable === 'ff') {
    const speedVals = (params.ff && params.ff.data) ? params.ff.data : [];
    const dirVals   = (params.dd && params.dd.data) ? params.dd.data : [];
    chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: times,
        datasets: [{
          label: 'Wind Speed (m s⁻¹)',
          data: speedVals,
          borderColor: '#fb8c00',
          backgroundColor: 'rgba(251,140,0,0.1)',
          tension: 0.3,
          pointRadius: 2,
          fill: true,
        }],
      },
      options: singleAxisOptions('m s⁻¹', '#fb8c00', 0),
    });
    buildCompassRow(times, speedVals, dirVals);
  }
}

function singleAxisOptions(unit, color, yMin) {
  const yOpts = {
    type: 'linear', position: 'left',
    ticks: { color, font: { size: 9 } },
    grid:  { color: 'rgba(255,255,255,0.06)' },
    title: { display: true, text: unit, color, font: { size: 9 } },
  };
  if (yMin !== null) yOpts.min = yMin;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { labels: { color: '#bdbdbd', font: { size: 10 }, boxWidth: 12 } },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: {
        ticks: { color: '#9e9e9e', font: { size: 9 }, maxTicksLimit: 7 },
        grid:  { color: 'rgba(255,255,255,0.06)' },
      },
      y: yOpts,
    },
  };
}

function buildCompassRow(times, speedVals, dirVals) {
  const row  = document.getElementById('fc-compass-row');
  row.innerHTML = '';
  const meta = VAR_META['ff'];
  const svgNS = 'http://www.w3.org/2000/svg';

  times.forEach((time, i) => {
    const speed = speedVals[i];
    const dir   = dirVals[i];
    const item  = document.createElement('div');
    item.className = 'fc-compass-item';
    item.title = `${time}\nSpeed: ${isFinite(speed) ? speed.toFixed(1) : '—'} m/s\nFrom: ${isFinite(dir) ? Math.round(dir) + '°' : '—'}`;

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '-10 -10 20 20');

    if (!isFinite(speed) || !isFinite(dir) || speed < 0.5) {
      const circle = document.createElementNS(svgNS, 'circle');
      circle.setAttribute('r', '3');
      circle.setAttribute('fill', '#888');
      svg.appendChild(circle);
    } else {
      const frac = Math.max(0, Math.min(1, speed / meta.max));
      const [r, g, b] = interpolateColor(meta.stops, frac);
      const col = `rgb(${r},${g},${b})`;

      const toRad = ((dir + 180) % 360) * Math.PI / 180;
      const ax = Math.sin(toRad) * 7;
      const ay = -Math.cos(toRad) * 7;

      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', (-ax * 0.5).toFixed(1));
      line.setAttribute('y1', (-ay * 0.5).toFixed(1));
      line.setAttribute('x2', (ax * 0.5).toFixed(1));
      line.setAttribute('y2', (ay * 0.5).toFixed(1));
      line.setAttribute('stroke', col);
      line.setAttribute('stroke-width', '1.5');
      svg.appendChild(line);

      const hLen  = 3.5;
      const bAng  = 0.45;
      const angle = Math.atan2(ay, ax);
      const poly  = document.createElementNS(svgNS, 'polygon');
      const tip   = `${(ax * 0.5).toFixed(1)},${(ay * 0.5).toFixed(1)}`;
      const l1    = `${((ax*0.5) - hLen*Math.cos(angle-bAng)).toFixed(1)},${((ay*0.5) - hLen*Math.sin(angle-bAng)).toFixed(1)}`;
      const l2    = `${((ax*0.5) - hLen*Math.cos(angle+bAng)).toFixed(1)},${((ay*0.5) - hLen*Math.sin(angle+bAng)).toFixed(1)}`;
      poly.setAttribute('points', `${tip} ${l1} ${l2}`);
      poly.setAttribute('fill', col);
      svg.appendChild(poly);
    }

    item.appendChild(svg);
    row.appendChild(item);
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
