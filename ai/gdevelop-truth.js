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

function createObjectData(params) {
  if (params.type === 'ShapePainter') return createShapePainterObject(params);
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

function validateProject(project) {
  function visitObject(object) {
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
