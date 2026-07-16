function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeCompilerProjectData(projectData) {
  var compilerData = clone(projectData);
  var detached = {
    globalObjects: compilerData.objects || [],
    layoutObjects: (compilerData.layouts || []).map(function(layout) { return layout.objects || []; })
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
    if (!declaration.assetBinding) return;
    var binding = declaration.assetBinding;
    if (!binding.adapterId || !binding.resourceKind || !Array.isArray(binding.operations) || (!binding.resourceName && !binding.frameSet)) {
      throw new Error('Official object asset binding is incomplete for ' + declaration.name + '.');
    }
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
      if (operation.kind === 'sprite-frame-set') {
        if (!binding.frameSet || !Array.isArray(binding.frameSet.states) || !binding.frameSet.states.length) throw new Error('FrameSet binding is incomplete for ' + declaration.name + '.');
        var frameSetConfiguration = gd.asSpriteConfiguration(object.getConfiguration());
        var frameSetAnimations = frameSetConfiguration.getAnimations();
        frameSetAnimations.removeAllAnimations();
        binding.frameSet.states.forEach(function(state, stateIndex) {
          if (!state || !state.stateId || !Array.isArray(state.frames) || !state.frames.length || !Number.isInteger(state.durationMs) || state.durationMs < 1 || typeof state.loop !== 'boolean') throw new Error('FrameSet state is invalid for ' + declaration.name + '.');
          frameSetAnimations.addAnimation(state.stateId);
          var frameSetAnimation = frameSetAnimations.getAnimation(stateIndex);
          frameSetAnimation.setDirectionsCount(1);
          var frameSetDirection = frameSetAnimation.getDirection(0);
          frameSetDirection.setLoop(state.loop);
          frameSetDirection.setTimeBetweenFrames(state.durationMs);
          state.frames.forEach(function(frame) {
            frameSetDirection.addSprite('');
            frameSetDirection.getSprite(frameSetDirection.getSpritesCount() - 1).setImageName(frame.resourceName);
          });
        });
        return;
      }
      throw new Error('Unknown official object asset binding operation: ' + operation.kind);
    });
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

function loadProject(gd, projectData) {
  var compilerInput = makeCompilerProjectData(projectData);
  var project = gd.ProjectHelper.createNewGDJSProject();
  var serializedProject = gd.Serializer.fromJSObject(compilerInput.projectData);
  project.unserializeFrom(serializedProject);
  serializedProject.delete();
  restoreObjectDeclarations(gd, project, project.getObjects(), compilerInput.detached.globalObjects);
  compilerInput.detached.layoutObjects.forEach(function(objects, index) {
    restoreObjectDeclarations(gd, project, project.getLayoutAt(index).getObjects(), objects);
  });
  restoreAssetResources(gd, project, compilerInput.assetResources);
  validateInstructionTypes(gd, projectData, project);
  return project;
}

module.exports = {
  makeCompilerProjectData: makeCompilerProjectData,
  restoreObjectDeclarations: restoreObjectDeclarations,
  restoreAssetResources: restoreAssetResources,
  validateInstructionTypes: validateInstructionTypes,
  loadProject: loadProject
};
