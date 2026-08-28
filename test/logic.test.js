/*
 * 단위 테스트 — 이 리포에서 새로 얹은 순수 로직만 검증한다.
 *
 * 원본 6DOF 해석 로직(Jacobi/Cholesky 등)은 index.html 안에 DOM과 얽혀
 * 그대로 있고 손대지 않았으므로 여기서 다시 검증하지 않는다 — 원작자(김완호)가
 * 이미 검증한 로직이다. 여기서 보는 건 js/interpret.js 뿐이다.
 */
'use strict';
var assert = require('assert');
var path = require('path');
var hd19Interpret = require(path.join(__dirname, '..', 'js', 'interpret.js'));

var passed = 0, failed = 0;
function group(t) { console.log('\n' + t); }
function test(label, fn) {
  try { fn(); passed++; console.log('  ✓ ' + label); }
  catch (e) { failed++; console.log('  X ' + label); console.log('      ' + e.message); }
}

group('interpretModes — 대역 판정');
test('저주파(<2Hz)는 warn', function () {
  var r = hd19Interpret.interpretModes([{ f: 1.2, dominant: 0, vec: [1, 0, 0, 0, 0, 0] }]);
  assert.strictEqual(r[0].level, 'warn');
  assert.strictEqual(r[0].bandLabel, '저주파(<2Hz)');
});
test('엔진 회전 대역(8~25Hz)은 danger', function () {
  var r = hd19Interpret.interpretModes([{ f: 15, dominant: 2, vec: [0, 0, 1, 0, 0, 0] }]);
  assert.strictEqual(r[0].level, 'danger');
});
test('60Hz 이상은 info', function () {
  var r = hd19Interpret.interpretModes([{ f: 75, dominant: 4, vec: [0, 0, 0, 0, 1, 0] }]);
  assert.strictEqual(r[0].level, 'info');
});
test('경계값 8Hz는 엔진대역(8~25)으로 분류된다(2~8 대역 미포함)', function () {
  var r = hd19Interpret.interpretModes([{ f: 8, dominant: 0, vec: [1, 0, 0, 0, 0, 0] }]);
  assert.strictEqual(r[0].bandLabel, '엔진 회전 대역(8~25Hz)');
});

group('interpretModes — 모드 결합(순도) 판정');
test('지배 DOF 순도가 낮으면(다축 결합) coupled=true, danger가 아니면 warn으로 올림', function () {
  var r = hd19Interpret.interpretModes([{ f: 40, dominant: 0, vec: [0.5, 0.5, 0.5, 0.1, 0.1, 0.1] }]);
  assert.strictEqual(r[0].coupled, true);
  assert.strictEqual(r[0].level, 'warn');
});
test('지배 DOF 순도가 높으면 coupled=false', function () {
  var r = hd19Interpret.interpretModes([{ f: 40, dominant: 0, vec: [0.99, 0.05, 0.02, 0.01, 0.01, 0.01] }]);
  assert.strictEqual(r[0].coupled, false);
});
test('danger 대역은 결합이 있어도 danger를 유지한다(경고를 낮추지 않음)', function () {
  var r = hd19Interpret.interpretModes([{ f: 15, dominant: 0, vec: [0.5, 0.5, 0.5, 0.1, 0.1, 0.1] }]);
  assert.strictEqual(r[0].level, 'danger');
});

group('interpretModes — 입력 방어');
test('빈 배열은 빈 배열을 돌려준다', function () {
  assert.deepStrictEqual(hd19Interpret.interpretModes([]), []);
});
test('배열이 아니면 빈 배열을 돌려준다(죽지 않는다)', function () {
  assert.deepStrictEqual(hd19Interpret.interpretModes(null), []);
  assert.deepStrictEqual(hd19Interpret.interpretModes(undefined), []);
});
test('DOF 이름을 직접 넘기면 그걸 쓴다', function () {
  var r = hd19Interpret.interpretModes([{ f: 1, dominant: 1, vec: [0, 1, 0, 0, 0, 0] }], ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.strictEqual(r[0].dof, 'B');
});

group('renderInterpretationHtml');
test('결과가 없으면 안내 문구를 낸다', function () {
  assert.strictEqual(hd19Interpret.renderInterpretationHtml([]), '해석 결과가 없습니다.');
});
test('findings가 있으면 모드 번호와 주파수를 포함한 HTML을 낸다', function () {
  var findings = hd19Interpret.interpretModes([{ f: 12.345, dominant: 0, vec: [1, 0, 0, 0, 0, 0] }]);
  var html = hd19Interpret.renderInterpretationHtml(findings);
  assert.ok(html.indexOf('모드 1') >= 0, 'html: ' + html);
  assert.ok(html.indexOf('12.35') >= 0 || html.indexOf('12.34') >= 0, 'html: ' + html);
});

console.log('\n총 ' + (passed + failed) + '개 중 ' + passed + '개 통과' + (failed ? ', ' + failed + '개 실패' : ''));
process.exit(failed ? 1 : 0);
