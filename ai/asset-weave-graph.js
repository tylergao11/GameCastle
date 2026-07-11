var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var assetWorld = require('./asset-world');
var runtimeAnimation = require('./runtime-animation-recipes');
var assetValidator = require('./asset-contract-validator');

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function sha(v) { return crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex'); }
function key(s) { return s.runId + '|' + s.slot.slotId + '|' + sha(s.spec); }
function trace(s, node) { return (s.trace || []).concat([node]); }
function reserveModelBudget(s) { var estimate = Number((s.source || {}).modelCostEstimate === undefined ? 1 : s.source.modelCostEstimate); if (!Number.isFinite(estimate) || estimate < 0) return null; var budget = s.ledger.__modelBudget || { cost: 0, reservations: [] }; if (budget.cost + estimate > s.maxCost) return null; budget.cost += estimate; budget.reservations.push({ slotId: s.slot.slotId, decision: s.decision, estimate: estimate }); s.ledger.__modelBudget = budget; return estimate; }
function settleModelBudget(s, estimate, actual) { var budget = s.ledger.__modelBudget, cost = Number(actual); if (!Number.isFinite(cost) || cost < 0) cost = estimate; budget.cost += cost - estimate; budget.reservations[budget.reservations.length - 1].actual = cost; return budget.cost <= s.maxCost; }
function debt(s, reason) {
  s.candidate = { slotId:s.slot.slotId,status:'placeholder',source:'runtimeFallback',assetId:null,path:'runtime://placeholder/'+s.slot.slotId,format:'png',width:s.slot.constraints.width,height:s.slot.constraints.height,transparent:!!s.slot.constraints.transparent,styleId:s.slot.styleId||null,semanticTags:s.slot.semanticTags||[],styleTags:s.slot.styleTags||[],confidence:0,resolution:{strategy:'placeholder',cacheHit:false,ownerOnFailure:'AssetWeave'},publishability:{playable:true,publishable:false,repoEligible:false,trainingEligible:false,blocksFinalExport:true,debt:reason} };
  s.debt = reason; return s;
}
function record(s, source, status, extra) {
  var x = extra || {};
  var candidate = Object.assign({}, x, {slotId:s.slot.slotId,status:status,source:source,assetId:x.assetId||source+'.'+s.slot.slotId,path:x.path||('memory://'+source+'/'+s.slot.slotId),format:x.format||'png',sha1:x.sha1||sha([source,s.slot.slotId]),width:x.width||s.slot.constraints.width,height:x.height||s.slot.constraints.height,transparent:x.transparent === true ? true : x.transparent === false ? false : !!s.slot.constraints.transparent,styleId:x.styleId||s.slot.styleId||null,semanticTags:clone(s.slot.semanticTags||[]),styleTags:clone(s.slot.styleTags||[]),confidence:1,resolution:{strategy:source,cacheHit:false,ownerOnFailure:'AssetWeave'},publishability:Object.assign({playable:true,publishable:true,repoEligible:false,trainingEligible:false,blocksFinalExport:false,debt:'none'},x.publishability||{})});
  candidate.repositoryStatus=x.status||null;
  return candidate;
}
function manifest(s) { var a=s.candidate; return {meta:{schemaVersion:1,contractId:s.runId+':asset-manifest',createdAt:new Date().toISOString(),owner:'RuntimeAssetResolver',status:a.status==='placeholder'?'partial':'ready'},buildContractId:s.runId,assets:[a],summary:{resolved:1,generated:a.status==='generated'?1:0,reused:(a.status==='reused'||a.status==='variant')?1:0,placeholders:a.status==='placeholder'?1:0,failed:0,cacheHit:false,publishable:!!a.publishability.publishable}}; }
function cloudAssetIsApproved(asset) { return !!asset && (asset.status === 'approved' || asset.repositoryStatus === 'approved'); }
function materializeCandidate(s, candidate) {
  if (s.projectAssetDir && fs.existsSync(candidate.path)) { fs.mkdirSync(s.projectAssetDir, { recursive: true }); var target = path.join(s.projectAssetDir, path.basename(candidate.path)); fs.copyFileSync(candidate.path, target); candidate.path = target; }
  candidate.materialized = true; return candidate;
}
function lookupCloud(s) {
  if (!s.cloudRepository) return null;
  var exact = typeof s.cloudRepository.findExactForSpec === 'function' ? s.cloudRepository.findExactForSpec(s.slot) : null;
  if (cloudAssetIsApproved(exact)) return { kind: 'cloud_exact', asset: exact };
  var near = typeof s.cloudRepository.findNearForSpec === 'function' ? s.cloudRepository.findNearForSpec(s.slot) : null;
  if (cloudAssetIsApproved(near)) return { kind: 'cloud_near', asset: near };
  var tags = [].concat(s.slot.semanticTags || [], s.slot.styleTags || []);
  var legacy = typeof s.cloudRepository.findByTags === 'function' ? s.cloudRepository.findByTags(tags)[0] : null;
  return cloudAssetIsApproved(legacy) ? { kind: 'cloud_exact', asset: legacy } : null;
}
async function loadLangGraph() { return import('@langchain/langgraph'); }

async function runSlot(input) {
  var lg=await loadLangGraph(); var ledger=input.ledger||{}; var initial={runId:input.runId,slot:input.slot,spec:input.spec||input.slot,sources:input.sources||{},localAssets:input.localAssets||{},cloudRepository:input.cloudRepository||null,visualIntents:input.visualIntents||{},ports:input.ports||{},modelPolicy:input.modelPolicy||null,ledger:ledger,projectAssetDir:input.projectAssetDir||null,maxAttempts:input.maxAttempts||2,maxCost:input.maxCost===undefined?Infinity:input.maxCost,trace:[]};
  var A=lg.Annotation.Root({state:lg.Annotation({reducer:function(_l,r){return r;},default:function(){return null;}})});
  function node(name, fn){return async function(w){var s=Object.assign({},w.state); await fn(s); s.trace=trace(s,name); return {state:s};};}
  var g=new lg.StateGraph(A)
  .addNode('asset-intake',node('asset-intake',function(s){s.specHash=sha(s.spec);}))
  .addNode('asset-resolver',node('asset-resolver',function(s){var x=s.sources[s.slot.slotId]||{};if(!x.kind&&s.localAssets[s.slot.slotId])x={kind:'local',asset:s.localAssets[s.slot.slotId]};if(!x.kind)x=lookupCloud(s)||{};s.decision=x.kind||'generation_required';s.source=x;if(s.decision==='local')s.candidate=record(s,'localExplicit','reused',x.asset||{});} ))
  .addNode('asset-materialize',node('asset-materialize',function(s){s.candidate=materializeCandidate(s,record(s,'cloudRepo','reused',s.source.asset||{}));}))
  .addNode('deterministic-variant',node('deterministic-variant',async function(s){if(s.source.needsPixels){s.decision='image_edit';return;} if(s.source.derivationSpec&&s.ports.localDerive&&typeof s.ports.localDerive.derive==='function'){var derived=await s.ports.localDerive.derive(s);s.candidate=record(s,'deterministicVariant','variant',derived);return;} if(typeof s.ports.variant==='function'){var variant=await s.ports.variant(s);s.candidate=record(s,'deterministicVariant','variant',variant);return;} s.candidate=materializeCandidate(s,record(s,'deterministicVariant','variant',s.source.asset||{}));}))
  .addNode('image-edit',node('image-edit',async function(s){var k=key(s),e=s.ledger[k]||{attempts:0,cost:0};if(e.completed){s.candidate=clone(e.completed.candidate);s.review=clone(e.completed.review);return;}if(!s.source.parentRevisionId) throw new Error('ImageEdit requires parentRevisionId');if(e.attempts>=s.maxAttempts||e.cost>=s.maxCost){debt(s,'budget_exhausted');return;}if(typeof s.ports.edit!=='function'){debt(s,(s.modelPolicy&&s.modelPolicy.code)||'image_edit_port_unavailable');return;}var reserved=reserveModelBudget(s);if(reserved===null){debt(s,'budget_exhausted');return;}var edited=await s.ports.edit(s);s.candidate=record(s,'imageEdit','variant',edited);s.candidate.parentRevisionId=s.source.parentRevisionId;e.attempts++;e.cost+=Number(s.candidate.cost||reserved);if(!settleModelBudget(s,reserved,s.candidate.cost)){debt(s,'budget_exhausted');return;}s.ledger[k]=e;}))
  .addNode('image-generation',node('image-generation',async function(s){var k=key(s), e=s.ledger[k]||{attempts:0,cost:0};if(e.completed){s.candidate=clone(e.completed.candidate);s.review=clone(e.completed.review);return;}if(e.attempts>=s.maxAttempts || e.cost>=s.maxCost){debt(s,'budget_exhausted');return;}if(typeof s.ports.generate!=='function'){debt(s,(s.modelPolicy&&s.modelPolicy.code)||'image_generation_port_unavailable');return;}var reserved=reserveModelBudget(s);if(reserved===null){debt(s,'budget_exhausted');return;}var generated=await s.ports.generate(s);s.candidate=record(s,'imageGeneration','generated',generated); e.attempts++; e.cost+=Number(s.candidate.cost||reserved);if(!settleModelBudget(s,reserved,s.candidate.cost)){debt(s,'budget_exhausted');return;} s.ledger[k]=e;}))
  .addNode('vision-review',node('vision-review',async function(s){if(s.debt||s.review)return;if(typeof s.ports.review!=='function'){debt(s,'vision_review_port_unavailable');return;}s.review=await s.ports.review(s);}))
  .addNode('asset-repair-plan',node('asset-repair-plan',function(s){s.source.needsPixels=true; s.source.parentRevisionId=s.candidate.parentRevisionId||s.candidate.assetId; s.review=null; }))
  .addNode('deterministic-validation',node('deterministic-validation',function(s){s.validation=assetValidator.validateAssetCandidate(s.slot,s.candidate);s.valid=s.validation.pass;}))
  .addNode('asset-acceptance-gate',node('asset-acceptance-gate',function(s){var needsVision=s.candidate&&(s.candidate.source==='imageGeneration'||s.candidate.source==='imageEdit'||s.candidate.simulated===true);if(!s.valid||s.debt||(needsVision&&(!s.review||!s.review.pass))){debt(s,s.debt||(s.validation&&s.validation.errors.join(','))||'asset_rejected');return;} s.accepted=true;}))
  .addNode('asset-finalize',node('asset-finalize',function(s){var e=s.ledger[key(s)];if(e)e.completed={candidate:clone(s.candidate),review:clone(s.review)};s.cloudPromotionQueue=s.accepted&&s.source.requestCloudPromotion?[{slotId:s.slot.slotId,assetId:s.candidate.assetId,parentRevisionId:s.candidate.parentRevisionId||null,asset:Object.assign({},s.candidate,{provenance:s.source.provenance||'asset-weave',license:s.source.license||'owned'}),receipt:{accepted:true,runId:s.runId}}]:[];s.assetManifest=manifest(s);s.assetWorld=assetWorld.buildAssetWorld(s.assetManifest,null);}))
  .addNode('runtime-linker',node('runtime-linker',function(s){
    if(s.candidate.status==='placeholder'){
      s.assetBinding={slotId:s.slot.slotId,assetId:null,status:'placeholder',runtimeFallback:true};
      return;
    }
    s.candidate.assetId=s.candidate.assetId||('asset.'+sha([s.slot.slotId,s.candidate.path,s.candidate.sha1]));
    var intent=s.visualIntents[s.slot.slotId]||{};
    s.assetBinding=Object.assign({slotId:s.slot.slotId,status:s.candidate.status},runtimeAnimation.bindSpriteAsset(s.candidate,intent));
  }));
  g.addEdge(lg.START,'asset-intake').addEdge('asset-intake','asset-resolver');
  g.addConditionalEdges('asset-resolver',function(s){return (s.state||s).decision;},{local:'deterministic-validation',cloud_exact:'asset-materialize',cloud_near:'deterministic-variant',generation_required:'image-generation'});
  g.addEdge('asset-materialize','deterministic-validation');
  g.addConditionalEdges('deterministic-variant',function(s){s=s.state||s;return s.decision==='image_edit'?'image_edit':'deterministic_validation';},{image_edit:'image-edit','deterministic_validation':'deterministic-validation'});
  g.addEdge('image-edit','vision-review').addEdge('image-generation','vision-review');
  g.addConditionalEdges('vision-review',function(s){s=s.state||s;if(s.debt)return 'validate'; return s.review.pass?'validate':(s.review.repairable?'repair':'debt');},{validate:'deterministic-validation',repair:'asset-repair-plan',debt:'asset-acceptance-gate'});
  g.addEdge('asset-repair-plan','image-edit').addConditionalEdges('deterministic-validation',function(s){s=s.state||s;return s.candidate&&s.candidate.simulated===true&&!s.review?'review':'accept';},{review:'vision-review',accept:'asset-acceptance-gate'}).addEdge('asset-acceptance-gate','asset-finalize').addEdge('asset-finalize','runtime-linker').addEdge('runtime-linker',lg.END);
  var out=await g.compile().invoke({state:initial}); return out.state;
}
async function runAssetWeave(input){var ledger=input.ledger||{};if(input.ledgerPath&&fs.existsSync(input.ledgerPath))ledger=JSON.parse(fs.readFileSync(input.ledgerPath,'utf8'));var slots=(input.buildContract.assetContract||input.buildContract).slots||[];var results=[];for(var i=0;i<slots.length;i++)results.push(await runSlot(Object.assign({},input,{slot:slots[i],ledger:ledger})));if(input.ledgerPath){fs.mkdirSync(path.dirname(input.ledgerPath),{recursive:true});fs.writeFileSync(input.ledgerPath,JSON.stringify(ledger,null,2));}var assets=results.map(function(r){return r.candidate;});var m={meta:{schemaVersion:1,contractId:input.runId+':asset-manifest',createdAt:new Date().toISOString(),owner:'RuntimeAssetResolver',status:assets.some(function(a){return a.status==='placeholder';})?'partial':'ready'},buildContractId:input.runId,assets:assets,summary:{resolved:assets.length,generated:assets.filter(function(a){return a.status==='generated';}).length,reused:assets.filter(function(a){return a.status==='reused'||a.status==='variant';}).length,placeholders:assets.filter(function(a){return a.status==='placeholder';}).length,failed:0,cacheHit:false,publishable:assets.every(function(a){return a.publishability.publishable;})}};return {slots:results,assetManifest:m,assetWorld:assetWorld.buildAssetWorld(m,null),assetBindings:results.map(function(r){return r.assetBinding;}),cloudPromotionQueue:[].concat.apply([],results.map(function(r){return r.cloudPromotionQueue||[];})),ledger:ledger};}
module.exports={runAssetWeave:runAssetWeave,runSlot:runSlot};
