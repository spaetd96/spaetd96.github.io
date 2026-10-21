/* global L */
'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const API_BASE = 'https://dataset.api.hub.geosphere.at/v1';
const OPENMETEO_BASE = 'https://api.open-meteo.com/v1/forecast';

const MODELS = {
  ifs: {
    label:    'IFS HRES',
    desc:     'ECMWF IFS HRES · hourly up to 10 days · 9 km grid · updated every 6 h · global coverage',
    dataUrl:  'https://open-meteo.com/en/docs/ecmwf-api',
    hasCloudCover: true,
    isOpenMeteo:   true,
    openMeteoBase:  'https://api.open-meteo.com/v1/ecmwf',
    openMeteoModel: null,  // dedicated endpoint; no models= param needed
    openMeteoDays:  10,
    creditHtml: '<a href="https://www.ecmwf.int/en/forecasts/datasets/open-data" target="_blank" rel="noopener">ECMWF IFS HRES</a> via <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>',
  },
  icon_ch: {
    label:    'ICON-CH',
    desc:     'MeteoSwiss ICON-CH1 (1 km, 33 h) + ICON-CH2 (2 km, 5 days) · merged forecast · covers Central Europe',
    dataUrl:  'https://open-meteo.com/en/docs/meteoswiss-api',
    hasCloudCover: true,
    isOpenMeteo:   true,
    isMerged:      true,
    // CH1: 1km, ~33h; CH2: 2km, 5 days – fetched separately and stitched
    mergeModels: [
      { openMeteoModel: 'meteoswiss_icon_ch1', openMeteoDays: 2, label: 'ICON-CH1' },
      { openMeteoModel: 'meteoswiss_icon_ch2', openMeteoDays: 5, label: 'ICON-CH2' },
    ],
    creditHtml: '<a href="https://www.meteoswiss.admin.ch/weather/warning-and-forecasting-systems/icon-forecasting-systems.html" target="_blank" rel="noopener">MeteoSwiss ICON-CH1/CH2</a> via <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>',
  },
  arome: {
    resource: 'nwp-v2-1h-1km',
    label:    'C-LAEF AlpeAdria',
    desc:     'Short-range weather forecast · hourly steps up to 60 h · 1 km grid · temperature, rain, snow, wind, clouds',
    params:   '2t,rain,sf,10u,10v,tcc,10fg',
    dataUrl:  'https://data.hub.geosphere.at/dataset/nwp-v2-1h-1km',
    doi:      null,
    doiUrl:   null,
    hasCloudCover: true,
    accumulated:   false,
    hasUV:         true,
    hasUVgust:     false,
    tempField:  '2t',
    rainField:  'rain',
    snowField:  'sf',
    snowAccumulated: false,
    windUField: '10u',
    windVField: '10v',
    gustField:  '10fg',
  },
  compare: {
    label:    'Compare',
    desc:     'Side-by-side comparison of IFS HRES, ICON-CH and C-LAEF AlpeAdria forecasts for the same location',
    isCompare: true,
  },
  inca: {
    resource: 'nowcast-v1-15min-1km',
    label:    'INCA Nowcast',
    desc:     'Very short-range nowcast · 15-min steps up to 3 h · 1 km grid · best for the next few hours',
    params:   't2m,rr,ff,dd,fx',
    dataUrl:  'https://data.hub.geosphere.at/dataset/nowcast-v1-15min-1km',
    doi:      null,
    doiUrl:   null,
    hasCloudCover: false,
    accumulated:   false,
    hasUV:         false,
    hasUVgust:     false,
  },
  ensemble: {
    resource: 'ensemble-v2-1h-1km',
    label:    'Ensemble',
    desc:     'Probabilistic forecast showing uncertainty \u00b7 hourly steps up to 60 h \u00b7 range of likely outcomes',
    params:   '2t_p10,2t_p50,2t_p90,tp_p10,tp_p50,tp_p90,10fg_p10,10fg_p50,10fg_p90,tcc_p10,tcc_p50,tcc_p90,10u_p50,10v_p50',
    dataUrl:  'https://data.hub.geosphere.at/dataset/ensemble-v2-1h-1km',
    doi:      null,
    doiUrl:   null,
    isEnsemble: true,
  },
  spartacus: {
    resource: 'spartacus-v3-1d-1km',
    label:    'SPARTACUS daily',
    chipLabel: 'Recent days',
    pastView: 'daily',
    desc:     'Observed daily temperature, precipitation and sunshine for Austria and border areas · 1 km grid · 1961 until yesterday · anomalies vs 1961–1990 or 1991–2020',
    dataUrl:  'https://data.hub.geosphere.at/dataset/spartacus-v3-1d-1km',
    doi:      '10.60669/5cqg-p427',
    doiUrl:   'https://doi.org/10.60669/5cqg-p427',
    isHistorical: true,
  },
  spartacus_m: {
    resource: 'spartacus-v3-1m-1km',
    label:    'SPARTACUS monthly',
    chipLabel: 'Climate since 1961',
    pastView: 'monthly',
    desc:     'Observed monthly temperature, precipitation and sunshine since 1961 · 1 km grid · warming stripes, trends and recent months vs 1961–1990 or 1991–2020',
    dataUrl:  'https://data.hub.geosphere.at/dataset/spartacus-v3-1m-1km',
    doi:      '10.60669/34gw-b457',
    doiUrl:   'https://doi.org/10.60669/34gw-b457',
    isHistorical: true,
  },
  snowgrid: {
    resource: 'snowgrid_cl-v2-1d-1km',
    label:    'SNOWGRID-CL',
    chipLabel: 'Snow',
    pastView: 'snow',
    desc:     'Modelled daily snow depth since 1961 · 1 km grid · this winter vs normal and snow days per winter',
    dataUrl:  'https://data.hub.geosphere.at/dataset/snowgrid_cl-v2-1d-1km',
    doi:      '10.60669/fsxx-6977',
    doiUrl:   'https://doi.org/10.60669/fsxx-6977',
    isHistorical: true,
  },
  stations: {
    label:    'Stations',
    desc:     'Current weather from ~260 Austrian TAWES stations + South Tyrol (SIAG) stations + Trentino (Meteotrentino) stations · 48 h history for Austrian stations',
    dataUrl:  'https://data.hub.geosphere.at/dataset/tawes-v1-10min',
    dataUrl2: 'https://data.hub.geosphere.at/dataset/tawes-v1-10min',
    doi:      null,
    doiUrl:   null,
    isStation: true,
  },
};

// Tabs in the info box; each tab offers its models as chips
const MODEL_GROUPS = {
  now:      ['stations', 'inca'],
  forecast: ['ifs', 'icon_ch', 'arome', 'compare'],
  past:     ['spartacus', 'spartacus_m', 'snowgrid'],
};
const SELECTABLE_MODELS = Object.values(MODEL_GROUPS).flat();

const MAP_BOUNDS = [[44.0, 6.0], [51.5, 20.5]];
const MAP_MIN_ZOOM = 7, MAP_MAX_ZOOM = 12;

const TAWES_RESOURCE = 'tawes-v1-10min';
const STATION_PARAMS = 'TL,RR,FF,DD,FFX,RF,P,SCHNEE';
const HIST_RESOURCE = 'tawes-v1-10min';
const HIST_PARAMS = 'TL,RF,P,FF,RR';

const MS_TO_KT = 1.94384;

const WIND_UNITS = {
  kmh: { label: 'km/h', factor: 3.6 },
  ms:  { label: 'm/s',  factor: 1 },
  kt:  { label: 'kt',   factor: MS_TO_KT },
};
const WIND_UNIT_ORDER = ['kmh', 'ms', 'kt'];

/** Convert a wind speed in m/s to the selected display unit. */
function windToUnit(ms) {
  return (ms !== null && isFinite(ms)) ? ms * WIND_UNITS[windUnit].factor : ms;
}

function windUnitLabel() {
  return WIND_UNITS[windUnit].label;
}

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

// ── Geo utilities ──────────────────────────────────────────────────────────

/** Haversine distance in km between two lat/lon pairs. */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Wind speed colour stops (m/s → [r,g,b])
const WIND_STOPS = [
  [ 0, [200, 200, 200]],
  [ 5, [240, 200,  50]],
  [15, [230, 100,  10]],
  [30, [180,   0,   0]],
];

// ── State ────────────────────────────────────────────────────────────────────

let map, pinMarker = null, currentModel = 'stations', windUnit = 'kmh', displayTZ = 'local';
let lastForecastData = null;
let lastHistData = null;
let stationMeta = null;
let siagStations = null;
let trentinoStations = null;
let stationMarkerLayer = null;
let nearestStationMarker = null;
let selectedStationMarker = null;
let lastNearestStation = null;
let searchTimeout = null;
let selectedLatLng = null;     // location kept across model switches
let selectedLabel = null;      // place name from search, if any
let stationMarkersReady = Promise.resolve();
const stationMarkerIndex = new Map();  // station object → its map marker
const lastModelInGroup = {};
let hintTimeout = null;
let ensembleWanted = false;  // user opened the ensemble; keep it open for new locations
let ensembleCache = null;    // { key, data } for the last fetched point
let ensembleReq = 0;         // invalidates in-flight ensemble requests
let histWanted = false;      // same for the station 48 h history

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const hash = readHash();
  loadPrefs();
  initMap();
  initControls();
  initSearch();
  initLocate();
  if (hash.latLng || hash.zoom != null) {
    map.setView(hash.latLng || map.getCenter(), hash.zoom ?? map.getZoom());
  }
  selectedLatLng = hash.latLng;
  setModel(hash.model || currentModel);
});

function initMap() {
  map = L.map('fc-map', {
    center:   [47.5, 13.0],
    zoom:     7,
    minZoom:  MAP_MIN_ZOOM,
    maxZoom:  MAP_MAX_ZOOM,
    zoomControl: false,
    maxBounds: MAP_BOUNDS,
    maxBoundsViscosity: 1.0,
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://tile.jawg.io/jawg-terrain/{z}/{x}/{y}{r}.png?access-token=yCsJVR3m9Cl8MYpNhawkJVMjJuTKILFhOLHb3pzNDFrpwQHvfMgs5bMHC1kINJ1X', {
    attribution: '<a href="https://www.jawg.io" target="_blank">&copy; Jawg</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors',
    maxZoom: 22,
  }).addTo(map);

  stationMarkerLayer = L.layerGroup().addTo(map);

  map.on('click', onMapClick);
  map.on('moveend', writeHash);
}

function initControls() {
  document.querySelectorAll('.fc-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.group;
      if (group === groupOf(currentModel)) return;
      setModel(lastModelInGroup[group] || MODEL_GROUPS[group][0]);
    });
  });

  document.getElementById('fc-forecast-close').addEventListener('click', () => {
    document.getElementById('fc-forecast-panel').classList.add('hidden');
    resetPanelContent();
    if (pinMarker) { pinMarker.remove(); pinMarker = null; }
    if (nearestStationMarker) { nearestStationMarker.remove(); nearestStationMarker = null; }
    lastNearestStation = null;
    if (selectedStationMarker) {
      const origColor = selectedStationMarker._origColor || '#ff9800';
      selectedStationMarker.setStyle({ color: origColor, fillColor: origColor });
      selectedStationMarker = null;
    }
    selectedLatLng = null;
    selectedLabel = null;
    writeHash();
    document.getElementById('fc-click-hint').classList.remove('hidden');
  });

  document.getElementById('fc-unit-toggle').addEventListener('click', () => {
    windUnit = WIND_UNIT_ORDER[(WIND_UNIT_ORDER.indexOf(windUnit) + 1) % WIND_UNIT_ORDER.length];
    savePref('fc.windUnit', windUnit);
    updateToggleLabels();
    reRenderCurrent();
  });

  document.getElementById('fc-tz-toggle').addEventListener('click', () => {
    displayTZ = displayTZ === 'UTC' ? 'local' : 'UTC';
    savePref('fc.tz', displayTZ);
    updateToggleLabels();
    reRenderCurrent();
  });

  // Mobile bottom sheet: tap the handle or swipe to collapse/expand the panel
  const panel = document.getElementById('fc-forecast-panel');
  const handle = document.getElementById('fc-panel-handle');
  handle.addEventListener('click', () => panel.classList.toggle('fc-panel-collapsed'));
  let touchStartY = null;
  handle.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
  handle.addEventListener('touchend', e => {
    if (touchStartY === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY;
    touchStartY = null;
    if (Math.abs(dy) < 30) return;  // treated as a tap (click handler)
    e.preventDefault();
    panel.classList.toggle('fc-panel-collapsed', dy > 0);
  });

  document.getElementById('fc-ensemble-btn').addEventListener('click', () => {
    if (!pinMarker) return;
    const open = !document.getElementById('fc-ensemble-scroll').classList.contains('hidden');
    ensembleWanted = !open;
    if (open) {
      hideEnsemble();
    } else {
      const ll = pinMarker.getLatLng();
      showEnsemble(ll.lat, ll.lng);
    }
  });
}

// ── Model tabs ───────────────────────────────────────────────────────────────

function groupOf(key) {
  return Object.keys(MODEL_GROUPS).find(g => MODEL_GROUPS[g].includes(key));
}

/** Switch to a model: update tabs/chips, info box, map state and URL. */
function setModel(key) {
  if (!SELECTABLE_MODELS.includes(key)) key = 'stations';
  currentModel = key;
  lastModelInGroup[groupOf(key)] = key;
  renderModelTabs();
  updateInfoBox();
  applyModelSelectionState();
  writeHash();
}

function renderModelTabs() {
  const group = groupOf(currentModel);
  document.querySelectorAll('.fc-tab').forEach(btn => {
    const active = btn.dataset.group === group;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  const chips = document.getElementById('fc-subchips');
  chips.innerHTML = '';
  chips.classList.toggle('hidden', MODEL_GROUPS[group].length < 2);
  for (const key of MODEL_GROUPS[group]) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'fc-chip' + (key === currentModel ? ' active' : '');
    chip.textContent = MODELS[key].chipLabel || MODELS[key].label;
    chip.title = MODELS[key].desc;
    chip.addEventListener('click', () => { if (key !== currentModel) setModel(key); });
    chips.appendChild(chip);
  }
}

function defaultHintText() {
  const m = MODELS[currentModel];
  if (m.isStation) return 'Click on a station to see current measurements';
  if (m.isHistorical) return 'Click anywhere in Austria to see past weather and climate';
  return 'Click anywhere on the map to see a weather forecast';
}

/** Briefly show a message in the hint bubble, then restore the default hint. */
function flashHint(msg) {
  const hint = document.getElementById('fc-click-hint');
  hint.textContent = msg;
  hint.classList.remove('hidden');
  clearTimeout(hintTimeout);
  hintTimeout = setTimeout(() => {
    hint.textContent = defaultHintText();
    if (selectedLatLng) hint.classList.add('hidden');
  }, 4000);
}

function applyModelSelectionState() {
  const m = MODELS[currentModel];
  const hint = document.getElementById('fc-click-hint');
  hint.textContent = defaultHintText();

  if (m.isStation) {
    if (pinMarker) { pinMarker.remove(); pinMarker = null; }
    if (nearestStationMarker) { nearestStationMarker.remove(); nearestStationMarker = null; }
    lastNearestStation = null;
    stationMarkersReady = showStationMarkers();
    if (selectedLatLng) {
      openNearestStation(selectedLatLng.lat, selectedLatLng.lng);
    } else {
      hint.classList.remove('hidden');
      document.getElementById('fc-forecast-panel').classList.add('hidden');
    }
    return;
  }

  hideStationMarkers();
  if (selectedLatLng) {
    placePin(selectedLatLng.lat, selectedLatLng.lng);
    hint.classList.add('hidden');
    fetchAndShowForecast(selectedLatLng.lat, selectedLatLng.lng);
  }
}

// ── Location selection ───────────────────────────────────────────────────────

function placePin(lat, lng) {
  if (pinMarker) pinMarker.remove();
  if (nearestStationMarker) { nearestStationMarker.remove(); nearestStationMarker = null; }
  lastNearestStation = null;
  pinMarker = L.circleMarker([lat, lng], {
    radius: 6, color: '#26a69a', fillColor: '#26a69a', fillOpacity: 0.9, weight: 2,
  }).addTo(map);
}

/**
 * Select a location from a map click, search result, geolocation or permalink.
 * In station mode this opens the nearest station; otherwise the forecast.
 */
function selectLocation(lat, lng, { label = null } = {}) {
  expandPanel();
  selectedLatLng = L.latLng(lat, lng);
  selectedLabel = label;
  writeHash();
  document.getElementById('fc-click-hint').classList.add('hidden');
  if (MODELS[currentModel].isStation) {
    openNearestStation(lat, lng);
    return;
  }
  placePin(lat, lng);
  fetchAndShowForecast(lat, lng);
}

// ── Permalink + preferences ──────────────────────────────────────────────────

/** Parse `#m=<model>&ll=<lat>,<lon>&z=<zoom>`; invalid parts are ignored. */
function readHash() {
  const out = { model: null, latLng: null, zoom: null };
  const params = new URLSearchParams(location.hash.slice(1));
  const m = params.get('m');
  if (SELECTABLE_MODELS.includes(m)) out.model = m;
  const ll = (params.get('ll') || '').split(',').map(Number);
  if (ll.length === 2 && ll.every(Number.isFinite) && L.latLngBounds(MAP_BOUNDS).contains(ll)) {
    out.latLng = L.latLng(ll[0], ll[1]);
  }
  const z = parseInt(params.get('z'), 10);
  if (z >= MAP_MIN_ZOOM && z <= MAP_MAX_ZOOM) out.zoom = z;
  return out;
}

function writeHash() {
  if (!map) return;
  const parts = [`m=${currentModel}`];
  if (selectedLatLng) parts.push(`ll=${selectedLatLng.lat.toFixed(4)},${selectedLatLng.lng.toFixed(4)}`);
  parts.push(`z=${map.getZoom()}`);
  try {
    history.replaceState(null, '', `${location.pathname}${location.search}#${parts.join('&')}`);
  } catch (err) { /* ignore (e.g. sandboxed iframe) */ }
}

function loadPref(key, allowed) {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v) ? v : null;
  } catch (err) { return null; }
}

function savePref(key, value) {
  try { localStorage.setItem(key, value); } catch (err) { /* storage unavailable */ }
}

function loadPrefs() {
  windUnit  = loadPref('fc.windUnit', WIND_UNIT_ORDER) || windUnit;
  displayTZ = loadPref('fc.tz', ['UTC', 'local']) || displayTZ;
  updateToggleLabels();
}

function updateToggleLabels() {
  document.getElementById('fc-unit-toggle').textContent = windUnitLabel();
  document.getElementById('fc-tz-toggle').textContent = displayTZ === 'UTC' ? 'UTC' : 'Local';
}

// ── Geolocation ──────────────────────────────────────────────────────────────

function initLocate() {
  const btn = document.getElementById('fc-locate-btn');
  if (!('geolocation' in navigator)) { btn.classList.add('hidden'); return; }
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.classList.add('fc-locating');
    const done = () => { btn.disabled = false; btn.classList.remove('fc-locating'); };
    navigator.geolocation.getCurrentPosition(pos => {
      done();
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!L.latLngBounds(MAP_BOUNDS).contains([lat, lng])) {
        flashHint('Your location is outside the area covered by this map');
        return;
      }
      map.setView([lat, lng], Math.max(map.getZoom(), 10));
      selectLocation(lat, lng);
    }, () => {
      done();
      flashHint('Location unavailable');
    }, { timeout: 10000, maximumAge: 300000 });
  });
}

/** Hide every content section inside the panel and remove size classes. */
function resetPanelContent() {
  document.getElementById('fc-forecast-scroll').classList.add('hidden');
  document.getElementById('fc-table-footer').classList.add('hidden');
  document.getElementById('fc-past-data').classList.add('hidden');
  document.getElementById('fc-ensemble-scroll').classList.add('hidden');
  document.getElementById('fc-ensemble-btn-wrap').classList.add('hidden');
  ensembleReq++;
  document.getElementById('fc-compare-scroll').classList.add('hidden');
  document.getElementById('fc-station-data').classList.add('hidden');
  document.getElementById('fc-nearest-station').classList.add('hidden');
  const panel = document.getElementById('fc-forecast-panel');
  panel.classList.remove('fc-panel-ensemble', 'fc-panel-compare', 'fc-panel-past');
}

function reRenderCurrent() {
  if (!lastForecastData) return;
  if (lastForecastData.isCompare) {
    renderCompareView(lastForecastData.models);
  } else if (lastForecastData.isEnsemble) {
    renderEnsembleCharts(lastForecastData);
  } else if (lastForecastData.isStation) {
    renderStationData(lastForecastData.params, lastForecastData.station, lastForecastData.timestamp);
  } else if (lastForecastData.isSiag) {
    renderSiagStationData(lastForecastData.station);
  } else if (lastForecastData.isTrentino) {
    renderTrentinoStationData(lastForecastData.stationData, lastForecastData.station);
  } else if (lastForecastData.isPast) {
    renderPast(lastForecastData);
  } else {
    renderForecastTable(lastForecastData);
    if (lastNearestStation) renderNearestStationBar();
    const ensembleOpen = !document.getElementById('fc-ensemble-scroll').classList.contains('hidden');
    if (ensembleOpen && ensembleCache) renderEnsembleCharts(ensembleCache.data);
  }
}

function updateInfoBox() {
  const m = MODELS[currentModel];
  document.getElementById('fc-info-title').textContent = m.label;
  document.getElementById('fc-info-resolution').textContent = m.desc;
  let credit;
  if (m.isCompare) {
    credit = 'Comparing IFS HRES, ICON-CH and C-LAEF AlpeAdria forecasts';
  } else if (m.isStation) {
    credit = `Data: <a href="${m.dataUrl}" target="_blank" rel="noopener">GeoSphere TAWES</a> (current) · ` +
             `<a href="${m.dataUrl2}" target="_blank" rel="noopener">GeoSphere TAWES</a> (48 h history, 30 min display) · ` +
             `<a href="https://weather.province.bz.it/" target="_blank" rel="noopener">SIAG South Tyrol</a> (CC0) · ` +
             `<a href="https://www.meteotrentino.it/" target="_blank" rel="noopener">Meteotrentino</a> (CC BY 4.0)`;
  } else if (m.isOpenMeteo) {
    credit = `Data: ${m.creditHtml} (CC BY 4.0)`;
  } else {
    const doiPart = m.doi ? ` · <a href="${m.doiUrl}" target="_blank" rel="noopener">doi:${m.doi}</a>` : '';
    credit = `Data: <a href="${m.dataUrl}" target="_blank" rel="noopener">GeoSphere Austria ${m.label}</a> (CC BY 4.0)${doiPart}`;
  }
  document.getElementById('fc-info-credit').innerHTML = credit;
}

// ── Map click ────────────────────────────────────────────────────────────────

function onMapClick(e) {
  selectLocation(e.latlng.lat, e.latlng.lng);
}

// ── Forecast location label ──────────────────────────────────────────────────

/**
 * Update the `fc-forecast-location` element.
 * Shows the ACTUAL grid cell coordinates when they differ from the clicked
 * point by more than 2 km (so the user understands why data may not match
 * other sources like Windy that interpolate at the exact click).
 *
 * @param {number}  lat    Clicked latitude
 * @param {number}  lng    Clicked longitude
 * @param {object|null} data  Processed forecast data (may have gridLat/gridLon)
 * @param {string}  label Model label string
 */
function setForecastLocationEl(lat, lng, data, label) {
  const el = document.getElementById('fc-forecast-location');
  const reqId = ++locationLabelReq;
  let coords = `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E`;
  el.title = '';
  if (data && data.gridLat !== undefined && data.gridLon !== undefined) {
    const dist = haversineKm(lat, lng, data.gridLat, data.gridLon);
    if (dist > 2) {
      // Grid cell is noticeably far from the clicked point — show actual coords
      coords = `${data.gridLat.toFixed(3)}°N, ${data.gridLon.toFixed(3)}°E`;
      el.title = `You clicked ${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E. `
        + `The nearest model grid cell is ${dist.toFixed(0)} km away. `
        + `Differences vs. other sources that interpolate may be due to this offset.`;
    }
  }

  const place = selectedLabel || placeNames.get(placeKey(lat, lng));
  el.textContent = `${place ? place + ' · ' : ''}${coords} · ${label}`;

  // Fill in the place name once known, unless a newer label was set meanwhile
  if (!place && !placeNames.has(placeKey(lat, lng))) {
    reverseGeocode(lat, lng).then(name => {
      if (name && reqId === locationLabelReq) setForecastLocationEl(lat, lng, data, label);
    });
  }
}

// ── Reverse geocoding ────────────────────────────────────────────────────────

const placeNames = new Map();     // key → name (or null when unknown)
const placeNameRequests = new Map();
let locationLabelReq = 0;

function placeKey(lat, lng) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

/** Short place name for a point via Nominatim, e.g. "Innere Stadt, Vienna". Never rejects. */
function reverseGeocode(lat, lng) {
  const key = placeKey(lat, lng);
  if (!placeNameRequests.has(key)) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&format=json&zoom=14&accept-language=en`;
    const req = fetchJSON(url).then(json => {
      const a = json.address || {};
      const local  = a.village || a.town || a.suburb || a.hamlet || a.city_district;
      const region = a.city || a.municipality || a.county;
      return (local && region && local !== region) ? `${local}, ${region}` : (local || region || json.name || null);
    }).catch(() => null).then(name => {
      placeNames.set(key, name);
      return name;
    });
    placeNameRequests.set(key, req);
  }
  return placeNameRequests.get(key);
}

// ── Fetch + render forecast ──────────────────────────────────────────────────

async function fetchAndShowForecast(lat, lng) {
  const panel   = document.getElementById('fc-forecast-panel');
  const loading = document.getElementById('fc-forecast-loading');
  const scroll         = document.getElementById('fc-forecast-scroll');
  const ensembleScroll = document.getElementById('fc-ensemble-scroll');
  const ensembleBtnWrap = document.getElementById('fc-ensemble-btn-wrap');
  const compareScroll  = document.getElementById('fc-compare-scroll');
  const stationDataEl  = document.getElementById('fc-station-data');

  panel.classList.remove('hidden');
  loading.classList.remove('hidden');
  resetPanelContent();
  lastNearestStation = null;

  const m   = MODELS[currentModel];

  // Toggle panel size class based on model type
  if (m.isCompare) {
    panel.classList.add('fc-panel-compare');
  }

  // Reset loading UI in case of previous error
  const loadingSpan = loading.querySelector('span');
  loadingSpan.textContent = 'Loading forecast data — this may take a few seconds…';
  const spinner = loading.querySelector('.fc-spin-ring');
  spinner.style.display = '';

  // Initial location text (clicked coordinates); updated later once we know the actual grid cell.
  setForecastLocationEl(lat, lng, null, m.label);

  try {
    if (m.isHistorical) {
      await fetchAndShowPast(lat, lng);
      return;
    }

    if (m.isCompare) {
      // Compare mode: fetch IFS, ICON-CH, and C-LAEF AlpeAdria in parallel
      const results = await fetchCompareData(lat, lng);
      lastForecastData = { isCompare: true, models: results };
      compareScroll.classList.remove('hidden');
      renderCompareView(results);
      loading.classList.add('hidden');
      return;
    }

    if (m.isMerged) {
      // Merged ICON-CH: fetch CH1 + CH2 in parallel, stitch
      const data = await fetchMergedIconCH(lat, lng);
      lastForecastData = data;
      lastForecastData.isEnsemble = false;
      setForecastLocationEl(lat, lng, lastForecastData, m.label);
      scroll.classList.remove('hidden');
      renderForecastTable(lastForecastData);
      loading.classList.add('hidden');
      addClimateContext(lat, lng, lastForecastData);
      return;
    }

    let url;
    if (m.isOpenMeteo) {
      const omBase = m.openMeteoBase || OPENMETEO_BASE;
      const modelsParam = m.openMeteoModel ? `&models=${m.openMeteoModel}` : '';
      url = `${omBase}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
            `&hourly=temperature_2m,precipitation,snowfall,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover` +
            `${modelsParam}&forecast_days=${m.openMeteoDays}&wind_speed_unit=ms&timezone=UTC`;
    } else if (m.isEnsemble) {
      url = `${API_BASE}/timeseries/forecast/${m.resource}` +
            `?lat_lon=${lat.toFixed(4)},${lng.toFixed(4)}&parameters=${m.params}`;
    } else {
      url = `${API_BASE}/timeseries/forecast/${m.resource}` +
            `?lat_lon=${lat.toFixed(4)},${lng.toFixed(4)}&parameters=${m.params}`;
    }

    const json = await fetchJSON(url);
    if (m.isOpenMeteo) {
      lastForecastData = processOpenMeteoTimeseries(json);
      lastForecastData.isEnsemble = false;
      setForecastLocationEl(lat, lng, lastForecastData, m.label);
      scroll.classList.remove('hidden');
      renderForecastTable(lastForecastData);
    } else if (m.isEnsemble) {
      lastForecastData = processEnsembleTimeseries(json);
      ensembleScroll.classList.remove('hidden');
      renderEnsembleCharts(lastForecastData);
    } else {
      lastForecastData = processTimeseries(json);
      lastForecastData.isEnsemble = false;
      setForecastLocationEl(lat, lng, lastForecastData, m.label);
      scroll.classList.remove('hidden');
      renderForecastTable(lastForecastData);
    }
    loading.classList.add('hidden');

    // Climate context makes little sense for the 3 h nowcast
    if (!m.isEnsemble && currentModel !== 'inca') addClimateContext(lat, lng, lastForecastData);

    // Show ensemble button only for C-LAEF AlpeAdria
    if (currentModel === 'arome') {
      ensembleBtnWrap.classList.remove('hidden');
      updateEnsembleButton('closed');
      if (ensembleWanted) showEnsemble(lat, lng);
    }

    if (currentModel === 'inca') {
      fetchAndShowNearestStation(lat, lng);
    }
  } catch (err) {
    console.error('Forecast fetch error:', err);
    spinner.style.display = 'none';
    const status = err.message?.match(/HTTP (\d+)/)?.[1];
    if (status === '503' || status === '502' || status === '500') {
      loadingSpan.textContent = `⚠️ The ${m.label} data source is temporarily unavailable. Please try again later or select a different model.`;
    } else if (status === '404' || status === '400') {
      loadingSpan.textContent = `⚠️ No ${m.label} data available for this location. The point may be outside the model domain.`;
    } else {
      loadingSpan.textContent = `⚠️ Error loading ${m.label} forecast data. The data source may be temporarily unavailable or the location may be outside the model domain.`;
    }
  }
}

// ── Fetch + show C-LAEF AlpeAdria ensemble (button-triggered) ────────────────

function updateEnsembleButton(state) {
  const btn = document.getElementById('fc-ensemble-btn');
  btn.disabled = state === 'loading';
  btn.setAttribute('aria-expanded', String(state === 'open'));
  btn.textContent = {
    closed:  'Show ensemble range ▾',
    loading: 'Loading ensemble…',
    open:    'Hide ensemble range ▴',
    error:   '⚠️ Ensemble data unavailable · retry',
  }[state];
}

function hideEnsemble() {
  ensembleReq++;
  document.getElementById('fc-ensemble-scroll').classList.add('hidden');
  document.getElementById('fc-forecast-panel').classList.remove('fc-panel-ensemble');
  updateEnsembleButton('closed');
}

/** Show the C-LAEF ensemble percentiles under the forecast table (cached per point). */
async function showEnsemble(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const req = ++ensembleReq;
  let data = ensembleCache?.key === key ? ensembleCache.data : null;

  if (!data) {
    updateEnsembleButton('loading');
    const em = MODELS.ensemble;
    const url = `${API_BASE}/timeseries/forecast/${em.resource}` +
                `?lat_lon=${lat.toFixed(4)},${lng.toFixed(4)}&parameters=${em.params}`;
    try {
      data = processEnsembleTimeseries(await fetchJSON(url));
      ensembleCache = { key, data };
    } catch (err) {
      console.error('Ensemble fetch error:', err);
      if (req === ensembleReq) updateEnsembleButton('error');
      return;
    }
  }
  if (req !== ensembleReq || currentModel !== 'arome') return;

  document.getElementById('fc-forecast-panel').classList.add('fc-panel-ensemble');
  document.getElementById('fc-ensemble-scroll').classList.remove('hidden');
  renderEnsembleCharts(data);
  updateEnsembleButton('open');
}

// ── Fetch merged ICON-CH1 + CH2 ─────────────────────────────────────────────

async function fetchMergedIconCH(lat, lng) {
  const m = MODELS.icon_ch;
  const omParams = 'temperature_2m,precipitation,snowfall,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover';

  const urls = m.mergeModels.map(sub =>
    `${OPENMETEO_BASE}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    `&hourly=${omParams}&models=${sub.openMeteoModel}&forecast_days=${sub.openMeteoDays}&wind_speed_unit=ms&timezone=UTC`
  );

  const [json1, json2] = await Promise.all(urls.map(u => fetchJSON(u)));
  const d1 = processOpenMeteoTimeseries(json1);
  const d2 = processOpenMeteoTimeseries(json2);

  // Find the last CH1 timestamp that has valid (non-null) temperature data.
  // Open-Meteo may return the full requested days with nulls after the model's
  // actual horizon (~33 h for CH1 with forecast_days=2 → 48 h requested).
  // Using the last null-padded timestamp as the merge point would leave a gap
  // of null-filled hours between CH1 and CH2.
  if (d1.times.length === 0) return d2;
  let ch1EndIdx = d1.times.length - 1;
  while (ch1EndIdx > 0 && (d1.temp[ch1EndIdx] === null || !isFinite(d1.temp[ch1EndIdx]))) ch1EndIdx--;
  const ch1Count = ch1EndIdx + 1; // number of valid CH1 entries to keep
  const ch1End = d1.times[ch1EndIdx].getTime();

  // Append CH2 timesteps that are strictly after the last valid CH1 time
  const mergeStart = d2.times.findIndex(t => t.getTime() > ch1End);
  if (mergeStart < 0) return { ...d1, transitionIndex: null };

  const transitionIndex = ch1Count; // index where CH2 data starts

  const merged = {
    times:      [...d1.times.slice(0, ch1Count),      ...d2.times.slice(mergeStart)],
    temp:       [...d1.temp.slice(0, ch1Count),       ...d2.temp.slice(mergeStart)],
    rain:       [...d1.rain.slice(0, ch1Count),       ...d2.rain.slice(mergeStart)],
    snowfall:   [...(d1.snowfall || []).slice(0, ch1Count), ...(d2.snowfall || []).slice(mergeStart)],
    windSpeed:  [...d1.windSpeed.slice(0, ch1Count),  ...d2.windSpeed.slice(mergeStart)],
    windDir:    [...d1.windDir.slice(0, ch1Count),    ...d2.windDir.slice(mergeStart)],
    gustSpeed:  [...(d1.gustSpeed || []).slice(0, ch1Count), ...(d2.gustSpeed || []).slice(mergeStart)],
    cloudCover: [...(d1.cloudCover || []).slice(0, ch1Count), ...(d2.cloudCover || []).slice(mergeStart)],
    // Use CH1 grid coordinates (highest resolution)
    gridLat: d1.gridLat,
    gridLon: d1.gridLon,
    transitionIndex,
    transitionLabel: 'ICON-CH2',
  };
  return merged;
}

// ── Compare mode: fetch IFS, ICON-CH, C-LAEF AlpeAdria ──────────────────────

async function fetchCompareData(lat, lng) {
  const omParams = 'temperature_2m,precipitation,snowfall,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover';

  // IFS — use the dedicated /v1/ecmwf endpoint for correct IFS HRES 9 km data
  const ifsUrl = `https://api.open-meteo.com/v1/ecmwf?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    `&hourly=${omParams}&forecast_days=5&wind_speed_unit=ms&timezone=UTC`;

  // C-LAEF AlpeAdria (GeoSphere direct) — include snow so the compare table includes its snow row
  const aromeUrl = `${API_BASE}/timeseries/forecast/${MODELS.arome.resource}` +
    `?lat_lon=${lat.toFixed(4)},${lng.toFixed(4)}&parameters=${MODELS.arome.params}`;

  const results = [];

  // Fetch all in parallel (ICON-CH is itself a parallel fetch internally)
  const [ifsJson, iconChData, aromeJson] = await Promise.allSettled([
    fetchJSON(ifsUrl),
    fetchMergedIconCH(lat, lng),
    fetchJSON(aromeUrl),
  ]);

  // Process IFS
  if (ifsJson.status === 'fulfilled') {
    const data = processOpenMeteoTimeseries(ifsJson.value);
    data.isEnsemble = false;
    results.push({ label: 'IFS HRES', data, hasCloudCover: true, gridLat: data.gridLat, gridLon: data.gridLon });
  } else {
    results.push({ label: 'IFS HRES', error: ifsJson.reason?.message || 'Failed to load' });
  }

  // Process ICON-CH (already processed by fetchMergedIconCH)
  if (iconChData.status === 'fulfilled') {
    const data = iconChData.value;
    data.isEnsemble = false;
    results.push({ label: 'ICON-CH', data, hasCloudCover: true, gridLat: data.gridLat, gridLon: data.gridLon });
  } else {
    results.push({ label: 'ICON-CH', error: iconChData.reason?.message || 'Failed to load' });
  }

  // Process C-LAEF AlpeAdria
  if (aromeJson.status === 'fulfilled') {
    // Temporarily set currentModel to arome for processTimeseries
    const savedModel = currentModel;
    currentModel = 'arome';
    try {
      const data = processTimeseries(aromeJson.value);
      data.isEnsemble = false;
      results.push({ label: 'C-LAEF AlpeAdria', data, hasCloudCover: true, gridLat: data.gridLat, gridLon: data.gridLon });
    } finally {
      currentModel = savedModel;
    }
  } else {
    results.push({ label: 'C-LAEF AlpeAdria', error: aromeJson.reason?.message || 'Failed to load' });
  }

  // Remap all datasets to a shared unified time axis so columns align perfectly
  unifyCompareTimes(results);

  return results;
}

/**
 * Remaps every compare entry to the same sorted union of all timestamps.
 * Entries that have no value for a given timestep get null (renders as —).
 * This ensures every table has identical column count and column widths,
 * making scrollLeft-based sync pixel-perfect.
 */
function unifyCompareTimes(results) {
  // Collect union of all timestamps (by ms)
  const msSet = new Set();
  for (const entry of results) {
    if (!entry.error && entry.data?.times) {
      for (const t of entry.data.times) msSet.add(t.getTime());
    }
  }
  if (msSet.size === 0) return;

  const unified = [...msSet].sort((a, b) => a - b).map(ms => new Date(ms));

  for (const entry of results) {
    if (entry.error || !entry.data) continue;
    const d = entry.data;

    // Remember transition time before index changes
    const transitionTimeMs = d.transitionIndex != null
      ? d.times[d.transitionIndex]?.getTime()
      : null;

    const indexMap = new Map(d.times.map((t, i) => [t.getTime(), i]));
    const remap = arr => arr
      ? unified.map(t => { const i = indexMap.get(t.getTime()); return i !== undefined ? arr[i] : null; })
      : null;

    d.times       = unified;
    d.temp        = remap(d.temp);
    d.rain        = remap(d.rain);
    d.snowfall    = remap(d.snowfall);
    d.windSpeed   = remap(d.windSpeed);
    d.windDir     = remap(d.windDir);
    d.gustSpeed   = remap(d.gustSpeed);
    d.cloudCover  = remap(d.cloudCover);

    // Remap transitionIndex to position in unified axis
    if (transitionTimeMs != null) {
      d.transitionIndex = unified.findIndex(t => t.getTime() === transitionTimeMs);
    }
  }
}

// ── Render compare view ──────────────────────────────────────────────────────

function renderCompareView(models) {
  const container = document.getElementById('fc-compare-scroll');
  container.innerHTML = '';

  for (const entry of models) {
    const section = document.createElement('div');
    section.className = 'fc-compare-section';

    const heading = document.createElement('h3');
    heading.className = 'fc-section-heading';
    if (entry.gridLat !== undefined && entry.gridLon !== undefined) {
      heading.textContent = `${entry.label} — grid: ${entry.gridLat.toFixed(3)}°N, ${entry.gridLon.toFixed(3)}°E`;
    } else {
      heading.textContent = entry.label;
    }
    const run = entry.data ? modelRunText(entry.data.refTime) : '';
    if (run) heading.textContent += ` · ${run}`;
    section.appendChild(heading);

    if (entry.error) {
      const errDiv = document.createElement('div');
      errDiv.className = 'fc-compare-error';
      errDiv.textContent = `⚠️ ${entry.error}`;
      section.appendChild(errDiv);
    } else {
      const scrollWrap = document.createElement('div');
      scrollWrap.className = 'fc-forecast-scroll';
      const table = document.createElement('table');
      table.className = 'fc-forecast-table';
      scrollWrap.appendChild(table);
      section.appendChild(scrollWrap);
      renderForecastTableInto(table, entry.data);
    }
    container.appendChild(section);
  }

  const firstOk = models.find(e => e.data);
  if (firstOk) {
    const footer = document.createElement('div');
    footer.className = 'fc-table-footer';
    footer.appendChild(buildTableFooter({}));
    container.appendChild(footer);
  }

  // Sync horizontal scroll across all three forecast tables
  const scrollWrappers = [...container.querySelectorAll('.fc-forecast-scroll')];
  let activeScroller = null;
  for (const w of scrollWrappers) {
    w.addEventListener('scroll', () => {
      if (activeScroller && activeScroller !== w) return;
      activeScroller = w;
      for (const other of scrollWrappers) {
        if (other !== w) other.scrollLeft = w.scrollLeft;
      }
      requestAnimationFrame(() => { activeScroller = null; });
    }, { passive: true });
  }
  if (firstOk && !scrolledToNow.has(models)) {
    scrolledToNow.add(models);
    scrollWrappers.forEach(w => scrollTableToNow(w, w.querySelector('table')));
  }
}

// ── Process Open-Meteo API response ─────────────────────────────────────────

function processOpenMeteoTimeseries(json) {
  const h = json.hourly;
  // Open-Meteo timestamps are UTC ISO strings without a timezone suffix; append 'Z'
  const allTimes = h.time.map(t => new Date(t + 'Z'));
  
  // Get the start of the current hour in local time
  const now = new Date();
  const lastFullHour = new Date(now);
  lastFullHour.setMinutes(0, 0, 0);
  
  // Filter to only include times >= lastFullHour
  const validIndices = allTimes
    .map((_, i) => i)
    .filter(i => allTimes[i] >= lastFullHour);
  
  // Extract only valid timesteps for each data array
  const times      = validIndices.map(i => allTimes[i]);
  const temp       = validIndices.map(i => h.temperature_2m[i]);
  const rain       = validIndices.map(i => h.precipitation[i] === null ? 0 : Math.max(0, h.precipitation[i]));
  // Open-Meteo snowfall is in cm of snow depth; 1 cm ≈ 1 mm water equivalent
  const snowfall   = h.snowfall
    ? validIndices.map(i => h.snowfall[i] === null ? 0 : Math.max(0, h.snowfall[i]))
    : null;
  const windSpeed  = validIndices.map(i => h.wind_speed_10m[i]);
  const windDir    = validIndices.map(i => h.wind_direction_10m[i]);
  const gustSpeed  = validIndices.map(i => h.wind_gusts_10m[i]);
  // Cloud cover is 0–100 in Open-Meteo; normalise to 0–1 for weatherIcon()
  const cloudCover = validIndices.map(i => h.cloud_cover[i] === null ? null : h.cloud_cover[i] / 100);
  // Actual grid cell returned by the API (may differ from the requested coordinates)
  const gridLat = json.latitude;
  const gridLon = json.longitude;
  
  return { times, temp, rain, snowfall, windSpeed, windDir, gustSpeed, cloudCover, gridLat, gridLon };
}

// ── Process API response ─────────────────────────────────────────────────────

function processTimeseries(json) {
  const timestamps = json.timestamps.map(t => new Date(t));
  const p = json.features[0].properties.parameters;
  const m = MODELS[currentModel];

  const tempField = m.tempField || 't2m';
  const temp = p[tempField] ? p[tempField].data : [];

  let rain;
  if (m.accumulated) {
    const rainField = m.rainField || 'rr_acc';
    const acc = p[rainField] ? p[rainField].data : [];
    rain = acc.map((v, i) => i === 0 ? Math.max(0, v) : Math.max(0, v - acc[i - 1]));
  } else {
    const rainField = m.rainField || 'rr';
    rain = p[rainField] ? p[rainField].data : [];
  }

  let windSpeed, windDir;
  if (m.hasUV) {
    const uField = m.windUField || 'u10m';
    const vField = m.windVField || 'v10m';
    const u = p[uField] ? p[uField].data : [];
    const v = p[vField] ? p[vField].data : [];
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
  } else if (!m.hasUVgust) {
    const gustField = m.gustField || 'fx';
    if (p[gustField]) gustSpeed = p[gustField].data;
  }

  const cloudCover = m.hasCloudCover && p.tcc ? p.tcc.data : null;

  // Snow: accumulated fields (mm WE since forecast start) need differencing; C-LAEF's 'sf' is already per-hour
  let snowfall = null;
  const snowField = m.snowField || 'snow_acc';
  if (p[snowField]) {
    if (m.snowAccumulated === false) {
      snowfall = p[snowField].data.map(v => Math.max(0, v));
    } else {
      const acc = p[snowField].data;
      snowfall = acc.map((v, i) => i === 0 ? Math.max(0, v) : Math.max(0, v - acc[i - 1]));
    }
  }

  // Actual grid cell coordinates from the GeoJSON feature geometry
  const coords = json.features?.[0]?.geometry?.coordinates;
  const gridLat = coords ? coords[1] : undefined;
  const gridLon = coords ? coords[0] : undefined;
  // Model run reference time
  const refTime = json.reference_time ? new Date(json.reference_time) : null;

  return { times: timestamps, temp, rain, snowfall, windSpeed, windDir, gustSpeed, cloudCover, gridLat, gridLon, refTime };
}

// ── Render Windy-style forecast table ────────────────────────────────────────

const scrolledToNow = new WeakSet();

function renderForecastTable(data) {
  const table = document.getElementById('fc-forecast-table');
  const wrapper = document.getElementById('fc-forecast-scroll');
  const keepScroll = wrapper.scrollLeft;  // re-rendering empties the table briefly
  renderForecastTableInto(table, data);
  wrapper.scrollLeft = keepScroll;

  const footer = document.getElementById('fc-table-footer');
  footer.innerHTML = '';
  footer.appendChild(buildTableFooter(data));
  footer.classList.remove('hidden');

  // Scroll the current hour into view once per dataset (not on re-renders)
  if (!scrolledToNow.has(data)) {
    scrolledToNow.add(data);
    scrollTableToNow(wrapper, table);
  }
}

/** Scroll a table wrapper so the current-hour column sits just right of the label column. */
function scrollTableToNow(wrapper, table) {
  const cell  = table.querySelector('.fc-row-hours td.fc-now-col');
  const label = table.querySelector('.fc-label');
  if (!cell || !label) return;
  wrapper.scrollLeft = Math.max(0, cell.offsetLeft - label.offsetWidth - cell.offsetWidth);
}

/** Index of the column covering the current time, or -1 if now is outside the range. */
function findNowIndex(times) {
  const n = times.length;
  if (n < 2) return -1;
  const now = Date.now();
  const step = times[1] - times[0];
  if (now < times[0].getTime() || now >= times[n - 1].getTime() + step) return -1;
  for (let i = n - 1; i >= 0; i--) {
    if (times[i].getTime() <= now) return i;
  }
  return -1;
}

function formatDateTime(d) {
  const tz = displayTZ === 'UTC' ? 'UTC' : undefined;
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  return `${date} ${time}${displayTZ === 'UTC' ? ' UTC' : ''}`;
}

/** "Model run 14 Oct 06:00 (5 h ago)", or '' when the run time is unknown. */
function modelRunText(refTime) {
  if (!refTime || !isFinite(refTime.getTime())) return '';
  const hoursAgo = Math.max(0, Math.round((Date.now() - refTime.getTime()) / 3.6e6));
  return `Model run ${formatDateTime(refTime)} (${hoursAgo} h ago)`;
}

/** Footer under a forecast table: model run time + colour legends. */
function buildTableFooter(data) {
  const wrap = document.createElement('div');
  wrap.className = 'fc-table-footer-inner';

  const run = modelRunText(data.refTime);
  if (run) {
    const runEl = document.createElement('span');
    runEl.className = 'fc-run-info';
    runEl.textContent = run;
    wrap.appendChild(runEl);
  }

  const legend = (title, gradient, lo, hi) => {
    const item = document.createElement('span');
    item.className = 'fc-legend-item';
    item.innerHTML = `<span class="fc-legend-title">${title}</span><span class="fc-legend-tick">${lo}</span>`
      + `<span class="fc-legend-bar" style="background:${gradient}"></span><span class="fc-legend-tick">${hi}</span>`;
    return item;
  };
  const tLo = TEMP_STOPS[0][0], tHi = TEMP_STOPS[TEMP_STOPS.length - 1][0];
  const tempGrad = `linear-gradient(to right, ${TEMP_STOPS.map(([v]) =>
    `${tempColor(v).replace(/[\d.]+\)$/, '0.9)')} ${((v - tLo) / (tHi - tLo) * 100).toFixed(0)}%`).join(', ')})`;
  const wHi = WIND_STOPS[WIND_STOPS.length - 1][0];
  const windGrad = `linear-gradient(to right, ${WIND_STOPS.map(([v]) =>
    `${windColor(v)} ${(v / wHi * 100).toFixed(0)}%`).join(', ')})`;

  const legends = document.createElement('span');
  legends.className = 'fc-legends';
  legends.appendChild(legend('Temp', tempGrad, `${tLo}°`, `${tHi}°`));
  legends.appendChild(legend('Rain', 'linear-gradient(to right, rgba(30,136,229,0.15), rgba(30,136,229,0.7))', '0.1', '10+ mm'));
  legends.appendChild(legend('Gusts', windGrad, '0', `${Math.round(windToUnit(wHi))}+ ${windUnitLabel()}`));
  wrap.appendChild(legends);
  return wrap;
}

function renderForecastTableInto(table, data) {
  const { times, temp, rain, snowfall, windSpeed, windDir, gustSpeed, cloudCover, transitionIndex, transitionLabel } = data;
  const hasSnow = snowfall && snowfall.some(v => v !== null && v > 0.05);
  const unitLabel = windUnitLabel();
  const toUnit = windToUnit;
  const n = times.length;
  table.innerHTML = '';

  // Time helpers — respect displayTZ setting
  const tz     = displayTZ === 'UTC' ? 'UTC' : undefined;
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
      dayGroups.push({ label: k, start: i, count: 1 });
      currentDay = k;
    } else {
      dayGroups[dayGroups.length - 1].count++;
    }
  }

  // Per-day min/max temperature and precipitation total
  for (const g of dayGroups) {
    const idx = Array.from({ length: g.count }, (_, j) => g.start + j);
    const temps = idx.map(i => temp[i]).filter(v => v !== null && isFinite(v));
    const precip = idx.reduce((sum, i) => sum + (isFinite(rain[i]) && rain[i] > 0 ? rain[i] : 0), 0);
    g.tMin = temps.length ? Math.min(...temps) : null;
    g.tMax = temps.length ? Math.max(...temps) : null;
    g.precip = precip;
    // Daily max is only meaningful if the day's afternoon is covered
    g.hasAfternoon = idx.some(i => times[i].getHours() === 14);
  }

  const nowIdx = findNowIndex(times);

  // Helper: mark no-data cells (from unified time axis fill)
  const applyNoData = (td, val) => {
    if (val === null) td.classList.add('fc-no-data');
  };

  // Helper: apply transition border to a cell at the transition point
  const applyTransitionBorder = (td, i) => {
    if (transitionIndex != null && i === transitionIndex) {
      td.style.borderLeft = '2px solid rgba(255,200,50,0.6)';
    }
  };

  // ── Row 1: Day headers ──
  // colSpan groups + text-align:left means the label appears at the first
  // (leftmost) column of each day — i.e. at 00:00 of that day.
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
    // Summary only where the day is wide enough to hold it
    if (g.count >= 6 && g.tMin !== null) {
      const sum = document.createElement('span');
      sum.className = 'fc-day-summary';
      sum.textContent = `${Math.round(g.tMin)}–${Math.round(g.tMax)}°`
        + (g.precip >= 0.1 ? ` · ${g.precip < 10 ? g.precip.toFixed(1) : Math.round(g.precip)} mm` : '');
      td.appendChild(sum);
    }
    dayRow.appendChild(td);
  }
  table.appendChild(dayRow);

  // ── Transition marker row (if merged model) ──
  if (transitionIndex != null && transitionLabel) {
    const markerRow = document.createElement('tr');
    markerRow.className = 'fc-row-transition';
    const mLabel = document.createElement('td');
    mLabel.className = 'fc-label';
    markerRow.appendChild(mLabel);
    for (let i = 0; i < n; i++) {
      const td = document.createElement('td');
      if (i === transitionIndex) {
        td.className = 'fc-transition-marker';
        // Wrap in a span so the text overflows absolutely and does not
        // widen the column (which would push all adjacent cells apart).
        const span = document.createElement('span');
        span.textContent = `← ${transitionLabel}`;
        td.appendChild(span);
      }
      markerRow.appendChild(td);
    }
    table.appendChild(markerRow);
  }

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
    applyTransitionBorder(td, i);
    hourRow.appendChild(td);
  }
  table.appendChild(hourRow);

  // ── Row 3: Weather icons ──
  if (cloudCover) {
    const iconRow = document.createElement('tr');
    iconRow.className = 'fc-row-icons';
    const iconLabel = document.createElement('td');
    iconLabel.className = 'fc-label';
    iconRow.appendChild(iconLabel);
    for (let i = 0; i < n; i++) {
      const td = document.createElement('td');
      if (cloudCover[i] !== null) {
        td.textContent = weatherIcon(cloudCover[i], rain[i], getH(times[i]), snowfall ? snowfall[i] : 0);
      }
      applyNoData(td, cloudCover[i]);
      applyTransitionBorder(td, i);
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
    if (val !== null && isFinite(val)) {
      td.textContent = Math.round(val) + '°';
      td.style.backgroundColor = tempColor(val);
    }
    applyNoData(td, val);
    applyTransitionBorder(td, i);
    tempRow.appendChild(td);
  }
  table.appendChild(tempRow);

  // ── Row 4b: Daily max vs climate normal (SPARTACUS, filled in asynchronously) ──
  if (data.climate && typeof climateComparison === 'function') {
    const climRow = document.createElement('tr');
    climRow.className = 'fc-row-climate';
    const climLabel = document.createElement('td');
    climLabel.className = 'fc-label';
    climLabel.innerHTML = 'vs&nbsp;normal';
    climLabel.title = 'Forecast daily maximum compared with observed daily maxima (SPARTACUS) around the same date in 1991–2020';
    climRow.appendChild(climLabel);
    for (const g of dayGroups) {
      const td = document.createElement('td');
      td.colSpan = g.count;
      td.className = 'fc-climate-cell';
      const cmp = (g.hasAfternoon && g.tMax !== null && g.count >= 6)
        ? climateComparison(data.climate, times[g.start], g.tMax) : null;
      if (cmp) {
        td.textContent = cmp.text;
        td.title = cmp.title;
        td.style.backgroundColor = cmp.color;
      }
      climRow.appendChild(td);
    }
    table.appendChild(climRow);
  }

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
    if (val !== null && isFinite(val) && val > 0.05) {
      td.textContent = val < 10 ? val.toFixed(1) : Math.round(val);
      const intensity = Math.min(1, val / 10);
      td.style.backgroundColor = `rgba(30, 136, 229, ${(0.15 + intensity * 0.55).toFixed(2)})`;
      td.style.color = '#fff';
    }
    applyNoData(td, val);
    applyTransitionBorder(td, i);
    rainRow.appendChild(td);
  }
  table.appendChild(rainRow);

  // ── Row 6: Snow (only if any snowfall) ──
  if (hasSnow) {
    const snowRow = document.createElement('tr');
    snowRow.className = 'fc-row-snow';
    const snowLabel = document.createElement('td');
    snowLabel.className = 'fc-label';
    snowLabel.innerHTML = 'Snow&nbsp;mm';
    snowRow.appendChild(snowLabel);
    for (let i = 0; i < n; i++) {
      const td = document.createElement('td');
      td.className = 'fc-snow-cell';
      const val = snowfall[i];
      if (val !== null && isFinite(val) && val > 0.05) {
        td.textContent = val < 10 ? val.toFixed(1) : Math.round(val);
        const intensity = Math.min(1, val / 10);
        td.style.backgroundColor = `rgba(160, 210, 255, ${(0.2 + intensity * 0.6).toFixed(2)})`;
        td.style.color = '#111';
      }
      applyNoData(td, val);
      applyTransitionBorder(td, i);
      snowRow.appendChild(td);
    }
    table.appendChild(snowRow);
  }

  // ── Row 7: Wind ──
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
    if (speed !== null && isFinite(speed)) {
      td.appendChild(windArrowSVG(speed, dir));
      const span = document.createElement('span');
      span.textContent = Math.round(toUnit(speed));
      td.appendChild(span);
    }
    applyNoData(td, speed);
    applyTransitionBorder(td, i);
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
      if (gust !== null && isFinite(gust) && gust > 0) {
        td.textContent = Math.round(toUnit(gust));
        td.style.color = windColor(gust);
      }
      applyNoData(td, gust);
      applyTransitionBorder(td, i);
      gustRow.appendChild(td);
    }
    table.appendChild(gustRow);
  }

  // Highlight the column covering the current time (rows with one cell per timestep)
  if (nowIdx >= 0) {
    for (const row of table.rows) {
      if (row.cells.length === n + 1) row.cells[nowIdx + 1].classList.add('fc-now-col');
    }
    const hourCell = table.querySelector('.fc-row-hours').cells[nowIdx + 1];
    hourCell.classList.add('fc-now-hour');
    hourCell.title = 'Now';
  }
}

// ── Process ensemble API response ────────────────────────────────────────────

function processEnsembleTimeseries(json) {
  const p = json.features[0].properties.parameters;
  const col = key => (p[key] ? p[key].data : []);
  const triple = name => ({ p10: col(`${name}_p10`), p50: col(`${name}_p50`), p90: col(`${name}_p90`) });
  return {
    isEnsemble: true,
    times:   json.timestamps.map(t => new Date(t)),
    refTime: json.reference_time ? new Date(json.reference_time) : null,
    temp:    triple('2t'),
    precip:  triple('tp'),
    gust:    triple('10fg'),
    cloud:   triple('tcc'),
    // Percentiles of u and v cannot be combined into percentiles of speed, so
    // only the speed implied by the median components is available.
    wind50:  col('10u_p50').map((u, i) => {
      const v = col('10v_p50')[i];
      return u === null || v === null || v === undefined ? null : Math.hypot(u, v);
    }),
  };
}

// ── Render ensemble uncertainty charts ───────────────────────────────────────

function renderEnsembleCharts(data) {
  const container = document.getElementById('fc-ensemble-scroll');
  container.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'fc-ens-head';
  const run = modelRunText(data.refTime);
  head.innerHTML =
    `<h3 class="fc-section-heading">C-LAEF AlpeAdria ensemble</h3>` +
    `<div class="fc-ens-legend">` +
    `<span class="fc-ens-key"><span class="fc-ens-swatch-line"></span>median</span>` +
    `<span class="fc-ens-key"><span class="fc-ens-swatch-band"></span>80% of members (10th–90th percentile)</span>` +
    (run ? `<span class="fc-ens-key">${run}</span>` : '') +
    `<span class="fc-ens-key fc-ens-hint">Hover or tap a chart for values</span>` +
    `</div>`;
  container.appendChild(head);

  const toWind = arr => arr.map(windToUnit);
  const grid = document.createElement('div');
  grid.className = 'fc-chart-grid';
  grid.appendChild(makeEnsembleChart({
    title: 'Temperature', unit: '°C', times: data.times, ...data.temp,
    color: '#ef9a9a', bandFill: 'rgba(239,154,154,0.38)',
    fmt: v => `${v.toFixed(1)}°`, tickFmt: v => `${Math.round(v)}°`,
  }));
  grid.appendChild(makeEnsembleChart({
    title: 'Cloud cover', unit: '%', times: data.times, ...data.cloud,
    color: '#cfd8dc', bandFill: 'rgba(176,190,197,0.32)',
    yMin0: true, yMax: 100, fmt: v => `${Math.round(v)}%`, tickFmt: v => Math.round(v),
  }));
  grid.appendChild(makeEnsembleChart({
    title: 'Wind speed', unit: windUnitLabel(), times: data.times,
    p10: data.wind50.map(() => null), p50: toWind(data.wind50), p90: data.wind50.map(() => null),
    color: '#ce93d8', bandFill: 'rgba(206,147,216,0.35)',
    yMin0: true, yMinSpan: 5, fmt: v => `${Math.round(v)} ${windUnitLabel()}`, tickFmt: v => Math.round(v),
  }));
  grid.appendChild(makeEnsembleChart({
    title: 'Wind gusts', unit: windUnitLabel(), times: data.times,
    p10: toWind(data.gust.p10), p50: toWind(data.gust.p50), p90: toWind(data.gust.p90),
    color: '#ffb74d', bandFill: 'rgba(255,183,77,0.35)',
    yMin0: true, yMinSpan: 5, fmt: v => `${Math.round(v)} ${windUnitLabel()}`, tickFmt: v => Math.round(v),
  }));
  grid.appendChild(makeEnsembleChart({
    title: 'Precipitation', unit: 'mm/h', times: data.times, ...data.precip,
    color: '#64b5f6', bandFill: 'rgba(100,181,246,0.4)',
    yMin0: true, yMinSpan: 1, fmt: v => `${v.toFixed(1)} mm`, tickFmt: v => v.toFixed(1),
  }));
  grid.appendChild(makeEnsembleChart({
    title: 'Accumulated precipitation', unit: 'mm', times: data.times,
    p10: accumulate(data.precip.p10), p50: accumulate(data.precip.p50), p90: accumulate(data.precip.p90),
    color: '#64b5f6', bandFill: 'rgba(100,181,246,0.55)', bars: true,
    yMin0: true, yMinSpan: 2, fmt: v => `${v.toFixed(1)} mm`, tickFmt: v => v.toFixed(1),
  }));
  container.appendChild(grid);

  const note = document.createElement('div');
  note.className = 'fc-hist-note';
  note.textContent = 'Accumulated precipitation: bars sum the hourly median since the start of the run, ' +
    'error bars sum the hourly 10th and 90th percentiles. Only hourly percentiles are published, ' +
    'so the error bars overstate the spread of the true accumulated total. ' +
    'Wind speed is derived from the median wind components, so it has no percentile range.';
  container.appendChild(note);
}

/** Running total of an hourly series; missing hours count as zero. */
function accumulate(arr) {
  let sum = 0;
  return arr.map(v => (sum += v !== null && isFinite(v) ? v : 0));
}

/**
 * Ensemble percentile chart: shaded 10–90 % band, median line, "now" marker
 * and a hover/tap readout. With `bars`, draws median bars with 10–90 % error
 * bars instead.
 */
function makeEnsembleChart({ title, unit, times, p10, p50, p90, color, bandFill, bars = false, yMin0 = false, yMinSpan = 0, yMax = null, fmt = v => v.toFixed(1), tickFmt = v => v }) {
  const W = 640, H = 170;
  const ML = 40, MR = 12, MT = 22, MB = 34;
  const CW = W - ML - MR, CH = H - MT - MB;
  const n = times.length;
  const ok = v => v !== null && isFinite(v);

  const wrapper = document.createElement('div');
  wrapper.className = 'fc-ens-chart';
  const allVals = [...p10, ...p50, ...p90].filter(ok);
  if (n < 2 || !allVals.length) {
    wrapper.textContent = `${title}: no data`;
    return wrapper;
  }

  const rawMin = Math.min(...allVals), rawMax = Math.max(...allVals);
  const span = rawMax - rawMin || 1;
  let yLo = yMin0 ? 0 : rawMin - span * 0.12;
  let yHi = yMax !== null ? yMax : rawMax + span * 0.12;
  if (yHi - yLo < yMinSpan) yHi = yLo + yMinSpan;

  // Lines run edge to edge; bars sit centred in one slot per hour
  const step = bars ? CW / n : CW / (n - 1);
  const xOf = i => ML + (bars ? (i + 0.5) * step : i * step);
  const iOf = x => Math.round((x - ML) / step - (bars ? 0.5 : 0));
  const yOf = v => MT + CH - ((Math.max(yLo, Math.min(yHi, v)) - yLo) / (yHi - yLo)) * CH;

  const svgNS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', style: 'display:block;overflow:visible;touch-action:pan-y' });

  svg.appendChild(el('text', {
    x: ML, y: 13, fill: '#e0e0e0', 'font-size': '12', 'font-family': 'inherit', 'font-weight': '600',
  }, `${title} (${unit})`));

  for (let i = 0; i <= 4; i++) {
    const v = yLo + (yHi - yLo) * (i / 4);
    const y = yOf(v);
    svg.appendChild(el('line', { x1: ML, x2: ML + CW, y1: y, y2: y, stroke: 'rgba(255,255,255,0.08)', 'stroke-width': '1' }));
    svg.appendChild(el('text', {
      x: ML - 6, y: y + 3.5, 'text-anchor': 'end', fill: '#9e9e9e', 'font-size': '10', 'font-family': 'inherit',
    }, tickFmt(v)));
  }

  // X axis: hour ticks on the first row, day labels on the second row
  const tzOpt = displayTZ === 'UTC' ? 'UTC' : undefined;
  const getH  = d => displayTZ === 'UTC' ? d.getUTCHours() : d.getHours();
  const dayKey = d => d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tzOpt });
  let lastDK = null;
  for (let i = 0; i < n; i++) {
    const x = xOf(i);
    const dk = dayKey(times[i]);
    if (dk !== lastDK) {
      // Bars: put the day boundary between slots rather than through a bar
      const xd = bars ? x - step / 2 : x;
      if (i > 0) svg.appendChild(el('line', { x1: xd, x2: xd, y1: MT, y2: MT + CH + 4, stroke: 'rgba(255,255,255,0.25)', 'stroke-width': '1' }));
      svg.appendChild(el('text', {
        x: xd + 3, y: MT + CH + 28, fill: '#bdbdbd', 'font-size': '10', 'font-family': 'inherit', 'font-weight': '600',
      }, dk));
      lastDK = dk;
    }
    const h = getH(times[i]);
    if (h % 6 === 0) {
      svg.appendChild(el('text', {
        x, y: MT + CH + 14, 'text-anchor': 'middle', fill: '#8a8a8a', 'font-size': '9.5', 'font-family': 'inherit',
      }, String(h).padStart(2, '0')));
    }
  }

  if (bars) {
    // Median bars, 10–90 % whiskers with caps
    const bw = step * 0.72, cap = Math.max(2, step * 0.4);
    for (let i = 0; i < n; i++) {
      const x = xOf(i);
      if (ok(p50[i]) && p50[i] > 0) {
        const y = yOf(p50[i]);
        svg.appendChild(el('rect', { x: x - bw / 2, y, width: bw, height: MT + CH - y, fill: bandFill }));
      }
      if (ok(p10[i]) && ok(p90[i]) && p90[i] > p10[i]) {
        const y1 = yOf(p10[i]), y2 = yOf(p90[i]);
        svg.appendChild(el('path', {
          d: `M ${x},${y1} L ${x},${y2} M ${x - cap / 2},${y1} L ${x + cap / 2},${y1} M ${x - cap / 2},${y2} L ${x + cap / 2},${y2}`,
          fill: 'none', stroke: color, 'stroke-width': '1',
        }));
      }
    }
  }

  // Band, percentile edges, median
  const idx = bars ? [] : times.map((_, i) => i).filter(i => ok(p10[i]) && ok(p90[i]));
  const pts = arr => idx.map(i => `${xOf(i).toFixed(1)},${yOf(arr[i]).toFixed(1)}`);
  if (idx.length) {
    const hi = pts(p90), lo = pts(p10);
    svg.appendChild(el('path', { d: `M ${hi.join(' L ')} L ${lo.reverse().join(' L ')} Z`, fill: bandFill, stroke: 'none' }));
    for (const arr of [p10, p90]) {
      svg.appendChild(el('path', { d: `M ${pts(arr).join(' L ')}`, fill: 'none', stroke: color, 'stroke-width': '1', 'stroke-opacity': '0.55' }));
    }
  }
  const medIdx = bars ? [] : times.map((_, i) => i).filter(i => ok(p50[i]));
  if (medIdx.length) {
    svg.appendChild(el('path', {
      d: 'M ' + medIdx.map(i => `${xOf(i).toFixed(1)},${yOf(p50[i]).toFixed(1)}`).join(' L '),
      fill: 'none', stroke: color, 'stroke-width': '2.4', 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
  }

  // "Now" marker
  const nowIdx = findNowIndex(times);
  if (nowIdx >= 0) {
    const frac = (Date.now() - times[nowIdx].getTime()) / (times[1] - times[0]);
    const x = xOf(nowIdx) + Math.min(1, frac) * step;
    if (x <= ML + CW) {
      svg.appendChild(el('line', { x1: x, x2: x, y1: MT, y2: MT + CH, stroke: '#26a69a', 'stroke-width': '1.5' }));
      svg.appendChild(el('text', { x: x + 3, y: MT + 10, fill: '#80cbc4', 'font-size': '9.5', 'font-family': 'inherit' }, 'now'));
    }
  }

  svg.appendChild(el('rect', { x: ML, y: MT, width: CW, height: CH, fill: 'none', stroke: 'rgba(255,255,255,0.1)', 'stroke-width': '1' }));

  // Hover / tap readout
  const hair = el('g', { visibility: 'hidden', 'pointer-events': 'none' });
  const hairLine = el('line', { y1: MT, y2: MT + CH, stroke: 'rgba(255,255,255,0.5)', 'stroke-width': '1', 'stroke-dasharray': '3,2' });
  const hairDot = el('circle', { r: '3.5', fill: color, stroke: '#fff', 'stroke-width': '1.2' });
  const tipBg = el('rect', { rx: '4', ry: '4', fill: 'rgba(15,15,15,0.92)', stroke: 'rgba(255,255,255,0.2)', 'stroke-width': '1' });
  const tipTxt = el('text', { fill: '#f5f5f5', 'font-size': '10.5', 'font-family': 'inherit' });
  hair.append(hairLine, hairDot, tipBg, tipTxt);
  svg.appendChild(hair);

  const overlay = el('rect', { x: ML, y: MT, width: CW, height: CH, fill: 'transparent', style: 'cursor:crosshair' });
  svg.appendChild(overlay);
  const showAt = clientX => {
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const i = Math.max(0, Math.min(n - 1, iOf((clientX - r.left) * (W / r.width))));
    if (!ok(p50[i])) { hair.setAttribute('visibility', 'hidden'); return; }
    const x = xOf(i), y = yOf(p50[i]);
    hairLine.setAttribute('x1', x); hairLine.setAttribute('x2', x);
    hairDot.setAttribute('cx', x);  hairDot.setAttribute('cy', y);
    const t = times[i];
    const hh = String(getH(t)).padStart(2, '0');
    const range = ok(p10[i]) && ok(p90[i]) ? ` (${fmt(p10[i])} – ${fmt(p90[i])})` : '';
    tipTxt.textContent = `${dayKey(t)} ${hh}:00 · ${fmt(p50[i])}${range}`;
    const tw = tipTxt.getComputedTextLength ? tipTxt.getComputedTextLength() : tipTxt.textContent.length * 5.6;
    const tx = x + 10 + tw > ML + CW ? x - tw - 10 : x + 10;
    const ty = MT + 16;
    tipTxt.setAttribute('x', tx); tipTxt.setAttribute('y', ty);
    tipBg.setAttribute('x', tx - 5); tipBg.setAttribute('y', ty - 12);
    tipBg.setAttribute('width', tw + 10); tipBg.setAttribute('height', 17);
    hair.setAttribute('visibility', 'visible');
  };
  overlay.addEventListener('pointermove', e => showAt(e.clientX));
  overlay.addEventListener('pointerdown', e => showAt(e.clientX));
  overlay.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hair.setAttribute('visibility', 'hidden'); });

  wrapper.appendChild(svg);
  return wrapper;
}

// ── Weather icon helper ──────────────────────────────────────────────────────

function weatherIcon(tcc, rain, hour, snow = 0) {
  const isNight = hour < 6 || hour >= 21;
  if (isFinite(snow) && snow > 0.1) {
    if (tcc < 0.5) return '🌨️';
    return '❄️';
  }
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

// ── Search ───────────────────────────────────────────────────────────────────

function initSearch() {
  const input = document.getElementById('fc-search-input');
  const results = document.getElementById('fc-search-results');

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = input.value.trim();
    if (q.length < 2) { results.classList.add('hidden'); return; }
    searchTimeout = setTimeout(() => searchLocation(q), 350);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#fc-search-box')) results.classList.add('hidden');
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.blur(); results.classList.add('hidden'); }
  });
}

async function searchLocation(query) {
  const results = document.getElementById('fc-search-results');
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=9,46,17,49&bounded=0&accept-language=en`;
    const data = await fetchJSON(url);
    if (!data.length) {
      results.innerHTML = '<div class="fc-search-item fc-search-empty">No results found</div>';
      results.classList.remove('hidden');
      return;
    }
    results.innerHTML = '';
    for (const item of data) {
      const div = document.createElement('div');
      div.className = 'fc-search-item';
      div.textContent = item.display_name;
      div.addEventListener('click', () => {
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        const searchInput = document.getElementById('fc-search-input');
        searchInput.value = '';
        searchInput.blur();
        results.classList.add('hidden');

        if (item.boundingbox) {
          const bb = item.boundingbox;
          map.flyToBounds([[bb[0], bb[2]], [bb[1], bb[3]]], { duration: 1, maxZoom: 13 });
        } else {
          map.flyTo([lat, lon], 10, { duration: 1 });
        }

        const shortName = item.display_name.split(',').slice(0, 2).join(',').trim();
        selectLocation(lat, lon, { label: shortName });
      });
      results.appendChild(div);
    }
    results.classList.remove('hidden');
  } catch (err) {
    console.error('Search error:', err);
    results.innerHTML = '<div class="fc-search-item fc-search-empty">Search failed</div>';
    results.classList.remove('hidden');
  }
}

// ── Station functions ────────────────────────────────────────────────────────

async function ensureStationMeta() {
  if (stationMeta) return stationMeta;
  const tawesJson = await fetchJSON(`${API_BASE}/station/current/${TAWES_RESOURCE}/metadata`);
  stationMeta = tawesJson.stations.filter(s => s.is_active);
  return stationMeta;
}

async function ensureSiagStations() {
  if (siagStations) return siagStations;
  const [valleyJson, mountainJson] = await Promise.all([
    fetchJSON('https://static-weather.province.bz.it/stations-data/website/valley.json'),
    fetchJSON('https://static-weather.province.bz.it/stations-data/website/mountain.json'),
  ]);
  const rows = [...(valleyJson.stations || []), ...(mountainJson.stations || [])];
  siagStations = rows.map(r => {
    const measurements = new Map((r.statistics || []).map(s => [s.sensorCode, s]));
    const value = code => measurements.get(code)?.sensorValue ?? null;
    const lastUpdated = [...measurements.values()]
      .map(s => s.sensorLastValidDate)
      .filter(Boolean)
      .sort()
      .at(-1) || null;
    return {
      code:      r.code,
      name:      r.name_en || r.name_de || r.name_it || r.code,
      lat:       r.lat,
      lon:       r.lon,
      altitude:  r.elevation,
      t:         value('LT'),
      rh:        value('LF'),
      ff:        value('WG') * 3.6,
      bb:        value('WG.BOE') * 3.6,
      dd:        value('WR'),
      p:         value('LD.RED'),
      n:         value('N'),
      lastUpdated,
    };
  });
  return siagStations;
}

async function loadStationSourceSets() {
  const [stations, siag, trentino] = await Promise.all([
    ensureStationMeta().catch(() => []),
    ensureSiagStations().catch(() => []),
    ensureTrentinoStations().catch(() => []),
  ]);
  return { stations, siag, trentino };
}

/** Add a clickable station marker; clicking also makes it the selected location. */
function addStationMarker(type, s, color, tooltip) {
  const marker = L.circleMarker([s.lat, s.lon], {
    radius: 8,
    color,
    fillColor: color,
    fillOpacity: 0.7,
    weight: 1.5,
    bubblingMouseEvents: false,  // don't also trigger the map click handler
  });
  marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -6] });
  marker.on('click', () => {
    selectedLatLng = L.latLng(s.lat, s.lon);
    selectedLabel = null;
    writeHash();
    openStation(type, s, marker);
  });
  stationMarkerLayer.addLayer(marker);
  stationMarkerIndex.set(s, marker);
}

function expandPanel() {
  document.getElementById('fc-forecast-panel').classList.remove('fc-panel-collapsed');
}

function openStation(type, s, marker) {
  expandPanel();
  if (type === 'tawes') onStationClick(s, marker);
  else if (type === 'siag') onSiagStationClick(s, marker);
  else onTrentinoStationClick(s, marker);
}

/** Open the station closest to a point (station mode only). */
async function openNearestStation(lat, lng) {
  await stationMarkersReady;
  const found = await findNearestStation(lat, lng);
  if (!found || !MODELS[currentModel].isStation) return;
  const marker = stationMarkerIndex.get(found.station);
  if (marker) openStation(found.type, found.station, marker);
}

async function showStationMarkers() {
  stationMarkerLayer.clearLayers();
  stationMarkerIndex.clear();
  try {
    const { stations, siag, trentino } = await loadStationSourceSets();
    for (const s of stations) {
      addStationMarker('tawes', s, '#ff9800', s.name);
    }
    for (const s of siag) {
      if (!isFinite(s.lat) || !isFinite(s.lon)) continue;
      addStationMarker('siag', s, '#29b6f6', `${s.name} (South Tyrol)`);
    }
    for (const s of trentino) {
      if (!isFinite(s.lat) || !isFinite(s.lon)) continue;
      addStationMarker('trentino', s, '#29b6f6', `${s.name} (Trentino)`);
    }
  } catch (err) {
    console.error('Error loading station metadata:', err);
  }
}

function hideStationMarkers() {
  stationMarkerLayer.clearLayers();
  if (selectedStationMarker) { selectedStationMarker = null; }
}

async function onStationClick(station, marker) {
  if (selectedStationMarker) {
    const origColor = selectedStationMarker._origColor || '#ff9800';
    selectedStationMarker.setStyle({ color: origColor, fillColor: origColor });
  }
  marker._origColor = '#ff9800';
  marker.setStyle({ color: '#26a69a', fillColor: '#26a69a' });
  selectedStationMarker = marker;

  const panel = document.getElementById('fc-forecast-panel');
  const loading = document.getElementById('fc-forecast-loading');
  const stationDataEl = document.getElementById('fc-station-data');

  panel.classList.remove('hidden');
  resetPanelContent();
  loading.classList.remove('hidden');
  document.getElementById('fc-click-hint').classList.add('hidden');
  lastHistData = null;

  const loadingSpan = loading.querySelector('span');
  loadingSpan.textContent = 'Loading station data\u2026';
  const spinner = loading.querySelector('.fc-spin-ring');
  spinner.style.display = '';

  document.getElementById('fc-forecast-location').textContent =
    `${station.name} \u00b7 ${station.altitude} m \u00b7 ${station.state}`;

  try {
    const url = `${API_BASE}/station/current/${TAWES_RESOURCE}?parameters=${STATION_PARAMS}&station_ids=${station.id}&output_format=geojson`;
    const json = await fetchJSON(url);
    const timestamp = json.timestamps[0];
    const params = json.features[0].properties.parameters;
    renderStationData(params, station, timestamp);
    loading.classList.add('hidden');
    stationDataEl.classList.remove('hidden');
  } catch (err) {
    console.error('Station data error:', err);
    spinner.style.display = 'none';
    loadingSpan.textContent = 'Error loading station data.';
  }
}

async function ensureTrentinoStations() {
  if (trentinoStations) return trentinoStations;
  const xml = await fetchXML('https://dati.meteotrentino.it/service.asmx/getListOfMeteoStations');
  const ns = 'http://www.meteotrentino.it/';
  const stations = [];
  for (const el of xml.getElementsByTagNameNS(ns, 'pointOfMeasureInfo')) {
    const getText = tag => el.getElementsByTagNameNS(ns, tag)[0]?.textContent?.trim();
    const enddate = getText('enddate');
    if (enddate && /\d/.test(enddate)) continue; // inactive station
    const code = getText('code');
    const name = getText('name');
    const elevation = parseFloat(getText('elevation'));
    const lat = parseFloat(getText('latitude'));
    const lon = parseFloat(getText('longitude'));
    if (!code || !name || !isFinite(lat) || !isFinite(lon)) continue;
    stations.push({ code, name, elevation: isFinite(elevation) ? elevation : null, lat, lon });
  }
  trentinoStations = stations;
  return stations;
}

function parseTrentinoXML(xml) {
  const ns = 'http://www.meteotrentino.it/';
  const getEls = tag => [...xml.getElementsByTagNameNS(ns, tag)];

  const getLatestItem = (itemTag, valueTag = 'value') => {
    const items = getEls(itemTag);
    for (let i = items.length - 1; i >= 0; i--) {
      const v = parseFloat(items[i].getElementsByTagNameNS(ns, valueTag)[0]?.textContent);
      if (isFinite(v)) {
        const date = items[i].getElementsByTagNameNS(ns, 'date')[0]?.textContent?.trim();
        return { value: v, date };
      }
    }
    return null;
  };

  const tempResult     = getLatestItem('air_temperature');
  const precipResult   = getLatestItem('precipitation');
  const humidityResult = getLatestItem('relative_humidity');
  const radResult      = getLatestItem('global_radiation');

  // Wind uses wind_list > wind10m > speed_value / direction_value / windgust
  const windItems = getEls('wind10m');
  let windSpeed = null, windDir = null, windGust = null, windDate = null;
  for (let i = windItems.length - 1; i >= 0; i--) {
    const s = parseFloat(windItems[i].getElementsByTagNameNS(ns, 'speed_value')[0]?.textContent);
    if (isFinite(s)) {
      windSpeed = s;
      windDir   = parseFloat(windItems[i].getElementsByTagNameNS(ns, 'direction_value')[0]?.textContent);
      windGust  = parseFloat(windItems[i].getElementsByTagNameNS(ns, 'windgust')[0]?.textContent);
      windDate  = windItems[i].getElementsByTagNameNS(ns, 'date')[0]?.textContent?.trim();
      break;
    }
  }

  // Snow depth
  const snowItems = getEls('snow_depth');
  let snow = null;
  for (let i = snowItems.length - 1; i >= 0; i--) {
    const v = parseFloat(snowItems[i].getElementsByTagNameNS(ns, 'value')[0]?.textContent);
    if (isFinite(v)) { snow = v; break; }
  }

  return {
    temp:      tempResult?.value ?? null,
    precip:    precipResult?.value ?? null,
    windSpeed,
    windDir,
    windGust,
    humidity:  humidityResult?.value ?? null,
    radiation: radResult?.value ?? null,
    snow,
    timestamp: tempResult?.date || windDate || precipResult?.date || null,
  };
}

/** Parse a Meteotrentino timestamp string (e.g. "2026-04-21T14:30:00+01") to a Date. */
function parseTrentinoTimestamp(str) {
  if (!str) return null;
  try {
    const normalized = str.replace(/([+-]\d{2})$/, '$1:00');
    const ts = new Date(normalized);
    return isFinite(ts.getTime()) ? ts : null;
  } catch { return null; }
}

async function onTrentinoStationClick(station, marker) {
  if (selectedStationMarker) {
    const origColor = selectedStationMarker._origColor || '#ff9800';
    selectedStationMarker.setStyle({ color: origColor, fillColor: origColor });
  }
  marker._origColor = '#29b6f6';
  marker.setStyle({ color: '#26a69a', fillColor: '#26a69a' });
  selectedStationMarker = marker;
  lastHistData = null;

  const panel = document.getElementById('fc-forecast-panel');
  const loading = document.getElementById('fc-forecast-loading');
  const stationDataEl = document.getElementById('fc-station-data');

  panel.classList.remove('hidden');
  resetPanelContent();
  loading.classList.remove('hidden');
  document.getElementById('fc-click-hint').classList.add('hidden');

  const loadingSpan = loading.querySelector('span');
  loadingSpan.textContent = 'Loading station data\u2026';
  const spinner = loading.querySelector('.fc-spin-ring');
  spinner.style.display = '';

  document.getElementById('fc-forecast-location').textContent =
    `${station.name} \u00b7 ${isFinite(station.elevation) ? station.elevation + ' m \u00b7 ' : ''}Trentino`;

  try {
    const xml = await fetchXML(`https://dati.meteotrentino.it/service.asmx/getLastDataOfMeteoStation?codice=${encodeURIComponent(station.code)}`);
    const stationData = parseTrentinoXML(xml);

    lastForecastData = { isTrentino: true, station, stationData };
    renderTrentinoStationData(stationData, station);
    loading.classList.add('hidden');
    stationDataEl.classList.remove('hidden');
  } catch (err) {
    console.error('Trentino station data error:', err);
    spinner.style.display = 'none';
    loadingSpan.textContent = '\u26a0\ufe0f Error loading station data. The service may be temporarily unavailable.';
  }
}

function renderTrentinoStationData(stationData, station) {
  const stationDataEl = document.getElementById('fc-station-data');
  const panel = document.getElementById('fc-forecast-panel');
  const loading = document.getElementById('fc-forecast-loading');

  panel.classList.remove('hidden');
  resetPanelContent();
  loading.classList.add('hidden');
  document.getElementById('fc-click-hint').classList.add('hidden');

  document.getElementById('fc-forecast-location').textContent =
    `${station.name} \u00b7 ${isFinite(station.elevation) ? station.elevation + ' m \u00b7 ' : ''}Trentino`;

  const toUnit = windToUnit;
  const unitLabel = windUnitLabel();

  const compassDir = (deg) => {
    if (!isFinite(deg)) return '';
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
  };

  let timeFmt = '';
  const ts = parseTrentinoTimestamp(stationData.timestamp);
  if (ts) {
    timeFmt = displayTZ === 'UTC'
      ? `${ts.toISOString().replace('T', ' ').substring(0, 16)} UTC`
      : ts.toLocaleString();
  }

  let html = timeFmt ? `<div class="fc-station-time">Measured at ${timeFmt}</div>` : '';
  html += '<h3 class="fc-section-heading">Current observations</h3>';
  html += '<div class="fc-station-grid">';

  const { temp, precip, windSpeed, windDir, windGust, humidity, radiation, snow } = stationData;

  if (isFinite(temp)) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F321}\uFE0F</span>
      <span class="fc-sp-val" style="background:${tempColor(temp)}">${temp.toFixed(1)} \u00B0C</span>
      <span class="fc-sp-label">Temperature</span>
    </div>`;
  }
  if (isFinite(humidity)) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F4A7}</span>
      <span class="fc-sp-val">${humidity.toFixed(0)} %</span>
      <span class="fc-sp-label">Humidity</span>
    </div>`;
  }
  if (isFinite(windSpeed)) {
    const dir = isFinite(windDir) ? ` ${compassDir(windDir)}` : '';
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F4A8}</span>
      <span class="fc-sp-val">${toUnit(windSpeed).toFixed(1)} ${unitLabel}${dir}</span>
      <span class="fc-sp-label">Wind</span>
    </div>`;
  }
  if (isFinite(windGust) && windGust > 0) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F32C}\uFE0F</span>
      <span class="fc-sp-val" style="color:${windColor(windGust)}">${toUnit(windGust).toFixed(1)} ${unitLabel}</span>
      <span class="fc-sp-label">Gusts</span>
    </div>`;
  }
  if (isFinite(precip) && precip > 0) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F327}\uFE0F</span>
      <span class="fc-sp-val">${precip.toFixed(1)} mm</span>
      <span class="fc-sp-label">Rain (15 min)</span>
    </div>`;
  }
  if (isFinite(snow) && snow > 0) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u2744\uFE0F</span>
      <span class="fc-sp-val">${snow.toFixed(0)} cm</span>
      <span class="fc-sp-label">Snow depth</span>
    </div>`;
  }
  if (isFinite(radiation) && radiation >= 0) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u2600\uFE0F</span>
      <span class="fc-sp-val">${Math.round(radiation)} W/m²</span>
      <span class="fc-sp-label">Solar radiation</span>
    </div>`;
  }

  html += '</div>';
  html += `<div class="fc-station-credit">Data: <a href="https://www.meteotrentino.it/" target="_blank" rel="noopener">Meteotrentino / Provincia Autonoma di Trento</a> (CC BY 4.0)</div>`;

  stationDataEl.innerHTML = html;
  stationDataEl.classList.remove('hidden');
}

function onSiagStationClick(station, marker) {
  if (selectedStationMarker) {
    const origColor = selectedStationMarker._origColor || '#ff9800';
    selectedStationMarker.setStyle({ color: origColor, fillColor: origColor });
  }
  marker._origColor = '#29b6f6';
  marker.setStyle({ color: '#26a69a', fillColor: '#26a69a' });
  selectedStationMarker = marker;
  lastHistData = null;
  lastForecastData = { isSiag: true, station };
  renderSiagStationData(station);
}

function renderSiagStationData(station) {
  const stationDataEl = document.getElementById('fc-station-data');
  const panel = document.getElementById('fc-forecast-panel');
  const loading = document.getElementById('fc-forecast-loading');

  panel.classList.remove('hidden');
  resetPanelContent();
  loading.classList.add('hidden');
  document.getElementById('fc-click-hint').classList.add('hidden');

  document.getElementById('fc-forecast-location').textContent =
    `${station.name} \u00b7 ${station.altitude != null ? station.altitude + ' m' : ''} \u00b7 South Tyrol`;

  const KMH_TO_MS = 1 / 3.6;
  const toUnit = v => windToUnit(isFinite(v) ? v * KMH_TO_MS : v);
  const unitLabel = windUnitLabel();

  const compassDir = (deg) => {
    if (!isFinite(deg)) return '';
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
  };

  const ts = station.lastUpdated ? new Date(station.lastUpdated) : null;
  const timeFmt = ts
    ? (displayTZ === 'UTC' ? `${ts.toISOString().replace('T', ' ').substring(0, 16)} UTC` : ts.toLocaleString())
    : '';

  let html = timeFmt ? `<div class="fc-station-time">Measured at ${timeFmt}</div>` : '';
  html += '<h3 class="fc-section-heading">Current observations</h3>';
  html += '<div class="fc-station-grid">';

  const t = parseFloat(station.t);
  const rh = parseFloat(station.rh);
  const ff = parseFloat(station.ff);
  const bb = parseFloat(station.bb);
  const dd = parseFloat(station.dd);
  const p = parseFloat(station.p);
  const n = parseFloat(station.n);

  if (isFinite(t)) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F321}\uFE0F</span>
      <span class="fc-sp-val" style="background:${tempColor(t)}">${t.toFixed(1)} \u00B0C</span>
      <span class="fc-sp-label">Temperature</span>
    </div>`;
  }
  if (isFinite(rh)) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F4A7}</span>
      <span class="fc-sp-val">${rh.toFixed(0)} %</span>
      <span class="fc-sp-label">Humidity</span>
    </div>`;
  }
  if (isFinite(p)) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F4CA}</span>
      <span class="fc-sp-val">${p.toFixed(1)} hPa</span>
      <span class="fc-sp-label">Pressure</span>
    </div>`;
  }
  if (isFinite(ff) && ff > 0) {
    const dir = isFinite(dd) ? ` ${compassDir(dd)}` : '';
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F4A8}</span>
      <span class="fc-sp-val">${toUnit(ff).toFixed(1)} ${unitLabel}${dir}</span>
      <span class="fc-sp-label">Wind</span>
    </div>`;
  }
  if (isFinite(bb) && bb > 0) {
    const windMs = bb * KMH_TO_MS;
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F32C}\uFE0F</span>
      <span class="fc-sp-val" style="color:${windColor(windMs)}">${toUnit(bb).toFixed(1)} ${unitLabel}</span>
      <span class="fc-sp-label">Gusts</span>
    </div>`;
  }
  if (isFinite(n) && n > 0) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F327}\uFE0F</span>
      <span class="fc-sp-val">${n.toFixed(1)} mm</span>
      <span class="fc-sp-label">Rain (since midnight)</span>
    </div>`;
  }
  html += '</div>';
  html += `<div class="fc-station-credit">Data: <a href="https://weather.province.bz.it/" target="_blank" rel="noopener">SIAG / Province of Bolzano</a></div>`;

  stationDataEl.innerHTML = html;
  stationDataEl.classList.remove('hidden');
}

function renderStationData(params, station, timestamp) {
  const container = document.getElementById('fc-station-data');
  const toUnit = windToUnit;
  const unitLabel = windUnitLabel();

  const ts = new Date(timestamp);
  const timeFmt = displayTZ === 'UTC'
    ? `${ts.toISOString().replace('T', ' ').substring(0, 16)} UTC`
    : ts.toLocaleString();

  const getValue = (key) => {
    if (!params[key] || params[key].data[0] === null) return null;
    return params[key].data[0];
  };

  const temp = getValue('TL');
  const rain = getValue('RR');
  const wind = getValue('FF');
  const windDir = getValue('DD');
  const gust = getValue('FFX');
  const humidity = getValue('RF');
  const pressure = getValue('P');
  const snow = getValue('SCHNEE');

  const compassDir = (deg) => {
    if (!isFinite(deg)) return '';
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
  };

  let html = `<div class="fc-station-time">Measured at ${timeFmt}</div>`;
  html += '<h3 class="fc-section-heading">Current observations</h3>';
  html += '<div class="fc-station-grid">';

  if (temp !== null) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F321}\uFE0F</span>
      <span class="fc-sp-val" style="background:${tempColor(temp)}">${temp.toFixed(1)} \u00B0C</span>
      <span class="fc-sp-label">Temperature</span>
    </div>`;
  }

  if (humidity !== null) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F4A7}</span>
      <span class="fc-sp-val">${humidity.toFixed(0)} %</span>
      <span class="fc-sp-label">Humidity</span>
    </div>`;
  }

  if (pressure !== null) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F4CA}</span>
      <span class="fc-sp-val">${pressure.toFixed(1)} hPa</span>
      <span class="fc-sp-label">Pressure</span>
    </div>`;
  }

  if (wind !== null) {
    const dir = windDir !== null ? ` ${compassDir(windDir)}` : '';
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F4A8}</span>
      <span class="fc-sp-val">${toUnit(wind).toFixed(1)} ${unitLabel}${dir}</span>
      <span class="fc-sp-label">Wind</span>
    </div>`;
  }

  if (gust !== null && gust > 0) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F32C}\uFE0F</span>
      <span class="fc-sp-val" style="color:${windColor(gust)}">${toUnit(gust).toFixed(1)} ${unitLabel}</span>
      <span class="fc-sp-label">Gusts</span>
    </div>`;
  }

  if (rain !== null && rain > 0) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u{1F327}\uFE0F</span>
      <span class="fc-sp-val">${rain.toFixed(1)} mm</span>
      <span class="fc-sp-label">Rain (10 min)</span>
    </div>`;
  }

  if (snow !== null && snow > 0) {
    html += `<div class="fc-station-param">
      <span class="fc-sp-icon">\u2744\uFE0F</span>
      <span class="fc-sp-val">${snow.toFixed(0)} cm</span>
      <span class="fc-sp-label">Snow depth</span>
    </div>`;
  }

  html += '</div>';

  html += `<div class="fc-hist-btn-wrap">
    <button class="fc-hist-btn" id="fc-hist-btn" aria-expanded="false">Show past 48 hours ▾</button>
  </div>
  <div id="fc-hist-charts-placeholder"></div>`;

  container.innerHTML = html;

  const btn = document.getElementById('fc-hist-btn');
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    histWanted = !open;
    if (open) hideStationHistory();
    else showStationHistory(station);
  });

  lastForecastData = { isStation: true, params, station, timestamp };

  // Keep the history open across re-renders (unit/TZ toggles) and station clicks
  if (histWanted) showStationHistory(station);
}

function setHistButton(state) {
  const btn = document.getElementById('fc-hist-btn');
  if (!btn) return;
  btn.disabled = state === 'loading';
  btn.setAttribute('aria-expanded', String(state === 'open'));
  btn.textContent = {
    closed:  'Show past 48 hours ▾',
    loading: 'Loading…',
    open:    'Hide past 48 hours ▴',
    error:   'No history data available · retry',
  }[state];
}

function hideStationHistory() {
  document.getElementById('fc-hist-charts-placeholder').innerHTML = '';
  setHistButton('closed');
}

async function showStationHistory(station) {
  let histData = lastHistData?.stationId === station.id ? lastHistData : null;
  if (!histData) {
    setHistButton('loading');
    histData = await fetchStationHistory(station.id);
    // The user may have picked another station meanwhile
    if (lastForecastData?.station !== station) return;
    if (!histData) { setHistButton('error'); return; }
    histData.stationId = station.id;
    lastHistData = histData;
  }
  renderStationHistoryCharts(histData);
  setHistButton('open');
}

// ── Station history charts ───────────────────────────────────────────────────

async function fetchStationHistory(stationId) {
  if (stationId == null) return null;
  const now = new Date();
  const end = now.toISOString().substring(0, 16);
  const start = new Date(now - 48 * 3600 * 1000).toISOString().substring(0, 16);
  const url = `${API_BASE}/station/historical/${HIST_RESOURCE}?parameters=${HIST_PARAMS}&station_ids=${stationId}&start=${start}&end=${end}`;
  try {
    const json = await fetchJSON(url);
    if (!json.timestamps || json.timestamps.length === 0) return null;
    const feat = json.features?.[0];
    if (!feat) return null;
    const p = feat.properties.parameters;
    const times = json.timestamps.map(ts => new Date(ts));
    if (times.length < 2) return null;

    const tempData = p.TL?.data ?? p.tl?.data ?? [];
    const humidityData = p.RF?.data ?? p.rf?.data ?? [];
    const pressureData = p.P?.data ?? p.p?.data ?? [];
    const windData = p.FF?.data ?? p.ff?.data ?? [];
    const rainData = p.RR?.data ?? p.rr?.data ?? [];

    // Keep every 30-minute slot to reduce clutter while preserving sub-hourly detail.
    const sampledIdx = [];
    for (let i = 0; i < times.length; i++) {
      const minute = times[i].getUTCMinutes();
      if (minute === 0 || minute === 30) sampledIdx.push(i);
    }
    if (sampledIdx.length < 2) return null;

    const pick = arr => sampledIdx.map(i => (i < arr.length ? arr[i] : null));

    // RR is the 10 min sum ending at the timestamp, so a value stamped exactly
    // on the hour belongs to the previous hour.
    const bins = new Map();
    for (let i = 0; i < times.length; i++) {
      const v = rainData[i];
      if (v === null || v === undefined || !isFinite(v)) continue;
      const hourStart = Math.floor((times[i].getTime() - 1) / 3600000) * 3600000;
      bins.set(hourStart, (bins.get(hourStart) ?? 0) + v);
    }
    const rainHours = [...bins.keys()].sort((a, b) => a - b);
    let run = 0;
    return {
      rainTimes: rainHours.map(t => new Date(t)),
      rainHourly: rainHours.map(t => bins.get(t)),
      rainAccum: rainHours.map(t => (run += bins.get(t))),
      times: sampledIdx.map(i => times[i]),
      temp: pick(tempData),
      humidity: pick(humidityData),
      pressure: pick(pressureData),
      wind: pick(windData),
    };
  } catch {
    return null;
  }
}

function renderStationHistoryCharts(histData) {
  const container = document.getElementById('fc-hist-charts-placeholder');
  container.innerHTML = '';
  const toWind = windToUnit;
  const windLabel = windUnitLabel();

  const wrap = document.createElement('div');
  wrap.className = 'fc-station-charts';
  const histHeading = document.createElement('h3');
  histHeading.className = 'fc-section-heading';
  histHeading.textContent = 'Last 48 hours · 30 min values (precipitation hourly) · hover or tap for details';
  wrap.appendChild(histHeading);
  const grid = document.createElement('div');
  grid.className = 'fc-chart-grid';
  const series = [
    { name: 'temperature', title: 'Temperature (°C)', values: histData.temp, color: '#ef9a9a' },
    { name: 'humidity', title: 'Humidity (%)', values: histData.humidity, color: '#64b5f6', yMin0: true, yMax: 100 },
    { name: 'pressure', title: 'Pressure (hPa)', values: histData.pressure, color: '#80cbc4' },
    { name: 'wind', title: `Wind (${windLabel})`, values: histData.wind.map(toWind), color: '#ce93d8', yMin0: true },
  ];
  // Not every station measures everything (e.g. wind-only rooftop sites)
  series.push(
    { name: 'precipitation', title: 'Precipitation (mm/h)', values: histData.rainHourly, times: histData.rainTimes,
      color: '#64b5f6', yMin0: true, bars: true, dec: 2 },
    { name: 'accumulated precipitation', title: 'Accumulated precipitation (mm)', values: histData.rainAccum, times: histData.rainTimes,
      color: '#4fc3f7', yMin0: true, bars: true, dec: 2 },
  );
  const hasData = v => v.filter(x => x !== null && isFinite(x)).length >= 2;
  const missing = series.filter(c => !hasData(c.values)).map(c => c.name);
  for (const c of series.filter(c => hasData(c.values))) {
    grid.appendChild(makeHistoryChart({ times: histData.times, ...c }));
  }
  wrap.appendChild(grid);
  if (missing.length) {
    const note = document.createElement('div');
    note.className = 'fc-hist-note';
    note.textContent = `Not measured at this station: ${missing.join(', ')}`;
    wrap.appendChild(note);
  }
  container.appendChild(wrap);
}

function makeHistoryChart({ title, times, values, color, yMin0 = false, yMax = null, bars = false, dec = 1 }) {
  const W = 640, H = 150;
  const ML = 40, MR = 12, MT = 22, MB = 34;
  const CW = W - ML - MR, CH = H - MT - MB;
  const n = times.length;

  const valid = values.filter(v => v !== null && isFinite(v));
  const wrapper = document.createElement('div');
  wrapper.className = 'fc-station-chart';
  if (valid.length < 2) return wrapper;

  const rawMin = Math.min(...valid);
  const rawMax = Math.max(...valid);
  const span = rawMax - rawMin || 1;
  let yLo = yMin0 ? 0 : rawMin - span * 0.1;
  let yHi = yMax !== null ? yMax : rawMax + span * 0.1;
  if (yHi <= yLo) { yLo -= 1; yHi += 1; }

  // Bars sit centred in one slot per value; lines run edge to edge
  const step = bars ? CW / n : CW / Math.max(n - 1, 1);
  const xOf = i => ML + (bars ? (i + 0.5) * step : i * step);
  const iOf = x => Math.round((x - ML) / step - (bars ? 0.5 : 0));
  const yOf = v => MT + CH - ((v - yLo) / (yHi - yLo)) * CH;
  const clamp = v => Math.max(yLo, Math.min(yHi, v));

  const svgNS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', style: 'display:block;overflow:visible;touch-action:pan-y' });

  // Title
  svg.appendChild(el('text', {
    x: ML, y: 13,
    fill: '#e0e0e0', 'font-size': '12', 'font-family': 'inherit', 'font-weight': '600',
  }, title));

  // Y-axis grid + ticks
  for (let i = 0; i <= 4; i++) {
    const v = yLo + (yHi - yLo) * (i / 4);
    const y = yOf(v);
    svg.appendChild(el('line', { x1: ML, x2: ML + CW, y1: y, y2: y, stroke: 'rgba(255,255,255,0.07)', 'stroke-width': '1' }));
    const lbl = Math.abs(v) < 10 ? v.toFixed(1) : String(Math.round(v));
    svg.appendChild(el('text', {
      x: ML - 6, y: y + 3.5, 'text-anchor': 'end',
      fill: '#9e9e9e', 'font-size': '10', 'font-family': 'inherit',
    }, lbl));
  }

  // X-axis time labels
  const tzOpt = displayTZ === 'UTC' ? 'UTC' : undefined;
  const getH = d => displayTZ === 'UTC' ? d.getUTCHours() : d.getHours();
  let prevDK = null;
  for (let i = 0; i < n; i++) {
    const h = getH(times[i]);
    const m = displayTZ === 'UTC' ? times[i].getUTCMinutes() : times[i].getMinutes();
    const dk = times[i].toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tzOpt });
    const x = xOf(i);
    // Day labels on a second row so they never collide with the hour ticks
    if (dk !== prevDK) {
      const xd = bars ? x - step / 2 : x;
      if (i > 0) svg.appendChild(el('line', { x1: xd, x2: xd, y1: MT, y2: MT + CH + 4, stroke: 'rgba(255,255,255,0.25)', 'stroke-width': '1' }));
      svg.appendChild(el('text', {
        x: xd + 3, y: MT + CH + 28,
        fill: '#bdbdbd', 'font-size': '10', 'font-family': 'inherit', 'font-weight': '600',
      }, dk));
      prevDK = dk;
    }
    if (m === 0 && h % 6 === 0) {
      svg.appendChild(el('line', { x1: x, x2: x, y1: MT + CH, y2: MT + CH + 4, stroke: 'rgba(255,255,255,0.15)', 'stroke-width': '1' }));
      svg.appendChild(el('text', {
        x, y: MT + CH + 14, 'text-anchor': 'middle',
        fill: '#8a8a8a', 'font-size': '9.5', 'font-family': 'inherit',
      }, String(h).padStart(2, '0')));
    }
  }

  if (bars) {
    const bw = step * 0.78;
    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (v === null || !isFinite(v) || v <= 0) continue;
      const y = yOf(clamp(v));
      svg.appendChild(el('rect', { x: xOf(i) - bw / 2, y, width: bw, height: MT + CH - y, fill: color, 'fill-opacity': '0.75' }));
    }
  }

  // Line path (with gap handling for nulls)
  let pathD = '';
  let inSeg = false;
  for (let i = 0; i < n && !bars; i++) {
    const v = values[i];
    if (v === null || !isFinite(v)) { inSeg = false; continue; }
    const x = xOf(i).toFixed(1);
    const y = yOf(clamp(v)).toFixed(1);
    pathD += inSeg ? ` L ${x},${y}` : `M ${x},${y}`;
    inSeg = true;
  }
  if (pathD) {
    svg.appendChild(el('path', {
      d: pathD, fill: 'none', stroke: color,
      'stroke-width': '2.2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
  }

  // Border
  svg.appendChild(el('rect', { x: ML, y: MT, width: CW, height: CH, fill: 'none', stroke: 'rgba(255,255,255,0.08)', 'stroke-width': '1' }));

  // ── Interactive crosshair ──
  const hairG = el('g', { visibility: 'hidden', 'pointer-events': 'none' });
  const hairLine = el('line', { x1: 0, x2: 0, y1: MT, y2: MT + CH, stroke: 'rgba(255,255,255,0.45)', 'stroke-width': '1', 'stroke-dasharray': '3,2' });
  const hairDot  = el('circle', { cx: 0, cy: 0, r: '3.5', fill: color, stroke: 'rgba(255,255,255,0.8)', 'stroke-width': '1.5' });
  const hairBg   = el('rect', { rx: '3', ry: '3', fill: 'rgba(20,20,20,0.88)', stroke: 'rgba(255,255,255,0.18)', 'stroke-width': '1' });
  const hairTxt  = el('text', { 'font-size': '10.5', 'font-family': 'inherit', fill: '#f0f0f0' });
  hairG.appendChild(hairLine);
  hairG.appendChild(hairDot);
  hairG.appendChild(hairBg);
  hairG.appendChild(hairTxt);
  svg.appendChild(hairG);

  // Transparent overlay that captures mouse events
  const overlay = el('rect', { x: ML, y: MT, width: CW, height: CH, fill: 'transparent', style: 'cursor:crosshair' });
  svg.appendChild(overlay);

  const showAt = (e) => {
    const svgRect = svg.getBoundingClientRect();
    if (!svgRect.width) return;
    const svgX = (e.clientX - svgRect.left) * (W / svgRect.width);
    const idx = Math.max(0, Math.min(n - 1, iOf(svgX)));
    const v = values[idx];
    if (v === null || !isFinite(v)) { hairG.setAttribute('visibility', 'hidden'); return; }
    const px = xOf(idx);
    const py = yOf(clamp(v));
    hairLine.setAttribute('x1', px); hairLine.setAttribute('x2', px);
    hairDot.setAttribute('cx', px);  hairDot.setAttribute('cy', py);
    const t = times[idx];
    const tzOpt2 = displayTZ === 'UTC' ? 'UTC' : undefined;
    const hh = (displayTZ === 'UTC' ? t.getUTCHours()   : t.getHours()).toString().padStart(2, '0');
    const mm = (displayTZ === 'UTC' ? t.getUTCMinutes() : t.getMinutes()).toString().padStart(2, '0');
    const dayFmt = t.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tzOpt2 });
    const unit   = title.match(/\(([^)]+)\)/)?.[1] ?? '';
    const valStr = v.toFixed(dec);
    const label  = `${valStr} ${unit}, ${dayFmt}, ${hh}:${mm}`;
    hairTxt.textContent = label;
    const approxW = label.length * 5.9 + 10;
    const approxH = 16;
    const ttX = (px + 8 + approxW > ML + CW) ? px - approxW - 6 : px + 8;
    const ttY = Math.max(MT + 4, py - 10);
    hairBg.setAttribute('x', ttX - 3);      hairBg.setAttribute('y', ttY - 12);
    hairBg.setAttribute('width', approxW);  hairBg.setAttribute('height', approxH);
    hairTxt.setAttribute('x', ttX);         hairTxt.setAttribute('y', ttY - 1);
    hairG.setAttribute('visibility', 'visible');
  };
  overlay.addEventListener('pointermove', showAt);
  overlay.addEventListener('pointerdown', showAt);
  overlay.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hairG.setAttribute('visibility', 'hidden'); });

  wrapper.appendChild(svg);
  return wrapper;
}

// ── Nearest station (INCA mode) ──────────────────────────────────────────────

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Nearest station across TAWES, SIAG and Trentino: { station, type, distance } or null. */
async function findNearestStation(lat, lng) {
  const { stations, siag, trentino } = await loadStationSourceSets();
  let best = null;
  const consider = (list, type) => {
    for (const s of list) {
      if (!isFinite(s.lat) || !isFinite(s.lon)) continue;
      const d = haversineDistance(lat, lng, s.lat, s.lon);
      if (!best || d < best.distance) best = { station: s, type, distance: d };
    }
  };
  consider(stations, 'tawes');
  consider(siag, 'siag');
  consider(trentino, 'trentino');
  return best;
}

async function fetchAndShowNearestStation(lat, lng) {
  const nearestBar = document.getElementById('fc-nearest-station');
  nearestBar.classList.add('hidden');
  lastNearestStation = null;
  if (nearestStationMarker) { nearestStationMarker.remove(); nearestStationMarker = null; }

  try {
    const found = await findNearestStation(lat, lng);
    if (!found) return;
    const { station: nearest, type: nearestType, distance: minDist } = found;

    const markerColor = nearestType === 'tawes' ? '#ff9800' : '#29b6f6';
    nearestStationMarker = L.circleMarker([nearest.lat, nearest.lon], {
      radius: 5, color: markerColor, fillColor: markerColor, fillOpacity: 0.85, weight: 2,
    }).addTo(map).bindTooltip(nearest.name, { direction: 'top', offset: [0, -6] });

    // Fetch data and normalise into { name, altitude, timestamp, temp, humidity, wind, pressure }
    const altitude = nearestType === 'trentino' ? nearest.elevation : nearest.altitude;
    let norm;

    if (nearestType === 'tawes') {
      const url = `${API_BASE}/station/current/${TAWES_RESOURCE}?parameters=${STATION_PARAMS}&station_ids=${nearest.id}&output_format=geojson`;
      const json = await fetchJSON(url);
      const ts = new Date(json.timestamps[0]);
      const params = json.features[0].properties.parameters;
      const gv = key => (params[key]?.data[0] ?? null);
      norm = {
        name: nearest.name, altitude, timestamp: ts,
        temp: gv('TL'), humidity: gv('RF'), wind: gv('FF'), pressure: gv('P'),
      };
    } else if (nearestType === 'siag') {
      const KMH_TO_MS = 1 / 3.6;
      const ts = nearest.lastUpdated ? new Date(nearest.lastUpdated) : null;
      const ff = parseFloat(nearest.ff);
      norm = {
        name: nearest.name, altitude, timestamp: ts,
        temp:     isFinite(parseFloat(nearest.t))  ? parseFloat(nearest.t)  : null,
        humidity: isFinite(parseFloat(nearest.rh)) ? parseFloat(nearest.rh) : null,
        wind:     isFinite(ff) ? ff * KMH_TO_MS : null,
        pressure: isFinite(parseFloat(nearest.p))  ? parseFloat(nearest.p)  : null,
      };
    } else { // trentino
      const xml = await fetchXML(`https://dati.meteotrentino.it/service.asmx/getLastDataOfMeteoStation?codice=${encodeURIComponent(nearest.code)}`);
      const d = parseTrentinoXML(xml);
      const ts = parseTrentinoTimestamp(d.timestamp);
      norm = {
        name: nearest.name, altitude, timestamp: ts,
        temp: d.temp, humidity: d.humidity, wind: d.windSpeed, pressure: null,
      };
    }

    lastNearestStation = { ...norm, distance: minDist };
    renderNearestStationBar();
  } catch (err) {
    console.error('Nearest station error:', err);
  }
}

function renderNearestStationBar() {
  const nearestBar = document.getElementById('fc-nearest-station');
  if (!lastNearestStation) { nearestBar.classList.add('hidden'); return; }
  const { name, altitude, timestamp, distance, temp, humidity, wind, pressure } = lastNearestStation;
  const toUnit = windToUnit;
  const unitLabel = windUnitLabel();

  let timeFmt = '';
  if (timestamp) {
    const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isFinite(ts.getTime())) {
      timeFmt = displayTZ === 'UTC'
        ? `${ts.getUTCHours().toString().padStart(2, '0')}:${ts.getUTCMinutes().toString().padStart(2, '0')} UTC`
        : `${ts.getHours().toString().padStart(2, '0')}:${ts.getMinutes().toString().padStart(2, '0')}`;
    }
  }

  let parts = [];
  if (temp !== null && isFinite(temp))         parts.push(`${temp.toFixed(1)}\u00B0C`);
  if (humidity !== null && isFinite(humidity)) parts.push(`${humidity.toFixed(0)}% RH`);
  if (wind !== null && isFinite(wind))         parts.push(`${toUnit(wind).toFixed(1)} ${unitLabel}`);
  if (pressure !== null && isFinite(pressure)) parts.push(`${pressure.toFixed(0)} hPa`);

  const altStr = altitude != null && isFinite(altitude) ? `, ${altitude}\u00A0m a.s.l.` : '';
  nearestBar.innerHTML = `
    <span class="fc-nearest-label">Closest weather station: ${name} (${distance.toFixed(1)}\u00A0km away${altStr}) \u2014 ${timeFmt}</span>
    <span class="fc-nearest-values">${parts.join(' \u00B7 ')}</span>
  `;
  nearestBar.classList.remove('hidden');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchXML(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const text = await res.text();
  return new DOMParser().parseFromString(text, 'text/xml');
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}
