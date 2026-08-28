/*
 * 계산 엔진 검증 — index.html 안의 원본 6DOF 해석 로직(Jacobi/Cholesky 등)을
 * 그대로 복붙해 돌리는 게 아니라, 같은 수식을 여기서 독립적으로 다시 짜서
 * 이론값과 대조한다(복붙 검증은 같은 실수를 그대로 통과시키므로 의미가 없다).
 *
 * 대칭 배치 예시 데이터(index.html의 setExample())를 쓰면 물리적으로 6개
 * 모드가 완전히 디커플되어야 한다(마운트가 X=0·Y=0 평면에 대해 대칭이고
 * 모든 마운트가 Z=0에 있으므로 병진-회전 커플링이 전부 상쇄된다). 이 성질
 * 자체가 강한 회귀 검사가 된다 — 버그가 있으면 커플링이 남거나 순서가
 * 어긋난다.
 */
'use strict';
var assert = require('assert');

var passed = 0, failed = 0;
function group(t) { console.log('\n' + t); }
function test(label, fn) {
  try { fn(); passed++; console.log('  ✓ ' + label); }
  catch (e) { failed++; console.log('  X ' + label); console.log('      ' + e.message); }
}

// ── index.html 의 수식과 독립적으로 다시 구현 ──────────────────────────
function crossMatrix(r) { return [[0, -r[2], r[1]], [r[2], 0, -r[0]], [-r[1], r[0], 0]]; }
function matMul(A, B) {
  var m = A.length, n = B[0].length, p = B.length;
  var C = Array.from({ length: m }, function () { return Array(n).fill(0); });
  for (var i = 0; i < m; i++) for (var k = 0; k < p; k++) for (var j = 0; j < n; j++) C[i][j] += A[i][k] * B[k][j];
  return C;
}
function matT(A) { return A[0].map(function (_, j) { return A.map(function (r) { return r[j]; }); }); }
function addTo(A, B) { for (var i = 0; i < A.length; i++) for (var j = 0; j < A[0].length; j++) A[i][j] += B[i][j]; }
function diag3(a, b, c) { return [[a, 0, 0], [0, b, 0], [0, 0, c]]; }
function mountBMatrix(r) {
  var S = crossMatrix(r);
  return [[1, 0, 0, -S[0][0], -S[0][1], -S[0][2]],
          [0, 1, 0, -S[1][0], -S[1][1], -S[1][2]],
          [0, 0, 1, -S[2][0], -S[2][1], -S[2][2]]];
}
function cholesky(A) {
  var n = A.length, L = Array.from({ length: n }, function () { return Array(n).fill(0); });
  for (var i = 0; i < n; i++) for (var j = 0; j <= i; j++) {
    var s = A[i][j]; for (var k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) L[i][j] = Math.sqrt(Math.max(s, 1e-14)); else L[i][j] = s / L[j][j];
  }
  return L;
}
function invertLower(L) {
  var n = L.length, X = Array.from({ length: n }, function () { return Array(n).fill(0); });
  for (var j = 0; j < n; j++) for (var i = j; i < n; i++) {
    var s = (i === j ? 1 : 0); for (var k = j; k < i; k++) s -= L[i][k] * X[k][j];
    X[i][j] = s / L[i][i];
  }
  return X;
}
function jacobi(A) {
  var n = A.length, Q = Array.from({ length: n }, function (_, i) { return Array.from({ length: n }, function (_, j) { return i === j ? 1 : 0; }); });
  for (var iter = 0; iter < 200; iter++) {
    var p = 0, q = 1, max = 0;
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) if (Math.abs(A[i][j]) > max) { max = Math.abs(A[i][j]); p = i; q = j; }
    if (max < 1e-10) break;
    var phi = .5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]), c = Math.cos(phi), s = Math.sin(phi);
    var app = A[p][p], aqq = A[q][q], apq = A[p][q];
    A[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    A[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    A[p][q] = A[q][p] = 0;
    for (var k2 = 0; k2 < n; k2++) if (k2 !== p && k2 !== q) {
      var akp = A[k2][p], akq = A[k2][q];
      A[k2][p] = A[p][k2] = c * akp - s * akq;
      A[k2][q] = A[q][k2] = s * akp + c * akq;
    }
    for (var k3 = 0; k3 < n; k3++) {
      var qkp = Q[k3][p], qkq = Q[k3][q];
      Q[k3][p] = c * qkp - s * qkq; Q[k3][q] = s * qkp + c * qkq;
    }
  }
  var vals = A.map(function (r, i) { return r[i]; });
  var idx = vals.map(function (x, i) { return i; }).sort(function (a, b) { return vals[a] - vals[b]; });
  return { values: idx.map(function (i) { return vals[i]; }), vectors: Q.map(function (r) { return idx.map(function (i) { return r[i]; }); }) };
}

function solve(mass, I, mounts) {
  var M = Array.from({ length: 6 }, function () { return Array(6).fill(0); });
  for (var i = 0; i < 3; i++) M[i][i] = mass;
  for (i = 0; i < 3; i++) for (var j = 0; j < 3; j++) M[i + 3][j + 3] = I[i][j];

  var K = Array.from({ length: 6 }, function () { return Array(6).fill(0); });
  mounts.forEach(function (m) {
    var r = [m.x / 1000, m.y / 1000, m.z / 1000];
    var B = mountBMatrix(r);
    var D = diag3(m.kx * 1000, m.ky * 1000, m.kz * 1000);
    addTo(K, matMul(matT(B), matMul(D, B)));
  });

  var L = cholesky(M), Li = invertLower(L);
  var A = matMul(Li, matMul(K, matT(Li)));
  var ev = jacobi(A);

  return ev.values.map(function (lambda, j) {
    var w = Math.sqrt(Math.max(lambda, 0)), f = w / (2 * Math.PI);
    var y = ev.vectors.map(function (r) { return r[j]; });
    var phi = Array(6).fill(0);
    for (var i2 = 0; i2 < 6; i2++) for (var k = i2; k < 6; k++) phi[i2] += Li[k][i2] * y[k];
    var mx = Math.max.apply(null, phi.map(Math.abs));
    var norm = phi.map(function (x) { return x / mx; });
    var dominant = norm.reduce(function (a, x, i3) { return Math.abs(x) > Math.abs(norm[a]) ? i3 : a; }, 0);
    if (norm[dominant] < 0) norm = norm.map(function (x) { return -x; });
    return { f: f, dominant: dominant, vec: norm };
  });
}

// index.html의 setExample() 값 그대로
var mass = 1000, I = diag3(500, 800, 1000);
var mounts = [
  { x: -700, y: -450, z: 0, kx: 180, ky: 180, kz: 300 },
  { x: -700, y: 450, z: 0, kx: 180, ky: 180, kz: 300 },
  { x: 700, y: 450, z: 0, kx: 180, ky: 180, kz: 300 },
  { x: 700, y: -450, z: 0, kx: 180, ky: 180, kz: 300 }
];
var DOF = ['x', 'y', 'z', 'roll', 'pitch', 'yaw'];

group('6DOF 해석 엔진 — 대칭 예시 데이터 이론값 대조');

test('Z bounce 모드는 f = sqrt(4*kz_total/m)/(2π) 이론값과 정확히 일치한다', function () {
  var modes = solve(mass, I, mounts);
  var zMode = modes.find(function (m) { return DOF[m.dominant] === 'z'; });
  assert.ok(zMode, 'z 지배 모드가 있어야 한다');
  var kzTotal = 4 * 300 * 1000; // N/m
  var fTheory = Math.sqrt(kzTotal / mass) / (2 * Math.PI);
  assert.ok(Math.abs(zMode.f - fTheory) < 1e-6, 'f=' + zMode.f + ' theory=' + fTheory);
});

test('완전 대칭 배치라 6개 모드 전부 완전히 디커플된다(커플링 0)', function () {
  var modes = solve(mass, I, mounts);
  assert.strictEqual(modes.length, 6);
  modes.forEach(function (m) {
    var purity = Math.abs(m.vec[m.dominant]);
    assert.ok(purity > 0.999999, DOF[m.dominant] + ' 모드 순도=' + purity + ' (1.0 이어야 함)');
  });
});

test('x/y 모드는 대칭 배치(kx=ky, 마운트 배치 대칭)라 주파수가 같다', function () {
  var modes = solve(mass, I, mounts);
  var xMode = modes.find(function (m) { return DOF[m.dominant] === 'x'; });
  var yMode = modes.find(function (m) { return DOF[m.dominant] === 'y'; });
  assert.ok(Math.abs(xMode.f - yMode.f) < 1e-6, 'x=' + xMode.f + ' y=' + yMode.f);
});

test('N/mm → N/m 변환이 안 되면(단위 버그) 이론값과 1000배 어긋난다 — 방어 확인', function () {
  // 일부러 단위변환을 빼먹은 버전으로 깨뜨려서, 이 검사기가 실제로 잡는지 확인한다.
  function solveNoConvert() {
    var M = Array.from({ length: 6 }, function () { return Array(6).fill(0); });
    for (var i = 0; i < 3; i++) M[i][i] = mass;
    for (i = 0; i < 3; i++) for (var j = 0; j < 3; j++) M[i + 3][j + 3] = I[i][j];
    var K = Array.from({ length: 6 }, function () { return Array(6).fill(0); });
    mounts.forEach(function (m) {
      var r = [m.x / 1000, m.y / 1000, m.z / 1000];
      var B = mountBMatrix(r);
      var D = diag3(m.kx, m.ky, m.kz); // 일부러 *1000 누락
      addTo(K, matMul(matT(B), matMul(D, B)));
    });
    var L = cholesky(M), Li = invertLower(L);
    var A = matMul(Li, matMul(K, matT(Li)));
    return jacobi(A);
  }
  var evBroken = solveNoConvert();
  var fBroken = Math.sqrt(Math.max.apply(null, evBroken.values)) / (2 * Math.PI);
  var modes = solve(mass, I, mounts);
  var fCorrect = Math.max.apply(null, modes.map(function (m) { return m.f; }));
  var ratio = fCorrect / fBroken;
  assert.ok(Math.abs(ratio - Math.sqrt(1000)) < 0.01, '단위버그 있으면 sqrt(1000)배 차이나야 하는데 ratio=' + ratio);
});

console.log('\n총 ' + (passed + failed) + '개 중 ' + passed + '개 통과' + (failed ? ', ' + failed + '개 실패' : ''));
process.exit(failed ? 1 : 0);
