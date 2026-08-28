/* 화면 연기 테스트 — node test/smoke.browser.js (playwright 필요, 없으면 건너뜀)
 *
 * 원본 해석 로직은 페이지 로드 시 analyze()를 자동으로 한 번 돌린다(index.html
 * 맨 끝 `analyze();`). 그러니 "화면이 뜬다"만 확인해도 계산 경로 전체를 지나간다.
 * 여기서 추가로 보는 건 이번에 얹은 결과 저장/해설 카드가 실제로 나타나는지,
 * Supabase가 아직 설정 안 된 상태에서도 저장 버튼이 화면을 죽이지 않는지다.
 */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');

var chromium;
try { chromium = require('playwright').chromium; }
catch (e) {
  console.log('playwright가 없어 화면 연기 테스트를 건너뜁니다 (CI에서는 설치 후 돌립니다).');
  process.exit(0);
}

var ROOT = path.join(__dirname, '..');
var passed = 0, failed = 0;
function group(t) { console.log('\n' + t); }
function ok(c, label, detail) {
  if (c) passed++; else { failed++; console.log('  X ' + label); if (detail) console.log('      ' + detail); }
}

var MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml'
};

function serve(port) {
  return http.createServer(function (req, res) {
    var rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/index.html';
    var file = path.join(ROOT, rel);
    if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('nope'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(port);
}

(async function main() {
  var PORT = 8819;
  var server = serve(PORT);
  var browser = await chromium.launch();
  // 미처리 예외(pageerror)만 "진짜 오류"로 본다. console 'error' 타입에는
  // 실패한 네트워크 요청(fetch 404 등)에 대해 브라우저가 자동으로 남기는
  // "Failed to load resource" 로그도 섞여 들어오는데, 그건 우리 코드가
  // try/catch로 이미 정상 처리한 것이라도 브라우저가 항상 찍는다 — 그러니
  // 그것까지 "오류"로 세면 저장 기능을 아직 안 켠 서버(테이블 없음) 상태에서
  // 매번 거짓 실패가 난다. consoleNoise는 참고용으로만 남긴다.
  var errors = [];
  var consoleNoise = [];

  try {
    var page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    page.on('pageerror', function (e) { errors.push(String(e)); });
    page.on('console', function (m) {
      if (m.type() !== 'error') return;
      var text = m.text();
      if (/Failed to load resource/i.test(text)) { consoleNoise.push(text); return; }
      errors.push(text);
    });
    await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'networkidle' });

    group('1. 화면이 오류 없이 뜬다');
    ok(await page.isVisible('#mass'), '질량 입력칸이 보인다');

    group('2. 페이지 로드시 자동 해석이 돈다 (원본 로직 그대로)');
    var rows = await page.locator('#resultTable tbody tr').count();
    ok(rows === 6, '6개 모드 결과행이 나온다 (' + rows + '행)');

    group('3. 이번에 얹은 저장/해설 카드가 보인다');
    ok(await page.isVisible('#saveBtn'), '서버 저장 버튼이 보인다');
    ok(await page.isVisible('#hd19Interpretation'), '결과 해설 패널이 보인다');
    var interp = (await page.textContent('#hd19Interpretation')).trim();
    ok(interp.length > 0 && interp.indexOf('먼저') === -1, '자동 해석 후 해설이 채워진다', interp.slice(0, 80));

    group('4. Supabase 테이블 미설정 상태에서도 저장이 화면을 죽이지 않는다');
    await page.fill('#saveLabel', '스모크테스트');
    await page.click('#saveBtn');
    await page.waitForTimeout(2500);
    var saveStatus = (await page.textContent('#hd19SaveStatus')).trim();
    ok(saveStatus.length > 0, '저장 시도 후 상태 메시지가 뜬다(성공이든 "곧 활성화"든)', saveStatus);
    ok(errors.length === 0, '저장 시도로 자바스크립트가 죽지 않는다', errors.join(' | '));

    group('5. 좁은 화면에서 가로로 밀리지 않는다');
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(150);
    var over = await page.evaluate(function () {
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    ok(over <= 1, '가로 스크롤이 생기지 않는다 (넘침 ' + over + 'px)');

    group('6. 콘솔에 오류가 없다');
    ok(errors.length === 0, '자바스크립트 오류 없음', errors.join(' | '));

  } finally {
    await browser.close();
    server.close();
  }

  if (consoleNoise.length) {
    console.log('\n(참고, 실패 아님) 실패한 네트워크 요청 ' + consoleNoise.length + '건 — ' +
      '서버 테이블(hd19_analysis_results)이 아직 없으면 저장 시도 시 정상적으로 뜬다:');
    consoleNoise.slice(0, 3).forEach(function (n) { console.log('  · ' + n); });
  }
  console.log('\n' + (failed ? 'X' : 'O') + ' ' + passed + ' 통과 / ' + failed + ' 실패');
  process.exit(failed ? 1 : 0);
}());
