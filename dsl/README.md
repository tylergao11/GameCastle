# Intent DSL

行式 Intent DSL 是自然游戏意图与确定性编译器之间的中间表示，不是用户或 LLM2 的底层引擎接口。

```text
verb target key=value key=value ...
on <trigger> -> <action1>, <action2>
every <N>s -> <action1>, <action2>
```

解析与验证入口见 [ai/intent-dsl.js](../ai/intent-dsl.js)，封闭槽位到 DSL 的唯一渲染入口见 [ai/intent-slots.js](../ai/intent-slots.js)。示例与离线 fixture 位于 [ai/fixtures/](../ai/fixtures/)。
