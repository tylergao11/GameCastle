var path = require('path');

var TRUTH_PATH = path.join(__dirname, 'gdevelop-truth', 'runtime-truth.json');
var truth = require(TRUTH_PATH);

var CORE_PROJECT_EXTENSIONS = [
  'BuiltinObject',
  'Sprite',
  'BuiltinCommonInstructions',
  'BuiltinVariables',
  'BuiltinTime',
  'BuiltinMouse',
  'BuiltinKeyboard',
  'BuiltinCamera',
  'BuiltinScene',
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function addUnique(list, value) {
  if (list.indexOf(value) < 0) list.push(value);
}

function parseHexColor(color, fallback) {
  fallback = fallback || { r: 255, g: 255, b: 255 };
  var hex = String(color || '').replace('#', '');
  function read(start, key) {
    var parsed = parseInt(hex.substring(start, start + 2), 16);
    return isNaN(parsed) ? fallback[key] : parsed;
  }
  return {
    r: read(0, 'r'),
    g: read(2, 'g'),
    b: read(4, 'b'),
  };
}

function toRgbString(color, fallback) {
  var parsed = parseHexColor(color, fallback);
  return parsed.r + ';' + parsed.g + ';' + parsed.b;
}

function requireObjectType(type) {
  // Core GDevelop types that are always available
  if (type === 'Sprite') return { extension: 'Sprite', includes: [], dataFields: [] };
  var record = truth.objects[type];
  if (!record) throw new Error('Unsupported GDevelop object type: ' + type);
  return record;
}

function requireBehaviorType(type) {
  var record = truth.behaviors[type];
  if (!record) throw new Error('Unsupported GDevelop behavior type: ' + type);
  return record;
}

function getObjectIncludes(type) {
  return clone(requireObjectType(type).includes || []);
}

function getBehaviorIncludes(type) {
  return clone(requireBehaviorType(type).includes || []);
}

function isThreeDType(type) {
  var objectRecord = truth.objects[type];
  var behaviorRecord = truth.behaviors[type];
  return (objectRecord && objectRecord.extension === 'ThreeD') ||
    (behaviorRecord && behaviorRecord.extension === 'ThreeD');
}

function createShapePainterObject(params) {
  requireObjectType('PrimitiveDrawing::Drawer');
  var parsedColor = parseHexColor(params.color || '#4488FF', { r: 100, g: 130, b: 240 });
  return {
    name: params.name,
    tags: '',
    type: 'PrimitiveDrawing::Drawer',
    variables: [],
    behaviors: [],
    effects: [],
    absoluteCoordinates: false,
    clearBetweenFrames: false,
    antialiasing: 'low',
    fillColor: parsedColor,
    fillOpacity: 255,
    outlineColor: { r: 0, g: 0, b: 0 },
    outlineOpacity: 255,
    outlineSize: params.outline || 0,
  };
}

function createTextObject(params) {
  requireObjectType('TextObject::Text');
  return {
    name: params.name,
    tags: '',
    type: 'TextObject::Text',
    variables: [],
    behaviors: [],
    effects: [],
    content: {
      text: params.text || params.name,
      font: '',
      characterSize: params.size || 20,
      color: toRgbString(params.color || '#FFFFFF', { r: 255, g: 255, b: 255 }),
      bold: false,
      italic: false,
      underlined: false,
      textAlignment: 'left',
      verticalTextAlignment: 'top',
      isOutlineEnabled: false,
      outlineThickness: 0,
      outlineColor: '0;0;0',
      isShadowEnabled: false,
      shadowColor: '0;0;0',
      shadowOpacity: 127,
      shadowDistance: 4,
      shadowAngle: 45,
      shadowBlurRadius: 2,
      lineHeight: 0,
    },
  };
}

function createCube3DObject(params) {
  requireObjectType('Scene3D::Cube3DObject');
  return {
    name: params.name,
    tags: '',
    type: 'Scene3D::Cube3DObject',
    variables: [],
    behaviors: [],
    effects: [],
    content: {
      width: params.width || 64,
      height: params.height || 64,
      depth: params.depth || 64,
      enableTextureTransparency: false,
      facesOrientation: 'Y',
      frontFaceResourceName: '',
      backFaceResourceName: '',
      backFaceUpThroughWhichAxisRotation: 'X',
      leftFaceResourceName: '',
      rightFaceResourceName: '',
      topFaceResourceName: '',
      bottomFaceResourceName: '',
      frontFaceResourceRepeat: false,
      backFaceResourceRepeat: false,
      leftFaceResourceRepeat: false,
      rightFaceResourceRepeat: false,
      topFaceResourceRepeat: false,
      bottomFaceResourceRepeat: false,
      tileScale: 1,
      frontFaceVisible: true,
      backFaceVisible: true,
      leftFaceVisible: true,
      rightFaceVisible: true,
      topFaceVisible: true,
      bottomFaceVisible: true,
      tint: toRgbString(params.color || '#FFFFFF', { r: 255, g: 255, b: 255 }),
      isCastingShadow: true,
      isReceivingShadow: true,
      materialType: 'StandardWithoutMetalness',
    },
  };
}


function createSpriteObject(params) {
  // Sprite is a core GDevelop object type (always available via CORE_PROJECT_EXTENSIONS).
  // It holds animation frames that reference texture images.
  var texturePath = params.texture || params.name + '.png';
  var width = Number(params.width) || 32;
  var height = Number(params.height) || 32;
  return {
    name: params.name,
    tags: '',
    type: 'Sprite',
    variables: [],
    behaviors: [],
    effects: [],
    updateIfNotVisible: false,
    animations: [
      {
        name: '',
        useMultipleDirections: false,
        directions: [
          {
            looping: false,
            timeBetweenFrames: 0.08,
            sprites: [
              {
                hasCustomCollisionMask: false,
                image: texturePath,
                points: [],
                originPoint: { name: 'origin', x: 0, y: 0 },
                centerPoint: { automatic: true, name: 'centre', x: 0, y: 0 },
                customCollisionMask: [],
              },
            ],
          },
        ],
      },
    ],
  };
}

function createObjectData(params) {
  if (params.type === 'ShapePainter') return createShapePainterObject(params);
  if (params.type === 'Sprite') return createSpriteObject(params);
  if (params.type === 'Text') return createTextObject(params);
  if (params.type === 'Scene3D::Cube3DObject') return createCube3DObject(params);
  throw new Error('Unsupported internal object DSL type: ' + params.type);
}

function createBehaviorData(params) {
  requireBehaviorType(params.type);
  if (params.type === 'PlatformBehavior::PlatformerObjectBehavior') {
    return {
      name: params.as || 'PlatformerObject',
      type: params.type,
      acceleration: params.acceleration || 1500,
      canGoDownFromJumpthru: true,
      canGrabPlatforms: false,
      canGrabWithoutMoving: true,
      deceleration: params.deceleration || 1500,
      gravity: params.gravity || 1300,
      ignoreDefaultControls: false,
      jumpSpeed: params.jumpSpeed || 1000,
      jumpSustainTime: 0,
      ladderClimbingSpeed: 150,
      maxFallingSpeed: params.maxFallingSpeed || 1000,
      maxSpeed: params.maxSpeed || 250,
      slopeMaxAngle: params.slopeMaxAngle || 60,
      useLegacyTrajectory: false,
      useRepeatedJump: false,
      xGrabTolerance: 10,
      yGrabOffset: 0,
    };
  }
  if (params.type === 'PlatformBehavior::PlatformBehavior') {
    return {
      name: params.as || 'Platform',
      type: params.type,
      canBeGrabbed: true,
      platformType: params.platformType || 'NormalPlatform',
      yGrabOffset: 0,
    };
  }
  if (params.type === 'Scene3D::Base3DBehavior') {
    return {
      name: params.as || 'Object3D',
      type: params.type,
    };
  }
  throw new Error('Unsupported internal behavior DSL type: ' + params.type);
}

function visitProjectObjects(project, visitor) {
  (project.objects || []).forEach(visitor);
  (project.layouts || []).forEach(function(layout) {
    (layout.objects || []).forEach(visitor);
  });
}

function getProjectExtensions(project) {
  var names = CORE_PROJECT_EXTENSIONS.slice();
  if (project) {
    visitProjectObjects(project, function(object) {
      var objectRecord = requireObjectType(object.type);
      addUnique(names, objectRecord.extension);
      (object.behaviors || []).forEach(function(behavior) {
        var behaviorRecord = requireBehaviorType(behavior.type);
        addUnique(names, behaviorRecord.extension);
      });
    });
  }
  return names.map(function(name) { return { name: name }; });
}

function syncProjectExtensions(project) {
  if (!project.properties) project.properties = {};
  project.properties.extensions = getProjectExtensions(project);
}

function validateRecordFields(kind, type, value, fields) {
  (fields || []).forEach(function(field) {
    if (field.optional) return;
    if (String(field.type || '').indexOf('undefined') >= 0) return;
    if (value[field.name] === undefined && (!value.content || value.content[field.name] === undefined)) {
      throw new Error(kind + ' ' + type + ' is missing official data field: ' + field.name);
    }
  });
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(label + ' must be an object');
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(label + ' must be an array');
  }
}

function assertString(value, label) {
  if (typeof value !== 'string') {
    throw new Error(label + ' must be a string');
  }
}

function assertNumber(value, label) {
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new Error(label + ' must be a finite number');
  }
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new Error(label + ' must be a boolean');
  }
}

function indexProjectObjects(project, layout) {
  var byName = {};
  (project.objects || []).forEach(function(object) {
    byName[object.name] = object;
  });
  ((layout || {}).objects || []).forEach(function(object) {
    byName[object.name] = object;
  });
  return byName;
}

function validateVariables(variables, label) {
  assertArray(variables, label);
  variables.forEach(function(variable, index) {
    assertObject(variable, label + '[' + index + ']');
    assertString(variable.name, label + '[' + index + '].name');
    assertNumber(variable.type, label + '[' + index + '].type');
    if (variable.value !== undefined) assertString(String(variable.value), label + '[' + index + '].value');
  });
}

function validateInstruction(instruction, label) {
  assertObject(instruction, label);
  assertObject(instruction.type, label + '.type');
  assertBoolean(instruction.type.inverted, label + '.type.inverted');
  assertString(instruction.type.value, label + '.type.value');
  assertArray(instruction.parameters, label + '.parameters');
  instruction.parameters.forEach(function(parameter, index) {
    if (typeof parameter !== 'string') {
      throw new Error(label + '.parameters[' + index + '] must be a string');
    }
  });
}

function validateEvent(event, label) {
  assertObject(event, label);
  assertBoolean(event.disabled, label + '.disabled');
  assertBoolean(event.folded, label + '.folded');
  assertString(event.type, label + '.type');
  assertArray(event.conditions, label + '.conditions');
  assertArray(event.actions, label + '.actions');
  assertArray(event.events, label + '.events');
  event.conditions.forEach(function(condition, index) {
    validateInstruction(condition, label + '.conditions[' + index + ']');
  });
  event.actions.forEach(function(action, index) {
    validateInstruction(action, label + '.actions[' + index + ']');
  });
  event.events.forEach(function(child, index) {
    validateEvent(child, label + '.events[' + index + ']');
  });
}

function validateLayer(layer, label) {
  assertObject(layer, label);
  assertString(layer.name, label + '.name');
  assertBoolean(layer.visibility, label + '.visibility');
  assertArray(layer.cameras, label + '.cameras');
  assertArray(layer.effects, label + '.effects');
  layer.cameras.forEach(function(camera, index) {
    assertObject(camera, label + '.cameras[' + index + ']');
    ['height', 'width', 'viewportBottom', 'viewportLeft', 'viewportRight', 'viewportTop'].forEach(function(field) {
      assertNumber(camera[field], label + '.cameras[' + index + '].' + field);
    });
    assertBoolean(camera.defaultSize, label + '.cameras[' + index + '].defaultSize');
    assertBoolean(camera.defaultViewport, label + '.cameras[' + index + '].defaultViewport');
  });
}

function validateInstance(instance, label, objectIndex) {
  assertObject(instance, label);
  assertString(instance.name, label + '.name');
  if (!objectIndex[instance.name]) throw new Error(label + ' references unknown object: ' + instance.name);
  assertNumber(instance.x, label + '.x');
  assertNumber(instance.y, label + '.y');
  assertNumber(instance.zOrder, label + '.zOrder');
  assertNumber(instance.angle, label + '.angle');
  assertBoolean(instance.customSize, label + '.customSize');
  assertNumber(instance.width, label + '.width');
  assertNumber(instance.height, label + '.height');
  assertString(instance.layer, label + '.layer');
  assertArray(instance.numberProperties, label + '.numberProperties');
  assertArray(instance.stringProperties, label + '.stringProperties');
  assertArray(instance.initialVariables, label + '.initialVariables');
}

function validateProjectShape(project) {
  assertObject(project, 'Project');
  assertObject(project.gdVersion, 'Project.gdVersion');
  ['build', 'major', 'minor', 'revision'].forEach(function(field) {
    assertNumber(project.gdVersion[field], 'Project.gdVersion.' + field);
  });
  assertObject(project.properties, 'Project.properties');
  assertString(project.properties.name, 'Project.properties.name');
  assertNumber(project.properties.windowWidth, 'Project.properties.windowWidth');
  assertNumber(project.properties.windowHeight, 'Project.properties.windowHeight');
  assertArray(project.properties.extensions, 'Project.properties.extensions');
  project.properties.extensions.forEach(function(extension, index) {
    assertObject(extension, 'Project.properties.extensions[' + index + ']');
    assertString(extension.name, 'Project.properties.extensions[' + index + '].name');
  });
  [
    'resources',
    'objects',
    'objectsGroups',
    'variables',
    'layouts',
    'usedResources',
    'externalEvents',
    'eventsFunctionsExtensions',
    'externalLayouts',
    'externalSourceFiles',
  ].forEach(function(field) {
    if (field === 'resources') assertObject(project.resources, 'Project.resources');
    else assertArray(project[field], 'Project.' + field);
  });
  assertArray(project.resources.resources, 'Project.resources.resources');
  assertArray(project.resources.resourceFolders, 'Project.resources.resourceFolders');
  validateVariables(project.variables, 'Project.variables');
  if (project.layouts.length) {
    assertString(project.firstLayout, 'Project.firstLayout');
    if (!project.layouts.some(function(layout) { return layout.name === project.firstLayout; })) {
      throw new Error('Project.firstLayout must reference an existing layout');
    }
  }
}

function validateLayout(project, layout, index) {
  var label = 'Project.layouts[' + index + ']';
  assertObject(layout, label);
  assertString(layout.name, label + '.name');
  assertString(layout.mangledName, label + '.mangledName');
  assertBoolean(layout.disableInputWhenNotFocused, label + '.disableInputWhenNotFocused');
  assertBoolean(layout.standardSortMethod, label + '.standardSortMethod');
  assertBoolean(layout.stopSoundsOnStartup, label + '.stopSoundsOnStartup');
  assertArray(layout.instances, label + '.instances');
  assertArray(layout.objects, label + '.objects');
  assertArray(layout.events, label + '.events');
  assertArray(layout.layers, label + '.layers');
  assertArray(layout.variables, label + '.variables');
  assertArray(layout.objectsGroups, label + '.objectsGroups');
  assertArray(layout.behaviorsSharedData, label + '.behaviorsSharedData');
  assertArray(layout.usedResources, label + '.usedResources');
  validateVariables(layout.variables, label + '.variables');
  var layerNames = {};
  layout.layers.forEach(function(layer, layerIndex) {
    validateLayer(layer, label + '.layers[' + layerIndex + ']');
    if (layerNames[layer.name]) throw new Error(label + '.layers has duplicate layer: ' + layer.name);
    layerNames[layer.name] = true;
  });
  var objectIndex = indexProjectObjects(project, layout);
  layout.instances.forEach(function(instance, instanceIndex) {
    validateInstance(instance, label + '.instances[' + instanceIndex + ']', objectIndex);
    if (!layerNames[instance.layer]) throw new Error(label + '.instances[' + instanceIndex + '] references unknown layer: ' + instance.layer);
  });
  layout.events.forEach(function(event, eventIndex) {
    validateEvent(event, label + '.events[' + eventIndex + ']');
  });
}

function validateProject(project) {
  validateProjectShape(project);
  function visitObject(object) {
    assertObject(object, 'Project object');
    assertString(object.name, 'Project object.name');
    assertString(object.type, 'Project object.type');
    assertArray(object.variables, 'Project object.variables');
    assertArray(object.behaviors, 'Project object.behaviors');
    assertArray(object.effects, 'Project object.effects');
    var objectRecord = requireObjectType(object.type);
    validateRecordFields('Object', object.type, object, objectRecord.dataFields);
    (object.behaviors || []).forEach(function(behavior) {
      var behaviorRecord = requireBehaviorType(behavior.type);
      validateRecordFields('Behavior', behavior.type, behavior, (behaviorRecord.constructorDataFields || []).map(function(name) {
        return { name: name, optional: false, type: '' };
      }));
    });
  }
  visitProjectObjects(project, visitObject);
  (project.layouts || []).forEach(function(layout, index) {
    validateLayout(project, layout, index);
  });
}

module.exports = {
  truth: truth,
  getObjectIncludes: getObjectIncludes,
  getBehaviorIncludes: getBehaviorIncludes,
  isThreeDType: isThreeDType,
  createObjectData: createObjectData,
  createBehaviorData: createBehaviorData,
  getProjectExtensions: getProjectExtensions,
  syncProjectExtensions: syncProjectExtensions,
  validateProject: validateProject,
  parseHexColor: parseHexColor,
  toRgbString: toRgbString,
};
