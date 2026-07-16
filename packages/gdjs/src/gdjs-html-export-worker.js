var fs = require('fs');
var os = require('os');
var path = require('path');
var extensionLoader = require('./gdevelop-extension-loader');
var projectLoader = require('./libgd-project-loader');

function readProject() {
  var source = fs.readFileSync(0, 'utf8');
  if (!source.trim()) throw new Error('No accepted GDJS project was provided on stdin.');
  return JSON.parse(source);
}

function createFileSystem(gd, virtualRoot, runtimeDir) {
  var virtualRuntime = path.resolve(virtualRoot, 'Runtime');
  function sourcePath(value) {
    var resolved = path.resolve(value);
    if (resolved === virtualRuntime || resolved.indexOf(virtualRuntime + path.sep) === 0) return path.resolve(runtimeDir, path.relative(virtualRuntime, resolved));
    return value;
  }
  var fileSystem = new gd.AbstractFileSystemJS();
  fileSystem.mkDir = function(directory) { fs.mkdirSync(sourcePath(directory), { recursive: true }); return true; };
  fileSystem.dirExists = function(directory) { try { return fs.statSync(sourcePath(directory)).isDirectory(); } catch (error) { return false; } };
  fileSystem.fileExists = function(file) { try { return fs.statSync(sourcePath(file)).isFile(); } catch (error) { return false; } };
  fileSystem.fileNameFrom = function(file) { return path.basename(file); };
  fileSystem.dirNameFrom = function(file) { return path.dirname(file).replace(/\\/g, '/'); };
  fileSystem.makeAbsolute = function(file, baseDirectory) { return path.resolve(baseDirectory, file).replace(/\\/g, '/'); };
  fileSystem.makeRelative = function(file, baseDirectory) { return path.relative(baseDirectory, file).replace(/\\/g, '/'); };
  fileSystem.isAbsolute = function(file) { return path.isAbsolute(file); };
  fileSystem.copyFile = function(source, destination) {
    try {
      source = sourcePath(source);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      if (path.resolve(source) !== path.resolve(destination)) fs.copyFileSync(source, destination);
      return true;
    } catch (error) {
      process.stderr.write('[GDJSHTMLExport] copyFile failed: ' + source + ' -> ' + destination + ': ' + error.message + '\n');
      return false;
    }
  };
  fileSystem.clearDir = function(directory) {
    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.readdirSync(directory).forEach(function(name) { fs.rmSync(path.join(directory, name), { recursive: true, force: true }); });
      return true;
    } catch (error) {
      process.stderr.write('[GDJSHTMLExport] clearDir failed: ' + directory + ': ' + error.message + '\n');
      return false;
    }
  };
  fileSystem.writeToFile = function(file, contents) {
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, contents, 'utf8'); return true; }
    catch (error) { process.stderr.write('[GDJSHTMLExport] writeToFile failed: ' + file + ': ' + error.message + '\n'); return false; }
  };
  fileSystem.readFile = function(file) { try { return fs.readFileSync(sourcePath(file), 'utf8'); } catch (error) { return ''; } };
  fileSystem.getTempDir = function() { var directory = path.join(os.tmpdir(), 'gamecastle-gdjs-export'); fs.mkdirSync(directory, { recursive: true }); return directory.replace(/\\/g, '/'); };
  fileSystem.readDir = function(directory, extension) {
    var output = new gd.VectorString(), suffix = String(extension || '').toUpperCase();
    try {
      var actualDirectory = sourcePath(directory);
      if (fs.existsSync(actualDirectory)) fs.readdirSync(actualDirectory).forEach(function(name) {
        if (!suffix || name.toUpperCase().slice(-suffix.length) === suffix) output.push_back(path.join(directory, name).replace(/\\/g, '/'));
      });
    } catch (error) {}
    return output;
  };
  return fileSystem;
}

async function main() {
  var libGdPath = path.resolve(process.argv[2] || '');
  var runtimeDir = path.resolve(process.argv[3] || '');
  var outputDir = path.resolve(process.argv[4] || '');
  if (!fs.existsSync(libGdPath)) throw new Error('Missing libGD.js: ' + libGdPath);
  if (!fs.existsSync(path.join(path.dirname(libGdPath), 'libGD.wasm'))) throw new Error('Missing libGD.wasm beside ' + libGdPath);
  if (!fs.existsSync(runtimeDir)) throw new Error('Missing official GDJS runtime: ' + runtimeDir);
  if (!outputDir) throw new Error('Missing GDJS HTML export output directory.');
  var projectData = readProject();
  var originalLog = console.log;
  console.log = function() {};
  var gd;
  try {
    gd = await require(libGdPath)({ locateFile: function(fileName) { return fileName === 'libGD.wasm' ? path.join(path.dirname(libGdPath), 'libGD.wasm') : path.join(path.dirname(libGdPath), fileName); } });
  } finally {
    console.log = originalLog;
  }
  extensionLoader.loadOfficialExtensions(gd, path.join(path.dirname(libGdPath), 'extensions'));
  var project = projectLoader.loadProject(gd, projectData);
  var virtualRoot = path.join(os.tmpdir(), 'gamecastle-gdjs-export-root');
  var fileSystem = createFileSystem(gd, virtualRoot, runtimeDir);
  var exporter = new gd.Exporter(fileSystem, virtualRoot.replace(/\\/g, '/'));
  var exportOptions = new gd.ExportOptions(project, outputDir.replace(/\\/g, '/'));
  var succeeded;
  console.log = function() {};
  try { succeeded = exporter.exportWholePixiProject(exportOptions); }
  finally { console.log = originalLog; exportOptions.delete(); exporter.delete(); project.delete(); fileSystem.delete(); }
  if (!succeeded) throw new Error('Official libGD HTML exporter rejected the accepted projection.');
  process.stdout.write(JSON.stringify({ ok: true, outputDir: outputDir }));
}

main().catch(function(error) {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
  process.exitCode = 1;
});
