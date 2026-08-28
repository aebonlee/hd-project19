/*
 * 결과 해설(참고용 · 규칙 기반) — 순수 함수, DOM/네트워크 의존 없음.
 * node test/logic.test.js 에서 그대로 require 해서 검증한다.
 *
 * 여기서 쓰는 주파수 대역은 "이 정도 대역이면 통상 이런 가진원과 겹칠 수 있다"는
 * 일반적인 경험칙이지 이 장비의 실측치가 아니다. 그래서 문구마다 "겹칠 수 있다/
 * 가능성" 같은 완곡 표현을 쓰고, 화면에도 "참고용"이라고 못박아 둔다 — 실제
 * 엔진 회전수·주행 조건은 장비마다 다르므로 설계 판단은 사람이 해야 한다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.hd19Interpret = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BANDS = [
    { max: 2, level: 'warn', label: '저주파(<2Hz)', message: '차체·서스펜션의 저주파 거동과 겹칠 수 있는 대역입니다. 저속 주행이나 정차 시 흔들림으로 체감될 수 있습니다.' },
    { max: 8, level: 'warn', label: '인체 민감 대역(2~8Hz)', message: '사람이 진동에 특히 민감하게 반응한다고 알려진 대역과 겹칩니다. 운전자 승차감에 영향을 줄 수 있습니다.' },
    { max: 25, level: 'danger', label: '엔진 회전 대역(8~25Hz)', message: '디젤 엔진의 공회전~중속 회전수 가진 주파수와 겹칠 수 있는 대역입니다. 실제 엔진 회전수(rpm/60)와 꼭 대조해 보세요.' },
    { max: 60, level: 'info', label: '고주파(25~60Hz)', message: '국부 브래킷·패널 등 부분 구조의 공진일 가능성이 있는 대역입니다.' }
  ];
  var COUPLING_PURITY_THRESHOLD = 0.7;

  function bandFor(freqHz) {
    for (var i = 0; i < BANDS.length; i++) {
      if (freqHz < BANDS[i].max) return BANDS[i];
    }
    return { max: Infinity, level: 'info', label: '고주파(60Hz~)', message: '상대적으로 고주파 대역입니다. 통상적인 엔진·주행 가진원과의 직접적 연관성은 낮은 편입니다.' };
  }

  /**
   * modes: index.html 의 analyze() 가 만드는 배열.
   *   각 원소 { f: 주파수Hz, dominant: 지배 DOF 인덱스(0~5), vec: 정규화 모드형상(6) }
   * DOF 이름 배열은 index.html 과 동일 순서로 기본값을 둔다.
   */
  function interpretModes(modes, dofNames) {
    dofNames = dofNames || ['X', 'Y', 'Z', 'Roll', 'Pitch', 'Yaw'];
    if (!Array.isArray(modes) || modes.length === 0) return [];

    return modes.map(function (m, i) {
      var band = bandFor(m.f);
      var purity = Math.abs(m.vec[m.dominant]);
      var coupled = purity < COUPLING_PURITY_THRESHOLD;
      var notes = [band.message];
      if (coupled) {
        notes.push('이 모드는 ' + dofNames[m.dominant] + ' 축이 지배적이지만 다른 축과 상당히 섞여 있습니다(순도 ' + (purity * 100).toFixed(0) + '%). 마운트 배치나 강성 비율을 재검토하면 축별로 더 분리될 수 있습니다.');
      }
      return {
        modeIndex: i + 1,
        dof: dofNames[m.dominant],
        freqHz: m.f,
        level: coupled && band.level !== 'danger' ? 'warn' : band.level,
        bandLabel: band.label,
        coupled: coupled,
        purity: purity,
        message: notes.join(' ')
      };
    });
  }

  function renderInterpretationHtml(findings) {
    if (!findings || !findings.length) return '해석 결과가 없습니다.';
    var colors = { info: '#1e5b91', warn: '#e57b24', danger: '#b43b3b' };
    return findings.map(function (f) {
      var c = colors[f.level] || colors.info;
      return '<div style="border-left:3px solid ' + c + ';padding:6px 10px;margin-bottom:6px;">' +
        '<b style="color:' + c + '">모드 ' + f.modeIndex + ' · ' + f.dof + ' · ' + f.freqHz.toFixed(2) + 'Hz</b> — ' + f.bandLabel + '<br>' +
        f.message + '</div>';
    }).join('');
  }

  return { interpretModes: interpretModes, renderInterpretationHtml: renderInterpretationHtml, BANDS: BANDS };
});
