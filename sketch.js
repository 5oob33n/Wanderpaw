// sketch.js
// Global variables
let gMap;
let pawPrints = [];
let savedLandmarks = [];
let dogFriendlyLandmarks = [];
let userPosition = null;
let tempPosition = null;
let watchId = null;
let currentLocationMarker = null;
let directionsService;
let directionsRenderer;

let isRouteActive = false;
let currentRouteRequestId = 0;
let pawPrintInterval = null;
let currentPath = [];

// Walk mode slider value (1~5km) (슬라이더 값)
let walkRadiusKm = 2; 

// Map settings
const INITIAL_ZOOM = 14;
let initialCenterPos = null;

// Dog speech bubble-related variables
let lastBubbleTime = 0; 
const bubbleCooldown = 5000; 

// startApp function : Executed after the Google Maps API script is loaded
function startApp() {
  // If the Google Maps API is not loaded, retry after 100ms
  if (!window.google || !google.maps) {
    setTimeout(startApp, 100);
    return;
  }

  // Get the user's location and initialize the map
  getUserLocation(function(centerPos) {
    initialCenterPos = centerPos;
    const mapOptions = {
      center: centerPos,
      zoom: INITIAL_ZOOM,
      mapId: 'fac61996c95e4065', 
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false
    };

    gMap = new google.maps.Map(document.getElementById('map'), mapOptions);

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
      map: gMap,
      suppressMarkers: true,
      suppressPolylines: true
    });

    startLocationTracking();

    // Load and display saved landmarks
    loadSavedLandmarks();
    displaySavedLandmarks();
    updateLandmarksList();

    // Dog-friendly place road
    loadDogFriendlyPlacesFromGoogle();

    // Sidebar Toggle (Open/Close Sidebar)
    window.toggleSidebar = function() {
      const sb = document.getElementById('sidebar');
      const ov = document.getElementById('overlay');
      if (sb.style.width === '250px') {
        sb.style.width = '0';
        ov.style.display = 'none';
      } else {
        sb.style.width = '250px';
        ov.style.display = 'block';
      }
    };

    // Add New Landmark on Map Click
    gMap.addListener('click', (evt) => {
      const nameDiv = document.getElementById('landmark-name-input');
      if (nameDiv.classList.contains('show')) {
        hideLandmarkNameInput();
        return;
      }
      tempPosition = { lat: evt.latLng.lat(), lng: evt.latLng.lng() };
      nameDiv.style.display = 'block';
      setTimeout(() => {
        nameDiv.classList.remove('hide');
        nameDiv.classList.add('show');
      }, 10);
      document.getElementById('landmarkName').value = '';
      document.getElementById('landmarkName').focus();
    });

    // Register User Landmark Save Button Event
    document.getElementById('saveLandmarkButton').addEventListener('click', () => {
      const inEl = document.getElementById('landmarkName');
      const val = inEl.value.trim();
      if (val && tempPosition) {
        const lm = { name: val, position: tempPosition };
        savedLandmarks.push(lm);
        displayLandmark(lm);
        updateLandmarksList();
        saveLandmarksToLocalStorage();
        hideLandmarkNameInput();
      } else {
        alert("Please enter a spot name.");
      }
    });

    // Close Sidebar on Overlay Click
    document.getElementById('overlay').addEventListener('click', () => {
      toggleSidebar();
    });
  });

  // Register Slider Event (Adjust Walking Radius)
  const slider = document.getElementById('radiusSlider');
  const sliderVal = document.getElementById('sliderValue');
  slider.addEventListener('input', () => {
    walkRadiusKm = parseInt(slider.value, 10);
    sliderVal.textContent = walkRadiusKm + ' km';
  });

  // Register Start Walking Button Event
  document.getElementById('walkStartButton').addEventListener('click', () => {
    walkModeRoute();
  });
}

// Get User Location (Geolocation)
function getUserLocation(callback) {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        callback(userPosition);
      },
      (err) => {
        console.error("Failed to get user location:", err);
        // fallback 좌표
        userPosition = { lat: 53.0793, lng: 8.8017 };
        callback(userPosition);
      }
    );
  } else {
    console.error("Geolocation not supported");
    userPosition = { lat: 53.0793, lng: 8.8017 };
    callback(userPosition);
  }
}

// Search Dog-Friendly Places Using Google Places API
function loadDogFriendlyPlacesFromGoogle() {
  if (!userPosition || !gMap) return;

  const service = new google.maps.places.PlacesService(gMap);

  const searchQueries = [
    { type: "park" },
    { type: "pet_store" },
    { type: "park", keyword: "grass" },
    { type: "park", keyword: "Wiese" },
    { type: "park", keyword: "see" },    
    { type: "park", keyword: "water" }   
  ];

  let pendingCalls = searchQueries.length;

  searchQueries.forEach(query => {
    const request = {
      location: userPosition,
      radius: 4000,  // 4km 
      type: query.type 
    };
    if (query.keyword) {
      request.keyword = query.keyword;
    }

    service.nearbySearch(request, (results, status) => {
      pendingCalls--;
      if (status === google.maps.places.PlacesServiceStatus.OK) {
        results.forEach(place => {
          dogFriendlyLandmarks.push({
            name: place.name,
            position: {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng()
            }
          });
        });
      } else {
        console.error("Places search failed:", status, "for query:", query);
      }
      if (pendingCalls === 0) {
        displayDogFriendlyLandmarks();
      }
    });
  });
}


// Display Dog-Friendly Place Markers (AdvancedMarkerElement 사용)
function displayDogFriendlyLandmarks() {
  dogFriendlyLandmarks.forEach((lm) => {
    const icon = document.createElement('img');
    icon.src = "images/dog-landmark.png"; 
    icon.style.width = '25px';
    icon.style.height = '25px';

    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: gMap,
      position: lm.position,
      content: icon,
      title: lm.name
    });
    marker.addEventListener('gmp-click', () => {
      showDogMessage(`I love this place! (${lm.name})`);
    });
  });
}

// Track User Location in Real-Time (AdvancedMarkerElement 사용)
function startLocationTracking() {
  if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        userPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        if (currentLocationMarker) {
          // For AdvancedMarkerElement, use the setPosition method.
          currentLocationMarker.setPosition(userPosition);
        } else {
          const icon = document.createElement('img');
          icon.src = "images/current-location.png";
          icon.style.width = '30px';
          icon.style.height = '30px';

          currentLocationMarker = new google.maps.marker.AdvancedMarkerElement({
            map: gMap,
            position: userPosition,
            content: icon,
            title: "Your Location"
          });
        }
        checkNearbyDogLandmarks();
      },
      (err) => {
        console.error("Error in watchPosition:", err);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
  }
}

// Check Proximity Between User and Dog-Friendly Places (or Saved Landmarks)
function checkNearbyDogLandmarks() {
  if (!userPosition) return;
  const threshold = 60; 
  const now = Date.now();
  let near = false;

  for (const lm of dogFriendlyLandmarks) {
    const dist = calculateDistance(userPosition, lm.position);
    if (dist < threshold) {
      near = true;
      break;
    }
  }
  if (!near) {
    for (const lm of savedLandmarks) {
      const dist = calculateDistance(userPosition, lm.position);
      if (dist < threshold) {
        near = true;
        break;
      }
    }
  }
  if (near && now - lastBubbleTime > bubbleCooldown) {
    const numBubbles = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < numBubbles; i++) {
      spawnRandomDogSpeechBubble();
    }
    lastBubbleTime = now;
  }
}

// Generate Random Dog Speech Bubble
function spawnRandomDogSpeechBubble() {
  const messages = [
    "Woof! I love this spot!",
    "Bark! What's that smell?",
    "Yip! Let's take a break!",
    "Arf! Time to explore!",
    "Woof, smells interesting!"
  ];
  const message = messages[Math.floor(Math.random() * messages.length)];
  const bubble = document.createElement('div');
  bubble.className = 'dogSpeechBubble';
  bubble.textContent = message;
  bubble.style.position = 'absolute';
  bubble.style.padding = '8px 12px';
  bubble.style.background = 'rgba(0,0,0,0.7)';
  bubble.style.color = '#fff';
  bubble.style.border = '1px solid #fff';
  bubble.style.borderRadius = '10px';
  bubble.style.fontSize = '14px';
  bubble.style.zIndex = '1001';

  const dogIcon = document.getElementById('dogIcon');
  const rect = dogIcon.getBoundingClientRect();
  const mapRect = document.getElementById('map').getBoundingClientRect();
  const offsetX = Math.random() * 50;
  const offsetY = Math.random() * 50;
  const left = rect.left - mapRect.left + offsetX;
  const top = rect.top - mapRect.top - offsetY;
  bubble.style.left = left + 'px';
  bubble.style.top = top + 'px';

  document.getElementById('map').appendChild(bubble);

  setTimeout(() => {
    bubble.style.transition = "opacity 1s";
    bubble.style.opacity = "0";
    setTimeout(() => {
      bubble.remove();
    }, 1000);
  }, 3000);
}

// Display Dog Speech Bubble 
function showDogMessage(txt) {
  const msgDiv = document.getElementById('dogMessage');
  msgDiv.textContent = txt;
  msgDiv.style.display = 'block';
}

// Hide Dog Speech Bubble
function hideDogMessage() {
  const msgDiv = document.getElementById('dogMessage');
  msgDiv.style.display = 'none';
}

// Walk Mode: Generate Circular Path
function walkModeRoute() {
  if (!userPosition) {
    alert("Cannot start walk: no user position");
    return;
  }
  isRouteActive = true;
  currentRouteRequestId++;

  const circlePoints = createCirclePoints(userPosition, walkRadiusKm, 8);
  const localLM = findLocalUserLandmarks(userPosition, walkRadiusKm);
  const dogSpots = dogFriendlyLandmarks.filter(ds => calculateDistance(userPosition, ds.position) <= walkRadiusKm * 1000);

  const circleWps = circlePoints.map(pt => ({ location: pt, stopover: true }));
  const lmWps = localLM.map(lm => ({ location: lm.position, stopover: true }));
  const dsWps = dogSpots.map(ds => ({ location: ds.position, stopover: true }));
  const finalWaypoints = [...circleWps, ...lmWps, ...dsWps];

  buildCircleRoute(userPosition, finalWaypoints, currentRouteRequestId);
}

// Generate Circular Points Function
function createCirclePoints(center, radiusKm, numPoints) {
  const out = [];
  const radM = radiusKm * 1000;
  const latRad = center.lat * Math.PI / 180;
  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    const dLat = (radM * Math.cos(angle)) / 111000;
    const dLng = (radM * Math.sin(angle)) / (111000 * Math.cos(latRad));
    const pLat = center.lat + dLat;
    const pLng = center.lng + dLng;
    out.push({ lat: pLat, lng: pLng });
  }
  return out;
}

// Search Saved Landmarks Within Radius
function findLocalUserLandmarks(center, radiusKm) {
  const rad = radiusKm * 1000;
  const out = [];
  for (const lm of savedLandmarks) {
    const dist = calculateDistance(lm.position, center);
    if (dist <= rad) {
      out.push(lm);
    }
  }
  return out;
}

// Generate Path (Start Point → Start Point)
function buildCircleRoute(centerPos, waypoints, routeRequestId) {
  directionsService.route({
    origin: centerPos,
    destination: centerPos,
    travelMode: 'WALKING', 
    waypoints: waypoints,
    optimizeWaypoints: false,
    avoidHighways: true
  }, (res, status) => {
    if (routeRequestId !== currentRouteRequestId || !isRouteActive) return;
    if (status === "OK") {
      directionsRenderer.setDirections(res);
      addRouteXButton();
      currentPath = interpolatePath(
        res.routes[0].overview_path.map(pt => ({ lat: pt.lat(), lng: pt.lng() })),
        100
      );
      displayPawPrints(currentPath);
    } else {
      console.error("Route build failed:", status);
    }
  });
}


// Interpolate Path Function
function interpolatePath(path, distance) {
  const out = [];
  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i];
    const end = path[i + 1];
    const R = 6371000;
    const dLat = (end.lat - start.lat) * Math.PI / 180;
    const dLng = (end.lng - start.lng) * Math.PI / 180;
    const lat1 = start.lat * Math.PI / 180;
    const lat2 = end.lat * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const segDist = R * c;

    const numPoints = Math.ceil(segDist / distance);
    for (let j = 0; j <= numPoints; j++) {
      const frac = j / numPoints;
      const lat = start.lat + frac * (end.lat - start.lat);
      const lng = start.lng + frac * (end.lng - start.lng);
      out.push({ lat, lng });
    }
  }
  return out;
}

// Display Footprint Markers Along Path (AdvancedMarkerElement 사용)
function displayPawPrints(path) {
  clearPawPrints();
  let index = 0;
  const step = 4;
  const pawSize = '30px';

  pawPrintInterval = setInterval(() => {
    if (index >= path.length) {
      clearInterval(pawPrintInterval);
      pawPrintInterval = null;
      return;
    }
    if (index % step === 0) {
      const icon = document.createElement('img');
      icon.src = "images/paw.png";
      icon.style.width = pawSize;
      icon.style.height = pawSize;
      icon.style.position = 'absolute';
      icon.style.transformOrigin = 'center';

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: gMap,
        position: path[index],
        content: icon
      });
      pawPrints.push(marker);
    }
    index++;
  }, 10);
}

// Reset Footprint Markers
function clearPawPrints() {
  if (pawPrintInterval) {
    clearInterval(pawPrintInterval);
    pawPrintInterval = null;
  }
  for (const mk of pawPrints) {
    mk.setMap(null);
  }
  pawPrints = [];
}

// Display User Landmark Markers (AdvancedMarkerElement 사용)
function displayLandmark(lm) {
  const icon = document.createElement('img');
  icon.src = "images/landmark.png";
  icon.style.width = '25px';
  icon.style.height = '25px';

  const marker = new google.maps.marker.AdvancedMarkerElement({
    map: gMap,
    position: lm.position,
    content: icon,
    title: lm.name
  });
  lm.marker = marker;
}

// Display All Saved Landmarks
function displaySavedLandmarks() {
  savedLandmarks.forEach((lm) => {
    displayLandmark(lm);
  });
}

// Update Sidebar Landmark List
function updateLandmarksList() {
  const list = document.getElementById('landmark-list');
  list.innerHTML = '';

  savedLandmarks.forEach((lm, idx) => {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = lm.name;

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'delete-button';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (lm.marker) lm.marker.setMap(null);
      savedLandmarks.splice(idx, 1);
      saveLandmarksToLocalStorage();
      updateLandmarksList();
    });
    li.appendChild(nameSpan);
    li.appendChild(del);

    li.addEventListener('click', () => {
      gMap.setCenter(lm.position);
      gMap.setZoom(16);
      toggleSidebar();
    });
    list.appendChild(li);
  });
}

// Save to Local Storage
function saveLandmarksToLocalStorage() {
  const data = savedLandmarks.map(({ name, position }) => ({ name, position }));
  localStorage.setItem('savedLandmarks', JSON.stringify(data));
}

// Load from Local Storage
function loadSavedLandmarks() {
  const data = localStorage.getItem('savedLandmarks');
  if (data) {
    savedLandmarks = JSON.parse(data);
  }
}

// Hide Landmark Input Field
function hideLandmarkNameInput() {
  const d = document.getElementById('landmark-name-input');
  d.classList.remove('show');
  d.classList.add('hide');
  setTimeout(() => {
    if (d.classList.contains('hide')) {
      d.style.display = 'none';
    }
  }, 300);
  tempPosition = null;
}

// Calculate Distance Between Two Coordinates (Meters)
function calculateDistance(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const A =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const C = 2 * Math.atan2(Math.sqrt(A), Math.sqrt(1 - A));
  return R * C;
}

// Add Path Close Button
let xButton = null;
function addRouteXButton() {
  if (xButton) return;

  xButton = document.createElement('button');
  xButton.id = 'closeRouteButton';
  xButton.innerHTML = '✖';
  xButton.style.position = 'absolute';
  xButton.style.top = '15px';
  xButton.style.left = '15px';
  xButton.style.width = '40px';
  xButton.style.height = '40px';
  xButton.style.fontSize = '18px';
  xButton.style.backgroundColor = '#000';
  xButton.style.color = '#fff';
  xButton.style.border = '1px solid #fff';
  xButton.style.borderRadius = '50%';
  xButton.style.cursor = 'pointer';
  xButton.style.boxShadow = '0 4px 6px rgba(255,255,255,0.1)';
  xButton.style.zIndex = 2000;

  xButton.addEventListener('click', () => {
    directionsRenderer.setMap(null);
    directionsRenderer = new google.maps.DirectionsRenderer({
      map: gMap,
      suppressMarkers: true,
      suppressPolylines: true
    });
    removeRouteXButton();
    clearPawPrints();
    gMap.setZoom(INITIAL_ZOOM);
    if (initialCenterPos) gMap.setCenter(initialCenterPos);

    isRouteActive = false;
    currentPath = [];
  });

  document.body.appendChild(xButton);
}

function removeRouteXButton() {
  if (xButton) {
    xButton.remove();
    xButton = null;
  }
}

// Execute startApp Function After Page Load
window.addEventListener('load', startApp);
