var childProcess = require('child_process');
var crypto = require('crypto');
var fs = require('fs');
var http = require('http');
var net = require('net');
var os = require('os');
var path = require('path');
var WebSocket = require('ws');
var assetWorldApi = require('./asset-world');
var projectExporter = require('./gdjs-html-project-exporter');
var png = require('./local-derivation-port');
var spatialEngine = require('../runtime/spatial');

var OPTION_FIELDS = ['browserExecutable', 'runtimeDir', 'timeoutMs', 'settleMs'];
var INPUT_FIELDS = ['assetProduct', 'spatialProduct', 'outputDir'];

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'GDJSHeadlessBrowserCapturePort'; throw error; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('GDJS_BROWSER_CAPTURE_INPUT_INVALID', label + ' must be non-empty text.'); return value.trim(); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function productHash(value, prefix) { var core = clone(value); delete core.contentHash; return prefix + crypto.createHash('sha256').update(JSON.stringify(stable(core))).digest('hex').slice(0, 24); }
function delay(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }
function allowed(value, fields, label) { Object.keys(value || {}).forEach(function(field) { if (fields.indexOf(field) < 0) fail('GDJS_BROWSER_CAPTURE_INPUT_INVALID', label + ' contains unknown field: ' + field); }); }

function resolveBrowser(value) {
  var candidates = [
    value,
    process.env.GAMECASTLE_BROWSER_EXECUTABLE,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean).map(function(candidate) { return path.resolve(candidate); });
  for (var index = 0; index < candidates.length; index++) if (fs.existsSync(candidates[index])) return candidates[index];
  fail('GDJS_BROWSER_CAPTURE_BROWSER_MISSING', 'No supported Chrome or Edge executable is available. Configure GAMECASTLE_BROWSER_EXECUTABLE.');
}

function reservePort() {
  return new Promise(function(resolve, reject) {
    var server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', function() {
      var port = server.address().port;
      server.close(function(error) { if (error) reject(error); else resolve(port); });
    });
  });
}

function requestJson(port, requestPath) {
  return new Promise(function(resolve, reject) {
    var request = http.request({ hostname: '127.0.0.1', port: port, path: requestPath, method: 'GET' }, function(response) {
      var chunks = [];
      response.on('data', function(chunk) { chunks.push(chunk); });
      response.on('end', function() {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error('DevTools HTTP status ' + response.statusCode));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { reject(error); }
      });
    });
    request.once('error', reject);
    request.end();
  });
}

async function waitForPage(port, browserProcess, timeoutMs) {
  var deadline = Date.now() + timeoutMs, lastError = null;
  while (Date.now() < deadline) {
    if (browserProcess.exitCode !== null) fail('GDJS_BROWSER_CAPTURE_BROWSER_EXITED', 'Headless browser exited before DevTools became ready.');
    try {
      var pages = await requestJson(port, '/json/list');
      var page = pages.filter(function(item) { return item.type === 'page' && item.webSocketDebuggerUrl; })[0];
      if (page) return page;
    } catch (error) { lastError = error; }
    await delay(100);
  }
  fail('GDJS_BROWSER_CAPTURE_TIMEOUT', 'Headless browser DevTools did not become ready: ' + String(lastError && lastError.message || 'timeout'));
}

function CdpClient(url, timeoutMs) {
  this.url = url;
  this.timeoutMs = timeoutMs;
  this.socket = null;
  this.nextId = 1;
  this.pending = Object.create(null);
  this.listeners = Object.create(null);
}
CdpClient.prototype.connect = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    var socket = self.socket = new WebSocket(self.url);
    socket.once('open', resolve);
    socket.once('error', reject);
    socket.on('message', function(bytes) {
      var message;
      try { message = JSON.parse(String(bytes)); } catch (error) { return; }
      if (message.id && self.pending[message.id]) {
        var pending = self.pending[message.id]; delete self.pending[message.id]; clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error))); else pending.resolve(message.result || {});
        return;
      }
      (self.listeners[message.method] || []).slice().forEach(function(listener) { listener(message.params || {}); });
    });
  });
};
CdpClient.prototype.on = function(method, listener) { if (!this.listeners[method]) this.listeners[method] = []; this.listeners[method].push(listener); };
CdpClient.prototype.once = function(method, timeoutMs) {
  var self = this;
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() { cleanup(); reject(new Error('Timed out waiting for ' + method)); }, timeoutMs || self.timeoutMs);
    function listener(params) { cleanup(); resolve(params); }
    function cleanup() { clearTimeout(timer); var list = self.listeners[method] || [], index = list.indexOf(listener); if (index >= 0) list.splice(index, 1); }
    self.on(method, listener);
  });
};
CdpClient.prototype.send = function(method, params) {
  var self = this, id = this.nextId++;
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() { delete self.pending[id]; reject(new Error('CDP command timed out: ' + method)); }, self.timeoutMs);
    self.pending[id] = { resolve: resolve, reject: reject, timer: timer };
    self.socket.send(JSON.stringify({ id: id, method: method, params: params || {} }), function(error) {
      if (!error) return;
      clearTimeout(timer); delete self.pending[id]; reject(error);
    });
  });
};
CdpClient.prototype.close = function() { if (this.socket) this.socket.close(); };

function mime(file) {
  var extension = path.extname(file).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' })[extension] || 'application/octet-stream';
}
function startServer(root, token, runtimeBuildHash) {
  return new Promise(function(resolve, reject) {
    var server = http.createServer(function(request, response) {
      var parsed;
      try { parsed = new URL(request.url, 'http://127.0.0.1'); } catch (error) { response.writeHead(400); response.end(); return; }
      var authorized = parsed.searchParams.get('capture') === token;
      if (!authorized && request.headers.referer) {
        try { authorized = new URL(request.headers.referer).searchParams.get('capture') === token; } catch (error) { authorized = false; }
      }
      if (!authorized) { response.writeHead(404); response.end(); return; }
      var relative;
      try { relative = decodeURIComponent(parsed.pathname).replace(/^\/+/, '') || 'index.html'; } catch (error) { response.writeHead(400); response.end(); return; }
      var target = path.resolve(root, relative);
      if (target !== root && target.indexOf(root + path.sep) !== 0) { response.writeHead(403); response.end(); return; }
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', mime(target));
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-GameCastle-Runtime-Build-Hash', runtimeBuildHash);
      response.writeHead(200);
      fs.createReadStream(target).pipe(response);
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', function() { resolve(server); });
  });
}
function closeServer(server) { return new Promise(function(resolve) { if (!server) return resolve(); server.close(function() { resolve(); }); }); }

function errorText(params) {
  if (params.exceptionDetails) return params.exceptionDetails.exception && params.exceptionDetails.exception.description || params.exceptionDetails.text || 'Runtime exception';
  if (params.entry) return params.entry.text || 'Browser log error';
  if (params.args) return params.args.map(function(arg) { return arg.value !== undefined ? String(arg.value) : arg.description || arg.type; }).join(' ');
  return 'Browser runtime error';
}
function header(headers, name) {
  var wanted = name.toLowerCase(), found = null;
  Object.keys(headers || {}).forEach(function(key) { if (key.toLowerCase() === wanted) found = String(headers[key]); });
  return found;
}

async function captureWithBrowser(input, options, build, marker, viewport, outputRoot) {
  var browserExecutable = resolveBrowser(options.browserExecutable), timeoutMs = options.timeoutMs || 20000, settleMs = options.settleMs === undefined ? 500 : options.settleMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || !Number.isInteger(settleMs) || settleMs < 0) fail('GDJS_BROWSER_CAPTURE_INPUT_INVALID', 'Browser timeoutMs and settleMs are invalid.');
  var token = crypto.randomBytes(24).toString('hex'), server = await startServer(build.outputDir, token, build.runtimeBuildHash);
  var pageUrl = 'http://127.0.0.1:' + server.address().port + '/index.html?capture=' + token;
  var debugPort = await reservePort(), profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-headless-'));
  var browser = childProcess.spawn(browserExecutable, [
    '--headless=new', '--remote-debugging-port=' + debugPort, '--remote-allow-origins=*', '--user-data-dir=' + profileDir,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync',
    '--mute-audio', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  var browserStderr = '';
  browser.stderr.on('data', function(chunk) { if (browserStderr.length < 65536) browserStderr += String(chunk); });
  var cdp = null;
  try {
    var page = await waitForPage(debugPort, browser, timeoutMs);
    cdp = new CdpClient(page.webSocketDebuggerUrl, timeoutMs);
    await cdp.connect();
    var runtimeErrors = [], networkErrors = [], mainResponseHash = null, mainResponseSeen = false;
    cdp.on('Runtime.exceptionThrown', function(params) { runtimeErrors.push(errorText(params)); });
    cdp.on('Runtime.consoleAPICalled', function(params) { if (params.type === 'error' || params.type === 'assert') runtimeErrors.push(errorText(params)); });
    cdp.on('Log.entryAdded', function(params) { if (params.entry && params.entry.level === 'error') runtimeErrors.push(errorText(params)); });
    cdp.on('Network.loadingFailed', function(params) { if (!params.canceled) networkErrors.push(params.errorText || 'Network loading failed'); });
    cdp.on('Network.responseReceived', function(params) {
      var response = params.response || {};
      if (response.url === pageUrl && params.type === 'Document') { mainResponseSeen = true; mainResponseHash = header(response.headers, 'x-gamecastle-runtime-build-hash'); }
      if (response.url && response.url.indexOf('http://127.0.0.1:' + server.address().port + '/') === 0 && response.status >= 400) networkErrors.push('HTTP ' + response.status + ' ' + response.url);
    });
    await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Log.enable'), cdp.send('Network.enable')]);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
    var loaded = cdp.once('Page.loadEventFired', timeoutMs);
    await cdp.send('Page.navigate', { url: pageUrl });
    await loaded;
    var deadline = Date.now() + timeoutMs, ready = false;
    while (Date.now() < deadline) {
      var evaluated = await cdp.send('Runtime.evaluate', { expression: '(function(){var expected=' + JSON.stringify(marker) + ';return !!(window.GameCastleAssetsLoaded&&window.GameCastleRuntimeGame&&window.GameCastleRuntimeGame.wasFirstSceneLoaded&&window.GameCastleRuntimeGame.wasFirstSceneLoaded()&&JSON.stringify(window.GameCastleAcceptedProjection)===JSON.stringify(expected));})()', returnByValue: true });
      if (evaluated.result && evaluated.result.value === true) { ready = true; break; }
      await delay(100);
    }
    if (!ready) fail('GDJS_BROWSER_CAPTURE_RUNTIME_NOT_READY', 'Final GDJS build never reached its source-bound accepted-projection ready state.');
    if (!mainResponseSeen || mainResponseHash !== build.runtimeBuildHash) fail('GDJS_BROWSER_CAPTURE_BUILD_MISMATCH', 'Browser did not observe the exact runtime build hash on the main document response.');
    if (settleMs) await delay(settleMs);
    var version = await cdp.send('Browser.getVersion');
    var screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    var bytes = Buffer.from(screenshot.data || '', 'base64');
    if (!bytes.length) fail('GDJS_BROWSER_CAPTURE_IMAGE_MISSING', 'Chrome DevTools returned an empty screenshot.');
    var decoded;
    try { decoded = png.decodePng(bytes); } catch (error) { fail('GDJS_BROWSER_CAPTURE_IMAGE_INVALID', 'Chrome DevTools screenshot is not a valid PNG: ' + error.message); }
    if (decoded.width !== viewport.width || decoded.height !== viewport.height) fail('GDJS_BROWSER_CAPTURE_VIEWPORT_MISMATCH', 'Screenshot dimensions do not equal the fixed browser viewport.');
    runtimeErrors = Array.from(new Set(runtimeErrors.filter(Boolean)));
    networkErrors = Array.from(new Set(networkErrors.filter(Boolean)));
    if (runtimeErrors.length || networkErrors.length) {
      var evidenceError = new Error('Final GDJS build emitted browser runtime or network errors.');
      evidenceError.code = 'GDJS_BROWSER_CAPTURE_RUNTIME_ERROR'; evidenceError.owner = 'GDJSHeadlessBrowserCapturePort'; evidenceError.consoleErrors = runtimeErrors.concat(networkErrors); throw evidenceError;
    }
    var screenshotPath = path.resolve(outputRoot, 'gdjs-browser-' + marker.finalProjectionHash.replace(/[^A-Za-z0-9]/g, '').slice(-24) + '.png');
    if (path.dirname(screenshotPath) !== outputRoot) fail('GDJS_BROWSER_CAPTURE_PATH_INVALID', 'Screenshot escaped its output root.');
    fs.writeFileSync(screenshotPath, bytes);
    return {
      runtimeBuildHash: build.runtimeBuildHash,
      buildManifestHash: build.buildManifestHash,
      buildDir: build.outputDir,
      browserFingerprint: text(version.product, 'browserFingerprint') + ' / ' + text(version.jsVersion, 'browser JavaScript version'),
      pageUrl: pageUrl,
      imagePath: screenshotPath,
      viewport: { width: viewport.width, height: viewport.height },
      consoleErrors: []
    };
  } catch (error) {
    if (!error.code) { error.code = 'GDJS_BROWSER_CAPTURE_FAILED'; error.owner = 'GDJSHeadlessBrowserCapturePort'; error.message = error.message + (browserStderr ? '\n' + browserStderr.slice(-2000) : ''); }
    throw error;
  } finally {
    if (cdp) cdp.close();
    if (browser.exitCode === null) browser.kill();
    await closeServer(server);
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (error) {}
  }
}

function create(options) {
  options = options || {};
  allowed(options, OPTION_FIELDS, 'GDJS browser capture options');
  async function captureAcceptedProjection(input) {
    input = input || {};
    allowed(input, INPUT_FIELDS, 'GDJS browser capture input');
    var assetProduct = input.assetProduct, spatialProduct = input.spatialProduct;
    if (!assetProduct || assetProduct.schemaVersion !== 2 || assetProduct.documentKind !== 'semantic-asset-product' || !assetProduct.artifact || !assetProduct.assetState || !assetProduct.assetState.assetWorld || assetProduct.contentHash !== productHash(assetProduct, 'semantic-asset-product.')) fail('GDJS_BROWSER_CAPTURE_PRODUCT_INVALID', 'Browser capture requires one hash-bound accepted semantic asset product.');
    if (!spatialProduct || spatialProduct.schemaVersion !== 3 || spatialProduct.documentKind !== 'semantic-spatial-product' || !spatialProduct.spatialInput || !spatialProduct.resolution || !spatialProduct.acceptedProjection || spatialProduct.contentHash !== productHash(spatialProduct, 'semantic-spatial-product.')) fail('GDJS_BROWSER_CAPTURE_PRODUCT_INVALID', 'Browser capture requires one hash-bound accepted semantic spatial product.');
    var world = assetWorldApi.validateAcceptedAssetWorld(assetProduct.assetState.assetWorld, { sourceHash: assetProduct.sourceHash });
    var spatialInput = spatialEngine.validateAssemblyInput(spatialProduct.spatialInput);
    var resolution = spatialEngine.validateSpatialResolution(spatialInput, spatialProduct.resolution).resolution;
    var projection = spatialEngine.validateProjection(spatialInput, assetProduct.artifact, spatialProduct.acceptedProjection);
    if (projection.basis.documentKind !== 'spatial-layout-resolution' || projection.basis.contentHash !== resolution.contentHash) fail('GDJS_BROWSER_CAPTURE_PROJECTION_INVALID', 'Browser capture accepts only the exact final resolution projection.');
    if (assetProduct.sourceHash !== spatialProduct.sourceHash || spatialProduct.assetProductHash !== assetProduct.contentHash || spatialInput.sourceHash !== assetProduct.sourceHash || world.contentHash !== spatialInput.assetWorldHash || projection.assetWorldHash !== world.contentHash) fail('GDJS_BROWSER_CAPTURE_PRODUCT_MISMATCH', 'Browser capture products do not share one Source, AssetProduct, and accepted AssetWorld.');
    var outputRoot = path.resolve(text(input.outputDir, 'outputDir'));
    fs.mkdirSync(outputRoot, { recursive: true });
    var marker = { sourceHash: assetProduct.sourceHash, assetWorldHash: world.contentHash, spatialResolutionHash: resolution.contentHash, finalProjectionHash: projection.contentHash };
    var build = projectExporter.exportAcceptedProject({ project: projection.project, projectionHash: projection.contentHash, marker: marker, outputDir: outputRoot, runtimeDir: options.runtimeDir });
    return captureWithBrowser(input, options, build, marker, { width: spatialInput.sceneCanvas.width, height: spatialInput.sceneCanvas.height }, outputRoot);
  }
  return { captureAcceptedProjection: captureAcceptedProjection };
}

module.exports = { create: create, resolveBrowser: resolveBrowser };
