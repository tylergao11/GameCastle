var fs = require('fs');
var http = require('http');
var path = require('path');

var rootDir = path.resolve(__dirname, '..');
var outputDir = path.join(rootDir, 'output');
var port = parseInt(process.env.PORT || '4182', 10);
var host = process.env.HOST || '127.0.0.1';

var contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

var server = http.createServer(function(req, res) {
  var cleanUrl = decodeURIComponent(String(req.url || '/').split('?')[0]);
  if (cleanUrl === '/') cleanUrl = '/game.html';
  var filePath = path.resolve(outputDir, '.' + cleanUrl);
  if (!filePath.startsWith(outputDir + path.sep) && filePath !== outputDir) {
    send(res, 403, 'Forbidden');
    return;
  }
  fs.readFile(filePath, function(err, data) {
    if (err) {
      send(res, 404, 'Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(port, host, function() {
  console.log('GameCastle output: http://' + host + ':' + port + '/game.html');
});
