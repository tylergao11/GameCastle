/**
 * JSON Engine — Execute operations against GDevelop project.json
 * 
 * Pure JSON manipulation. No GDevelop WASM/IDE dependency.
 * Each function mirrors one GDevelop editor function's effect on JSON.
 * 
 * Usage:
 *   const project = JSON.parse(fs.readFileSync('project.json'));
 *   executeOperation(project, { op: 'obj:create', params: { scene_name: 'Level1', object_name: 'Coin', object_type: 'Sprite' } });
 *   fs.writeFileSync('project.json', JSON.stringify(project, null, 2));
 */

import type { GDProject, GDObject, GDInstance, GDEvent, GDVariable, GDLayer, GDBbehavior } from './gdevelop-types';
import { VAR_TYPE } from './gdevelop-types';
import { getOperationById, type OperationDef } from './operations';

// ===== UTILITY =====

function findScene(project: GDProject, name: string): { index: number; scene: any } | null {
  const idx = project.layouts.findIndex(l => l.name === name);
  if (idx === -1) return null;
  return { index: idx, scene: project.layouts[idx] };
}

function findObject(project: GDProject, sceneName: string, objectName: string): { container: any[]; index: number; obj: any } | null {
  const container = sceneName ? findScene(project, sceneName)?.scene?.objects : project.objects;
  if (!container) return null;
  const idx = container.findIndex((o: any) => o.name === objectName);
  if (idx === -1) return null;
  return { container, index: idx, obj: container[idx] };
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function generateStableUuid(parts: Array<string | number>): string {
  return 'gc-' + shortHash(parts.map(part => String(part)).join('|'));
}

// ===== OPERATION HANDLERS =====

const handlers: Record<string, (project: GDProject, params: Record<string, any>) => { success: boolean; message: string }> = {

  // ---- SCENE ----
  'scene:create': (project, params) => {
    const name = params.scene_name;
    if (project.layouts.find(l => l.name === name)) return { success: false, message: 'Scene already exists: ' + name };
    project.layouts.push({
      name, mangledName: name.replace(/[^a-zA-Z0-9]/g, '_'),
      disableInputWhenNotFocused: true, standardSortMethod: true, stopSoundsOnStartup: true, title: '',
      r: 209, g: 209, b: 209,
      uiSettings: { grid:false, gridB:255, gridG:180, gridHeight:32, gridOffsetX:0, gridOffsetY:0, gridR:158, gridWidth:32, snap:true, windowMask:true, zoomFactor:1 },
      objectsGroups: [], variables: [], instances: [], objects: [], events: [],
      layers: [{ name: '', visibility: true, cameras: [{ defaultSize:true, defaultViewport:true, height:0, width:0, viewportBottom:1, viewportLeft:0, viewportRight:1, viewportTop:0 }], effects: [] }],
      behaviorsSharedData: []
    });
    if (params.is_first_scene) project.firstLayout = name;
    if (params.include_ui_layer) {
      const scene = project.layouts[project.layouts.length - 1];
      scene.layers.push({ name: 'UI', visibility: true, cameras: [{ defaultSize:true, defaultViewport:true, height:0, width:0, viewportBottom:1, viewportLeft:0, viewportRight:1, viewportTop:0 }], effects: [] });
    }
    return { success: true, message: 'Scene created: ' + name };
  },

  'scene:delete': (project, params) => {
    const found = findScene(project, params.scene_name);
    if (!found) return { success: false, message: 'Scene not found: ' + params.scene_name };
    project.layouts.splice(found.index, 1);
    if (project.firstLayout === params.scene_name) {
      project.firstLayout = project.layouts[0]?.name || '';
    }
    return { success: true, message: 'Scene deleted: ' + params.scene_name };
  },
  // ---- OBJECT ----
  'obj:create': (project, params) => {
    const container = params.scene_name ? findScene(project, params.scene_name)?.scene?.objects : project.objects;
    if (!container && params.scene_name) return { success: false, message: 'Scene not found: ' + params.scene_name };
    const target = container || project.objects;
    if (target.find((o: any) => o.name === params.object_name) && !params.replace_existing_object) {
      return { success: false, message: 'Object already exists: ' + params.object_name };
    }
    const newObj: any = { name: params.object_name, type: params.object_type, variables: [], behaviors: [] };
    if (params.object_type === 'Sprite') {
      newObj.animations = [{ name: '', directions: [{ sprites: [{ img: params.object_name + '.png' }] }] }];
      newObj.updateIfNotVisible = false;
    } else if (params.object_type.includes('Text')) {
      newObj.string = params.object_name;
      newObj.font = '';
      newObj.characterSize = 20;
      newObj.color = { r: 255, g: 255, b: 255 };
      newObj.bold = false;
      newObj.italic = false;
    }
    if (params.replace_existing_object) {
      const idx = target.findIndex((o: any) => o.name === params.object_name);
      if (idx >= 0) target[idx] = newObj;
      else target.push(newObj);
    } else {
      target.push(newObj);
    }
    return { success: true, message: 'Object created: ' + params.object_name };
  },

  'obj:delete': (project, params) => {
    const found = findObject(project, params.scene_name, params.object_name);
    if (!found) return { success: false, message: 'Object not found: ' + params.object_name };
    found.container.splice(found.index, 1);
    // Cascade: remove all instances of this object from all scenes
    for (const layout of project.layouts) {
      layout.instances = layout.instances.filter((inst: any) => inst.name !== params.object_name);
    }
    return { success: true, message: 'Object deleted: ' + params.object_name };
  },

  'obj:rename': (project, params) => {
    // params.changed_properties = [{"name":"name","value":"NewName"}]
    const props = JSON.parse(params.changed_properties);
    const newName = props.find((p: any) => p.name === 'name')?.value;
    if (!newName) return { success: false, message: 'No new name provided' };
    const found = findObject(project, params.scene_name, params.object_name);
    if (!found) return { success: false, message: 'Object not found' };
    found.obj.name = newName;
    // Cascade: rename instances
    for (const layout of project.layouts) {
      for (const inst of layout.instances) {
        if (inst.name === params.object_name) inst.name = newName;
      }
    }
    return { success: true, message: 'Object renamed: ' + params.object_name + ' -> ' + newName };
  },

  'obj:set-prop': (project, params) => {
    const found = findObject(project, params.scene_name, params.object_name);
    if (!found) return { success: false, message: 'Object not found' };
    if (params.changed_properties) {
      const props = JSON.parse(params.changed_properties);
      for (const p of props) {
        if (p.name === 'color' && typeof p.value === 'string') {
          const hex = p.value.replace('#', '');
          found.obj.color = { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16) };
        } else {
          found.obj[p.name] = p.value;
        }
      }
    }
    return { success: true, message: 'Properties updated for: ' + params.object_name };
  },

  // ---- BEHAVIOR ----
  'beh:add': (project, params) => {
    const found = findObject(project, params.scene_name, params.object_name);
    if (!found) return { success: false, message: 'Object not found' };
    if (!found.obj.behaviors) found.obj.behaviors = [];
    const behName = params.behavior_name || params.behavior_type.split('::').pop() || 'Behavior';
    found.obj.behaviors.push({ name: behName, type: params.behavior_type });
    return { success: true, message: 'Behavior added: ' + behName + ' to ' + params.object_name };
  },
  'beh:remove': (project, params) => {
    const found = findObject(project, params.scene_name, params.object_name);
    if (!found) return { success: false, message: 'Object not found' };
    if (!found.obj.behaviors) return { success: false, message: 'No behaviors' };
    const idx = found.obj.behaviors.findIndex((b: any) => b.name === params.behavior_name);
    if (idx === -1) return { success: false, message: 'Behavior not found: ' + params.behavior_name };
    found.obj.behaviors.splice(idx, 1);
    return { success: true, message: 'Behavior removed' };
  },

  'beh:set-prop': (project, params) => {
    const found = findObject(project, params.scene_name, params.object_name);
    if (!found) return { success: false, message: 'Object not found' };
    const beh = found.obj.behaviors?.find((b: any) => b.name === params.behavior_name);
    if (!beh) return { success: false, message: 'Behavior not found' };
    if (params.delete_this_behavior) {
      found.obj.behaviors = found.obj.behaviors.filter((b: any) => b.name !== params.behavior_name);
      return { success: true, message: 'Behavior deleted' };
    }
    if (params.changed_properties) {
      const props = JSON.parse(params.changed_properties);
      if (!beh.parameters) beh.parameters = [];
      for (const p of props) {
        const existing = beh.parameters.find((bp: any) => bp.name === p.name);
        if (existing) existing.value = p.value;
        else beh.parameters.push({ name: p.name, value: p.value });
      }
    }
    return { success: true, message: 'Behavior property updated' };
  },

  // ---- INSTANCE ----
  'inst:place': (project, params) => {
    const found = findScene(project, params.scene_name);
    if (!found) return { success: false, message: 'Scene not found' };
    const positions = params.instance_positions ? params.instance_positions.split(';') : [params.brush_position || '400,300'];
    const count = params.new_instances_count || positions.length;
    let zOrder = params.z_order || 1;
    for (let i = 0; i < count; i++) {
      const pos = (positions[i] || positions[0]).split(',').map(Number);
      const occurrence = found.scene.instances.filter((inst: any) =>
        inst.name === params.object_name
        && inst.x === pos[0]
        && inst.y === pos[1]
        && inst.layer === (params.layer_name || '')
      ).length + 1;
      found.scene.instances.push({
        angle: params.angle || 0, customSize: false, height: 0, width: 0,
        layer: params.layer_name || '', locked: false,
        name: params.object_name, x: pos[0], y: pos[1], zOrder: zOrder++,
        numberProperties: [], stringProperties: [], initialVariables: [],
        persistentUuid: generateStableUuid([
          params.scene_name,
          params.object_name,
          pos[0],
          pos[1],
          params.layer_name || '',
          occurrence,
        ])
      });
    }
    return { success: true, message: 'Placed ' + count + ' instance(s) of ' + params.object_name };
  },

  'inst:move': (project, params) => {
    const found = findScene(project, params.scene_name);
    if (!found) return { success: false, message: 'Scene not found' };
    const uuids = (params.existing_instance_ids || '').split(',').filter(Boolean);
    const [x, y] = (params.brush_position || '0,0').split(',').map(Number);
    for (const inst of found.scene.instances) {
      if (uuids.includes(inst.persistentUuid)) {
        inst.x = x; inst.y = y;
        if (params.layer_name !== undefined) inst.layer = params.layer_name;
      }
    }
    return { success: true, message: 'Moved ' + uuids.length + ' instance(s)' };
  },

  'inst:erase': (project, params) => {
    const found = findScene(project, params.scene_name);
    if (!found) return { success: false, message: 'Scene not found' };
    const uuids = (params.existing_instance_ids || '').split(',').filter(Boolean);
    found.scene.instances = found.scene.instances.filter(
      (inst: any) => !uuids.includes(inst.persistentUuid)
    );
    return { success: true, message: 'Erased ' + uuids.length + ' instance(s)' };
  },
  // ---- EVENT ----
  'evt:add': (project, params) => {
    const found = findScene(project, params.scene_name);
    if (!found) return { success: false, message: 'Scene not found' };
    // For manual event creation (AI generates raw event JSON)
    if (params.events_json) {
      const events = typeof params.events_json === 'string' ? JSON.parse(params.events_json) : params.events_json;
      const arr = Array.isArray(events) ? events : [events];
      found.scene.events.push(...arr);
      return { success: true, message: 'Added ' + arr.length + ' event(s)' };
    }
    // Template: single standard event from params
    const event: any = {
      disabled: false, folded: false,
      type: 'BuiltinCommonInstructions::Standard',
      conditions: [], actions: [], events: []
    };
    if (params.conditions) event.conditions = params.conditions;
    if (params.actions) event.actions = params.actions;
    found.scene.events.push(event);
    return { success: true, message: 'Event added' };
  },

  // ---- VARIABLE ----
  'var:set': (project, params) => {
    let container: any[];
    if (params.variable_scope === 'global') container = project.variables;
    else if (params.variable_scope === 'scene') {
      const found = findScene(project, params.scene_name);
      if (!found) return { success: false, message: 'Scene not found' };
      container = found.scene.variables;
    } else if (params.variable_scope === 'object') {
      const found = findObject(project, params.scene_name, params.object_name);
      if (!found) return { success: false, message: 'Object not found' };
      if (!found.obj.variables) found.obj.variables = [];
      container = found.obj.variables;
    } else return { success: false, message: 'Invalid scope' };
    const ops = JSON.parse(params.operations);
    for (const op of ops) {
      const existing = container.find((v: any) => v.name === op.variable_name_or_path);
      if (existing) { existing.value = op.value; if (op.type) existing.type = VAR_TYPE[op.type.toUpperCase() as keyof typeof VAR_TYPE] || VAR_TYPE.STRING; }
      else {
        const typeName = op.type || 'String';
        container.push({ name: op.variable_name_or_path, type: VAR_TYPE[typeName.toUpperCase() as keyof typeof VAR_TYPE] || VAR_TYPE.STRING, value: op.value });
      }
    }
    return { success: true, message: 'Variable set' };
  },

  'var:increment': (project, params) => {
    let container: any[];
    if (params.variable_scope === 'global') container = project.variables;
    else if (params.variable_scope === 'scene') { const f = findScene(project, params.scene_name); if (!f) return { success: false, message: 'Scene not found' }; container = f.scene.variables; }
    else if (params.variable_scope === 'object') { const f = findObject(project, params.scene_name, params.object_name); if (!f) return { success: false, message: 'Object not found' }; if(!f.obj.variables)f.obj.variables=[]; container = f.obj.variables; }
    else return { success: false, message: 'Invalid scope' };
    const ops = JSON.parse(params.operations);
    for (const op of ops) {
      const existing = container.find((v: any) => v.name === op.variable_name_or_path);
      if (existing && op.value) {
        const current = Number(existing.value) || 0;
        const delta = Number(op.value.replace(/[+]/g, ''));
        existing.value = String(current + delta);
      }
    }
    return { success: true, message: 'Variable incremented' };
  },

  'var:delete': (project, params) => {
    let container: any[];
    if (params.variable_scope === 'global') container = project.variables;
    else if (params.variable_scope === 'scene') { const f = findScene(project, params.scene_name); if (!f) return { success: false, message: 'Scene not found' }; container = f.scene.variables; }
    else if (params.variable_scope === 'object') { const f = findObject(project, params.scene_name, params.object_name); if (!f) return { success: false, message: 'Object not found' }; container = f.obj.variables || []; }
    else return { success: false, message: 'Invalid scope' };
    const ops = JSON.parse(params.operations);
    for (const op of ops) {
      const idx = container.findIndex((v: any) => v.name === op.variable_name_or_path);
      if (idx >= 0) container.splice(idx, 1);
    }
    return { success: true, message: 'Variable deleted' };
  },

  // ---- LAYER ----
  'layer:add': (project, params) => {
    const found = findScene(project, params.scene_name);
    if (!found) return { success: false, message: 'Scene not found' };
    const layers = JSON.parse(params.changed_layers);
    for (const l of layers) {
      if (l.operation === 'add') {
        found.scene.layers.push({
          name: l.name, visibility: l.visibility !== false,
          cameras: [{ defaultSize: true, defaultViewport: true, height: 0, width: 0, viewportBottom: 1, viewportLeft: 0, viewportRight: 1, viewportTop: 0 }],
          effects: []
        });
      }
    }
    return { success: true, message: 'Layer added' };
  },

  'layer:delete': (project, params) => {
    const found = findScene(project, params.scene_name);
    if (!found) return { success: false, message: 'Scene not found' };
    const layers = JSON.parse(params.changed_layers);
    for (const l of layers) {
      if (l.delete_this_layer) {
        found.scene.layers = found.scene.layers.filter((ly: any) => ly.name !== l.name);
        found.scene.instances = found.scene.instances.filter((inst: any) => inst.layer !== l.name);
      }
    }
    return { success: true, message: 'Layer deleted' };
  },

  'layer:set-vis': (project, params) => {
    const found = findScene(project, params.scene_name);
    if (!found) return { success: false, message: 'Scene not found' };
    const layers = JSON.parse(params.changed_layers);
    for (const l of layers) {
      const layer = found.scene.layers.find((ly: any) => ly.name === l.name);
      if (layer && l.operation === 'update') layer.visibility = l.visibility;
    }
    return { success: true, message: 'Layer visibility updated' };
  },

  // ---- EFFECT ----
  'effect:add': (project, params) => {
    const found = findScene(project, params.scene_name);
    if (!found) return { success: false, message: 'Scene not found' };
    const effects = JSON.parse(params.changed_layer_effects);
    for (const e of effects) {
      const layer = found.scene.layers.find((l: any) => l.name === (e.layer_name || ''));
      if (layer && e.operation === 'add') {
        layer.effects.push({
          name: e.layer_name || '',
          effectType: e.effect_type,
          doubleParameters: e.double_parameters || {},
          stringParameters: e.string_parameters || {},
          booleanParameters: e.boolean_parameters || {}
        });
      }
    }
    return { success: true, message: 'Effect added' };
  },

  // ---- GROUP ----
  'group:create': (project, params) => {
    const found = findScene(project, params.scene_name);
    if (!found) return { success: false, message: 'Scene not found' };
    const groups = JSON.parse(params.changed_groups);
    for (const g of groups) {
      if (g.operation === 'add') {
        found.scene.objectsGroups.push({ name: g.name, objects: g.object_names || [] });
      }
    }
    return { success: true, message: 'Group created' };
  },

};

// ===== MAIN EXECUTE FUNCTION =====

export interface ExecutionResult {
  success: boolean;
  message: string;
}

export function executeOperation(
  project: GDProject,
  op: { op: string; params: Record<string, any> }
): ExecutionResult {
  const handler = handlers[op.op];
  if (!handler) {
    return { success: false, message: 'Unknown operation: ' + op.op };
  }
  try {
    return handler(project, op.params);
  } catch (e: any) {
    return { success: false, message: 'Execution error: ' + e.message };
  }
}

export function executeOperations(
  project: GDProject,
  operations: { op: string; params: Record<string, any> }[]
): ExecutionResult[] {
  return operations.map(op => executeOperation(project, op));
}

export function getAvailableOperations(): string[] {
  return Object.keys(handlers);
}
