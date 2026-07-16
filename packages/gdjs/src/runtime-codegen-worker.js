var fs = require('fs');
var path = require('path');
var extensionLoader = require('./gdevelop-extension-loader');
var projectLoader = require('./libgd-project-loader');

function readProject() {
  var source = fs.readFileSync(0, 'utf8');
  if (!source.trim()) throw new Error('No project JSON was provided on stdin.');
  return JSON.parse(source);
}

function diagnosticToObject(diagnostic, sceneName) {
  return {
    sceneName: sceneName,
    type: diagnostic.getType(),
    message: diagnostic.getMessage(),
    actualValue: diagnostic.getActualValue(),
    expectedValue: diagnostic.getExpectedValue(),
    objectName: diagnostic.getObjectName(),
  };
}

async function main() {
  var libGdPath = path.resolve(process.argv[2] || '');
  if (!fs.existsSync(libGdPath)) throw new Error('Missing libGD.js: ' + libGdPath);
  var wasmPath = path.join(path.dirname(libGdPath), 'libGD.wasm');
  if (!fs.existsSync(wasmPath)) throw new Error('Missing libGD.wasm: ' + wasmPath);

  var projectData = readProject();
  var originalLog = console.log;
  console.log = function() {};
  var gd;
  try {
    gd = await require(libGdPath)({
      locateFile: function(fileName) {
        return fileName === 'libGD.wasm' ? wasmPath : path.join(path.dirname(libGdPath), fileName);
      },
    });
  } finally {
    console.log = originalLog;
  }
  extensionLoader.loadOfficialExtensions(gd, path.join(path.dirname(libGdPath), 'extensions'));

  var project = projectLoader.loadProject(gd, projectData);

  var files = [];
  var allDiagnostics = [];
  for (var index = 0; index < project.getLayoutsCount(); index++) {
    var layout = project.getLayoutAt(index);
    var includes = new gd.SetString();
    var diagnosticReport = new gd.DiagnosticReport();
    var generator = new gd.LayoutCodeGenerator(project);
    var code = generator.generateLayoutCompleteCode(layout, includes, diagnosticReport, true);
    var sceneDiagnostics = [];
    for (var diagnosticIndex = 0; diagnosticIndex < diagnosticReport.count(); diagnosticIndex++) {
      sceneDiagnostics.push(diagnosticToObject(diagnosticReport.get(diagnosticIndex), layout.getName()));
    }
    allDiagnostics = allDiagnostics.concat(sceneDiagnostics);
    files.push({
      fileName: 'code' + index + '.js',
      sceneName: layout.getName(),
      code: code,
      includes: (function() {
        var vector = includes.toNewVectorString();
        var values = [];
        for (var includeIndex = 0; includeIndex < vector.size(); includeIndex++) values.push(vector.at(includeIndex));
        vector.delete();
        return values;
      })(),
    });
    generator.delete();
    diagnosticReport.delete();
    includes.delete();
  }

  project.delete();
  if (allDiagnostics.length) {
    throw new Error('GDevelop diagnostics:\n' + JSON.stringify(allDiagnostics, null, 2));
  }
  if (files.length !== projectData.layouts.length) {
    throw new Error('GDevelop loaded ' + files.length + ' layouts, expected ' + projectData.layouts.length + '.');
  }
  process.stdout.write(JSON.stringify({ files: files }));
}

main().catch(function(error) {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
  process.exitCode = 1;
});
