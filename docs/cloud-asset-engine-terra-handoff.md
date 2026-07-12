# CloudAssetEngine Terra 实现交接

## 开工顺序

Terra 必须依次读取：

1. `shared/cloud-asset-engine-contract.json`
2. `shared/cloud-asset-dictionary.json`
3. `shared/asset-template-dictionary.json`
4. `shared/asset-style-dictionary.json`
5. `shared/local-derivation-contract.json`
6. `docs/cloud-asset-truth-sources.md`
7. `docs/cloud-asset-engine-boundaries.md`

机器契约和词典优先；实现必须保持受控 ID、Port 语义与 fail-closed 行为。

## P0 实现包

### 1. Dictionary Registry

- 建立只读 Registry，加载 cloud/style/template/local-operation 四个真相源。
- 校验 ID 存在、所属词典、版本和状态；未知值 fail closed。
- 用户自然语言必须在进入公共查询/晋升前编译为受控 ID，禁止把 UI 自由文本直接存入 RelationIndex。

### 2. Promotion Validator

- 将 `license`、`provenance`、任意 quality 对象收敛为 `licensePolicyId`、`provenanceTypeId`、
  `qualityTierId` 和 `qualityFlags`。
- 根据词典计算 `publicPromotionAllowed`，不得以字段非空代替授权。
- simulated、unknown、private、缺 consent/acceptance/runtime binding、阻塞 quality flag 必须拒绝。
- 完整实现 contract 中的 promotion states、重试、回执和幂等键。

### 3. Query / Rights / Ranking

- exact、near、template-kit 都先过滤 style/template/tag/license/quality，再评分。
- `CloudCandidate.rights` 必须由 license policy 派生，禁止硬编码 `reuseAllowed=true`。
- quality tier/flags 与 usage 只影响 Projection；Projection 可重建且不能成为第二主源。
- query outage 不阻塞 AssetEngine，本地/模型/debt 路由继续工作。

### 4. Template Projection

- Cloud graph 中的 Template/TemplateSlot 是 `asset-template-dictionary` 的带版本投影，不是云端新定义。
- 删除任意 `registerTemplate` 或云端自造槽位能力；词典升级后执行确定性 projection rebuild。
- template-kit 每个 slot 独立 materialize、验收和绑定。

### 5. Librarian Command Validator

- Agent 只能提出词典内 tag、bundle kind、quality flag，以及契约内关系。
- `markQuality` 不再接受任意 payload；所有命令写持久 audit receipt。
- Agent 无权发布、改 Blob、创建 template/style、读 private-local 或调用模型。

### 6. Port 与线上适配器

- 保持 BlobStore、RelationIndex、ProjectionIndex、PromotionQueue 四 Port 语义稳定。
- 默认文件适配器仅用于开发；真实部署补认证、对象存储、数据库、Worker、重试、限流和告警。
- materialize 必须产生契约要求的 requestId、project-local path、verifiedHash、createdRevisionId；远程 URL
  永不进入 Runtime manifest。

## P0 实现完成

- Dictionary Registry 将用户输入编译为受控 ID，并拒绝未知公共 metadata。
- Promotion 使用 provenance/license/quality policy、完整状态、幂等与 retry receipt。
- Query 派生 rights，按 quality/usage 投影排序；query outage 回落到 AssetEngine。
- Template/slot 每次加载都由模板词典投影并自动 reconcile。
- Librarian command 受控、原子且持久 audit；bundle/classification/quality 均验证词典 ID。
- Materialization 使用完整 request/receipt，且授权通过 CloudAccessPolicyPort 注入。

## 外部部署保留项

- 生产对象存储、关系数据库、持久队列 Worker、身份/租户服务、限流、监控和运营告警尚未部署。
- 这些属于 Port 适配器替换，不得改变契约、词典、project-local materialize 或 fail-closed 门。

## Terra Definition of Done

- 上述 P0 六包全部实现，不保留旧字段别名或双写。
- 正常、未知 ID、授权拒绝、模板漂移、Projection 重建、队列重试、query outage 测试全部通过。
- `npm run check:visual-assets` 与平台构建通过。
- 搜索确认没有 `CloudResourceManager`、自由公共授权字段、云端模板创建入口或远程 Runtime URL。
- 独立测试与审计分别给出证据，才可声明云库核心实现完成。
