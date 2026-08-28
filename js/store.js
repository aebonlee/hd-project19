/*
 * 결과 저장(로컬) + 결과 해설 연결부.
 *
 * index.html 의 원본 해석 로직(analyze() 등)은 건드리지 않는다. 대신 analyze()
 * 끝에서 window.hd19OnAnalyze(modes) 를 호출하도록 한 줄만 추가해 뒀고, 여기서
 * 그 훅을 받아 (1) 저장 버튼을 켜고 (2) 결과 해설 패널을 채운다.
 *
 * 서버(Supabase) 의존을 걷어내고 이 리포도 다른 hd-project들과 같은 완전한
 * 정적·백엔드 0 구조로 되돌렸다 — 저장은 이 브라우저의 localStorage 안에서만
 * 끝난다. 다른 기기·다른 브라우저에서는 안 보인다(로컬 전용이라는 한계를 화면에도
 * 밝혀 둔다).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'hd19_saved_results';
  var MAX_RECORDS = 20;

  function v(id) { var el = document.getElementById(id); return el ? parseFloat(el.value) || 0 : 0; }

  function collectInputs() {
    var inputs = {
      mass: v('mass'), grav: v('grav'),
      cgx: v('cgx'), cgy: v('cgy'), cgz: v('cgz'),
      ixx: v('ixx'), iyy: v('iyy'), izz: v('izz'),
      ixy: v('ixy'), ixz: v('ixz'), iyz: v('iyz'),
      mounts: []
    };
    for (var n = 1; n <= 4; n++) {
      inputs.mounts.push({
        n: n, x: v('m' + n + 'x'), y: v('m' + n + 'y'), z: v('m' + n + 'z'),
        kx: v('m' + n + 'kx'), ky: v('m' + n + 'ky'), kz: v('m' + n + 'kz')
      });
    }
    return inputs;
  }

  function applyInputs(inputs) {
    if (!inputs) return;
    var fields = ['mass', 'grav', 'cgx', 'cgy', 'cgz', 'ixx', 'iyy', 'izz', 'ixy', 'ixz', 'iyz'];
    fields.forEach(function (f) {
      var el = document.getElementById(f);
      if (el && inputs[f] !== undefined) el.value = inputs[f];
    });
    (inputs.mounts || []).forEach(function (m) {
      ['x', 'y', 'z', 'kx', 'ky', 'kz'].forEach(function (k) {
        var el = document.getElementById('m' + m.n + k);
        if (el && m[k] !== undefined) el.value = m[k];
      });
    });
  }

  function setStatus(msg, isError) {
    var el = document.getElementById('hd19SaveStatus');
    if (!el) return;
    el.style.color = isError ? '#b43b3b' : '#66736f';
    el.textContent = msg;
  }

  // localStorage가 막힌 환경(사생활 보호 모드 등)에서도 조용히 죽지 않는다.
  function readRecords() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return null; }
  }

  function writeRecords(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) { return false; }
  }

  window.hd19OnAnalyze = function (modes) {
    var saveBtn = document.getElementById('saveBtn');
    if (saveBtn) saveBtn.disabled = false;

    var panel = document.getElementById('hd19Interpretation');
    if (panel && window.hd19Interpret) {
      var findings = window.hd19Interpret.interpretModes(modes);
      panel.innerHTML = window.hd19Interpret.renderInterpretationHtml(findings);
    }
  };

  window.hd19SaveResult = function () {
    var labelEl = document.getElementById('saveLabel');
    var label = labelEl ? labelEl.value.trim() : '';
    if (!label) { setStatus('저장 이름을 입력하세요.', true); return; }
    if (!window.lastModes) { setStatus('먼저 공진 해석을 실행하세요.', true); return; }

    var list = readRecords();
    if (list === null) { setStatus('이 브라우저에서는 저장 기능을 쓸 수 없습니다(사생활 보호 모드 등).', true); return; }

    list.unshift({
      id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
      label: label,
      created_at: new Date().toISOString(),
      inputs: collectInputs(),
      results: window.lastModes.map(function (m) { return { f: m.f, w: m.w, dominant: m.dominant, vec: m.vec }; })
    });
    if (list.length > MAX_RECORDS) list.length = MAX_RECORDS;

    if (!writeRecords(list)) { setStatus('저장 공간이 부족하거나 저장할 수 없습니다.', true); return; }
    setStatus('이 브라우저에 저장했습니다: "' + label + '"');
    if (labelEl) labelEl.value = '';
  };

  window.hd19LoadResultList = function () {
    var listEl = document.getElementById('hd19SavedList');
    if (!listEl) return;

    var rows = readRecords();
    if (rows === null) { setStatus('이 브라우저에서는 저장 기능을 쓸 수 없습니다.', true); return; }
    if (!rows.length) { listEl.textContent = '저장된 기록이 없습니다.'; return; }

    listEl.innerHTML = rows.map(function (r) {
      var when = new Date(r.created_at).toLocaleString('ko-KR');
      return '<div style="padding:4px 0;border-bottom:1px solid #eee">' +
        '<a href="#" data-id="' + r.id + '" class="hd19-load-link" style="color:#1e5b91;font-weight:700;text-decoration:none">' +
        (r.label || '(이름 없음)') + '</a> <span style="color:#999">' + when + '</span></div>';
    }).join('');
    Array.prototype.forEach.call(listEl.querySelectorAll('.hd19-load-link'), function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        var found = rows.find(function (r) { return String(r.id) === a.getAttribute('data-id'); });
        if (found) { applyInputs(found.inputs); if (window.analyze) window.analyze(); setStatus('"' + found.label + '" 불러왔습니다.'); }
      });
    });
  };

  // index.html 맨 끝에서 이 파일이 로드되기 전에 이미 analyze()가 한 번
  // 자동으로 돌아 window.lastModes가 채워져 있을 수 있다(첫 화면 진입 시).
  // 그때 hd19OnAnalyze는 아직 정의되기 전이라 그 첫 호출은 조용히 스킵된다 —
  // 여기서 이미 계산된 게 있으면 지금 한 번 더 불러 저장버튼/해설 패널을 맞춘다.
  if (window.lastModes) window.hd19OnAnalyze(window.lastModes);
})();
