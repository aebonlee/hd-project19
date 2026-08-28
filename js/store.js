/*
 * 결과 저장(서버) + 결과 해설 연결부.
 *
 * index.html 의 원본 해석 로직(analyze() 등)은 건드리지 않는다. 대신 analyze()
 * 끝에서 window.hd19OnAnalyze(modes) 를 호출하도록 한 줄만 추가해 뒀고, 여기서
 * 그 훅을 받아 (1) 저장 버튼을 켜고 (2) 결과 해설 패널을 채운다.
 *
 * ⚠ 대표가 SQL Editor에서 supabase/schema.sql 을 아직 실행하지 않은 상태에서도
 * 이 화면 자체는 절대 죽으면 안 된다(CLAUDE.md §2.1 sqld 사고 재발 방지) — 그래서
 * 저장/불러오기는 실패해도 try/catch로 감싸고 "곧 활성화됩니다" 안내로 우아하게
 * 넘어간다. 계산·CSV 내보내기 등 원래 기능은 이 파일이 없어도 100% 그대로 동작한다.
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://hcmgdztsgjvzcyxyayaj.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjbWdkenRzZ2p2emN5eHlheWFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MzU4ODcsImV4cCI6MjA4NzAxMTg4N30.gznaPzY1l8qDAPsEyYNR9KS7f7VqS3xaw-_2HTSwSZw';
  var TABLE = 'hd19_analysis_results';
  var OWNER_KEY = 'hd19_owner_id';

  var client = null;
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  } catch (e) { client = null; }

  function getOwnerId() {
    try {
      var id = localStorage.getItem(OWNER_KEY);
      if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
        localStorage.setItem(OWNER_KEY, id);
      }
      return id;
    } catch (e) {
      // localStorage가 막힌 환경(사생활 보호 모드 등) — 저장 기능만 비활성.
      return null;
    }
  }

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

  // 테이블이 아직 없을 때 나는 PostgREST 오류(테이블 없음 42P01 / 스키마 캐시에 없음 PGRST205)를
  // "서버 설정 전"으로 인식해 조용히 안내만 하고, 그 외 진짜 오류와는 구분한다.
  function isTableMissing(err) {
    var code = (err && (err.code || '')) + '';
    var msg = (err && (err.message || '')) + '';
    return code === '42P01' || code === 'PGRST205' || /relation .* does not exist/i.test(msg) || /Could not find the table/i.test(msg);
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

  window.hd19SaveResult = async function () {
    var labelEl = document.getElementById('saveLabel');
    var label = labelEl ? labelEl.value.trim() : '';
    if (!label) { setStatus('저장 이름을 입력하세요.', true); return; }
    if (!window.lastModes) { setStatus('먼저 공진 해석을 실행하세요.', true); return; }
    if (!client) { setStatus('저장 기능은 곧 활성화됩니다.'); return; }
    var ownerId = getOwnerId();
    if (!ownerId) { setStatus('이 브라우저에서는 저장 기능을 쓸 수 없습니다(사생활 보호 모드 등).', true); return; }

    setStatus('저장 중…');
    try {
      var row = {
        owner_id: ownerId,
        label: label,
        inputs: collectInputs(),
        results: window.lastModes.map(function (m) { return { f: m.f, w: m.w, dominant: m.dominant, vec: m.vec }; })
      };
      var res = await client.from(TABLE).insert(row);
      if (res.error) throw res.error;
      setStatus('저장했습니다: "' + label + '"');
      if (labelEl) labelEl.value = '';
    } catch (e) {
      if (isTableMissing(e)) {
        setStatus('저장 기능은 곧 활성화됩니다 (관리자가 서버 설정을 아직 완료하지 않았습니다).', true);
      } else {
        setStatus('저장 실패: ' + (e && e.message ? e.message : String(e)), true);
      }
    }
  };

  window.hd19LoadResultList = async function () {
    var listEl = document.getElementById('hd19SavedList');
    if (!listEl) return;
    if (!client) { setStatus('저장 기능은 곧 활성화됩니다.'); return; }
    var ownerId = getOwnerId();
    if (!ownerId) { setStatus('이 브라우저에서는 저장 기능을 쓸 수 없습니다.', true); return; }

    listEl.textContent = '불러오는 중…';
    try {
      var res = await client.from(TABLE)
        .select('id,label,created_at,inputs')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (res.error) throw res.error;
      var rows = res.data || [];
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
    } catch (e) {
      if (isTableMissing(e)) {
        listEl.textContent = '저장 기능은 곧 활성화됩니다 (관리자가 서버 설정을 아직 완료하지 않았습니다).';
      } else {
        listEl.textContent = '불러오기 실패: ' + (e && e.message ? e.message : String(e));
      }
    }
  };

  // index.html 맨 끝에서 이 파일이 로드되기 전에 이미 analyze()가 한 번
  // 자동으로 돌아 window.lastModes가 채워져 있을 수 있다(첫 화면 진입 시).
  // 그때 hd19OnAnalyze는 아직 정의되기 전이라 그 첫 호출은 조용히 스킵된다 —
  // 여기서 이미 계산된 게 있으면 지금 한 번 더 불러 저장버튼/해설 패널을 맞춘다.
  if (window.lastModes) window.hd19OnAnalyze(window.lastModes);
})();
