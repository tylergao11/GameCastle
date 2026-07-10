var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

var DOCS = [
  'README.md',
  'ai/README.md',
  'docs/architecture.md',
  'docs/ai-first-intent-runtime-bridge.md',
  'docs/module-composition.md',
  'docs/roadmap.md',
  'ai/check-gdjs-bridge.js',
];

var FORBIDDEN_PRIMARY_SURFACE_PHRASES = [
  'The live LLM2 path is also Module DSL first',
  'LLM2 Module Patch Commander',
  'LLM2 Module DSL.',
  'LLM2 deterministic DSL patch',
  'translating creative intent into Module DSL',
  'DSLAgent output containing Module DSL patch text',
  'repairs Module DSL compile failures and inherits the DSL model',
  'LLM2 receives those interaction contracts',
  'Compile creative intent and ProjectWorld into Module DSL',
  'LLM2 may adjust coordinates',
  'LLM2 may add',
  'LLM2 may randomize position',
  'LLM2: 读取模块能力库并生成确定性 DSL patch',
  '翻译层: LLM2 把高层意图编译为确定性 DSL patch',
  'LLM2 输出应是 DSL patch',
  '让 LLM2 生成 DSL/operation patch',
  '追加修复 DSL diff',
  '只追加修复 DSL diff',
  '将在线 LLM2 主路径切到 Module Patch Commander',
  '明确 LLM2 读取模块能力库、DSL 能力',
  'LLM2/Commander 级 Module DSL parser',
  'LLM2 可以编译的行式 DSL',
  'LLM2：拿 `buildCompilerPromptSection()`，包括结构化能力卡和 DSL 命令表',
  'LLM2 translate to DSL',
  '--module-dsl-file',
  '--dsl-file',
  '--intent-dsl-file',
  '--internal-legacy-fixture',
  'test-dsl-fixtures.js',
  'module-dsl.js',
  'ModuleDslPatch',
  'dslInternalRepair',
  'LLM2 internal DSL repair',
  'internal DSL repair',
  'buildInternalExecutionRepairPrompt',
  'buildInternalDslRepairSystemPrompt',
  'view/patch',
  'applyNodeStatePatch',
  'path-object patch',
  'patch runner',
  'compiler.slotPatches',
  'compiler.configurePatches',
  'module DSL and GDJS bridge code remain stable',
  'AI 只负责从候选集选择模块',
  '继续迭代当前 output/project.json',
  '必须存在 `output/project.json`，并读取现有 `ProjectWorld`',
  'legacy/internal 低层执行语言文档',
  '迁移测试目标',
  'DSL 文件测试状态机',
  'Intent DSL patch',
  'natural Intent patch',
  'gameplay patch',
  'compiled Intent patch',
  'LLM2 才看到模块能力库、DSL 能力、参数规则、当前项目状态和 LLM1 的创意输出。它负责把意图编译成确定性 patch。',
  'LLM2 需要的是可编译的模块能力和 DSL 规则',
  '上一轮 DSL diff',
  '只允许输出失败命令所需的新增 DSL diff',
  'LLM2 读取结构化能力卡、DSL 示例、约束和同步标记。',
];

var FORBIDDEN_PRIMARY_SURFACE_PATTERNS = [
  /DSLAgent[^\n]*Module DSL/,
  /LLM2[^\n]*DSL\/operation patch/,
  /区分[^\n]*DSL patch/,
];

var REQUIRED_BOUNDARY_PHRASES = {
  'README.md': [
    'Current AI-first boundary: LLM2 writes natural Intent DSL only.',
  ],
  'ai/README.md': [
    'The live LLM2 product surface is Intent DSL.',
    'Low-level DSL is a compiler/runtime',
    'target shape only.',
  ],
  'docs/architecture.md': [
    'Current AI-first override: LLM2 output is AI-first Intent DSL.',
  ],
  'docs/ai-first-intent-runtime-bridge.md': [
    'live LLM2 path now selects them through AI-first Intent DSL',
  ],
};

function main() {
  var failures = [];
  DOCS.forEach(function(relativePath) {
    var fullPath = path.join(ROOT, relativePath);
    var text = fs.readFileSync(fullPath, 'utf8');
    FORBIDDEN_PRIMARY_SURFACE_PHRASES.forEach(function(phrase) {
      if (text.indexOf(phrase) >= 0) {
        failures.push(relativePath + ': ' + phrase);
      }
    });
    FORBIDDEN_PRIMARY_SURFACE_PATTERNS.forEach(function(pattern) {
      if (pattern.test(text)) {
        failures.push(relativePath + ': ' + pattern.toString());
      }
    });
    (REQUIRED_BOUNDARY_PHRASES[relativePath] || []).forEach(function(phrase) {
      if (text.indexOf(phrase) < 0) {
        failures.push(relativePath + ': missing required boundary phrase: ' + phrase);
      }
    });
  });
  if (failures.length) {
    throw new Error('Intent docs still teach stale LLM2 machine/old-command primary forms:\n' + failures.join('\n'));
  }
  console.log('[IntentDocBoundary] docs do not teach stale LLM2 machine/old-command primary forms');
}

main();
