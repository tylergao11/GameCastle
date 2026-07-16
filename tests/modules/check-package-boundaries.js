'use strict';

/**
 * Enforces the intended package dependency direction for GameCastle implementation code.
 * Data-only requires of *.json under another package are ignored.
 *
 * Allowed (code):
 *   product -> *owners and public façades
 *   assembly-module -> semantic-module, asset-engine, gdjs, spatial
 *   asset-engine -> assets, semantic-module
 *   semantic-module -> semantic
 *   gdjs -> semantic, assets
 *   spatial -> semantic, assets, gdjs  (preview/provider ports injected from product; no providers)
 *   assets -> (none of providers/semantic/gdjs/spatial/product)
 *   providers -> (none of assets/semantic/gdjs/spatial/product)
 *   semantic -> (none of providers/assets/gdjs/spatial/product)  // contract JSON data still allowed
 *   network -> (isolated; no other owners)
 */

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..', '..');
var PACKAGES = path.join(ROOT, 'packages');
var OWNERS = [
  'semantic', 'assets', 'spatial', 'product', 'providers', 'gdjs', 'network',
  'semantic-module', 'asset-engine', 'assembly-module'
];

var ALLOWED = {
  product: OWNERS.filter(function(name) { return name !== 'product'; }),
  'assembly-module': ['semantic-module', 'asset-engine', 'gdjs', 'spatial'],
  'asset-engine': ['assets', 'semantic-module'],
  'semantic-module': ['semantic'],
  gdjs: ['semantic', 'assets'],
  spatial: ['semantic', 'assets', 'gdjs'],
  assets: [],
  providers: [],
  semantic: [],
  network: []
};

var REQUIRE_RE = /require\((['"])([^'"]+)\1\)/g;

function walkJs(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function(entry) {
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') return;
      walkJs(full, out);
      return;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  });
  return out;
}

function packageOf(filePath) {
  var rel = path.relative(PACKAGES, filePath).split(path.sep);
  return rel[0];
}

function resolveTarget(fromFile, target) {
  if (target.endsWith('.json')) return null;
  if (target.indexOf('@gamecastle/') === 0) return target.slice('@gamecastle/'.length);
  if (target[0] !== '.') return null;
  var resolved;
  try {
    resolved = require.resolve(path.resolve(path.dirname(fromFile), target));
  } catch (error) {
    return null;
  }
  if (!resolved.endsWith('.js')) return null;
  var rel = path.relative(PACKAGES, resolved);
  if (rel.indexOf('..') === 0) return null;
  return rel.split(path.sep)[0];
}

var edges = [];
var filesByPackage = {};
OWNERS.forEach(function(name) {
  var dir = path.join(PACKAGES, name);
  if (!fs.existsSync(dir)) return;
  filesByPackage[name] = walkJs(dir, []);
});

Object.keys(filesByPackage).forEach(function(pkg) {
  filesByPackage[pkg].forEach(function(file) {
    var text = fs.readFileSync(file, 'utf8');
    var match;
    REQUIRE_RE.lastIndex = 0;
    while ((match = REQUIRE_RE.exec(text))) {
      var dest = resolveTarget(file, match[2]);
      if (!dest || OWNERS.indexOf(dest) < 0 || dest === pkg) continue;
      edges.push({
        from: pkg,
        to: dest,
        file: path.relative(ROOT, file).replace(/\\/g, '/')
      });
    }
  });
});

var forbidden = edges.filter(function(edge) {
  var allowed = ALLOWED[edge.from];
  return !allowed || allowed.indexOf(edge.to) < 0;
});

assert.strictEqual(
  forbidden.length,
  0,
  'Forbidden package code edges:\n' + forbidden.map(function(edge) {
    return '  ' + edge.from + ' -> ' + edge.to + '  (' + edge.file + ')';
  }).join('\n')
);

// Cycle check on allowed graph only
var graph = Object.create(null);
edges.forEach(function(edge) {
  if (!graph[edge.from]) graph[edge.from] = Object.create(null);
  graph[edge.from][edge.to] = true;
});
var cycles = [];
function dfs(node, stack, seenEdge) {
  Object.keys(graph[node] || {}).sort().forEach(function(next) {
    if (stack.indexOf(next) >= 0) {
      cycles.push(stack.slice(stack.indexOf(next)).concat([next]));
      return;
    }
    var key = node + '>' + next;
    if (seenEdge[key]) return;
    seenEdge[key] = true;
    dfs(next, stack.concat([next]), seenEdge);
  });
}
Object.keys(graph).sort().forEach(function(node) {
  dfs(node, [node], Object.create(null));
});
assert.strictEqual(cycles.length, 0, 'Package code cycles found: ' + JSON.stringify(cycles));

console.log('[PackageBoundaries] acyclic code dependencies match the composition-root call chain');
