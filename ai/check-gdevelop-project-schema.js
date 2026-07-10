var assert = require('assert');
var fs = require('fs');
var path = require('path');

var gdevelopTruth = require('./gdevelop-truth');
var intentCompiler = require('./intent-compiler');
var pipeline = require('./pipeline');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function makeProject() {
  var fixturePath = path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl');
  var intentDslText = fs.readFileSync(fixturePath, 'utf8');
  var compiled = intentCompiler.compileIntentDsl(intentDslText, {
    placementContext: {
      objectBounds: {
        Player: { x: 100, y: 400, width: 32, height: 48 },
      },
    },
  });
  var project = pipeline.emptyProject('GDevelopProjectSchemaCheck');
  var ops = pipeline.parseTargetPlan(compiled.bridgePlan.targetPlanText);
  for (var index = 0; index < ops.length; index++) {
    var result = await pipeline.execute(project, ops[index]);
    assert(result.ok, 'bridge target line should execute for project schema check: ' + compiled.bridgePlan.targetPlanLines[index] + ' -> ' + result.msg);
  }
  gdevelopTruth.syncProjectExtensions(project);
  return project;
}

function assertInvalid(project, pattern, label) {
  assert.throws(function() {
    gdevelopTruth.validateProject(project);
  }, pattern, label);
}

async function main() {
  var project = await makeProject();
  assert.doesNotThrow(function() {
    gdevelopTruth.validateProject(project);
  }, 'generated Intent project should satisfy GDevelop project schema');

  var missingProperties = clone(project);
  delete missingProperties.properties;
  assertInvalid(missingProperties, /Project\.properties must be an object/, 'project schema should require properties');

  var badFirstLayout = clone(project);
  badFirstLayout.firstLayout = 'MissingScene';
  assertInvalid(badFirstLayout, /firstLayout must reference an existing layout/, 'project schema should validate firstLayout');

  var badInstanceReference = clone(project);
  badInstanceReference.layouts[0].instances[0].name = 'MissingObject';
  assertInvalid(badInstanceReference, /references unknown object/, 'project schema should validate instance object references');

  var badEventParameter = clone(project);
  badEventParameter.layouts[0].events[0].actions[0].parameters[0] = 123;
  assertInvalid(badEventParameter, /parameters\[0\] must be a string/, 'project schema should validate instruction parameters');

  var badObjectShape = clone(project);
  delete badObjectShape.layouts[0].objects[0].behaviors;
  assertInvalid(badObjectShape, /Project object\.behaviors must be an array/, 'project schema should validate object containers');

  console.log('[GDevelopProjectSchema] generated project schema and negative cases passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
