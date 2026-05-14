// ══ 구역지도 ══
var _adminMap = null;
var _adminMapReady = false;
var _adminMarkers = []; // [{marker, cycle}]
var _adminInfoWindow = null;
var _activeCycleFilter = null; // null=전체, 숫자=해당 회차만

// ── 회차별 색상 팔레트 (8색 순환, 색상환 균등 배치) ─────────────────────────
var _CYCLE_PALETTE = [
  '#DC2626', // 1회차: 빨강
  '#EA580C', // 2회차: 주황
  '#CA8A04', // 3회차: 황금
  '#16A34A', // 4회차: 초록
  '#0D9488', // 5회차: 청록
  '#2563EB', // 6회차: 파랑
  '#7C3AED', // 7회차: 보라
  '#DB2777', // 8회차: 분홍
];

function _cycleColor(cycle) {
  var idx = ((parseInt(cycle) || 1) - 1) % _CYCLE_PALETTE.length;
  return _CYCLE_PALETTE[idx];
}

// ── 근접 구역 그룹핑 (~20m 이내를 같은 위치로 판단) ─────────────────────────
var _PROX_THR = 0.00018; // 위도/경도 차이 ~20m

function _groupByProximity(list) {
  var assigned = new Array(list.length).fill(false);
  var groups   = [];
  for (var i = 0; i < list.length; i++) {
    if (assigned[i]) continue;
    var g = [list[i]];
    assigned[i] = true;
    for (var j = i + 1; j < list.length; j++) {
      if (assigned[j]) continue;
      if (Math.abs(list[i].lat - list[j].lat) < _PROX_THR &&
          Math.abs(list[i].lng - list[j].lng) < _PROX_THR) {
        g.push(list[j]);
        assigned[j] = true;
      }
    }
    groups.push(g);
  }
  return groups;
}

// ── 마커 내 상태 기호 ─────────────────────────────────────────────────────────
function _statusSymbol(t) {
  if (t.status === '완료')   return '<span style="font-size:9px;margin-left:2px;opacity:0.95">✓</span>';
  if (t.status === '진행중') return '<span style="width:5px;height:5px;background:rgba(255,255,255,0.9);'
    + 'border-radius:50%;display:inline-block;margin-left:3px;vertical-align:middle"></span>';
  return '';
}

// ── 화살표 꼬리 ───────────────────────────────────────────────────────────────
function _arrowTail(color) {
  return '<div style="width:0;height:0;border-left:4px solid transparent;'
    + 'border-right:4px solid transparent;border-top:5px solid ' + color + ';'
    + 'margin:1px auto 0"></div>';
}

// ── 단일 마커 생성 ────────────────────────────────────────────────────────────
function _placeAdminMarker(t, lat, lng) {
  var pos   = new naver.maps.LatLng(lat, lng);
  var color = _cycleColor(t.cycle);

  var marker = new naver.maps.Marker({
    position: pos,
    map: _adminMap,
    icon: {
      content: '<div style="background:' + color + ';color:#fff;font-size:11px;font-weight:600;'
        + 'padding:3px 8px;border-radius:10px;box-shadow:0 2px 6px rgba(0,0,0,0.28);'
        + 'font-family:sans-serif;white-space:nowrap;cursor:pointer">'
        + String(t.no) + _statusSymbol(t)
        + _arrowTail(color)
        + '</div>',
      anchor: new naver.maps.Point(20, 30)
    }
  });

  naver.maps.Event.addListener(marker, 'click', function() {
    _adminInfoWindow.setContent(_buildSingleIW(t));
    _adminInfoWindow.open(_adminMap, marker);
    setTimeout(function() {
      var btn = document.getElementById('iw-btn-' + t.id);
      if (btn) btn.addEventListener('click', function() { openTerritoryFromMap(t.id); });
    }, 50);
  });

  _adminMarkers.push({ marker: marker, cycle: parseInt(t.cycle) || 1 });
}

// ── 그룹 마커 생성 (겹친 구역 N개) ──────────────────────────────────────────
function _placeAdminGroupMarker(group) {
  var lat   = group[0].lat, lng = group[0].lng;
  var pos   = new naver.maps.LatLng(lat, lng);
  var color = _cycleColor(group[0].cycle);
  var cnt   = group.length;

  var marker = new naver.maps.Marker({
    position: pos,
    map: _adminMap,
    icon: {
      content: '<div style="background:' + color + ';color:#fff;font-size:11px;font-weight:600;'
        + 'padding:3px 8px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.32);'
        + 'font-family:sans-serif;white-space:nowrap;cursor:pointer;display:inline-flex;align-items:center;gap:3px">'
        + String(group[0].no)
        + '<span style="background:rgba(0,0,0,0.30);border-radius:8px;padding:1px 5px;font-size:9px;font-weight:700">×' + cnt + '</span>'
        + _arrowTail(color)
        + '</div>',
      anchor: new naver.maps.Point(25, 30)
    }
  });

  naver.maps.Event.addListener(marker, 'click', function() {
    _adminInfoWindow.setContent(_buildGroupIW(group));
    _adminInfoWindow.open(_adminMap, marker);
    setTimeout(function() {
      group.forEach(function(t) {
        var btn = document.getElementById('iw-gbtn-' + t.id);
        if (btn) btn.addEventListener('click', function() { openTerritoryFromMap(t.id); });
      });
    }, 50);
  });

  _adminMarkers.push({ marker: marker, cycle: parseInt(group[0].cycle) || 1 });
}

// ── 단일 구역 InfoWindow HTML ──────────────────────────────────────────────
function _buildSingleIW(t) {
  var pubs  = _pubLabelPlain(t.assignedPublishers);
  var color = _cycleColor(t.cycle);
  var badge = t.completionStatus === 'complete'
    ? '<div style="margin-top:6px;padding:4px 8px;background:#DCFCE7;color:#15803D;'
      + 'border-radius:6px;font-size:11px">🔔 완료 신청 중</div>' : '';
  return '<div class="map-info-window">'
    + '<div class="map-iw-no" style="color:' + color + '">' + (t.cycle||1) + '회차 · ' + (t.status||'미배정') + '</div>'
    + '<div class="map-iw-name">' + String(t.no) + ' ' + t.name + '</div>'
    + '<div class="map-iw-row"><span>배정</span><span class="map-iw-val">' + pubs + '</span></div>'
    + '<div class="map-iw-row"><span>진행률</span><span class="map-iw-val">' + (t.completionRate||0) + '%</span></div>'
    + '<div class="map-iw-row"><span>세대수</span><span class="map-iw-val">' + (t.totalUnits||'—') + '세대</span></div>'
    + badge
    + '<button id="iw-btn-' + t.id + '" class="map-iw-btn">구역 편집</button>'
    + '</div>';
}

// ── 그룹 InfoWindow HTML (구역 목록) ─────────────────────────────────────────
function _buildGroupIW(group) {
  var items = group.map(function(t) {
    var c    = _cycleColor(t.cycle);
    var pubs = _pubLabelPlain(t.assignedPublishers);
    var stColor = t.status === '완료'   ? '#16A34A'
                : t.status === '진행중' ? '#2563EB' : '#94A3B8';
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid #F1F5F9">'
      + '<div style="width:4px;align-self:stretch;border-radius:2px;background:' + c + ';flex-shrink:0"></div>'
      + '<div style="flex:1;min-width:0">'
      +   '<div style="font-size:12px;font-weight:700;color:#1E293B;display:flex;align-items:center;gap:5px">'
      +     String(t.no) + ' ' + (t.name || '')
      +     '<span style="font-size:10px;font-weight:600;color:' + c + ';background:' + c + '18;'
      +       'padding:1px 5px;border-radius:4px">' + (t.cycle||1) + '회차</span>'
      +   '</div>'
      +   '<div style="font-size:10px;color:#64748B;margin-top:2px">'
      +     '<span style="color:' + stColor + ';font-weight:600">' + (t.status||'미배정') + '</span>'
      +     (pubs ? '<span style="color:#94A3B8"> · </span>' + pubs : '')
      +   '</div>'
      + '</div>'
      + '<button id="iw-gbtn-' + t.id + '" style="flex-shrink:0;background:#1B3A6B;color:#fff;'
      +   'border:none;border-radius:6px;padding:4px 9px;font-size:10px;cursor:pointer;font-weight:600">편집</button>'
      + '</div>';
  }).join('');

  return '<div class="map-info-window" style="min-width:240px;max-width:320px;padding:0">'
    + '<div style="font-size:12px;font-weight:700;color:#1B3A6B;padding:8px 12px;'
    +   'border-bottom:2px solid #E2E8F0;background:#F8FAFC;border-radius:12px 12px 0 0">'
    +   '📍 이 위치 구역 ' + group.length + '개'
    + '</div>'
    + items
    + '</div>';
}

// ── 회차 범례 업데이트 (클릭 필터 포함) ─────────────────────────────────────
function _updateCycleLegend(territories) {
  var el = document.getElementById('map-cycle-legend');
  if (!el) return;

  var cycleSet = {};
  territories.forEach(function(t) {
    var c = parseInt(t.cycle) || 1;
    cycleSet[c] = true;
  });
  var cycles = Object.keys(cycleSet).map(Number).sort(function(a,b){return a-b;});
  if (!cycles.length) { el.style.display = 'none'; return; }

  var allActive = (_activeCycleFilter === null);

  // 전체 버튼
  var allBtn = '<span id="map-cycle-all-btn" onclick="_setCycleFilter(null)" '
    + 'style="display:inline-flex;align-items:center;font-size:11px;cursor:pointer;'
    + 'padding:2px 6px;border-radius:4px;user-select:none;transition:all .15s;'
    + 'background:' + (allActive ? '#EFF6FF' : 'transparent') + ';'
    + 'color:' + (allActive ? '#1B3A6B' : '#94A3B8') + ';'
    + 'font-weight:' + (allActive ? '700' : '400') + '">'
    + '전체</span>';

  var chips = cycles.map(function(c) {
    var isSel = (_activeCycleFilter === c);
    var isVis = allActive || isSel;
    return '<span data-cycle="' + c + '" onclick="_setCycleFilter(' + c + ')" '
      + 'style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;'
      + 'padding:2px 6px;border-radius:4px;user-select:none;transition:all .15s;'
      + 'background:' + (isSel ? _cycleColor(c) + '18' : 'transparent') + ';'
      + 'outline:' + (isSel ? '2px solid ' + _cycleColor(c) : 'none') + ';'
      + 'outline-offset:0;'
      + 'opacity:' + (isVis ? '1' : '0.32') + '">'
      + '<span style="width:10px;height:10px;border-radius:3px;background:' + _cycleColor(c)
      + ';display:inline-block;flex-shrink:0"></span>'
      + '<span style="font-size:11px;color:#374151;font-weight:' + (isSel ? '700' : '400') + '">'
      + c + '회차</span>'
      + '</span>';
  }).join('');

  el.innerHTML = allBtn
    + '<span style="color:#D1D5DB;margin:0 1px;align-self:stretch;display:flex;align-items:center">|</span>'
    + chips;
  el.style.display = 'flex';
}

// ── 회차 필터 적용 (마커 show/hide) ─────────────────────────────────────────
function _applyCycleFilter() {
  _adminMarkers.forEach(function(item) {
    var visible = (_activeCycleFilter === null || item.cycle === _activeCycleFilter);
    item.marker.setMap(visible ? _adminMap : null);
  });
}

// ── 회차 필터 토글 (범례 칩 클릭 시 호출) ────────────────────────────────────
function _setCycleFilter(cycle) {
  // 같은 회차 재클릭 또는 null → 전체 보기
  _activeCycleFilter = (cycle === null || _activeCycleFilter === cycle) ? null : cycle;
  _applyCycleFilter();
  // 범례 UI만 갱신 (territories 데이터는 그대로)
  _updateCycleLegend(window._territories || []);
}

// ── 마커 전체 그리기 ─────────────────────────────────────────────────────────
function plotTerritoryMarkers() {
  _adminMarkers.forEach(function(item) { item.marker.setMap(null); });
  _adminMarkers = [];

  var territories = window._territories || [];
  if (!territories.length) {
    _updateCycleLegend([]); // 빈 상태로 범례 초기화
    return;
  }

  // 저장 좌표 보유/미보유 분리
  var withCoords = territories.filter(function(t) { return t.lat && t.lng; });
  var noCoords   = territories.filter(function(t) { return !t.lat || !t.lng; });

  // 근접 그룹핑 후 마커 배치
  var groups = _groupByProximity(withCoords);
  groups.forEach(function(group) {
    if (group.length === 1) {
      _placeAdminMarker(group[0], group[0].lat, group[0].lng);
    } else {
      _placeAdminGroupMarker(group);
    }
  });

  // 좌표 없는 구역 → 지오코딩 후 개별 배치
  if (noCoords.length) _geocodeSequential(noCoords, 0);

  // 범례 갱신 + 현재 필터 유지 적용
  _updateCycleLegend(territories);
  _applyCycleFilter();
}

// ── 지도 초기화 ───────────────────────────────────────────────────────────────
function initAdminMap() {
  if (_adminMapReady) {
    // 탭 재진입 시: resize 완료 후 마커·범례를 함께 갱신
    // (resize 전에 plotTerritoryMarkers를 호출하면 컨테이너 크기가 아직 0일 수 있음)
    setTimeout(function() {
      if (_adminMap) naver.maps.Event.trigger(_adminMap, 'resize');
      plotTerritoryMarkers();
    }, 100);
    return;
  }
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
  // 최초 생성: 레이아웃 완료 후 resize + 마커·범례 동시 갱신
  setTimeout(function() {
    if (_adminMap) naver.maps.Event.trigger(_adminMap, 'resize');
    plotTerritoryMarkers();
  }, 150);
}

window.openTerritoryFromMap = function(id) {
  var navItem = document.querySelector('[onclick*="territory"]');
  if (navItem) switchTab('territory', navItem);
  setTimeout(function() { openEditModal(id); }, 100);
};

// ── 주소 문자열 조합 (공통 유틸) ─────────────────────────────────────────────
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
    .catch(function() {});
  var t = (window._territories || []).find(function(x) { return x.id === id; });
  if (t) { t.lat = lat; t.lng = lng; }
}

// ── 순차 지오코딩 (rate-limit 방지: 100ms 간격) ─────────────────────────────
function _geocodeSequential(list, idx) {
  if (idx >= list.length) return;
  var t = list[idx];
  var q = _buildAddrQuery(t);
  if (!q) { _geocodeSequential(list, idx + 1); return; }

  naver.maps.Service.geocode({ query: q }, function(status, response) {
    if (status === naver.maps.Service.Status.OK
        && response.v2 && response.v2.meta.totalCount > 0) {
      var item = response.v2.addresses[0];
      var lat  = parseFloat(item.y);
      var lng  = parseFloat(item.x);
      _placeAdminMarker(t, lat, lng);
      _saveTerritoryCoords(t.id, lat, lng);
      // 필터 활성 시 새 마커에도 즉시 적용
      if (_activeCycleFilter !== null && (parseInt(t.cycle) || 1) !== _activeCycleFilter) {
        _adminMarkers[_adminMarkers.length - 1].marker.setMap(null);
      }
    }
    setTimeout(function() { _geocodeSequential(list, idx + 1); }, 100);
  });
}

// ── 전체 좌표 재계산 (설정 탭 버튼) ─────────────────────────────────────────
window._geocodeResetAll = function() {
  var territories = window._territories || [];
  if (!territories.length) { alert('구역 데이터가 없습니다.'); return; }
  if (!window.naver || !naver.maps) {
    alert('지도 API가 로드되지 않았습니다. 구역지도 탭을 먼저 열어 주세요.');
    return;
  }

  var total = 0, done = 0;
  territories.forEach(function(t) {
    var q = _buildAddrQuery(t);
    if (q) total++;
    delete t.lat; delete t.lng;
  });

  var msgEl = document.getElementById('s-geocode-msg');
  var btnEl = document.getElementById('s-geocode-btn');
  if (msgEl) { msgEl.style.display = 'block'; msgEl.textContent = '좌표 재계산 중… 0 / ' + total; }
  if (btnEl) btnEl.disabled = true;

  function _next(idx) {
    if (idx >= territories.length) {
      if (msgEl) msgEl.textContent = '✅ 완료 — ' + done + '개 구역 좌표 저장';
      if (btnEl) btnEl.disabled = false;
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
        _saveTerritoryCoords(t.id, parseFloat(item.y), parseFloat(item.x));
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
  if (t.lat && t.lng) { _renderMiniMarker(t, t.lat, t.lng); return; }

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
    var lat = parseFloat(item.y), lng = parseFloat(item.x);
    _saveTerritoryCoords(t.id, lat, lng);
    _renderMiniMarker(t, lat, lng);
  });
}

function _renderMiniMarker(t, lat, lng) {
  var pos   = new naver.maps.LatLng(lat, lng);
  var color = _cycleColor(t.cycle);

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
        + 'white-space:nowrap;font-family:sans-serif">'
        + t.no + ' ' + t.name
        + '<div style="width:0;height:0;border-left:5px solid transparent;'
        + 'border-right:5px solid transparent;border-top:6px solid ' + color + ';'
        + 'margin:2px auto 0"></div></div>',
      anchor: new naver.maps.Point(40, 38)
    }
  });

  naver.maps.Event.trigger(_miniMap, 'resize');
  document.getElementById('mini-map-loading').style.display = 'none';
}
