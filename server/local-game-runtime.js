var runtimeModule = require('./local-runtime');

var host = process.env.GAMECASTLE_RUNTIME_HOST || '127.0.0.1';
var port = parseInt(process.env.GAMECASTLE_RUNTIME_PORT || '4183', 10);
var runtime = runtimeModule.createRuntime({
  playBaseUrl: process.env.GAMECASTLE_PLAY_ORIGIN || ('http://localhost:' + port),
});

runtime.server.listen(port, host, function() {
  console.log('[LocalGameRuntime] http://' + host + ':' + port + ' project=active-local-project');
});

function shutdown() {
  runtime.coordinator.close();
  runtime.server.close(function() { process.exit(0); });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
