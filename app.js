// Umeå Street Map Application Logic

document.addEventListener('DOMContentLoaded', async () => {
  // State variables
  let geojsonData = null;
  let animalData = null;
  let streetLayer = null;
  let animalMarkerLayer = null;
  let highlightedLayer = null;
  let currentFilter = 'all';
  let currentTheme = 'light'; // 'dark' | 'light'
  const animalStreetLookup = new Map(); // streetName -> animal object
  const allUniqueStreets = new Set();
  const streetGeometryMap = new Map(); // streetName -> array of layers

  const cartoApiKey = 'cb1_2vgj_1_50a1af1b6daef54cda46c29f';
  const keyParam = cartoApiKey ? `?key=${encodeURIComponent(cartoApiKey)}` : '';

  const tileLayers = {
    dark: L.tileLayer(`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${keyParam}`, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }),
    light: L.tileLayer(`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png${keyParam}`, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }),
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19
    })
  };

  // Initialize Leaflet Map centered on Umeå
  const map = L.map('map', {
    center: [63.8258, 20.2630],
    zoom: 13,
    zoomControl: false,
    layers: [tileLayers.light]
  });

  // Custom Zoom Control top-right
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Load Data
  try {
    const [geoResp, animalResp] = await Promise.all([
      fetch('umea_streets.geojson'),
      fetch('animal_streets.json')
    ]);

    geojsonData = await geoResp.json();
    animalData = await animalResp.json();

    // Index animal data
    animalData.forEach(item => {
      item.streets.forEach(st => {
        animalStreetLookup.set(st.toLowerCase(), item);
      });
    });

    initMapLayers();
    initUI();
  } catch (err) {
    console.error('Failed to load map data:', err);
  }

  // Street Styling Function: animal-named streets highlighted, all others grey
  function getStreetStyle(feature) {
    const props = feature.properties;
    const name = props.name || '';
    const isAnimal = animalStreetLookup.has(name.toLowerCase());

    if (isAnimal) {
      return {
        color: '#ff4d4f',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      };
    }

    // All other streets (including highways) are neutral grey
    const neutralColor = currentTheme === 'light' ? '#94a3b8' : '#64748b';
    const neutralOpacity = 0.55;
    return {
      color: neutralColor,
      weight: 1.8,
      opacity: neutralOpacity
    };
  }

  // Initialize Vector Street Layers
  function initMapLayers() {
    streetLayer = L.geoJSON(geojsonData, {
      style: getStreetStyle,
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        const name = props.name || 'Unnamed';
        const isAnimal = animalStreetLookup.has(name.toLowerCase());
        const animalInfo = animalStreetLookup.get(name.toLowerCase());

        if (name && name !== 'Unnamed' && !/^\d+$/.test(name.trim())) {
          allUniqueStreets.add(name);
        }

        // Store geometry for search & zooming
        const lowerName = name.toLowerCase();
        if (!streetGeometryMap.has(lowerName)) {
          streetGeometryMap.set(lowerName, []);
        }
        streetGeometryMap.get(lowerName).push(layer);

        // Permanent & Hover Tooltip for Street Names
        const tooltipClass = isAnimal ? 'street-label-tooltip animal-street-tooltip' : 'street-label-tooltip';
        layer.bindTooltip(isAnimal ? `🐾 ${name}` : name, {
          permanent: false,
          direction: 'center',
          className: tooltipClass,
          sticky: true
        });

        // Click popup
        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          showStreetPopup(layer, props, animalInfo);
        });

        // Hover effect
        layer.on('mouseover', () => {
          if (layer !== highlightedLayer) {
            layer.setStyle({ weight: layer.options.weight + 2.5, opacity: 1 });
          }
        });

        layer.on('mouseout', () => {
          if (layer !== highlightedLayer) {
            streetLayer.resetStyle(layer);
          }
        });
      }
    }).addTo(map);

    // Add Animal Street Map Pins with Icons
    animalMarkerLayer = L.layerGroup();
    renderAnimalMarkers();
    animalMarkerLayer.addTo(map);

    // Update Stats
    const visibleCountEl = document.getElementById('stat-visible-count');
    if (visibleCountEl) visibleCountEl.textContent = geojsonData.features.length.toLocaleString();

    const uniqueCountEl = document.getElementById('stat-unique-count');
    if (uniqueCountEl) uniqueCountEl.textContent = allUniqueStreets.size.toLocaleString();

    const animalCountEl = document.getElementById('stat-animal-count');
    if (animalCountEl) animalCountEl.textContent = animalData.length.toString();

    const animalTabCountEl = document.getElementById('animal-tab-count');
    if (animalTabCountEl) animalTabCountEl.textContent = animalData.length.toString();

    const allTabCountEl = document.getElementById('all-tab-count');
    if (allTabCountEl) allTabCountEl.textContent = allUniqueStreets.size.toLocaleString();
  }

  // Render Custom Animal Markers (optionally filtered by category)
  function renderAnimalMarkers(filterCategory = 'all-animals') {
    animalMarkerLayer.clearLayers();
    animalData.forEach(item => {
      const matchCategory = filterCategory === 'all-animals' || filterCategory === 'all' ||
        item.category.toLowerCase() === filterCategory.toLowerCase();
      if (!matchCategory) return;

      item.streets.forEach(stName => {
        const layers = streetGeometryMap.get(stName.toLowerCase());
        if (layers && layers.length > 0) {
          const firstLayer = layers[0];
          const bounds = firstLayer.getBounds();
          const center = bounds.getCenter();

          // Custom Icon
          const customIcon = L.divIcon({
            className: 'animal-map-pin',
            html: `
              <div style="
                width: 34px;
                height: 34px;
                border-radius: 50%;
                background: #b91c1c;
                border: 2px solid #ffffff;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                cursor: pointer;
                transition: transform 0.2s;
              " title="${stName} (${item.animal_sv} - ${item.category})">
                <img src="animal_icons/${item.icon_file}" style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;" alt="${item.animal_sv}" draggable="false">
              </div>
            `,
            iconSize: [34, 34],
            iconAnchor: [17, 17]
          });

          const marker = L.marker(center, { icon: customIcon });
          marker.on('click', (e) => {
            if (e && e.originalEvent) {
              L.DomEvent.stopPropagation(e);
            }
            focusOnStreet(stName);
          });
          animalMarkerLayer.addLayer(marker);
        }
      });
    });
  }

  // Show Street Detail Popup
  function showStreetPopup(layer, props, animalInfo) {
    const latlng = layer.getBounds().getCenter();
    let popupHtml = '';

    if (animalInfo) {
      popupHtml = `
        <div class="popup-animal-card">
          <img src="animal_icons/${animalInfo.icon_file}" class="popup-animal-img" alt="${animalInfo.animal_sv}">
          <div>
            <div class="popup-title">${props.name}</div>
            <div class="popup-subtitle">${animalInfo.animal_en}</div>
            <div class="popup-tag">${animalInfo.category}</div>
          </div>
        </div>
      `;
    } else {
      popupHtml = `
        <div>
          <div class="popup-title">${props.name || 'Unnamed Street'}</div>
        </div>
      `;
    }

    L.popup({ className: 'custom-map-popup', offset: [0, -10] })
      .setLatLng(latlng)
      .setContent(popupHtml)
      .openOn(map);
  }

  // Focus and Highlight a Street
  function focusOnStreet(streetName) {
    const layers = streetGeometryMap.get(streetName.toLowerCase());
    if (!layers || layers.length === 0) return;

    // Calculate union bounds of all segments for this street
    const group = L.featureGroup(layers);
    map.flyToBounds(group.getBounds(), {
      padding: [80, 80],
      maxZoom: 16,
      duration: 1.2
    });

    // Flash Highlight
    layers.forEach(l => {
      l.setStyle({
        color: '#fbbf24',
        weight: 8,
        opacity: 1
      });
    });

    const animalInfo = animalStreetLookup.get(streetName.toLowerCase());
    showStreetPopup(layers[0], layers[0].feature.properties, animalInfo);

    // Reset style after delay
    setTimeout(() => {
      layers.forEach(l => {
        streetLayer.resetStyle(l);
      });
    }, 4500);
  }

  // Toast Notification Helper
  let toastTimer = null;
  function showToast(message) {
    let toast = document.getElementById('map-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'map-toast';
      toast.className = 'toast-notification';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 4500);
  }

  // Initialize UI & Event Handlers
  function initUI() {
    // Populate Animal List in Side Drawer
    function renderAnimalCards(filterCategory = 'all-animals') {
      const animalGrid = document.getElementById('animal-cards-list');
      animalGrid.innerHTML = '';

      const filtered = animalData.filter(item => {
        if (filterCategory === 'all' || filterCategory === 'all-animals') return true;
        return item.category.toLowerCase() === filterCategory.toLowerCase();
      });

      filtered.forEach(item => {
        const primaryStreet = item.streets[0];
        const card = document.createElement('div');
        card.className = 'animal-card';
        card.innerHTML = `
          <img src="animal_icons/${item.icon_file}" class="animal-thumb" alt="${item.animal_sv}" loading="lazy">
          <div class="animal-info">
            <div class="animal-name-row">
              <span class="animal-name-sv">${item.animal_sv}</span>
              <span class="animal-name-en">${item.animal_en}</span>
            </div>
            <div class="animal-street-badge">
              <span>📍 ${item.streets.join(', ')}</span>
              <span class="category-tag">${item.category}</span>
            </div>
          </div>
        `;
        card.addEventListener('click', () => {
          focusOnStreet(primaryStreet);
        });
        animalGrid.appendChild(card);
      });

      const countEl = document.getElementById('animal-tab-count');
      if (countEl) {
        countEl.textContent = filtered.length.toString();
      }
    }

    renderAnimalCards('all-animals');

    // Populate All Streets A-Z List
    const allStreetsList = document.getElementById('all-streets-list');
    const sortedStreets = Array.from(allUniqueStreets).filter(s => s && s !== 'Unnamed').sort((a, b) => a.localeCompare(b, 'sv'));

    function renderAllStreets(filterText = '') {
      allStreetsList.innerHTML = '';
      const filtered = sortedStreets.filter(s => s.toLowerCase().includes(filterText.toLowerCase()));

      filtered.slice(0, 150).forEach(st => {
        const isAnimal = animalStreetLookup.has(st.toLowerCase());
        const row = document.createElement('div');
        row.className = `street-item ${isAnimal ? 'animal-tagged' : ''}`;
        row.innerHTML = `
          <span>${isAnimal ? '🐾 ' : ''}${st}</span>
          <span class="search-item-tag ${isAnimal ? 'tag-animal' : ''}">${isAnimal ? 'Animal' : 'Street'}</span>
        `;
        row.addEventListener('click', () => {
          focusOnStreet(st);
        });
        allStreetsList.appendChild(row);
      });

      if (filtered.length > 150) {
        const moreNote = document.createElement('div');
        moreNote.style.padding = '8px 12px';
        moreNote.style.fontSize = '11px';
        moreNote.style.color = 'var(--text-muted)';
        moreNote.textContent = `Showing first 150 of ${filtered.length} matches. Type above to refine.`;
        allStreetsList.appendChild(moreNote);
      }
    }
    renderAllStreets();

    // Filter A-Z input
    const allStreetsFilterInput = document.getElementById('all-streets-filter-input');
    if (allStreetsFilterInput) {
      allStreetsFilterInput.addEventListener('input', (e) => {
        renderAllStreets(e.target.value);
      });
    }

    // Filter Pills
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filterType = btn.dataset.filter;
        applyFilter(filterType);
      });
    });

    function applyFilter(filterType) {
      currentFilter = filterType;

      streetLayer.eachLayer(layer => {
        const props = layer.feature.properties;
        const name = props.name || '';
        const animalInfo = animalStreetLookup.get(name.toLowerCase());

        let isTarget = false;
        if (animalInfo) {
          if (filterType === 'all-animals' || filterType === 'all') {
            isTarget = true;
          } else {
            isTarget = animalInfo.category.toLowerCase() === filterType.toLowerCase();
          }
        }

        if (isTarget) {
          // Highlight target animal streets in unified animal red
          layer.setStyle({
            color: '#ff4d4f',
            weight: 5.5,
            opacity: 1
          });
        } else if (animalInfo && (filterType !== 'all-animals' && filterType !== 'all')) {
          // Other animal streets dimmed when a specific category is active
          layer.setStyle({
            color: '#ff4d4f',
            weight: 2.5,
            opacity: 0.12
          });
        } else {
          // Other streets (neutral grey)
          const baseStyle = getStreetStyle(layer.feature);
          layer.setStyle({
            color: baseStyle.color,
            weight: baseStyle.weight,
            opacity: baseStyle.opacity
          });
        }
      });

      // Update Map Pins & Drawer List
      renderAnimalMarkers(filterType);
      renderAnimalCards(filterType);
    }

    // Theme Toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = document.getElementById('theme-icon');
    let activeTileLayer = tileLayers.light;

    themeBtn.addEventListener('click', () => {
      if (currentTheme === 'dark') {
        currentTheme = 'light';
        document.body.className = 'theme-light';
        themeIcon.textContent = '☀️';
        map.removeLayer(activeTileLayer);
        activeTileLayer = tileLayers.light;
        map.addLayer(activeTileLayer);
      } else {
        currentTheme = 'dark';
        document.body.className = 'theme-dark';
        themeIcon.textContent = '🌙';
        map.removeLayer(activeTileLayer);
        activeTileLayer = tileLayers.dark;
        map.addLayer(activeTileLayer);
      }
      applyFilter(currentFilter);
    });

    // Drawer Tabs
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const targetPane = document.getElementById(tab.dataset.tab);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // Drawer Toggle
    const sideDrawer = document.getElementById('side-drawer');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    if (sidebarToggleBtn && sideDrawer) {
      sidebarToggleBtn.addEventListener('click', () => {
        sideDrawer.classList.toggle('collapsed');
      });
    }
    const drawerCloseBtn = document.getElementById('drawer-close-btn');
    if (drawerCloseBtn && sideDrawer) {
      drawerCloseBtn.addEventListener('click', () => {
        sideDrawer.classList.add('collapsed');
      });
    }
  }
});
