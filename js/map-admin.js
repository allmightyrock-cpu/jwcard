// ══ 구역지도 ══
var _adminMap = null;
var _adminMapReady = false;
var _adminMarkers = [];
var _adminInfoWindow = null;

function initAdminMap() {
  if (_adminMapReady) { plotTerritoryMarkers(); return; }
  if (!window.naver || !naver.maps) return;
  _adminMap = new naver.maps.Map('admin-naver-map', {
    center: new naver.maps.LatLng(37.8950, 127.0550),
    zoom: 13,
    mapTypeId: naver.maps.MapTypeId.NORMAL,
    scaleControl: true,
    zoomControl: true,
    zoomControlOptions: { position: naver.maps.Position.RIGHT_CENTER }
  });
  _adminInfoWindow = new naver.maps.InfoWindow({
    borderWidth: 0,
    backgroundColor: 'transparent',
    disableAnchor: true,
    pixelOffset: new naver.maps.Point(0, -10)
  });
  naver.maps.Event.addListener(_adminMap, 'click', function() {
    _adminInfoWindow.close();
  });
  _adminMapReady = true;
  plotTerritoryMarkers();
}

window.openTerritoryFromMap = function(id) {
  var navItem = document.querySelector('[onclick*="territory"]');
  if (navItem) switchTab('territory', navItem);
  setTimeout(function() { openEditModal(id); }, 100);
};

// ── 주소 문자열 조합 (공통 유틸) ────────────────────────────────────────────
function _buildAddrQuery(t) {
  var units = t.units || [];
  var fu = units.find(function(u) { return u.road || u.jibun; }) || {};
  var road  = (fu.road  || '').trim();
  var jibun = (fu.jibun || '').trim();
  if (!road && !jibun) return '';
  var BASE = (window._mapRegion || '경기도 동두천시') + ' ';
  return (road && jibun) ? BASE + road + ' ' + jibun
       : road             ? BASE + road
       :                    BASE + jibun;
}

// ── Firestore에 좌표 저장 ────────────────────────────────────────────────────
function _saveTerritoryCoords(id, lat, lng) {
  if (!window._db || !window._doc || !window._updateDoc) return;
  window._updateDoc(window._doc(window._db, 'territories', id), { lat: lat, lng: lng })
    .catch(function() {}); // silent — 다음 로드 때 재시도

  // 로컬 캐시도 갱신 (새로고침 전까지 유효)
  var t = (window._territories || []).find(function(x) { return x.id === id; });
  if (t) { t.lat = lat; t.lng = lng; }
}

// ── 마커 생성 ────────────────────────────────────────────────────────────────
function _placeAdminMarker(t, lat, lng) {
  var pos   = new naver.maps.LatLng(lat, lng);
  var color = t.status === '완료'  ? '#16A34A'
            : t.status === '진행중' ? '#2563EB'
            : '#94A3B8';

  var marker = new naver.maps.Marker({
    position: pos,
    map: _adminMap,
    icon: {
      content: '<div style="background:' + color + ';color:#fff;font-size:11px;font-weight:600;'
        + 'padding:3px 8px;border-radius:10px;box-shadow:0 2px 6px rgba(0,0,0,0.25);'
        + 'font-family:sans-serif;white-space:nowrap;cursor:pointer">'
        + String(t.no)
        + '<div style="width:0;height:0;border-left:4px solid transparent;'
        + 'border-right:4px solid transparent;border-top:5px solid ' + color + ';'
        + 'margin:1px auto 0"></div></div>',
      anchor: new naver.maps.Point(20, 30)
    }
  });

  naver.maps.Event.addListener(marker, 'click', function() {
    var pubs  = _pubLabelPlain(t.assignedPublishers);
    var badge = t.completionStatus === 'complete'
      ? '<div style="margin-top:6px;padding:4px 8px;background:#DCFCE7;color:#15803D;'
        + 'border-radius:6px;font-size:11px">🔔 완료 신청 중</div>' : '';
    var iwId = 'iw-btn-' + t.id;
    var html = '<div class="map-info-window">'
      + '<div class="map-iw-no">' + (t.cycle||1) + '회차 · ' + (t.status||'미배정') + '</div>'
      + '<div class="map-iw-name">' + String(t.no) + ' ' + t.name + '</div>'
      + '<div class="map-iw-row"><span>배정</span><span class="map-iw-val">' + pubs + '</span></div>'
      + '<div class="map-iw-row"><span>진행률</span><span class="map-iw-val">' + (t.completionRate||0) + '%</span></div>'
      + '<div class="map-iw-row"><span>세대수</span><span class="map-iw-val">' + (t.totalUnits||'—') + '세대</span></div>'
      + badge
      + '<button id="' + iwId + '" class="map-iw-btn">구역 편집</button>'
      + '</div>';
    _adminInfoWindow.setContent(html);
    _adminInfoWindow.open(_adminMap, marker);
    setTimeout(function() {
      var btn = document.getElementById(iwId);
      if (btn) btn.addEventListener('click', function() { openTerritoryFromMap(t.id); });
    }, 50);
  });

  _adminMarkers.push(marker);
}

// ── 순차 지오코딩 (rate-limit 방지: 100ms 간격) ────────────────────────────
function _geocodeSequential(list, idx) {
  if (idx >= list.length) return;
  var t = list[idx];
  var q = _buildAddrQuery(t);
  if (!q) {
    _geocodeSequential(list, idx + 1);
    return;
  }

  naver.maps.Service.geocode({ query: q }, function(status, response) {
    if (status === naver.maps.Service.Status.OK
        && response.v2 && response.v2.meta.totalCount > 0) {
      var item = response.v2.addresses[0];
      var lat  = parseFloat(item.y);
      var lng  = parseFloat(item.x);
      _placeAdminMarker(t, lat, lng);
      _saveTerritoryCoords(t.id, lat, lng);
    }
    setTimeout(function() { _geocodeSequential(list, idx + 1); }, 100);
  });
}

// ── 전체 마커 그리기 ─────────────────────────────────────────────────────────
function plotTerritoryMarkers() {
  _adminMarkers.forEach(function(m) { m.setMap(null); });
  _adminMarkers = [];

  var territories = window._territories || [];
  if (!territories.length) return;

  var toGeocode = [];

  territories.forEach(function(t) {
    if (t.lat && t.lng) {
      // 저장된 좌표 즉시 사용 — API 호출 없음
      _placeAdminMarker(t, t.lat, t.lng);
    } else {
      toGeocode.push(t);
    }
  });

  // 좌표 미보유 구역만 순차 지오코딩
  if (toGeocode.length) {
    _geocodeSequential(toGeocode, 0);
  }
}

// ── 전체 좌표 재계산 (설정 탭 버튼) ─────────────────────────────────────────
window._geocodeResetAll = function() {
  var territories = window._territories || [];
  if (!territories.length) {
    alert('구역 데이터가 없습니다.');
    return;
  }
  if (!window.naver || !naver.maps) {
    alert('지도 API가 로드되지 않았습니다. 구역지도 탭을 먼저 열어 주세요.');
    return;
  }

  var total = 0;
  var done  = 0;

  // lat/lng 초기화 (로컬 캐시)
  territories.forEach(function(t) {
    var q = _buildAddrQuery(t);
    if (q) total++;
    delete t.lat;
    delete t.lng;
  });

  var msgEl = document.getElementById('s-geocode-msg');
  if (msgEl) {
    msgEl.style.display = 'block';
    msgEl.textContent   = '좌표 재계산 중… 0 / ' + total;
  }
  var btnEl = document.getElementById('s-geocode-btn');
  if (btnEl) btnEl.disabled = true;

  function _next(idx) {
    if (idx >= territories.length) {
      if (msgEl) msgEl.textContent = '✅ 완료 — ' + done + '개 구역 좌표 저장';
      if (btnEl) btnEl.disabled = false;
      // 지도 탭이 열려 있으면 마커 갱신
      if (_adminMapReady) plotTerritoryMarkers();
      return;
    }
    var t = territories[idx];
    var q = _buildAddrQuery(t);
    if (!q) { _next(idx + 1); return; }

    naver.maps.Service.geocode({ query: q }, function(status, response) {
      if (status === naver.maps.Service.Status.OK
          && response.v2 && response.v2.meta.totalCount > 0) {
        var item = response.v2.addresses[0];
        var lat  = parseFloat(item.y);
        var lng  = parseFloat(item.x);
        _saveTerritoryCoords(t.id, lat, lng);
        done++;
      }
      if (msgEl) msgEl.textContent = '좌표 재계산 중… ' + done + ' / ' + total;
      setTimeout(function() { _next(idx + 1); }, 100);
    });
  }

  _next(0);
};

// ── 미니 지도 팝업 ───────────────────────────────────────────────────────────
var _miniMap = null;
var _miniMapMarker = null;

window.openTerritoryMiniMap = function(id) {
  var t = (window._territories || []).find(function(x) { return x.id === id; });
  if (!t) return;

  document.getElementById('mini-map-title').textContent = t.no + ' ' + t.name;
  document.getElementById('mini-map-loading').style.display = 'flex';
  document.getElementById('mini-map-loading-text').textContent = '위치를 불러오는 중...';
  document.getElementById('mini-map-modal').classList.add('open');

  setTimeout(function() { _initMiniMap(t); }, 150);
};

function _initMiniMap(t) {
  if (!window.naver || !naver.maps) {
    document.getElementById('mini-map-loading-text').textContent = '지도를 사용할 수 없습니다.';
    return;
  }

  // 저장된 좌표가 있으면 바로 사용
  if (t.lat && t.lng) {
    _renderMiniMarker(t, t.lat, t.lng);
    return;
  }

  // 없으면 지오코딩 후 저장
  var q = _buildAddrQuery(t);
  if (!q) {
    document.getElementById('mini-map-loading-text').textContent = '주소 정보가 없습니다.';
    return;
  }

  naver.maps.Service.geocode({ query: q }, function(status, response) {
    if (status !== naver.maps.Service.Status.OK
        || !response.v2 || response.v2.meta.totalCount === 0) {
      document.getElementById('mini-map-loading-text').textContent = '위치를 찾을 수 없습니다.';
      return;
    }
    var item = response.v2.addresses[0];
    var lat  = parseFloat(item.y);
    var lng  = parseFloat(item.x);
    _saveTerritoryCoords(t.id, lat, lng);
    _renderMiniMarker(t, lat, lng);
  });
}

function _renderMiniMarker(t, lat, lng) {
  var pos   = new naver.maps.LatLng(lat, lng);
  var color = t.status === '완료'  ? '#16A34A'
            : t.status === '진행중' ? '#2563EB'
            : '#94A3B8';

  if (!_miniMap) {
    _miniMap = new naver.maps.Map('admin-mini-map', {
      center: pos, zoom: 16,
      mapTypeId: naver.maps.MapTypeId.NORMAL,
      zoomControl: true,
      zoomControlOptions: { position: naver.maps.Position.RIGHT_CENTER },
      scaleControl: false
    });
  } else {
    _miniMap.setCenter(pos);
    _miniMap.setZoom(16);
  }

  if (_miniMapMarker) _miniMapMarker.setMap(null);
  _miniMapMarker = new naver.maps.Marker({
    position: pos, map: _miniMap,
    icon: {
      content: '<div style="background:' + color + ';color:#fff;font-size:12px;font-weight:700;'
        + 'padding:5px 12px;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,0.3);'
        + 'white-space:nowrap;font-family:sans-serif">' + t.no + ' ' + t.name
        + '<div style="width:0;height:0;border-left:5px solid transparent;'
        + 'border-right:5px solid transparent;border-top:6px solid ' + color + ';'
        + 'margin:2px auto 0"></div></div>',
      anchor: new naver.maps.Point(40, 38)
    }
  });

  naver.maps.Event.trigger(_miniMap, 'resize');
  document.getElementById('mini-map-loading').style.display = 'none';
}
