var fs = require('fs');
var path = require('path');
var extensionLoader = require('./gdevelop-extension-loader');

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

function makeCompilerProjectData(projectData) {
  var compilerData = JSON.parse(JSON.stringify(projectData));
  var detached = {
    globalObjects: compilerData.objects || [],
    layoutObjects: (compilerData.layouts || []).map(function(layout) { return layout.objects || []; }),
  };
  compilerData.objects = [];
  var assetResources = compilerData.__assetResources || [];
  delete compilerData.__assetResources;
  compilerData.properties = compilerData.properties || {};
  compilerData.properties.currentPlatform = 'GDevelop JS platform';
  compilerData.properties.platforms = [{ name: 'GDevelop JS platform' }];
  (compilerData.layouts || []).forEach(function(layout) {
    layout.objects = [];
    layout.instances = [];
    layout.behaviorsSharedData = [];
  });
  return { projectData: compilerData, detached: detached, assetResources: assetResources };
}

function restoreObjectDeclarations(gd, project, container, objectDeclarations) {
  (objectDeclarations || []).forEach(function(declaration, index) {
    if (!declaration || !declaration.name || !declaration.type) {
      throw new Error('Object declaration requires name and type at index ' + index + ': ' + JSON.stringify(declaration));
    }
    var object = container.insertNewObject(project, declaration.type, declaration.name, container.getObjectsCount());
    if (!object || !container.hasObjectNamed(declaration.name)) {
      throw new Error('GDevelop could not declare object ' + declaration.name + ' (' + declaration.type + ').');
    }
    if (declaration.__serializedObject === true) {
      var serializedObject = gd.Serializer.fromJSObject(declaration.data);
      object.unserializeFrom(serializedObject);
      serializedObject.delete();
      return;
    }
    if (Array.isArray(declaration.variables) && declaration.variables.length) {
      object.getVariables().unserializeFrom(gd.Serializer.fromJSObject(declaration.variables));
    }
    (declaration.behaviors || []).forEach(function(behavior) {
      if (!behavior || !behavior.type || !behavior.name) throw new Error('Behavior declaration requires type and name on ' + declaration.name + '.');
      object.addNewBehavior(project, behavior.type, behavior.name);
    });
    if (declaration.assetBinding) {
      var binding = declaration.assetBinding;
      if (!binding.adapterId || !binding.resourceName || !binding.resourceKind || !Array.isArray(binding.operations)) throw new Error('Official object asset binding is incomplete for ' + declaration.name + '.');
      binding.operations.forEach(function(operation) {
        if (!operation || !operation.kind) throw new Error('Official object asset binding operation is invalid for ' + declaration.name + '.');
        if (operation.kind === 'update-property') {
          if (!object.getConfiguration().updateProperty(operation.property, binding.resourceName)) throw new Error('Official configuration property is unavailable: ' + operation.property + ' on ' + declaration.name + '.');
          return;
        }
        if (operation.kind === 'sprite-first-frame') {
          var configuration = gd.asSpriteConfiguration(object.getConfiguration());
          var animations = configuration.getAnimations();
          animations.removeAllAnimations();
          animations.addAnimation('');
          var animation = animations.getAnimation(0);
          animation.setDirectionsCount(1);
          var direction = animation.getDirection(0);
          direction.addSprite('');
          direction.getSprite(0).setImageName(binding.resourceName);
          return;
        }
        throw new Error('Unknown official object asset binding operation: ' + operation.kind);
      });
    }
  });
}

function restoreAssetResources(gd, project, resources) {
  (resources || []).forEach(function(resource, index) {
    if (!resource || !resource.name || !resource.file || !resource.kind) throw new Error('Asset resource requires name, kind, and file at index ' + index + '.');
    var official = new gd.Resource();
    official.setName(resource.name);
    official.setKind(resource.kind);
    official.setFile(resource.file);
    project.getResourcesManager().addResource(official);
    official.delete();
  });
}

function validateInstructionTypes(gd, projectData, project) {
  var platform = project.getCurrentPlatform();
  var unknown = [];
  function inspect(events, sceneName) {
    (events || []).forEach(function(event) {
      (event.conditions || []).forEach(function(condition) {
        var type = condition && condition.type && condition.type.value;
        var metadata = gd.MetadataProvider.getConditionMetadata(platform, type || '');
        if (!type || gd.MetadataProvider.isBadInstructionMetadata(metadata)) unknown.push({ sceneName: sceneName, kind: 'condition', type: type || null });
      });
      (event.actions || []).forEach(function(action) {
        var type = action && action.type && action.type.value;
        var metadata = gd.MetadataProvider.getActionMetadata(platform, type || '');
        if (!type || gd.MetadataProvider.isBadInstructionMetadata(metadata)) unknown.push({ sceneName: sceneName, kind: 'action', type: type || null });
      });
      inspect(event.events, sceneName);
    });
  }
  (projectData.layouts || []).forEach(function(layout) { inspect(layout.events, layout.name); });
  (projectData.externalEvents || []).forEach(function(externalEvents) { inspect(externalEvents.events, externalEvents.name); });
  if (unknown.length) throw new Error('Unknown GDevelop instruction types:\n' + JSON.stringify(unknown, null, 2));
}

async function main() {
  var libGdPath = path.resolve(process.argv[2] || '');
  if (!fs.existsSync(libGdPath)) throw new Error('Missing libGD.js: ' + libGdPath);
  var wasmPath = path.join(path.dirname(libGdPath), 'libGD.wasm');
  if (!fs.existsSync(wasmPath)) throw new Error('Missing libGD.wasm: ' + wasmPath);

  var projectData = readProject();
  var compilerInput = makeCompilerProjectData(projectData);
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

  var project = gd.ProjectHelper.createNewGDJSProject();
  var serializedProject = gd.Serializer.fromJSObject(compilerInput.projectData);
  project.unserializeFrom(serializedProject);
  restoreObjectDeclarations(gd, project, project.getObjects(), compilerInput.detached.globalObjects);
  compilerInput.detached.layoutObjects.forEach(function(objects, index) {
    restoreObjectDeclarations(gd, project, project.getLayoutAt(index).getObjects(), objects);
  });
  restoreAssetResources(gd, project, compilerInput.assetResources);
  validateInstructionTypes(gd, projectData, project);

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
