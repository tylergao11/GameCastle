# AI-first Intent Runtime Bridge

## Purpose

GameCastle is not trying to make LLM2 a GDJS programmer. GDJS is event-driven,
but GameCastle should be intent-driven.

The critical downgrade is: GDJS is not the creation language. GDJS is target
code. LLM2 describes game intent, Intent Graph carries the world model, and the
compiler/bridge turns that semantic model into a runnable GDJS project.

The refactor target is a two-layer architecture:

1. **Intent Layer**: the AI-facing language and graph. It uses human game-world
   concepts such as thing, component, relation, near, direction, role, action,
   pattern, and distance.
2. **Runtime Bridge Layer**: the deterministic compiler/runtime bridge that
   expands intent into an internal target plan, GDevelop project data, generated scene
   code, HTML export files, and GDJS runtime adapters.

This keeps the user and LLM2 in the same low-cognition world model: "put the
attack button near the jump button on the right", not "place object at x=680
y=520 and add a mouse/touch event".

## Non-goals

- Do not expose GDJS instruction names to the normal LLM2 surface.
- Do not ask LLM2 for exact screen/world coordinates.
- Do not ask LLM2 to select event indexes.
- Do not make component implementation details part of prompt memory.
- Do not make internal target instructions the normal product surface.

The internal target plan remains compiler target code only. It is not user-facing, LLM2-facing,
or a second repair surface.

## Current Pipeline

The live target pipeline is:

```text
User prompt / iteration request
  -> LLM1 design intent
  -> LLM2 Intent DSL (canonical)
  -> Intent Graph
  -> Edit Constraint Graph
  -> Module + Component graph
  -> Semantic Placement plan
  -> GDJS Bridge plan
  -> internal target execution plan
  -> project.json + code*.js + runtime adapters
  -> GDJS Runtime
```

Product modules such as `core.platformer`, `core.shooter`, and
`shell.start_screen` are compiler truth and reusable skeletons. LLM2 selects
capability through AI-first Intent DSL; module ids stay inside compiler-owned
facts.

## Layer 1: Intent Layer

The Intent Layer is the only normal surface LLM2 should write. Its vocabulary
should be closer to game design and player-space language than to engine code.

### Minimal Concepts

| Concept | Meaning | Examples |
| --- | --- | --- |
| `thing` | A world/UI concept | `Player`, `CoinTrail`, `JumpButton`, `Inventory` |
| `component` | A reusable capability attached to or owned by a thing | `virtual_joystick`, `jump_button`, `inventory`, `health_bar` |
| `value` | Low-cognition parameter | `fast`, `near`, `far`, `easy`, `24 slots` |
| `relation` | How things connect | `controls`, `owns`, `opens`, `spawns`, `damages`, `collects`, `near` |
| `placement` | Semantic spatial intent | `near screen bottom-left`, `near Player front`, `pattern trail` |
| `edit` | Semantic change to an existing world fact | `adjust Fox placement above slightly` |
| `role` | Why a thing exists | `hero`, `enemy`, `collectible`, `primary_action`, `hud` |
| `action` | Gameplay input/effect | `move`, `jump`, `attack`, `shoot`, `open_inventory` |

### Canonical Intent DSL Shape

The exact parser can evolve, but the canonical LLM2-facing shape is natural
game intent, not machine ids or `key=value` fields:

```text
make a mobile platformer
give Player platformer movement
add joystick controls Player near screen bottom-left
add jump button controls Player near screen bottom-right
add attack button controls Player near jump button left
add inventory owned by Player with 24 slots near screen right
adjust Fox placement above slightly
place coins near Player front as trail count 8
place enemies near Player far front as guard count 3
```

The compiler normalizes this into typed ids and structured fields:

```json
{
  "kind": "addComponent",
  "componentId": "input.jump_button",
  "target": "Player",
  "action": "jump",
  "placement": {
    "anchor": "screen",
    "direction": "bottom-right"
  }
}
```

The compiler owns id selection and normalization. LLM2 should not emit module
ids, component ids, runtime adapter names, or `key=value` machine fields in the
normal product surface.

Prompt examples, fixtures, docs, and tests use the canonical Intent DSL form.

Current implementation status: `ai/intent-dsl.js` parses the first natural
Intent DSL slice and reuses `ai/intent-surface-guard.js` to reject machine and
backend forms. `ai/intent-compiler.js` compiles that first slice into a typed
Intent Graph and Compile ResultCard. `ai/placement-resolver.js` now resolves
`near/direction/distance/pattern` plus semantic placement edit constraints such
as `adjust Fox placement above slightly` into an internal Placement Plan with
owner trace and diagnostics. `ai/components/` now provides the first split
AI Manifest / Compiler Manifest component library, and `ai/component-catalog.js`
lets the compiler resolve natural aliases such as joystick, jump button, attack
button, backpack, and platformer movement without exposing component ids to
LLM2. `ai/gdjs-bridge.js` now emits the first Bridge Plan: product modules and
resolved component placements compile to the internal target plan, while touch,
joystick, and inventory runtime gaps become explicit runtime adapter
requirements. `ai/intent-runtime-codegen.js` now turns those adapter
requirements into `intent-runtime.js` for HTML export, and `pipeline.js` accepts
`--intent-fixture-file` as a real fixture entry into the Intent -> Bridge -> GDJS
internal target-plan path.

### Intent AST

The parser should produce a small typed AST:

```json
{
  "schemaVersion": 1,
  "commands": [
    {
      "kind": "addComponent",
      "componentId": "input.jump_button",
      "target": "Player",
      "action": "jump",
      "placement": {
        "near": "screen",
        "direction": "bottom-right"
      }
    }
  ]
}
```

The AST is still close to LLM2 output. It is not allowed to contain GDJS
instruction names, concrete coordinates, event indexes, or generated UUIDs.

## Intent Graph

The Intent Graph is the stable project-planning representation after parsing
and normalization.

Intent DSL is the input surface. Intent Graph is the system model. Do not let
the DSL text itself become the world model, or the compiler will drift back into
string handling.

```ts
type IntentGraph = {
  schemaVersion: 1;
  modules: ModuleIntent[];
  things: ThingNode[];
  components: ComponentNode[];
  relations: RelationEdge[];
  placements: PlacementIntent[];
  edits: EditConstraint[];
  values: SemanticValue[];
  bindings: BindingIntent[];
  requirements: RequirementRecord[];
  diagnostics: IntentDiagnostic[];
};
```

### Nodes

`things` represent world/UI concepts:

```ts
type ThingNode = {
  id: string;
  name: string;
  archetype:
    | "player"
    | "enemy"
    | "coin"
    | "ui"
    | "platform"
    | "inventory"
    | "projectile"
    | "spawner"
    | "unknown";
  role?: string;
  tags?: string[];
  space?: "screen" | "world" | "camera" | "ui";
  stableName?: string;
};
```

`components` represent reusable capabilities:

```ts
type ComponentNode = {
  id: string;
  componentId: string;
  target?: string;
  owner?: string;
  thing?: string;
  config: Record<string, unknown>;
};
```

### Edges

`relations` connect concepts:

```ts
type RelationEdge = {
  type:
    | "controls"
    | "owns"
    | "damages"
    | "collects"
    | "opens"
    | "spawns"
    | "near";
  from: string;
  to: string;
  params?: Record<string, unknown>;
};
```

`placements` express spatial intent:

```ts
type PlacementIntent = {
  subject: string;
  anchor: string;
  space: "screen" | "world" | "camera" | "ui" | "level_path" | "object_relative";
  direction?: string;
  distance?: "touching" | "near" | "small" | "medium" | "far" | "safe";
  pattern?: "single" | "trail" | "grid" | "stairs" | "circle" | "wave" | "line" | "arc" | "cluster" | "guard";
  count?: number;
  align?: "start" | "center" | "end" | "even";
  constraints?: string[];
};
```

`edits` express small semantic changes to existing world facts. They are not
numeric deltas and they are not GDJS commands:

```ts
type EditConstraint = {
  kind: "editConstraint";
  subject: string;
  dimension: "placement";
  operator: "nudge" | "increase" | "decrease";
  direction?: "above" | "below" | "left" | "right" | "front" | "behind";
  amount?: "slightly" | "small" | "normal" | "far";
  anchor?: "current" | string;
  preserve?: string[];
  owner: "placement-resolver";
};
```

`bindings` express action/runtime input:

```ts
type BindingIntent = {
  action: string;
  source: string;
  target: string;
  inputKind: "touch_button" | "joystick_axis" | "keyboard" | "runtime_event";
  params?: Record<string, unknown>;
};
```

Semantic values preserve low-cognition user terms before the compiler fills
hard numbers:

```ts
type SemanticValue = {
  subject: string;
  key: string;
  value: "near" | "far" | "fast" | "slow" | "easy" | "hard" | string | number | boolean;
  source?: string;
};
```

## Abstraction Inheritance Model

GameCastle should use inheritance for defaults and contracts, not for exposing
engine implementation. The model is composition-first, with deterministic
inheritance used to fill missing intent facts.

The inheritance chain is:

```text
Project defaults
  -> Product module preset
  -> Thing archetype
  -> Component compiler manifest
  -> Component instance intent
  -> Edit constraints
  -> Placement context
  -> GDJS Bridge target expansion
```

### What Inherits

| Layer | Inherits | Example |
| --- | --- | --- |
| Project defaults | canvas, safe area, world direction, camera mode | 800x600, side camera, left-to-right |
| Product module preset | gameplay skeleton, core objects, movement model | `core.platformer` provides `Player` and platformer movement |
| Thing archetype | role defaults and tags | `Player` inherits archetype `player`, role `hero` |
| Component compiler manifest | requirements, default placement, emitted actions, component-family parents | `input.jump_button` inherits `input.touch_button`; `system.inventory` inherits `system.storage` + `ui.panel` |
| Component instance intent | user/LLM overrides | `near=JumpButton direction=left` |
| Edit constraints | semantic changes against current world facts | `adjust Fox placement above slightly` reads current bounds locally |
| Placement context | concrete interpretation of direction and pattern | `front` resolves by camera/game type |
| GDJS Bridge target expansion | target object/event/runtime implementation | touch button -> GDJS object + input binding |

### Override Order

More specific intent overrides inherited defaults:

```text
explicit LLM2 command
  > component instance config
  > component compiler defaults
  > thing archetype defaults
  > module preset defaults
  > project defaults
```

For example:

```text
add jump button controls Player near screen bottom-right
```

inherits:

- project safe area and screen size;
- `core.platformer` movement semantics from the module preset;
- `Player` as a `player` archetype;
- `input.jump_button` default action plus touch-button shape, size, binding, and runtime adapter ownership from `input.touch_button`;
- explicit `near screen bottom-right` from the command.

System components can compose multiple compiler-only parents. For inventory,
LLM2 says only:

```text
add inventory owned by Player with 24 slots near screen right
```

The compiler resolves this to `system.inventory`, then inherits storage slots
and persistence from `system.storage`, panel shape/size/layer from `ui.panel`,
and bridge `configExpansions` for the target InventorySlots variable. None of
those parent ids or target variable details belong in the Intent DSL.

Runtime adapter configuration follows the same rule. Button fallback keys,
button labels, joystick input names, panel titles, and panel dimensions are
sealed component defaults. The generated intent runtime consumes the config
from the Bridge Plan; it must not infer labels or keys from component ids.
Runtime adapter route metadata is manifest-owned too: `gdjsBridge.adapterRoutes`
records the owner, mechanism, route id, route owner, and route mechanism for
each adapter id. The GDJS bridge copies that evidence into the Bridge Plan
instead of maintaining an adapter-name switch in code.
The runtime adapter requirement contract also checks adapter-specific config:
touch buttons require key/label/shape/size/color, joysticks require input names
and visual sizing, and inventory adapters require slots, persistence, panel
title, and panel dimensions. Codegen should reject missing config through the
contract rather than infer it from action names or adapter ids.
Component object emission uses the same ownership. `gdjsBridge.objectSpec`
declares target object type plus object, layer, and placement emission route
evidence. Shape, color, size, and layer are inherited component defaults. The
bridge should assemble target DSL from those manifest facts, not choose a GDJS
object type, visual fallback, layer route, or component placement route itself.

The bridge then emits target code. GDJS never becomes a parent layer in the
AI-facing model; it is only the target backend.

### Inheritance Guardrails

- Inheritance fills missing semantic facts inside the canonical Intent DSL form.
- Inherited facts must be visible in the Compile ResultCard.
- Auto-added components or defaults must be recorded under `autoAdded`.
- Component inheritance must not leak runtime adapter names into the AI
  Manifest.
- Abstract component parents must be filtered out of LLM2 prompt cards and
  natural alias resolution.
- Runtime adapters must consume inherited config, not infer semantics from
  component ids.
- Runtime adapter route evidence must live in component manifests, not in a
  bridge-side adapter switch table.
- Runtime adapter config must be complete before codegen; codegen must not
  invent keys, labels, inputs, or panel metadata from action or adapter names.
- Component object specs must live in compiler manifests; bridge code must not
  invent target object types, visual defaults, layer routes, or component
  placement routes.
- GDJS object/event details must not be inherited upward into Intent Graph.

## DSL Growth Control

Abstracting Intent DSL and connecting GDJS are two coupled hard problems. GDJS
integration will reveal cases that feel hard to classify or express. The default
answer must not be "add another DSL primitive".

Intent DSL should stay small. Most complexity should be absorbed by inheritance,
rewriting, component manifests, placement contracts, bridge target rewrites, and
diagnostics.

### Admission Rule

A new LLM2-facing DSL concept is allowed only when all of these are true:

1. It names a reusable game-world concept that users naturally understand.
2. It cannot be expressed with existing `thing`, `component`, `relation`,
   `placement`, `value`, `role`, or `action`.
3. It is not merely a GDJS limitation, event shape, object field, runtime
   adapter option, coordinate rule, or generated-code workaround.
4. It can compile through a deterministic owner with a ResultCard trace.

If any condition fails, do not grow the DSL. Route the issue to the proper lower
owner.

### Classification Table

| Problem discovered while bridging to GDJS | Correct owner | Do not solve by |
| --- | --- | --- |
| User says a synonym such as "hero" or "main character" | symbol rewrite / aliases | adding new command grammar |
| A component needs a missing default | inheritance / compiler manifest | adding more LLM2 fields |
| A UI/world position is ambiguous | Placement Contract | asking LLM2 for coordinates |
| A component needs extra generated objects/events | component expansion / GDJS bridge | exposing GDJS events to LLM2 |
| A GDJS instruction has awkward parameters | GDJS bridge target rewrite | adding instruction-shaped Intent DSL |
| A runtime adapter needs internal config | Compiler Manifest | showing adapter names to LLM2 |
| A module/component combination is invalid | requirement validation diagnostic | letting LLM2 edit internal target instructions |
| A genuinely new reusable game feature appears | new component or module | expanding generic DSL syntax |

This is the pressure valve that keeps Intent DSL from becoming infinite.

The machine-checkable version of this gate lives in
`ai/intent-routing-rules.json` and is validated by
`ai/check-intent-routing-rules.js`, which is part of `npm run check:ai`.
Future `intent-dsl.js` and `gdjs-bridge.js` code should reuse
`ai/intent-surface-guard.js` instead of reimplementing prohibited-surface or
bridge-issue routing logic.

## Rewrite Contract

Rewriting is the main mechanism that keeps the AI surface natural while the
compiler stays deterministic.

```text
natural LLM2 phrase
  -> canonical Intent AST
  -> symbol ids
  -> inherited defaults and overrides
  -> typed Intent Graph
  -> component expansion
  -> bridge target rewrite
  -> internal target plan / GDJS artifacts
```

### Rewrite Types

| Rewrite | Example | Owner |
| --- | --- | --- |
| Phrase to intent | `make a mobile platformer` -> module intent for platformer + mobile controls | intent parser/compiler |
| Alias to symbol | `hero` -> `Player` thing id | symbol resolver |
| Natural component to component id | `jump button` -> `input.jump_button` | component catalog |
| Natural placement to contract | `near screen bottom-right` -> UI safe-area placement | placement resolver |
| Semantic value to concrete value | `fast` -> module/component speed default | inheritance/default resolver |
| Action to binding | `controls Player jump` -> touch input binding to `jump` | binding compiler |
| Component to target facts | `inventory owned by Player` -> variables, UI objects, open binding | component expander |
| Target rewrite | bridge maps awkward GDJS event/instruction shapes to generated target code | GDJS bridge |

### Override Contract

Overrides are explicit, local, and traceable:

- A user/LLM phrase can override inherited semantic defaults.
- An override must attach to a thing, component, relation, placement, or action.
- A bridge workaround cannot override upward into Intent Graph.
- Every override must appear in the Compile ResultCard as either `overrides` or
  `autoAdded`.

### Bridge Feedback Contract

When GDJS integration exposes a problem, the bridge emits a diagnostic with:

```json
{
  "stage": "GDJS Bridge Apply",
  "category": "target-rewrite-required",
  "owner": "gdjs-bridge",
  "intentSubject": "JumpButton",
  "message": "Touch input requires a runtime adapter instead of a direct GDJS event.",
  "suggestedAction": "expand component runtime adapter"
}
```

Only diagnostics with `owner=llm2-intent` should ask LLM2 to change Intent DSL.
All other diagnostics stay below the AI surface.

## GDJS Bridge Issue Routing Playbook

Use this playbook when the GDJS bridge hits a concrete implementation problem.
The first question is always: "Is this a new game-world concept, or just target
backend complexity?"

| GDJS integration problem | Correct route | ResultCard evidence |
| --- | --- | --- |
| Touch controls require multi-touch state that is awkward as GDJS events | Runtime adapter + bridge target rewrite | `rewrites: touch button -> adapter binding` |
| Joystick needs dead zone, radius, clamp, and axis smoothing | Compiler Manifest defaults/inheritance | `resolved: deadZone standard, radius medium` |
| A button should work on different screen sizes | Placement Contract | `placement: ui.screen.safeArea.bottom-right` |
| Two UI buttons overlap | Placement resolver avoidance | `diagnostics: placement-overlap-resolved` |
| `front` differs between platformer and top-down shooter | Placement context inherited from module preset | `rewrites: front -> world.right` or `front -> player.forward` |
| GDJS collision mask needs generated shape setup | Component expansion / GDJS bridge | `emitted: collision mask setup` |
| GDJS instruction parameters are ordered oddly | GDJS bridge target rewrite | `ownerTrace: GDJS Bridge Apply` |
| Inventory needs storage variables plus UI grid | Component expansion | `emitted: variables + UI panel + open binding` |
| Inventory persistence needs save/load details | Runtime adapter or component compiler manifest | `runtimeAdapters: inventory-storage` |
| Attack button should trigger melee in one game and projectile in another | Action binding + inherited module combat model | `resolved: action attack -> projectile_attack` |
| Touch input must feed tick intent frames | binding compiler + tick runtime adapter | `emitted: action binding to tick intent input` |
| A GDJS runtime file/include is missing | GDJS bridge / html exporter / gdevelop truth | `diagnostics.owner: gdjs-bridge` |
| User asks for a new reusable system such as crafting | New component/module candidate | `diagnostics.owner: component-catalog` |

### Anti-patterns

Do not add LLM2-facing syntax for these:

- `on touch button pointerId=...`
- `set gdjs parameter ...`
- `place at x y`
- `use runtime adapter ...`
- `include gdjs file ...`
- `event index ...`
- `collision mask rectangle ...`

Each of these is target/backend language, not game-world intent.

### Boundary Test

Before adding a new DSL concept, write the phrase in plain user language:

```text
Can a non-developer reasonably ask for this as a game feature?
```

If yes, it may be a component/module/action/relation candidate. If no, it is
probably bridge, placement, manifest, inheritance, or runtime adapter work.

## Component Library

Components are the AI-first sibling of product modules. Product modules answer
"what game skeleton is this?" Components answer "what reusable capability is
attached to the world?"

Suggested directory:

```text
ai/components/
  schema.json
  input.virtual_joystick.json
  input.jump_button.json
  input.attack_button.json
  system.inventory.json
  ui.health_bar.json
  combat.projectile_attack.json
  spawn.enemy_wave.json
  collectible.coin_trail.json
```

### Manifest Shape

Component manifests have two views:

- **AI Manifest**: shown to LLM2. It explains the game-world capability,
  examples, aliases, and simple requirements.
- **Compiler Manifest**: consumed by deterministic compiler code. It contains
  exact requirements, defaults, emitted actions, placement contracts, runtime
  adapters, and bridge expansion data.

LLM2 should not see runtime adapter details unless they are intentionally
summarized as a game-world capability.
The same boundary applies to iteration context. `ProjectWorld.intent` may store
component ids, bridge routes, runtime adapter summaries, and emitted target
counts for audit, but Intent Commander prompts must receive only the
AI-visible projection owned by `ai/project-world.js`. That projection keeps
prior safe Intent lines, thing names, relations, natural placements, object
names, and run summaries; it drops coordinates, GDJS object types, bridge plans,
runtime adapter ids, component ids, internal contract names, and target
execution commands. Intent repair prompts must follow the same rule. When a
previous Intent DSL contains
prohibited machine syntax, the repair prompt may say that such a line was
omitted, but it must not repeat the component id, adapter id, coordinate, or
target command that caused the failure.
LLM1 design briefs are natural at their own contract boundary too. Their
creative object names, roles, rules, controls, and rough placements may guide
LLM2, but numeric `x/y`, object `width/height`, variable values, and
implementation-like visual defaults are rejected by the DesignBrief validator.
Older saved briefs are sanitized into coarse natural placement such as
`screen bottom-right` before they enter RequirementModel history or Intent
Commander prompts.

### AI Manifest

```json
{
  "schemaVersion": 1,
  "id": "input.virtual_joystick",
  "name": "Virtual Joystick",
  "kind": "input",
  "description": "Adds a screen joystick that controls character movement.",
  "requires": ["a controllable character with movement"],
  "examples": [
    "add joystick controls Player near screen bottom-left"
  ],
  "aliases": ["joystick", "movement stick", "virtual stick", "touch move"]
}
```

### Compiler Manifest

```json
{
  "schemaVersion": 1,
  "id": "input.virtual_joystick",
  "requires": {
    "target": ["thing"],
    "targetProvides": ["movement"]
  },
  "provides": ["touch_movement", "mobile_controls"],
  "defaultPlacement": {
    "space": "ui",
    "anchor": "screen",
    "direction": "bottom-left",
    "distance": "safe"
  },
  "emits": ["move_left", "move_right", "move_up", "move_down"],
  "placement": {
    "space": "ui",
    "allowedDirections": ["bottom-left", "bottom-right"]
  },
  "runtime": {
    "adapter": "gdjs.virtual_joystick",
    "gdjsBridge": "input.virtualJoystick"
  },
  "compiler": {
    "internalDsl": []
  }
}
```

### First Component Set

The first implementation slice should be intentionally narrow:

- `input.virtual_joystick`: touch movement source.
- `input.jump_button`: touch button mapped to `jump`.
- `input.attack_button`: touch button mapped to `attack` or `shoot`.
- `system.inventory`: player-owned item storage plus UI opening relation.
- `ui.health_bar`: UI state display bound to a variable.
- `collectible.coin_trail`: semantic placement pattern for pickups.
- `spawn.enemy_wave`: timed or directional enemy spawn intent.

## Placement Contract

Placement Contract is the key AI-first spatial abstraction. The user/LLM2 says
"near whom, in which direction, how far, and in what pattern"; the resolver owns
coordinates, spacing, alignment, safe areas, and overlap handling.

It must answer four questions before emitting coordinates:

1. Does the subject belong to UI space or world space?
2. What is the anchor: screen, camera, object, path, ground, or safe area?
3. How does `direction` mean in the current game type and camera context?
4. Does the placement need avoidance, alignment, repetition, or pattern layout?

### Placement Vocabulary

| Field | Meaning | Examples |
| --- | --- | --- |
| `near` | Anchor | `screen`, `camera`, `Player`, `Ground`, `Path`, `JumpButton`, `safe_area` |
| `direction` | Relative side or progression | `left`, `right`, `above`, `below`, `front`, `behind`, `bottom-right`, `far-front` |
| `distance` | Semantic gap | `touching`, `near`, `medium`, `far`, `safe` |
| `pattern` | Repetition layout | `line`, `trail`, `arc`, `cluster`, `stairs`, `guard`, `wave` |
| `space` | Coordinate domain | `screen`, `world`, `camera`, `level_path`, `object_relative` |
| `count` | Repetition amount | `3`, `8`, `12` |

### Direction Context

Directions are resolved by context:

- In `screen` space, `bottom-right` means the safe-area lower right of the
  current viewport.
- In `world` space, `front` means the main level progression direction.
- In `object_relative` space, `left` means left of the anchor object.
- In `level_path` space, `along` means along the authored route or generated
  progression curve.

LLM2 should not decide this context directly unless it is necessary. The
resolver can infer it from anchors:

- `near=screen` -> `screen`
- `near=Player` -> `object_relative` or `world`
- `near=Path` -> `level_path`
- `near=Camera` -> `camera`

### Placement Context

The resolver interface should reserve these facts even before every one is fully
implemented:

```ts
type PlacementContext = {
  screenSize: { width: number; height: number };
  safeArea?: { left: number; right: number; top: number; bottom: number };
  cameraMode?: "side" | "top_down" | "isometric" | "runner" | "static";
  playerFacing?: "left" | "right" | "up" | "down";
  movementDirection?: "left_to_right" | "right_to_left" | "top_to_bottom" | "free";
  worldGravity?: "down" | "none";
  groundPlane?: string;
  objectBounds: Record<string, { x: number; y: number; width: number; height: number }>;
  occupiedRegions?: Array<{ space: string; x: number; y: number; width: number; height: number }>;
};
```

For example:

```text
add joystick controls Player near screen bottom-left
```

normalizes to:

```json
{
  "subject": "Joystick",
  "space": "ui",
  "anchor": "screen.safeArea",
  "direction": "bottom-left",
  "margin": "medium"
}
```

while:

```text
place coins near Player front trail count 8
```

normalizes to:

```json
{
  "subject": "CoinGroup",
  "space": "world",
  "anchor": "Player",
  "direction": "front",
  "pattern": "trail",
  "count": 8,
  "distance": "medium"
}
```

`front` is not universal. It means different things in a platformer, top-down
shooter, runner, and arena game. The resolver must use context, not string
replacement.

### Resolver Output

The placement resolver produces concrete placements and constraints:

```json
{
  "subject": "JumpButton",
  "space": "screen",
  "anchor": "screen.safeArea",
  "x": 704,
  "y": 504,
  "layer": "UI",
  "constraints": ["insideSafeArea", "avoidOverlap"]
}
```

The resolver should also preserve traceability:

```json
{
  "source": {
    "near": "screen",
    "direction": "bottom-right",
    "distance": "safe"
  },
  "resolved": {
    "x": 704,
    "y": 504
  }
}
```

For repeated semantic placements such as trails or guard lines, the resolver
also emits bridge-facing metadata:

```json
{
  "emission": {
    "mechanism": "semantic-group-placement-rewrite",
    "routeId": "semantic-pattern-placement",
    "routeMechanism": "placement-contract"
  }
}
```

The bridge copies this metadata onto emitted target DSL lines. It must not
invent a separate route label for semantic group placement.

For semantic edits, the resolver uses the current object bounds from placement
context or ProjectWorld and produces a planned edit:

```json
{
  "subject": "Fox",
  "dimension": "placement",
  "direction": "above",
  "amount": "slightly",
  "from": { "x": 240, "y": 320, "width": 64, "height": 64 },
  "resolved": { "x": 240, "y": 304 },
  "emission": {
    "mechanism": "semantic-placement-edit-rewrite",
    "routeId": "semantic-placement-edit",
    "routeMechanism": "edit-constraint-planner"
  }
}
```

The numbers in `from` and `resolved` are runtime planning facts, not LLM2
surface. LLM2 should write the semantic edit line; the resolver owns the step
size, no-overlap policy, and target coordinates.

## Runtime Bridge Layer

The bridge converts Intent Graph facts into GDJS-owned artifacts. It is
deterministic code, not an LLM role.

## Multi-stage Intent Compiler

The compiler must not jump directly from Intent DSL to GDJS. It should use
explicit stages so diagnostics can point to the right owner:

```text
Intent DSL
  -> Parse
  -> Normalize
  -> Resolve Symbols
  -> Build Intent Graph
  -> Validate Requirements
  -> Fill Defaults
  -> Resolve Placement
  -> Expand Components
  -> Emit Target Plan
  -> GDJS Bridge Apply
```

### Resolve Symbols

Symbol resolution unifies user/AI names into stable graph ids. Examples:

```text
Player
hero
main character
```

can all resolve to one `ThingNode.id` when the context proves they refer to the
same subject. This stage owns aliases and current-world lookup; later stages
must use ids, not raw names.

### Validate Requirements

Requirements are checked before expansion. For example:

```text
add joystick controls Player near screen bottom-left
```

requires `Player` to provide movement. If movement is missing, the compiler has
two possible policies:

- `strict`: fail with `Player missing movement component`.
- `auto`: add a default movement component and record it in the result.

Early implementation may use `auto` for smoother generation, but auto-filled
facts must be explicit in the Compile ResultCard.

### Expand Components

Expansion turns intent into target facts:

```text
add jump button controls Player near screen bottom-right
```

may expand into:

```text
create ui object JumpButton
place JumpButton at resolved position
bind touch JumpButton to Player.jump
ensure Player has platformer movement
```

LLM2 should not see or maintain this expansion.

### Bridge Responsibilities

1. Validate component requirements against modules and ProjectWorld.
2. Expand components into internal objects, variables, layers, events, and
   runtime adapter hooks.
3. Resolve semantic placement to concrete positions.
4. Generate action bindings such as touch button -> `jump`, joystick axis ->
   movement input, inventory button -> open panel.
5. Emit the internal target execution plan.
6. Let existing executors produce GDevelop project data.
7. Let runtime-codegen/html-exporter produce GDJS scene functions and HTML.

### Bridge Plan

The bridge should produce an auditable plan before mutation:

```json
{
  "schemaVersion": 1,
  "intentHash": "stable-hash",
  "componentExpansions": [],
  "placementResolutions": [],
  "internalDslLines": [],
  "runtimeAdapters": [],
  "diagnostics": []
}
```

This plan is the future approval-gate review unit. It should make visible:

- what LLM2 asked for;
- what component manifests were used;
- what placements were resolved;
- what internal target instructions will be executed;
- what runtime adapters will be copied or generated;
- which owner handles repair if a step fails.

## Compile ResultCard

Every compile run must produce a ResultCard. This is the proof object for
debugging, approval gate review, and owner-routed repair.

```json
{
  "schemaVersion": 1,
  "input": [
    "add joystick controls Player near screen bottom-left"
  ],
  "resolved": [
    {
      "target": "Player",
      "component": "input.virtual_joystick",
      "placement": "ui.screen.bottom-left",
      "requirements": ["Player.movement ok"]
    }
  ],
  "autoAdded": [],
  "rewrites": [
    {
      "from": "joystick",
      "to": "input.virtual_joystick",
      "owner": "component catalog"
    }
  ],
  "overrides": [],
  "emitted": [
    "create object VirtualJoystick",
    "place VirtualJoystick at 96,504",
    "bind joystick axis to Player movement"
  ],
  "diagnostics": [],
  "warnings": [],
  "ownerTrace": [
    { "stage": "Resolve Symbols", "owner": "intent-compiler" },
    { "stage": "Resolve Placement", "owner": "placement-resolver" },
    { "stage": "Emit Target Plan", "owner": "gdjs-bridge" }
  ]
}
```

When a bug appears, the ResultCard should help answer whether the fault came
from LLM2 intent, Intent Graph normalization, placement resolution, component
expansion, GDJS bridge generation, or runtime execution.

### GDJS Output Boundary

The GDJS bridge may emit:

- internal line DSL;
- GDevelop `project.json` objects, layouts, instances, variables, events;
- generated `code*.js` scene functions;
- input/runtime adapter files;
- `html-export-manifest.json` script includes.

The bridge must not expose these as normal LLM2 prompt surface.

## Owner Map

| Area | Owner |
| --- | --- |
| LLM2 prompt surface | `dsl-agent.js` Intent Commander |
| Intent DSL parser | `ai/intent-dsl.js` |
| Intent Graph normalization | `ai/intent-compiler.js` |
| Component truth | `ai/components/*.json` and `ai/component-catalog.js` |
| Product module truth | `ai/product-modules/*.json` |
| Semantic placement | `ai/placement-resolver.js` |
| GDJS bridge plan | `ai/gdjs-bridge.js` |
| Intent runtime adapters | `ai/intent-runtime-codegen.js` and `intent-runtime.js` |
| Target-plan execution | `ai/pipeline.js` executor until split |
| Project state summary | `ai/project-world.js` |
| GDevelop runtime truth | `ai/gdevelop-truth.js` and `runtime-truth.json` |
| Browser runtime export | `ai/runtime-codegen.js`, `ai/html-exporter.js`, `engine/` |

## Repair Model

Repair should happen at the highest owner that can fix the issue:

| Failure | Repair owner |
| --- | --- |
| Unknown intent command | LLM2 Intent repair |
| Unknown component id | LLM2 Intent repair or component catalog update |
| Missing target object | Intent compiler if inferable, otherwise LLM2 repair |
| Unsupported component/module combination | owner-routed compiler/component diagnostic |
| Placement overlap or missing anchor | Placement resolver if fallback exists, otherwise owner-routed diagnostic |
| Unsupported GDJS object/behavior/instruction | GDJS bridge or GDevelop truth update |
| Internal target command execution failure | bridge/runtime/executor owner; do not ask LLM2 for internal target instructions |

The model should avoid teaching LLM2 to edit target-specific GDJS symptoms. LLM2 may
repair natural Intent DSL when the diagnostic owner is `llm2-intent`; after
Intent has compiled to target code, failures stay below the AI surface and are
handled by the owning compiler, bridge, runtime adapter, or executor layer.

## Runtime Adapter Hardening

- Add touch/button/joystick adapters as runtime-owned code.
- Map UI controls to the same action/input model used by network sync.
- Ensure mobile controls, keyboard controls, and replay inputs share action
  names rather than duplicating gameplay events.

## Verification Gates

The refactor is not complete until these can be proven by code/tests:

- LLM2 can produce Intent DSL without concrete coordinates.
- The live LLM2 path uses Intent DSL as its only product surface.
- Intent fixtures and live requests use the canonical Intent DSL surface.
- Intent parser rejects GDJS instruction names and event indexes in normal
  intent commands.
- Component catalog validates required/provided capabilities.
- Placement resolver converts `near/direction/distance/pattern` to coordinates
  with traceability.
- Placement resolver converts semantic edits such as "up a little" into planned
  target positions without asking LLM2 for numeric deltas.
- GDJS bridge compiles Intent Graph into the internal target plan.
- Intent DSL fixtures produce `project.json`, `code*.js`, and `game.html`.
- Approval gate includes Intent DSL, Intent Graph, Bridge Plan, compiled
  internal target plan, and dry-run execution report.
- LLM2 repair uses owner-routed diagnostics instead of immediately dropping to
  internal target instructions.
- Intent execution failures record the `ExecutionReport` and route the issue to
  the lower-layer owner; there is no LLM internal-target repair fallback.

## Design Principle

GDJS events are target code. GameCastle Intent DSL is source code for AI.

The user says "put coins ahead of the player" or "add jump and attack buttons
on the right". The Intent Layer records that meaning. The Runtime Bridge does
the engine work.
