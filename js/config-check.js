// ══ 초기 설정 누락 감지 ══
// config.js(window.APP_CONFIG)가 없거나 플레이스홀더 그대로면,
// 앱 대신 친절한 안내 화면을 띄워 간편 설치 도우미(setup.html)로 유도한다.
// config.js 바로 다음에 로드되어야 한다.
(function () {
  'use strict';
  function ph(v) { return !v || /^YOUR_/i.test(String(v)) || String(v).trim() === ''; }
  var c = window.APP_CONFIG, fb = c && c.firebase;
  var valid = fb && !ph(fb.apiKey) && !ph(fb.projectId) && !ph(fb.appId);
  if (valid) return; // 정상 설정 → 아무것도 안 함

  function show() {
    if (document.getElementById('cfg-setup-overlay')) return;
    var o = document.createElement('div');
    o.id = 'cfg-setup-overlay';
    o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:linear-gradient(135deg,#1B3A6B,#0f172a);' +
      "color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:'Noto Sans KR',sans-serif";
    o.innerHTML =
      '<div style="max-width:420px;text-align:center">' +
        '<div style="font-size:46px;margin-bottom:10px">⚙️</div>' +
        '<div style="font-size:20px;font-weight:800;margin-bottom:8px">초기 설정이 필요합니다</div>' +
        '<div style="font-size:14px;line-height:1.7;opacity:.9;margin-bottom:22px">Firebase 설정(<b>config.js</b>)이 아직 입력되지 않았거나 형식이 올바르지 않습니다.<br>아래 간편 설치 도우미로 손쉽게 설정할 수 있어요.</div>' +
        '<a href="setup.html" style="display:block;background:#FEE500;color:#191919;text-decoration:none;border-radius:12px;padding:14px;font-size:15px;font-weight:800;margin-bottom:10px">⚙️ 간편 설치 도우미 열기</a>' +
        '<a href="install-guide.html" style="display:block;background:rgba(255,255,255,0.12);color:#fff;text-decoration:none;border-radius:12px;padding:12px;font-size:13px;font-weight:600;border:1px solid rgba(255,255,255,0.25)">📖 설치 안내서 보기</a>' +
        '<div style="font-size:11px;opacity:.6;margin-top:18px">이미 설정했다면, config.js를 배포 폴더에 넣고 재배포했는지 확인하세요.</div>' +
      '</div>';
    (document.body || document.documentElement).appendChild(o);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
  else show();
})();
