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

function plotTerritoryMarkers() {
  _adminMarkers.forEach(function(m) { m.setMap(null); });
  _adminMarkers = [];
  var territories = window._territories || [];
  if (!territories.length) return;

  territories.forEach(function(t) {
    var units = t.units || [];
    var fu = units.find(function(u) { return u.road || u.jibun; }) || {};
    var road  = (fu.road  || '').trim();
    var jibun = (fu.jibun || '').trim();
    if (!road && !jibun) return;
    var BASE = ''; // ⚠ 본인 회중 지역으로 변경하면 지도 정확도 향상 (예: '경기도 OO시 ')
    var q = (road && jibun) ? BASE + road + jibun : road ? BASE + road : BASE + jibun;

    naver.maps.Service.geocode({ query: q }, function(status, response) {
      if (status !== naver.maps.Service.Status.OK) return;
      if (!response.v2 || response.v2.meta.totalCount === 0) return;
      var item = response.v2.addresses[0];
      var pos  = new naver.maps.Point(item.x, item.y);
      var color = t.status === '완료' ? '#16A34A' : t.status === '진행중' ? '#2563EB' : '#94A3B8';

      var marker = new naver.maps.Marker({
        position: pos, map: _adminMap,
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
        // onclick 대신 이벤트 리스너로 따옴표 충돌 회피
        setTimeout(function() {
          var btn = document.getElementById(iwId);
          if (btn) btn.addEventListener('click', function() { openTerritoryFromMap(t.id); });
        }, 50);
      });
      _adminMarkers.push(marker);
    });
  });
}

// ── 미니 지도 팝업 ──
var _miniMap = null;
var _miniMapMarker = null;

window.openTerritoryMiniMap = function(id) {
  var t = (window._territories || []).find(function(x) { return x.id === id; });
  if (!t) return;

  document.getElementById('mini-map-title').textContent = t.no + ' ' + t.name;
  document.getElementById('mini-map-loading').style.display = 'flex';
  document.getElementById('mini-map-loading-text').textContent = '위치를 불러오는 중...';
  document.getElementById('mini-map-modal').classList.add('open');

  // 지도 컨테이너가 화면에 보인 후 초기화
  setTimeout(function() { _initMiniMap(t); }, 150);
};

function _initMiniMap(t) {
  if (!window.naver || !naver.maps) {
    document.getElementById('mini-map-loading-text').textContent = '지도를 사용할 수 없습니다.';
    return;
  }

  // 주소 조합 (첫 번째 세대 기준)
  var units = t.units || [];
  var fu = units.find(function(u) { return u.road || u.jibun; }) || {};
  var road  = (fu.road  || '').trim();
  var jibun = (fu.jibun || '').trim();
  if (!road && !jibun) {
    document.getElementById('mini-map-loading-text').textContent = '주소 정보가 없습니다.';
    return;
  }
  var BASE = ''; // ⚠ 본인 회중 지역으로 변경하면 지도 정확도 향상 (예: '경기도 OO시 ')
  var q = (road && jibun) ? BASE + road + ' ' + jibun : road ? BASE + road : BASE + jibun;

  naver.maps.Service.geocode({ query: q }, function(status, response) {
    if (status !== naver.maps.Service.Status.OK
        || !response.v2 || response.v2.meta.totalCount === 0) {
      document.getElementById('mini-map-loading-text').textContent = '위치를 찾을 수 없습니다.';
      return;
    }

    var item = response.v2.addresses[0];
    var pos  = new naver.maps.LatLng(parseFloat(item.y), parseFloat(item.x));
    var color = t.status === '완료' ? '#16A34A' : t.status === '진행중' ? '#2563EB' : '#94A3B8';

    // 지도 초기화 또는 재사용
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

    // 이전 마커 제거 후 새 마커 추가
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

    // 렌더링 보정 후 로딩 숨김
    naver.maps.Event.trigger(_miniMap, 'resize');
    document.getElementById('mini-map-loading').style.display = 'none';
  });
}

