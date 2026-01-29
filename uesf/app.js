(function () {
  'use strict';

  // ===== CONFIGURATION =====
  const MAPBOX_TOKEN = 'pk.eyJ1IjoidHdvZiIsImEiOiJjbWt6eXdzZWIwN2toM2dvaG56N2xldXBnIn0.UNp3hM0WgWhlNTCQL6zTdQ';
  const ISOCHRONE_MINUTES = 10;
  const ISOCHRONE_PROFILE = 'mapbox/walking';
  const AUTOCOMPLETE_DEBOUNCE_MS = 300;
  const AUTOCOMPLETE_MIN_CHARS = 3;
  const DEFAULT_MAP_CENTER = [-122.4194, 37.7749]; // San Francisco
  const DEFAULT_MAP_ZOOM = 12;
  const GOOGLE_FORM_BASE = 'https://docs.google.com/forms/d/e/1FAIpQLSdnlQ4sv94yMJheM67Ez-ceeHZvVJNsuVctMJ0A73aYWgqHnA/viewform?usp=pp_url';

  // ===== DOM REFERENCES =====
  const searchForm = document.getElementById('search-form');
  const addressInput = document.getElementById('address-input');
  const searchBtn = document.getElementById('search-btn');
  const statusMessage = document.getElementById('status-message');
  const resultsHeader = document.getElementById('results-header');
  const resultsCount = document.getElementById('results-count');
  const resultsList = document.getElementById('results-list');
  const noResults = document.getElementById('no-results');
  const loadingOverlay = document.getElementById('loading-overlay');

  const autocompleteList = document.getElementById('autocomplete-list');

  // ===== STATE =====
  let map = null;
  let currentMarkers = [];
  let autocompleteDebounceTimer = null;
  let activeAutocompleteIndex = -1;
  let lastSearchedAddress = '';

  // ===== MAP INITIALIZATION =====

  function initMap() {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  }

  // ===== GEOCODING =====

  async function geocodeAddress(query) {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
      + `?access_token=${MAPBOX_TOKEN}`
      + `&limit=1`
      + `&types=address,place,postcode`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Geocoding failed (HTTP ${response.status})`);
    }

    const data = await response.json();
    if (!data.features || data.features.length === 0) {
      throw new Error('Address not found. Please try a more specific address.');
    }

    const [lng, lat] = data.features[0].center;
    const placeName = data.features[0].place_name;
    return { lng, lat, placeName };
  }

  // ===== ISOCHRONE =====

  async function fetchIsochrone(lng, lat) {
    const url = `https://api.mapbox.com/isochrone/v1/${ISOCHRONE_PROFILE}/${lng},${lat}`
      + `?contours_minutes=${ISOCHRONE_MINUTES}`
      + `&polygons=true`
      + `&denoise=1`
      + `&access_token=${MAPBOX_TOKEN}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Isochrone API failed (HTTP ${response.status})`);
    }

    const data = await response.json();
    if (!data.features || data.features.length === 0) {
      throw new Error('Could not generate walking distance area for this location.');
    }

    return data;
  }

  // ===== POINT-IN-POLYGON (RAY CASTING) =====

  function pointInPolygon(point, polygon) {
    const [px, py] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];

      const intersects =
        ((yi > py) !== (yj > py)) &&
        (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);

      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
  }

  // ===== DISTANCE CALCULATION =====

  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function formatDistance(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  }

  // ===== MAP DISPLAY =====

  function displayOnMap(coords, isochroneGeoJSON, schools) {
    removeMapLayers();

    const addressMarker = new mapboxgl.Marker({ color: '#e74c3c' })
      .setLngLat([coords.lng, coords.lat])
      .setPopup(
        new mapboxgl.Popup({ offset: 25 }).setHTML(
          `<strong>Your Location</strong><br>${escapeHtml(coords.placeName)}`
        )
      )
      .addTo(map);
    currentMarkers.push(addressMarker);

    map.addSource('isochrone', {
      type: 'geojson',
      data: isochroneGeoJSON,
    });

    map.addLayer({
      id: 'isochrone-fill',
      type: 'fill',
      source: 'isochrone',
      paint: {
        'fill-color': '#4a90d9',
        'fill-opacity': 0.15,
      },
    });

    map.addLayer({
      id: 'isochrone-outline',
      type: 'line',
      source: 'isochrone',
      paint: {
        'line-color': '#4a90d9',
        'line-width': 2,
        'line-opacity': 0.6,
      },
    });

    schools.forEach((school, index) => {
      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
        buildSchoolPopupHTML(school)
      );

      const marker = new mapboxgl.Marker({ color: '#27ae60' })
        .setLngLat([school.lng, school.lat])
        .setPopup(popup)
        .addTo(map);

      marker._schoolIndex = index;
      currentMarkers.push(marker);
    });

    const bounds = new mapboxgl.LngLatBounds();
    const polyCoords = isochroneGeoJSON.features[0].geometry.coordinates[0];
    polyCoords.forEach(coord => bounds.extend(coord));
    map.fitBounds(bounds, { padding: 50 });
  }

  function buildFormUrl(schoolName) {
    return GOOGLE_FORM_BASE
      + `&entry.317760060=${encodeURIComponent(schoolName)}`
      + `&entry.1583157200=${encodeURIComponent(lastSearchedAddress)}`;
  }

  function buildSchoolPopupHTML(school) {
    const formUrl = buildFormUrl(school.name);
    let html = `<strong>${escapeHtml(school.name)}</strong>`;
    if (school.address) {
      html += `<br><span style="font-size:0.85em;color:#666">${escapeHtml(school.address)}</span>`;
    }
    html += `<br><span style="font-size:0.8em;color:#4a90d9">~${formatDistance(school.distance)} away</span>`;
    if (school.website) {
      html += `<br><a href="${escapeHtml(school.website)}" target="_blank" rel="noopener" style="font-size:0.8em">Website</a>`;
    }
    html += `<br><a href="${escapeHtml(formUrl)}" target="_blank" rel="noopener" `
      + `style="display:inline-block;margin-top:6px;padding:4px 10px;font-size:0.8em;`
      + `color:#fff;background:#4a90d9;border-radius:4px;text-decoration:none">Select this school</a>`;
    return html;
  }

  function removeMapLayers() {
    currentMarkers.forEach(m => m.remove());
    currentMarkers = [];

    if (map.getLayer('isochrone-fill')) map.removeLayer('isochrone-fill');
    if (map.getLayer('isochrone-outline')) map.removeLayer('isochrone-outline');
    if (map.getSource('isochrone')) map.removeSource('isochrone');
  }

  // ===== RESULTS LIST =====

  function displayResultsList(schools) {
    resultsList.innerHTML = '';

    if (schools.length === 0) {
      resultsHeader.classList.add('hidden');
      noResults.classList.remove('hidden');
      return;
    }

    noResults.classList.add('hidden');
    resultsHeader.classList.remove('hidden');
    resultsCount.textContent = `${schools.length} school${schools.length !== 1 ? 's' : ''}`;

    schools.forEach((school, index) => {
      const li = document.createElement('li');
      li.className = 'result-item';
      li.dataset.index = index;

      let innerHtml = `<div class="result-name">${escapeHtml(school.name)}</div>`;
      if (school.address) {
        innerHtml += `<div class="result-address">${escapeHtml(school.address)}</div>`;
      }
      innerHtml += `<div class="result-distance">~${formatDistance(school.distance)} away</div>`;
      innerHtml += `<a class="result-select-btn" href="${escapeHtml(buildFormUrl(school.name))}" target="_blank" rel="noopener">Select this school</a>`;
      li.innerHTML = innerHtml;

      li.addEventListener('click', (e) => {
        if (e.target.closest('.result-select-btn')) return;
        resultsList.querySelectorAll('.result-item').forEach(el => el.classList.remove('active'));
        li.classList.add('active');

        map.flyTo({ center: [school.lng, school.lat], zoom: 16 });

        // currentMarkers[0] is the address marker; school markers start at index 1
        const marker = currentMarkers[index + 1];
        if (marker) {
          marker.togglePopup();
        }
      });

      resultsList.appendChild(li);
    });
  }

  // ===== UTILITIES =====

  function showLoading(show) {
    loadingOverlay.classList.toggle('hidden', !show);
    searchBtn.disabled = show;
  }

  function setStatus(message, isError) {
    if (!message) {
      statusMessage.classList.add('hidden');
      return;
    }
    statusMessage.textContent = message;
    statusMessage.className = isError ? '' : 'info';
    statusMessage.classList.remove('hidden');
  }

  function clearPreviousResults() {
    resultsList.innerHTML = '';
    resultsHeader.classList.add('hidden');
    noResults.classList.add('hidden');
    removeMapLayers();
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ===== ERROR HANDLING =====

  function handleError(err) {
    console.error('Search error:', err);

    let userMessage = 'An unexpected error occurred. Please try again.';

    if (err.message.includes('Address not found')) {
      userMessage = err.message;
    } else if (err.message.includes('Geocoding failed')) {
      userMessage = 'Could not look up that address. Please check your input and try again.';
    } else if (err.message.includes('Isochrone')) {
      userMessage = 'Could not calculate walking distance from this location. Try a different address.';
    } else if (err.name === 'TypeError' && err.message.includes('fetch')) {
      userMessage = 'Network error. Please check your internet connection.';
    }

    setStatus(userMessage, true);
  }

  // ===== AUTOCOMPLETE =====

  async function fetchSuggestions(query) {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
      + `?access_token=${MAPBOX_TOKEN}`
      + `&autocomplete=true`
      + `&limit=5`
      + `&types=address,place,postcode`;

    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    return (data.features || []).map(f => ({
      placeName: f.place_name,
      text: f.text,
      context: f.place_name.replace(f.text, '').replace(/^,\s*/, ''),
    }));
  }

  function renderSuggestions(suggestions) {
    autocompleteList.innerHTML = '';
    activeAutocompleteIndex = -1;

    if (suggestions.length === 0) {
      autocompleteList.classList.add('hidden');
      return;
    }

    suggestions.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'autocomplete-item';
      li.setAttribute('role', 'option');
      li.dataset.index = i;
      li.innerHTML =
        `<div class="autocomplete-item-main">${escapeHtml(s.text)}</div>` +
        `<div class="autocomplete-item-context">${escapeHtml(s.context)}</div>`;

      li.dataset.placeName = s.placeName;

      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectSuggestion(s.placeName);
      });

      autocompleteList.appendChild(li);
    });

    autocompleteList.classList.remove('hidden');
  }

  function selectSuggestion(placeName) {
    addressInput.value = placeName;
    autocompleteList.classList.add('hidden');
    autocompleteList.innerHTML = '';
    activeAutocompleteIndex = -1;
    searchForm.requestSubmit();
  }

  function updateActiveItem() {
    const items = autocompleteList.querySelectorAll('.autocomplete-item');
    items.forEach((el, i) => {
      el.classList.toggle('active', i === activeAutocompleteIndex);
    });
    if (activeAutocompleteIndex >= 0 && items[activeAutocompleteIndex]) {
      items[activeAutocompleteIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  addressInput.addEventListener('input', () => {
    clearTimeout(autocompleteDebounceTimer);
    const query = addressInput.value.trim();

    if (query.length < AUTOCOMPLETE_MIN_CHARS) {
      autocompleteList.classList.add('hidden');
      autocompleteList.innerHTML = '';
      return;
    }

    autocompleteDebounceTimer = setTimeout(async () => {
      const suggestions = await fetchSuggestions(query);
      renderSuggestions(suggestions);
    }, AUTOCOMPLETE_DEBOUNCE_MS);
  });

  addressInput.addEventListener('keydown', (e) => {
    if (autocompleteList.classList.contains('hidden')) return;

    const items = autocompleteList.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeAutocompleteIndex = Math.min(activeAutocompleteIndex + 1, items.length - 1);
      updateActiveItem();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeAutocompleteIndex = Math.max(activeAutocompleteIndex - 1, 0);
      updateActiveItem();
    } else if (e.key === 'Enter' && activeAutocompleteIndex >= 0) {
      e.preventDefault();
      selectSuggestion(items[activeAutocompleteIndex].dataset.placeName);
    } else if (e.key === 'Escape') {
      autocompleteList.classList.add('hidden');
      activeAutocompleteIndex = -1;
    }
  });

  addressInput.addEventListener('blur', () => {
    setTimeout(() => {
      autocompleteList.classList.add('hidden');
      activeAutocompleteIndex = -1;
    }, 150);
  });

  // ===== SEARCH HANDLER =====

  searchForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const query = addressInput.value.trim();
    if (!query) return;

    autocompleteList.classList.add('hidden');
    autocompleteList.innerHTML = '';
    clearPreviousResults();
    showLoading(true);
    setStatus('', false);

    try {
      // Step 1: Geocode the address
      lastSearchedAddress = query;
      const coords = await geocodeAddress(query);

      // Step 2: Get 10-minute walking isochrone polygon
      const isochroneGeoJSON = await fetchIsochrone(coords.lng, coords.lat);

      // Step 3: Filter SFUSD schools to those inside the isochrone polygon
      const isochronePolygon = isochroneGeoJSON.features[0].geometry.coordinates[0];
      const schools = SFUSD_SCHOOLS
        .filter(school => pointInPolygon([school.lng, school.lat], isochronePolygon))
        .map(school => ({ ...school }));

      // Step 4: Calculate straight-line distance and sort
      schools.forEach(school => {
        school.distance = haversineDistance(
          coords.lat, coords.lng, school.lat, school.lng
        );
      });
      schools.sort((a, b) => a.distance - b.distance);

      // Step 8: Display results
      displayOnMap(coords, isochroneGeoJSON, schools);
      displayResultsList(schools);

    } catch (err) {
      handleError(err);
    } finally {
      showLoading(false);
    }
  });

  // ===== INIT =====
  initMap();

})();
