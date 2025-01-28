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

let isGuiding = true; // 가이드 모드 활성화 여부

// Audio for barking sound
const barkSound = new Audio('sounds/bark.mp3'); 

// Last paw print position
let lastPawPosition = null;

// DOM Node 생성 함수
function createMarkerContent(imgSrc, width, height) {
  const img = document.createElement('img');
  img.src = imgSrc;
  img.style.width = width;
  img.style.height = height;
  img.style.pointerEvents = 'auto'; // 마커 클릭 이벤트를 허용
  img.classList.add('fade-in-out'); // 애니메이션 클래스 추가
  return img;
}

// Define initMap in the global scope
window.initMap = function() {
  console.log("initMap called");
  getUserLocation((centerPos) => {
    const mapOptions = {
      center: centerPos,
      zoom: 18, // 더 상세한 뷰를 위해 확대
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false,
      mapId: 'fe443e3a5bfe8077' // 여기에 생성한 Map ID를 입력하세요
    };

    gMap = new google.maps.Map(document.getElementById('map'), mapOptions);

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
      map: gMap,
      suppressMarkers: true,
      suppressPolylines: true
    });

    startLocationTracking();

    // Load user-saved landmarks
    loadSavedLandmarks();
    displaySavedLandmarks(); // 랜드마크 표시

    updateLandmarksList();

    // Load dog-friendly places from Google Places
    loadDogFriendlyPlacesFromGoogle();

    // Sidebar toggle
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

    // Map click -> new landmark
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

    // Save landmark button
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
        alert("Please enter a spot name."); // 영어 UI 메시지
      }
    });

    // Overlay -> close sidebar
    document.getElementById('overlay').addEventListener('click', () => {
      toggleSidebar();
    });
  });
};

// Get user location
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
        // fallback
        userPosition = { lat: 53.0793, lng: 8.8017 }; // 기본 위치 설정 (예: 함부르크)
        callback(userPosition);
      }
    );
  } else {
    console.error("Geolocation not supported");
    userPosition = { lat: 53.0793, lng: 8.8017 };
    callback(userPosition);
  }
}

// Use Google Places API for dog-friendly places
function loadDogFriendlyPlacesFromGoogle() {
  if (!userPosition || !gMap) return;

  const service = new google.maps.places.PlacesService(gMap);

  // “park” + “pet_store” for demonstration
  const searchTypes = ["park", "pet_store"];
  let pendingCalls = searchTypes.length;

  searchTypes.forEach(placeType => {
    const request = {
      location: userPosition,
      radius: 4000,
      type: placeType // 수정: 배열이 아닌 문자열로 변경
    };
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
        console.error("Places search failed:", status, "for type:", placeType);
      }
      if (pendingCalls === 0) {
        displayDogFriendlyLandmarks();
      }
    });
  });
}

// Display dog-friendly places with different icon
function displayDogFriendlyLandmarks() {
  console.log("Displaying dog-friendly landmarks");
  dogFriendlyLandmarks.forEach((lm) => {
    console.log("Adding marker for:", lm.name);
    const contentNode = createMarkerContent("images/dog-landmark.png", "25px", "25px");
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: gMap,
      position: new google.maps.LatLng(lm.position.lat, lm.position.lng),
      content: contentNode,
      title: lm.name
    });

    // 마커 클릭 시 이벤트 리스너 추가
    marker.addEventListener('click', () => {
      showDogMessage(`I love this place! (${lm.name})`); // 영어 메시지
      triggerNotification();
    });
  });
}

// Track user location
function startLocationTracking() {
  if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        userPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        if (currentLocationMarker) {
          currentLocationMarker.set('position', new google.maps.LatLng(userPosition.lat, userPosition.lng));
        } else {
          const contentNode = createMarkerContent("images/current-location.png", "30px", "30px");
          currentLocationMarker = new google.maps.marker.AdvancedMarkerElement({
            map: gMap,
            position: new google.maps.LatLng(userPosition.lat, userPosition.lng),
            content: contentNode,
            title: "Your Location" // 영어 제목
          });
        }
        // 지도의 중심을 사용자 위치로 이동시키고 줌 레벨을 다시 설정
        gMap.setCenter(new google.maps.LatLng(userPosition.lat, userPosition.lng));
        gMap.setZoom(18); // 원하는 줌 레벨로 재설정

        checkNearbyDogLandmarks();
        guideRoute(); // 가이드 경로 업데이트

        // **발자국 마커 찍기**
        addPawPrint(userPosition);
      },
      (err) => {
        console.error("Error watchPosition:", err);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
  }
}

// Add paw print based on user's movement
function addPawPrint(currentPos) {
  if (!lastPawPosition) {
    // 첫 번째 발자국 위치 설정
    lastPawPosition = currentPos;
    placePawPrint(currentPos);
    return;
  }

  const distance = calculateDistance(lastPawPosition, currentPos);
  const threshold = 10; // 발자국 간격을 10미터로 설정

  if (distance >= threshold) {
    placePawPrint(currentPos);
    lastPawPosition = currentPos;
  }
}

// Place a paw print marker
function placePawPrint(position) {
  const contentNode = createMarkerContent("images/paw.png", "20px", "20px");
  const pawMarker = new google.maps.marker.AdvancedMarkerElement({
    map: gMap,
    position: new google.maps.LatLng(position.lat, position.lng),
    content: contentNode,
    zIndex: 999 // 발자국이 다른 마커 위에 표시되도록 설정
  });
  pawPrints.push(pawMarker);

  // **발자국 마커 수 제한 (예: 최대 100개)**
  const maxPawPrints = 100;
  if (pawPrints.length > maxPawPrints) {
    const oldestPaw = pawPrints.shift();
    oldestPaw.set('map', null); // 마커 제거
  }

  // 발자국 마커가 10초 후에 사라지도록 설정
  setTimeout(() => {
    pawMarker.set('map', null);
    pawPrints = pawPrints.filter(mk => mk !== pawMarker);
  }, 10000); // 10초
}

// Check if user near dog-friendly landmarks (사용자 근처에 강아지 친화적인 랜드마크가 있는지 확인)
function checkNearbyDogLandmarks() {
  if (!userPosition) return;
  const threshold = 60; // meters
  let found = false;
  for (const lm of dogFriendlyLandmarks) {
    const dist = calculateDistance(userPosition, lm.position);
    if (dist < threshold) {
      showDogMessage(`Wow! I smell something nice around ${lm.name}!`); // 영어 메시지
      triggerNotification();
      found = true;
      break;
    }
  }
  if (!found) {
    hideDogMessage();
  }
}

// Show dog message (강아지 메시지 표시)
function showDogMessage(txt) {
  const msgDiv = document.getElementById('dogMessage');
  msgDiv.textContent = txt;
  msgDiv.style.display = 'block';
}

// Hide dog message (강아지 메시지 숨기기)
function hideDogMessage() {
  const msgDiv = document.getElementById('dogMessage');
  msgDiv.style.display = 'none';
}

// Trigger vibration and sound (진동과 소리 트리거)
function triggerNotification() {
  // Vibration API 사용
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200]); // 패턴 진동
  }

  // 멍멍 소리 재생
  barkSound.play();

  // UI에 말풍선 표시
  displaySpeechBubble("Here's a place I like! Let's go this way!");
}

// Display speech bubble near dog icon (강아지 아이콘 근처에 말풍선 표시)
function displaySpeechBubble(message) {
  const speechBubble = document.getElementById('speechBubble');
  speechBubble.textContent = message;
  speechBubble.style.display = 'block';

  // 일정 시간 후 말풍선 제거
  setTimeout(() => {
    if (speechBubble) {
      speechBubble.style.display = 'none';
    }
  }, 5000);
}

// Guide route like a dog leading the way (강아지가 길을 안내하는 것처럼 가이드)
function guideRoute() {
  if (!userPosition || dogFriendlyLandmarks.length === 0) return;

  // Find the nearest dog-friendly landmark
  let nearest = null;
  let minDist = Infinity;
  dogFriendlyLandmarks.forEach(lm => {
    const dist = calculateDistance(userPosition, lm.position);
    if (dist < minDist) {
      minDist = dist;
      nearest = lm;
    }
  });

  if (nearest && minDist > 10) { // 10미터 이상 떨어져 있으면
    // Build directions to the nearest landmark
    directionsService.route({
      origin: userPosition,
      destination: nearest.position,
      travelMode: 'WALKING',
      optimizeWaypoints: false,
      avoidHighways: true
    }, (res, status) => {
      if (status === "OK") {
        directionsRenderer.setDirections(res);
        displayGuidingRoute();
      } else {
        console.error("Route build failed:", status);
      }
    });
  } else {
    // If already near the landmark, clear directions
    directionsRenderer.setDirections({ routes: [] });
    clearPawPrints();
  }
}

// Display guiding route with paw prints (발자국과 함께 가이드 경로 표시)
function displayGuidingRoute() {
  const route = directionsRenderer.getDirections().routes[0];
  if (!route) return;

  const path = route.overview_path.map(pt => ({ lat: pt.lat(), lng: pt.lng() }));
  displayPawPrints(path);
}

// Display paw prints along the route (현재는 사용하지 않음)
function displayPawPrints(path) {
  // 기존 발자국 생성 방식을 주석 처리하거나 제거
  /*
  clearPawPrints();
  const step = 10; // 발자국 간격 조절
  const pawSize = '20px';

  pawPrints = []; // 기존 발자국 초기화

  path.forEach((position, idx) => {
    if (idx % step === 0) {
      const pawMarker = new google.maps.marker.AdvancedMarkerElement({
        map: gMap,
        position: new google.maps.LatLng(position.lat, position.lng),
        content: createMarkerContent("images/paw.png", "20px", "20px"),
        zIndex: 999 // 발자국이 다른 마커 위에 표시되도록 설정
      });
      pawPrints.push(pawMarker);
    }
  });
  */
}

// Clear paw prints (발자국 지우기)
function clearPawPrints() {
  pawPrints.forEach(mk => {
    mk.set('map', null);
  });
  pawPrints = [];
}

// Display user-saved landmark (사용자가 저장한 랜드마크 표시)
function displayLandmark(lm) {
  const contentNode = createMarkerContent("images/landmark.png", "25px", "25px");
  const marker = new google.maps.marker.AdvancedMarkerElement({
    map: gMap,
    position: new google.maps.LatLng(lm.position.lat, lm.position.lng),
    content: contentNode,
    title: lm.name
  });
  lm.marker = marker;

  // 마커 클릭 시 이벤트 리스너 추가
  marker.addEventListener('click', () => {
    gMap.setCenter(new google.maps.LatLng(lm.position.lat, lm.position.lng));
    gMap.setZoom(18);
  });
}

// ***** 이 함수가 꼭 필요 *****
 // Display all user-saved landmarks (모든 사용자 저장 랜드마크 표시)
function displaySavedLandmarks() {
  savedLandmarks.forEach((lm) => {
    displayLandmark(lm);
  });
}

// Update sidebar (사이드바 업데이트)
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
      if (lm.marker) lm.marker.set('map', null);
      savedLandmarks.splice(idx, 1);
      saveLandmarksToLocalStorage();
      updateLandmarksList();
    });
    li.appendChild(nameSpan);
    li.appendChild(del);

    li.addEventListener('click', () => {
      gMap.setCenter(new google.maps.LatLng(lm.position.lat, lm.position.lng));
      gMap.setZoom(18);
      toggleSidebar();
    });
    list.appendChild(li);
  });
}

// Save / load from localStorage (로컬스토리지에 저장/불러오기)
function saveLandmarksToLocalStorage() {
  const data = savedLandmarks.map(({ name, position }) => ({ name, position }));
  localStorage.setItem('savedLandmarks', JSON.stringify(data));
}

function loadSavedLandmarks() {
  const data = localStorage.getItem('savedLandmarks');
  if (data) {
    savedLandmarks = JSON.parse(data);
  }
}

// Hide landmark input (랜드마크 입력 숨기기)
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

// Distance calculation (거리 계산)
function calculateDistance(a, b) {
  const R = 6371000; // meters
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
