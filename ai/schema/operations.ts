/**
 * GameCastle Truth Source — GDevelop Operation to JSON Mapping
 * 
 * 29 operations covering the full GDevelop project.json CRUD surface.
 * Machine-readable single source of truth for AI prompts, DSL commands, JSON engine, and validation.
 * 
 * Generated from GDevelop EditorFunctions/index.js reverse-engineering.
 * Read-only context operations prefixed with "ctx:".
 */

export type OperationCategory =
  | "project" | "scene" | "object" | "instance"
  | "event" | "variable" | "behavior" | "layer" | "effect";

export interface OpParam {
  name: string;
  type: "string" | "number" | "boolean" | "json";
  required: boolean;
  description: string;
  default?: any;
}

export interface OperationExample {
  input: string;
  jsonBefore: string;
  jsonAfter: string;
}

export interface OperationDef {
  id: string;
  gdFunctionName: string;
  category: OperationCategory;
  description: string;
  params: OpParam[];
  jsonPaths: string[];
  jsonEffect: string;
  dsl: string;
  example: OperationExample;
}

export const ALL_OPERATIONS: OperationDef[] = [
  {
    id: "project:init",
    gdFunctionName: "initialize_project",
    category: "project",
    description: "Create a new empty GDevelop project with default extensions and a starter scene.",
    params: [
      { name:"project_name", type:"string", required:true, description:"Name of the game project." },
      { name:"template_slug", type:"string", required:false, description:"Optional pre-built template identifier." },
    ],
    jsonPaths: ["(entire project.json)"],
    jsonEffect: "Creates complete project.json: 800x600, 60FPS, standard extensions, empty arrays, starter scene.",
    dsl: "project:init {name}",
    example: {
      input: "{\"project_name\":\"MyGame\"}",
      jsonBefore: "(file does not exist)",
      jsonAfter: "{\"firstLayout\":\"\",\"layouts\":[{\"name\":\"MyGame\"}]}",
    },
  },

  {
    id: "scene:create",
    gdFunctionName: "create_scene",
    category: "scene",
    description: "Create a new scene (layout) in the project.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Unique name for the new scene." },
      { name:"include_ui_layer", type:"boolean", required:false, description:"Add a UI layer." },
      { name:"background_color", type:"string", required:false, description:"Background color hex." },
      { name:"is_first_scene", type:"boolean", required:false, description:"Set as startup scene." },
    ],
    jsonPaths: ["layouts[]","firstLayout"],
    jsonEffect: "Pushes new GDLayout to layouts[] with base layer, camera, empty arrays.",
    dsl: "scene:new {name} [--first] [--ui]",
    example: {
      input: "{\"scene_name\":\"Level2\"}",
      jsonBefore: "[{\"name\":\"Level1\"}]",
      jsonAfter: "[{...L1...},{\"name\":\"Level2\",\"instances\":[],\"events\":[]}]",
    },
  },

  {
    id: "scene:delete",
    gdFunctionName: "change_scene_properties_layers_effects_groups",
    category: "scene",
    description: "Delete a scene using delete_this_scene flag.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Scene to delete." },
      { name:"delete_this_scene", type:"boolean", required:true, description:"Must be true." },
    ],
    jsonPaths: ["layouts[]","firstLayout"],
    jsonEffect: "Removes GDLayout from layouts[]. Updates firstLayout if needed.",
    dsl: "scene:delete {name}",
    example: {
      input: "{\"scene_name\":\"Level2\",\"delete_this_scene\":true}",
      jsonBefore: "[{L1},{L2},{L3}]",
      jsonAfter: "[{L1},{L3}]",
    },
  },

  {
    id: "scene:rename",
    gdFunctionName: "change_scene_properties_layers_effects_groups",
    category: "scene",
    description: "Rename a scene. Updates name, mangledName, firstLayout.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Current scene name." },
      { name:"changed_properties", type:"json", required:true, description:"[{\"name\":\"name\",\"value\":\"NewName\"}]" },
    ],
    jsonPaths: ["layouts[{s}].name","layouts[{s}].mangledName","firstLayout"],
    jsonEffect: "Updates name and mangledName. Cascades to firstLayout if startup scene.",
    dsl: "scene:rename {old} {new}",
    example: {
      input: "{\"scene_name\":\"Level1\",\"changed_properties\":[{\"name\":\"name\",\"value\":\"Stage1\"}]}",
      jsonBefore: "{\"name\":\"Level1\"}",
      jsonAfter: "{\"name\":\"Stage1\"}",
    },
  },

  {
    id: "scene:set-props",
    gdFunctionName: "change_scene_properties_layers_effects_groups",
    category: "scene",
    description: "Modify scene properties: title, background color, etc.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Target scene." },
      { name:"changed_properties", type:"json", required:true, description:"[{\"name\":\"prop\",\"value\":\"val\"}]" },
    ],
    jsonPaths: ["layouts[{s}].title","layouts[{s}].r/g/b"],
    jsonEffect: "Directly sets property values on the scene object.",
    dsl: "scene:set {scene} {prop}={value}",
    example: {
      input: "{\"scene_name\":\"Level1\",\"changed_properties\":[{\"name\":\"title\",\"value\":\"Dungeon\"}]}",
      jsonBefore: "title:\"\"",
      jsonAfter: "title:\"Dungeon\"",
    },
  },

  {
    id: "obj:create",
    gdFunctionName: "create_or_replace_object",
    category: "object",
    description: "Create a new object type (Sprite, Text, etc). Global or scene-scoped.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Scene or empty for global." },
      { name:"object_name", type:"string", required:true, description:"Unique object name." },
      { name:"object_type", type:"string", required:true, description:"Full type: Sprite, TextObject::Text, etc." },
      { name:"replace_existing_object", type:"boolean", required:false, description:"Replace existing with same name." },
      { name:"duplicated_object_name", type:"string", required:false, description:"Copy from this existing object." },
    ],
    jsonPaths: ["objects[]","layouts[{s}].objects[]"],
    jsonEffect: "Adds GDObject to objects[]. Type determines shape: Sprite gets animations[], Text gets string/font/color.",
    dsl: "obj:create {scene} {name} type={type}",
    example: {
      input: "{\"scene_name\":\"Level1\",\"object_name\":\"Coin\",\"object_type\":\"Sprite\"}",
      jsonBefore: "[{\"name\":\"Player\"}]",
      jsonAfter: "[{Player},{\"name\":\"Coin\",\"type\":\"Sprite\"}]",
    },
  },

  {
    id: "obj:delete",
    gdFunctionName: "change_object_properties_effects",
    category: "object",
    description: "Delete object type and all its instances from every scene.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Scene or empty." },
      { name:"object_name", type:"string", required:true, description:"Object to delete." },
      { name:"delete_this_object", type:"boolean", required:true, description:"Must be true." },
    ],
    jsonPaths: ["objects[]","layouts[*].instances[]"],
    jsonEffect: "Removes GDObject from array + ALL instances from ALL scenes.",
    dsl: "obj:delete {scene} {name}",
    example: {
      input: "{\"scene_name\":\"Level1\",\"object_name\":\"OldEnemy\",\"delete_this_object\":true}",
      jsonBefore: "[{Player},{OldEnemy}]",
      jsonAfter: "[{Player}]",
    },
  },

  {
    id: "obj:rename",
    gdFunctionName: "change_object_properties_effects",
    category: "object",
    description: "Rename object type. Cross-cutting: updates all instance and event references.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Scene." },
      { name:"object_name", type:"string", required:true, description:"Current name." },
      { name:"changed_properties", type:"json", required:true, description:"[{\"name\":\"name\",\"value\":\"NewName\"}]" },
    ],
    jsonPaths: ["objects[{n}].name","layouts[*].instances[].name"],
    jsonEffect: "Project-wide rename: objects[], instances[], event parameters.",
    dsl: "obj:rename {scene} {old} {new}",
    example: {
      input: "{\"scene_name\":\"Level1\",\"object_name\":\"Coin\",\"changed_properties\":[{\"name\":\"name\",\"value\":\"GoldCoin\"}]}",
      jsonBefore: "name:\"Coin\"",
      jsonAfter: "name:\"GoldCoin\"",
    },
  },

  {
    id: "obj:set-prop",
    gdFunctionName: "change_object_properties_effects",
    category: "object",
    description: "Modify object properties: text, color, size, animations, effects.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Scene or empty." },
      { name:"object_name", type:"string", required:true, description:"Target object." },
      { name:"changed_properties", type:"json", required:false, description:"[{\"name\":\"prop\",\"value\":\"val\"}]" },
      { name:"changed_effects", type:"json", required:false, description:"Effect changes." },
    ],
    jsonPaths: ["objects[{n}].{property}"],
    jsonEffect: "Direct property mutation. Sprite:animations. Text:string,font,characterSize,color.",
    dsl: "obj:set {scene} {name} {prop}={value}",
    example: {
      input: "{\"scene_name\":\"Level1\",\"object_name\":\"ScoreText\",\"changed_properties\":[{\"name\":\"string\",\"value\":\"Score:0\"}]}",
      jsonBefore: "string:\"Score:\"",
      jsonAfter: "string:\"Score:0\"",
    },
  },

  {
    id: "beh:add",
    gdFunctionName: "add_behavior",
    category: "behavior",
    description: "Add behavior to object (Platformer, Physics, Draggable, etc).",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Scene or empty." },
      { name:"object_name", type:"string", required:true, description:"Target object or group." },
      { name:"behavior_type", type:"string", required:true, description:"Full type: PlatformBehavior::PlatformerObjectBehavior." },
      { name:"behavior_name", type:"string", required:false, description:"Instance name. Defaults to behavior default." },
    ],
    jsonPaths: ["objects[{n}].behaviors[]"],
    jsonEffect: "Appends {name,type} to object.behaviors[]. Group: adds to all members.",
    dsl: "beh:add {scene} {obj} {type}",
    example: {
      input: "{\"scene_name\":\"Level1\",\"object_name\":\"Player\",\"behavior_type\":\"PlatformBehavior::PlatformerObjectBehavior\"}",
      jsonBefore: "[]",
      jsonAfter: "[{\"name\":\"Platformer\",\"type\":\"PlatformBehavior::PlatformerObjectBehavior\"}]",
    },
  },

  {
    id: "beh:remove",
    gdFunctionName: "remove_behavior",
    category: "behavior",
    description: "Remove a behavior from an object.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Scene." },
      { name:"object_name", type:"string", required:true, description:"Target object." },
      { name:"behavior_name", type:"string", required:true, description:"Behavior instance name." },
    ],
    jsonPaths: ["objects[{n}].behaviors[]"],
    jsonEffect: "Removes behavior entry from behaviors[].",
    dsl: "beh:remove {scene} {obj} {name}",
    example: {
      input: "{\"scene_name\":\"Level1\",\"object_name\":\"Player\",\"behavior_name\":\"Platformer\"}",
      jsonBefore: "[{Plat},{Health}]",
      jsonAfter: "[{Health}]",
    },
  },

  {
    id: "beh:set-prop",
    gdFunctionName: "change_behavior_property",
    category: "behavior",
    description: "Modify behavior properties, or delete behavior.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Scene." },
      { name:"object_name", type:"string", required:true, description:"Target object." },
      { name:"behavior_name", type:"string", required:true, description:"Behavior instance name." },
      { name:"changed_properties", type:"json", required:false, description:"[{\"name\":\"prop\",\"value\":\"val\"}]" },
      { name:"delete_this_behavior", type:"boolean", required:false, description:"Delete if true." },
    ],
    jsonPaths: ["objects[{n}].behaviors[{name}].parameters"],
    jsonEffect: "Updates behavior parameters. Platformer: maxSpeed,jumpSpeed,gravity,acceleration,etc.",
    dsl: "beh:set {scene} {obj} {beh} {prop}={val}",
    example: {
      input: "{\"scene_name\":\"Level1\",\"object_name\":\"Player\",\"behavior_name\":\"Platformer\",\"changed_properties\":[{\"name\":\"maxSpeed\",\"value\":\"500\"}]}",
      jsonBefore: "{\"name\":\"Platformer\"}",
      jsonAfter: "{\"name\":\"Platformer\",\"parameters\":[{\"name\":\"maxSpeed\",\"value\":\"500\"}]}",
    },
  },

  {
    id: "inst:place",
    gdFunctionName: "put_2d_instances",
    category: "instance",
    description: "Place new object instances on a scene.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Target scene." },
      { name:"object_name", type:"string", required:true, description:"Object type." },
      { name:"layer_name", type:"string", required:true, description:"Layer, empty=base." },
      { name:"brush_kind", type:"string", required:true, description:"paint|erase." },
      { name:"brush_position", type:"string", required:false, description:"x,y position." },
      { name:"new_instances_count", type:"number", required:false, description:"Count, default 1." },
      { name:"instance_positions", type:"string", required:false, description:"x1,y1;x2,y2;..." },
      { name:"existing_instance_ids", type:"string", required:false, description:"UUIDs to move." },
      { name:"z_order", type:"number", required:false, description:"Z-order." },
      { name:"angle", type:"number", required:false, description:"Rotation." },
      { name:"scale", type:"number", required:false, description:"Scale." },
    ],
    jsonPaths: ["layouts[{s}].instances[]"],
    jsonEffect: "Adds GDInstance with persistentUuid to instances[]. Position from brush_position or instance_positions.",
    dsl: "inst:place {scene} {obj} x={x} y={y} [count=N]",
    example: {
      input: "{\"scene_name\":\"Level1\",\"object_name\":\"Coin\",\"layer_name\":\"\",\"brush_kind\":\"paint\",\"brush_position\":\"300,200\",\"new_instances_count\":1}",
      jsonBefore: "[{Player}]",
      jsonAfter: "[{Player},{Coin,x:300,y:200}]",
    },
  },

  {
    id: "inst:move",
    gdFunctionName: "put_2d_instances",
    category: "instance",
    description: "Move existing instances to new positions/layers.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Target scene." },
      { name:"object_name", type:"string", required:true, description:"Object type." },
      { name:"layer_name", type:"string", required:true, description:"Target layer." },
      { name:"brush_kind", type:"string", required:true, description:"paint." },
      { name:"brush_position", type:"string", required:true, description:"New x,y." },
      { name:"existing_instance_ids", type:"string", required:true, description:"UUIDs to move." },
      { name:"new_instances_count", type:"number", required:false, description:"0=move only." },
    ],
    jsonPaths: ["layouts[{s}].instances[{uuid}].x/y/layer"],
    jsonEffect: "Updates x,y,layer of instances identified by persistentUuid.",
    dsl: "inst:move {scene} {obj} {uuid} x={x} y={y}",
    example: {
      input: "{\"scene_name\":\"Level1\",\"object_name\":\"Coin\",\"layer_name\":\"\",\"brush_kind\":\"paint\",\"brush_position\":\"500,100\",\"existing_instance_ids\":\"uuid123\",\"new_instances_count\":0}",
      jsonBefore: "{\"x\":300,\"y\":200,\"persistentUuid\":\"uuid123\"}",
      jsonAfter: "{\"x\":500,\"y\":100,\"persistentUuid\":\"uuid123\"}",
    },
  },

  {
    id: "inst:erase",
    gdFunctionName: "put_2d_instances",
    category: "instance",
    description: "Delete instances from a scene.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Target scene." },
      { name:"layer_name", type:"string", required:true, description:"Target layer." },
      { name:"brush_kind", type:"string", required:true, description:"erase." },
      { name:"existing_instance_ids", type:"string", required:true, description:"UUIDs to erase." },
    ],
    jsonPaths: ["layouts[{s}].instances[]"],
    jsonEffect: "Removes instances matching persistentUuid from instances[].",
    dsl: "inst:erase {scene} {uuid}",
    example: {
      input: "{\"scene_name\":\"Level1\",\"layer_name\":\"\",\"brush_kind\":\"erase\",\"existing_instance_ids\":\"uuid123\"}",
      jsonBefore: "[{uuid111},{uuid123}]",
      jsonAfter: "[{uuid111}]",
    },
  },

  {
    id: "evt:add",
    gdFunctionName: "add_scene_events",
    category: "event",
    description: "Generate and add events to a scene. THE key AI function for game logic.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Target scene." },
      { name:"events_description", type:"string", required:true, description:"Natural language event description." },
      { name:"existing_events_as_text", type:"string", required:false, description:"Current events as readable text." },
      { name:"extension_names_list", type:"string", required:false, description:"Available extensions." },
      { name:"objects_list", type:"string", required:false, description:"Available objects." },
      { name:"placement_hint", type:"string", required:false, description:"beginning|end|relative to ID." },
      { name:"event_batches", type:"json", required:false, description:"Batched generation jobs." },
    ],
    jsonPaths: ["layouts[{s}].events[]"],
    jsonEffect: "Server-side AI generates GDEvent objects inserted into events[]. Event types: Standard,Comment,While,Repeat,ForEach,Link,JsCode.",
    dsl: "evt:add {scene} \"description\"",
    example: {
      input: "{\"scene_name\":\"Level1\",\"events_description\":\"Collision Player Coin: destroy Coin, Score+1\"}",
      jsonBefore: "[{existing}]",
      jsonAfter: "[{existing},{conditions:[Collision(Player,Coin)],actions:[AddForce(Coin,Up,300),SetVariable(Score,+,1)]}]",
    },
  },

  {
    id: "evt:read",
    gdFunctionName: "read_scene_events",
    category: "event",
    description: "Read scene events as human-readable text. Read-only.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Scene to read." },
    ],
    jsonPaths: ["(read) events[]"],
    jsonEffect: "No JSON change. Returns indented text tree of conditions+actions.",
    dsl: "evt:read {scene}",
    example: {
      input: "{\"scene_name\":\"Level1\"}",
      jsonBefore: "(no change)",
      jsonAfter: "(no change)",
    },
  },

  {
    id: "var:set",
    gdFunctionName: "add_or_edit_variable",
    category: "variable",
    description: "Create or modify variable (global/scene/object scope). Supports nested paths.",
    params: [
      { name:"variable_scope", type:"string", required:true, description:"global|scene|object." },
      { name:"scene_name", type:"string", required:false, description:"Scene if scope=scene." },
      { name:"object_name", type:"string", required:false, description:"Object if scope=object." },
      { name:"operations", type:"json", required:true, description:"[{\"variable_name_or_path\":\"name\",\"value\":\"val\",\"type\":\"Number\"}]" },
    ],
    jsonPaths: ["variables[]","layouts[{s}].variables[]","objects[{n}].variables[]"],
    jsonEffect: "Creates/updates GDVariable {name,type,value}. type:2=String,3=Number,4=Boolean. Path for nested.",
    dsl: "var:set {scope} {name} = {value}",
    example: {
      input: "{\"variable_scope\":\"global\",\"operations\":[{\"variable_name_or_path\":\"Score\",\"value\":\"0\",\"type\":\"Number\"}]}",
      jsonBefore: "[{HighScore}]",
      jsonAfter: "[{HighScore},{name:Score,type:3,value:0}]",
    },
  },

  {
    id: "var:increment",
    gdFunctionName: "add_or_edit_variable",
    category: "variable",
    description: "Increment/decrement numeric variable. +N adds, -N subtracts.",
    params: [
      { name:"variable_scope", type:"string", required:true, description:"Scope." },
      { name:"scene_name", type:"string", required:false, description:"Scene." },
      { name:"object_name", type:"string", required:false, description:"Object." },
      { name:"operations", type:"json", required:true, description:"[{\"variable_name_or_path\":\"Score\",\"value\":\"+1\"}]" },
    ],
    jsonPaths: ["variables[{n}].value"],
    jsonEffect: "Reads current value, adds/subtracts, writes back.",
    dsl: "var:inc {scope} {name} {+N|-N}",
    example: {
      input: "{\"variable_scope\":\"global\",\"operations\":[{\"variable_name_or_path\":\"Score\",\"value\":\"+10\"}]}",
      jsonBefore: "{value:5}",
      jsonAfter: "{value:15}",
    },
  },

  {
    id: "var:delete",
    gdFunctionName: "add_or_edit_variable",
    category: "variable",
    description: "Delete a variable.",
    params: [
      { name:"variable_scope", type:"string", required:true, description:"Scope." },
      { name:"scene_name", type:"string", required:false, description:"Scene." },
      { name:"object_name", type:"string", required:false, description:"Object." },
      { name:"operations", type:"json", required:true, description:"[{\"variable_name_or_path\":\"name\",\"delete_this_variable\":true}]" },
    ],
    jsonPaths: ["variables[]"],
    jsonEffect: "Removes variable from scoped variables array.",
    dsl: "var:delete {scope} {name}",
    example: {
      input: "{\"variable_scope\":\"global\",\"operations\":[{\"variable_name_or_path\":\"OldVar\",\"delete_this_variable\":true}]}",
      jsonBefore: "[{Keep},{OldVar}]",
      jsonAfter: "[{Keep}]",
    },
  },

  {
    id: "layer:add",
    gdFunctionName: "change_scene_properties_layers_effects_groups",
    category: "layer",
    description: "Add a new layer to a scene.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Target scene." },
      { name:"changed_layers", type:"json", required:true, description:"[{\"name\":\"New\",\"operation\":\"add\",\"visibility\":true}]" },
    ],
    jsonPaths: ["layouts[{s}].layers[]"],
    jsonEffect: "Appends GDLayer {name,visibility,cameras:[{defaultSize:true,...}],effects:[]}.",
    dsl: "layer:add {scene} {name}",
    example: {
      input: "{\"scene_name\":\"Level1\",\"changed_layers\":[{\"name\":\"UI\",\"operation\":\"add\",\"visibility\":true}]}",
      jsonBefore: "[{base}]",
      jsonAfter: "[{base},{name:UI,visibility:true}]",
    },
  },

  {
    id: "layer:delete",
    gdFunctionName: "change_scene_properties_layers_effects_groups",
    category: "layer",
    description: "Delete a layer and all its instances.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Target scene." },
      { name:"changed_layers", type:"json", required:true, description:"[{\"name\":\"Target\",\"delete_this_layer\":true}]" },
    ],
    jsonPaths: ["layouts[{s}].layers[]","layouts[{s}].instances[]"],
    jsonEffect: "Removes layer + all instances on it.",
    dsl: "layer:delete {scene} {name}",
    example: {
      input: "{\"scene_name\":\"Level1\",\"changed_layers\":[{\"name\":\"Old\",\"delete_this_layer\":true}]}",
      jsonBefore: "[{base},{Old},{UI}]",
      jsonAfter: "[{base},{UI}]",
    },
  },

  {
    id: "layer:set-vis",
    gdFunctionName: "change_scene_properties_layers_effects_groups",
    category: "layer",
    description: "Toggle layer visibility.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Target scene." },
      { name:"changed_layers", type:"json", required:true, description:"[{\"name\":\"Layer\",\"operation\":\"update\",\"visibility\":false}]" },
    ],
    jsonPaths: ["layouts[{s}].layers[{n}].visibility"],
    jsonEffect: "Sets visibility boolean.",
    dsl: "layer:show|hide {scene} {name}",
    example: {
      input: "{\"scene_name\":\"Level1\",\"changed_layers\":[{\"name\":\"UI\",\"operation\":\"update\",\"visibility\":false}]}",
      jsonBefore: "visibility:true",
      jsonAfter: "visibility:false",
    },
  },

  {
    id: "effect:add",
    gdFunctionName: "change_scene_properties_layers_effects_groups",
    category: "effect",
    description: "Add visual effect to layer (blur, pixelate, glow, etc).",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Target scene." },
      { name:"changed_layer_effects", type:"json", required:true, description:"[{\"layer_name\":\"Layer\",\"operation\":\"add\",\"effect_type\":\"Pixelate\"}]" },
    ],
    jsonPaths: ["layouts[{s}].layers[{n}].effects[]"],
    jsonEffect: "Appends LayerEffect {effectType,doubleParameters:{},stringParameters:{},booleanParameters:{}}.",
    dsl: "effect:add {scene} {layer} {type}",
    example: {
      input: "{\"scene_name\":\"Level1\",\"changed_layer_effects\":[{\"layer_name\":\"\",\"operation\":\"add\",\"effect_type\":\"Pixelate\"}]}",
      jsonBefore: "[]",
      jsonAfter: "[{effectType:Pixelate}]",
    },
  },

  {
    id: "group:create",
    gdFunctionName: "change_scene_properties_layers_effects_groups",
    category: "object",
    description: "Create object group for event targeting.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Target scene." },
      { name:"changed_groups", type:"json", required:true, description:"[{\"name\":\"Group\",\"operation\":\"add\",\"object_names\":[\"A\",\"B\"]}]" },
    ],
    jsonPaths: ["layouts[{s}].objectsGroups[]"],
    jsonEffect: "Appends ObjectGroup {name,objects:[...]} to objectsGroups[].",
    dsl: "group:create {scene} {name} [objects]",
    example: {
      input: "{\"scene_name\":\"Level1\",\"changed_groups\":[{\"name\":\"Pickups\",\"operation\":\"add\",\"object_names\":[\"Coin\",\"Gem\"]}]}",
      jsonBefore: "[]",
      jsonAfter: "[{name:Pickups,objects:[Coin,Gem]}]",
    },
  },

  {
    id: "ctx:describe-instances",
    gdFunctionName: "describe_instances",
    category: "instance",
    description: "READ-ONLY: List all instances grouped by layer.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Scene." },
    ],
    jsonPaths: ["(read) instances[]"],
    jsonEffect: "No change. Returns: On base layer: 3 Coin, 1 Player.",
    dsl: "ctx:instances {scene}",
    example: {
      input: "{}",
      jsonBefore: "(no)",
      jsonAfter: "(no)",
    },
  },

  {
    id: "ctx:inspect-object",
    gdFunctionName: "inspect_object_properties_effects",
    category: "object",
    description: "READ-ONLY: Read all properties of an object type.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Scene." },
      { name:"object_name", type:"string", required:true, description:"Object." },
    ],
    jsonPaths: ["(read) objects[{n}]"],
    jsonEffect: "No change. Returns full property listing with types and values.",
    dsl: "ctx:object {scene} {name}",
    example: {
      input: "{}",
      jsonBefore: "(no)",
      jsonAfter: "(no)",
    },
  },

  {
    id: "ctx:inspect-scene",
    gdFunctionName: "inspect_scene_properties_layers_effects",
    category: "scene",
    description: "READ-ONLY: Read scene metadata, layers, effects, groups.",
    params: [
      { name:"scene_name", type:"string", required:true, description:"Scene." },
    ],
    jsonPaths: ["(read) layouts[{s}]"],
    jsonEffect: "No change. Returns full scene metadata.",
    dsl: "ctx:scene {scene}",
    example: {
      input: "{}",
      jsonBefore: "(no)",
      jsonAfter: "(no)",
    },
  },

  {
    id: "ctx:read-project",
    gdFunctionName: "read_game_project_json",
    category: "project",
    description: "READ-ONLY: Return full project JSON for AI context.",
    params: [
    ],
    jsonPaths: ["(read) entire project"],
    jsonEffect: "No change. Returns complete project.json.",
    dsl: "ctx:project",
    example: {
      input: "{}",
      jsonBefore: "(no)",
      jsonAfter: "(no)",
    },
  },

];

// ===== LOOKUP HELPERS =====

export function getOperationById(id: string): OperationDef | undefined {
  return ALL_OPERATIONS.find(op => op.id === id);
}

export function getOperationsByCategory(cat: OperationCategory): OperationDef[] {
  return ALL_OPERATIONS.filter(op => op.category === cat);
}

export function getOperationByGdFunction(name: string): OperationDef | undefined {
  return ALL_OPERATIONS.find(op => op.gdFunctionName === name);
}

export function getModifyingOperations(): OperationDef[] {
  return ALL_OPERATIONS.filter(op => !op.id.startsWith('ctx:'));
}

export function getReadOnlyOperations(): OperationDef[] {
  return ALL_OPERATIONS.filter(op => op.id.startsWith('ctx:'));
}

export const OPERATION_COUNT = ALL_OPERATIONS.length;

export const CATEGORIES: OperationCategory[] = [
  "project", "scene", "object", "instance", "event", "variable", "behavior", "layer", "effect"
];