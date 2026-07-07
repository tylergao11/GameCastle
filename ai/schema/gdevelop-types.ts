/**
 * GDevelop project.json JSON Schema TypeScript types
 * Based on GDevelop source reverse-engineering.
 * Used by JSON engine for type-safe project manipulation.
 */

export type RGBColor = { r: number; g: number; b: number };
export type Expression = string;
export interface InstructionType { inverted: boolean; value: string; }

export type ResourceKind = 'image' | 'audio' | 'font' | 'video' | 'json' | 'tilemap' | 'tileset' | 'model3D' | 'atlas' | 'spine' | 'bitmapFont';

export interface ProjectResource { kind: ResourceKind; name: string; metadata: string; file: string; }
export interface GDVariable { name: string; type: number; value?: string; children?: GDVariable[]; }
export interface GDBbehavior { name: string; type: string; parameters?: { name: string; value: string }[]; }
export interface SpriteFrame { img: string; }
export interface SpriteAnimation { name: string; directions: { sprites: SpriteFrame[] }[]; }
export interface GDObject {
  name: string; type: string;
  variables?: GDVariable[]; behaviors?: GDBbehavior[]; effects?: any[];
  animations?: SpriteAnimation[]; updateIfNotVisible?: boolean;
  string?: string; font?: string; characterSize?: number; color?: RGBColor; bold?: boolean; italic?: boolean;
  [key: string]: any;
}
export interface ObjectGroup { name: string; objects: string[]; }
export interface LayerCamera { defaultSize: boolean; defaultViewport: boolean; height: number; width: number; viewportBottom: number; viewportLeft: number; viewportRight: number; viewportTop: number; }
export interface LayerEffect { name: string; effectType: string; doubleParameters: Record<string,number>; stringParameters: Record<string,string>; booleanParameters: Record<string,boolean>; }
export interface GDLayer { name: string; visibility: boolean; cameras: LayerCamera[]; effects: LayerEffect[]; }
export interface GDInstance {
  angle: number; customSize: boolean; height: number; width: number;
  layer: string; locked: boolean; name: string; x: number; y: number; zOrder: number;
  numberProperties: { name:string; value:number }[];
  stringProperties: { name:string; value:string }[];
  initialVariables: GDVariable[]; persistentUuid?: string;
}
export interface GDInstruction { type: InstructionType; parameters: Expression[]; subInstructions?: GDInstruction[]; }
export interface GDEvent {
  disabled: boolean; folded: boolean; type: string;
  conditions: GDInstruction[]; actions: GDInstruction[]; events: GDEvent[];
  whileConditions?: GDInstruction[]; comment?: string;
}
export interface GDLayout {
  name: string; instances: GDInstance[]; objects: GDObject[];
  events: GDEvent[]; layers: GDLayer[]; variables: GDVariable[];
  objectsGroups: ObjectGroup[]; title?: string;
  stopSoundsOnStartup?: boolean; r?: number; g?: number; b?: number;
  [key: string]: any;
}
export interface ProjectProperties {
  name: string; author: string; windowWidth: number; windowHeight: number;
  maxFPS: number; minFPS: number; verticalSync: boolean;
  extensions: { name: string }[]; currentPlatform: string;
  [key: string]: any;
}
export interface GDProject {
  firstLayout: string;
  gdVersion: { build: number; major: number; minor: number; revision: number };
  properties: ProjectProperties;
  resources: { resources: ProjectResource[]; resourceFolders: any[] };
  objects: GDObject[]; objectsGroups: ObjectGroup[];
  variables: GDVariable[]; layouts: GDLayout[];
  externalEvents: any[]; externalLayouts: any[]; externalSourceFiles: any[];
}

// Variable type constants
export const VAR_TYPE = { UNKNOWN:0, STRING:2, NUMBER:3, BOOLEAN:4, STRUCTURE:5, ARRAY:6 } as const;