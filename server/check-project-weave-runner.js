var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var projectWeave = require('../ai/project-weave-runtime');
var runnerModule = require('./local-runtime/project-weave-runner');

async function main() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-project-weave-runner-'));
  try {
    var fixture = fs.readFileSync(path.join(__dirname, '..', 'ai', 'fixtures', 'intent-mobile-platformer.dsl'), 'utf8');
    var runner = runnerModule.createProjectWeaveRunner({
      workspaceRoot: path.join(root, '.gamecastle'),
      outputDir: path.join(root, 'output'),
      services: {
        semanticPort: {
          compile: function(request, previousWorld) {
            return projectWeave.defaultSemanticPort(Object.assign({}, request, { intentDslText: fixture }), previousWorld);
          }
        }
      }
    });
    var stages = [];
    var result = await runner.start({
      runId: 'project-weave-runner-check', projectId: 'runner-check', projectName: 'Runner Check',
      intent: 'make a compact platformer', mode: 'create',
      onLine: function() {}, onStage: function(stage) { stages.push(stage.id); }
    }).promise;
    assert.strictEqual(result.noChange, false);
    ['game.html', 'project.json', 'project-world.json', 'asset-world.json', 'execution-ledger.json', 'html-export-manifest.json'].forEach(function(name) {
      assert(fs.existsSync(path.join(root, 'output', name)), 'ProjectWeaveRunner must materialize ' + name);
    });
    assert(stages.indexOf('understanding') >= 0 && stages.indexOf('packaging') >= 0 && stages.indexOf('playtesting') >= 0, 'runner must report ProjectWeave lifecycle stages');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('[ProjectWeaveRunner] canonical ProjectWeave output materializes the Local Runtime release workspace');
}

main().catch(function(error) { console.error(error.stack || error); process.exit(1); });
