const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../src/lib/accountSyncEngine.js'),'utf8');
(async () => {
  const { reconcile,canonical } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const local = new Map(), cloud = new Map(); let state = { records:{},pending:{},conflicts:{} }; let writes = 0;
  const row = (name) => ({ kind:'gear',id:'g1',data:{ id:'g1',name },deleted:false });
  const request = async (route,options) => {
    const key = route.slice(1);
    if (!options) return { record:structuredClone(cloud.get(key)) };
    const body = JSON.parse(options.body), prior = cloud.get(key);
    if ((prior?.revision || 0) !== body.baseRevision) throw Object.assign(new Error('Conflict'),{ status:409,record:prior });
    const result = { kind:'gear',id:'g1',data:body.data,deleted:body.deleted,revision:body.baseRevision + 1 };
    cloud.set(key,result); writes++; return { record:result };
  };
  const run = (override = {}) => reconcile({ local:[...local.values()],remote:[...cloud.values()],state,request,
    persist:async () => {},apply:async (r) => { if (r.deleted) local.delete('gear/g1'); else local.set('gear/g1',r); },
    current:async () => local.get('gear/g1'), active:() => true,makeId:() => 'mutation',...override });
  local.set('gear/g1',row('Regulator')); await run(); assert.equal(writes,1);
  await run(); assert.equal(writes,1,'unchanged records must not upload again');
  local.set('gear/g1',{ ...row('Regulator'),data:{ id:'g1',name:'Regulator',updatedAt:'different',attachments:[{ uri:'file://local.jpg' }] } });
  await run(); assert.equal(writes,1,'normalization timestamps and local files must not churn');
  cloud.set('gear/g1',{ ...row('Web edit'),revision:2 }); await run(); assert.equal(local.get('gear/g1').data.name,'Web edit');
  local.set('gear/g1',row('Phone edit')); cloud.set('gear/g1',{ ...row('Other web edit'),revision:3 });
  assert.equal((await run()).conflicts,1); assert.equal(local.get('gear/g1').data.name,'Phone edit');
  assert.equal(cloud.get('gear/g1').data.name,'Other web edit');
  state.conflicts = {}; state.records['gear/g1'] = { revision:3,value:'active:' + canonical(local.get('gear/g1').data,'gear') };
  local.delete('gear/g1'); await run(); assert.equal(cloud.get('gear/g1').deleted,true);
  const before = writes; await run(); assert.equal(writes,before,'a deleted record must not upload repeatedly');
  // New installs pull existing cloud records instead of manufacturing deletion requests.
  state = { records:{},pending:{},conflicts:{} }; cloud.set('gear/g1',{ ...row('Recovered'),revision:5 }); await run();
  assert.equal(local.get('gear/g1').data.name,'Recovered');
  // A edit during a pull remains pending instead of being overwritten by the response.
  cloud.set('gear/g1',{ ...row('Web concurrent'),revision:6 });
  await run({ current:async () => row('Typed while loading') }); assert.equal(local.get('gear/g1').data.name,'Recovered');
  local.set('gear/g1',row('Offline draft')); cloud.clear(); state = { records:{},pending:{},conflicts:{} };
  await assert.rejects(run({ request:async () => { throw new Error('Offline'); } }),/Offline/);
  assert.equal(state.pending['gear/g1'].mutationId,'mutation'); assert.equal(local.get('gear/g1').data.name,'Offline draft');
  console.log('PASS: upload, no-op, local attachment preservation, download, conflicts, deletion, fresh install, concurrent edits, and offline queue.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
