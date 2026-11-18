const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=html.indexOf('/* AUTO_UPDATE_LOGIC_START */');
const end=html.indexOf('/* AUTO_UPDATE_LOGIC_END */');
assert.ok(start>=0&&end>start,'auto-update logic markers exist');
const source=html.slice(start,end);

let now=1_000_000;
const stored=new Map([['cbt-auto-reloaded-old-build',JSON.stringify({attempts:2,lastAttemptAt:500_000})]]);
const screens=new Map(['home','studyPlan','quiz','mockExam','mockSubjectPractice','dictionaryPractice','finish','stats','list','sectionList','sectionStart','leaderboard','accessAdmin'].map(id=>[id,{classList:{contains:name=>name==='hidden'}}]));
function show(screen){for(const [id,node] of screens)node.classList.contains=name=>name==='hidden'&&id!==screen;}
let reloads=0,updates=0,fetchCalls=[];
const ctx={
  console,Promise,Date:{now:()=>now},setTimeout,clearTimeout,setInterval(){},
  SERVICE_WORKER_BUILD:'old-build',_syncBusy:false,_syncDirty:false,
  mockExamState:{clock:null},mockSubjectSession:null,session:null,
  el:id=>screens.get(id),
  document:{hidden:false,activeElement:null,querySelector:()=>null,addEventListener(){}},
  window:{location:{reload(){reloads++;}},addEventListener(){}},
  sessionStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)},
  fetch:async(url,options)=>{fetchCalls.push([url,options]);return {ok:true,text:async()=>"const APP_BUILD='new-build';"};}
};
vm.createContext(ctx);
vm.runInContext(source,ctx);

(async()=>{
  assert.equal(stored.has('cbt-auto-reloaded-old-build'),false,'matching running build clears its reload guard');
  show('quiz');
  await vm.runInContext('checkForAppUpdate(false)',ctx);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(vm.runInContext('autoUpdatePendingBuild',ctx),'new-build','different build becomes pending');
  assert.match(fetchCalls[0][0],/^\.\/sw\.js\?check=\d+$/);
  assert.equal(fetchCalls[0][1].cache,'no-store');

  let finishUpdate;
  ctx.registration={update:()=>{updates++;return new Promise(resolve=>{finishUpdate=resolve;});}};
  vm.runInContext('autoUpdateRegistration=registration',ctx);
  const firstReload=vm.runInContext("applyPendingAppUpdate('hidden')",ctx);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(stored.has('cbt-auto-reloaded-new-build'),false,'guard is not recorded before update and flush finish');
  finishUpdate();
  assert.equal(await firstReload,true,'hidden page reloads pending update');
  assert.equal(updates,1,'service worker registration is updated before reload');
  assert.equal(reloads,1);
  assert.deepEqual(JSON.parse(stored.get('cbt-auto-reloaded-new-build')),{attempts:1,lastAttemptAt:now});

  vm.runInContext("autoUpdateApplying=false;autoUpdateReloadIssued=false;autoUpdatePendingBuild='mock-build'",ctx);
  show('mockExam');ctx.mockExamState.clock=1;
  assert.equal(await vm.runInContext("applyPendingAppUpdate('hidden')",ctx),false,'active mock exam defers even while hidden');
  assert.equal(reloads,1);

  ctx.mockExamState.clock=null;ctx.session={single:true};show('quiz');
  vm.runInContext("autoUpdatePendingBuild='single-build'",ctx);
  assert.equal(await vm.runInContext("applyPendingAppUpdate('hidden')",ctx),false,'single-question session defers while quiz is visible');
  assert.equal(reloads,1);
  show('home');ctx.registration={update:async()=>{updates++;}};
  vm.runInContext('autoUpdateRegistration=registration',ctx);
  assert.equal(await vm.runInContext("applyPendingAppUpdate('transition')",ctx),true,'single-question update applies after leaving quiz');
  assert.equal(reloads,2);

  ctx.session=null;
  vm.runInContext("autoUpdateApplying=false;autoUpdateReloadIssued=false",ctx);
  assert.equal(vm.runInContext("autoUpdateAttemptAllowed('new-build')",ctx),false,'same target waits ten minutes after reload');
  now+=10*60*1000;
  assert.equal(vm.runInContext("autoUpdateAttemptAllowed('new-build')",ctx),true,'old HTML may retry after ten minutes');
  vm.runInContext("recordAutoUpdateReloadAttempt('new-build')",ctx);
  now+=10*60*1000;vm.runInContext("recordAutoUpdateReloadAttempt('new-build')",ctx);
  now+=10*60*1000;
  assert.equal(vm.runInContext("autoUpdateAttemptAllowed('new-build')",ctx),false,'same target stops after three reload attempts');

  vm.runInContext("autoUpdatePendingBuild='';autoUpdateLastCheckAt=0",ctx);
  ctx.fetch=async()=>{throw new Error('offline');};
  await vm.runInContext('checkForAppUpdate(false)',ctx);
  assert.equal(vm.runInContext('autoUpdatePendingBuild',ctx),'','fetch failure is ignored');
  assert.equal(reloads,2);
  const swSource=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
  const swHandlers={},deleted=[];
  const checkRequest={url:'https://app.test/sw.js?check=123'},assetRequest={url:'https://app.test/index.html'};
  const swCache={keys:async()=>[checkRequest,assetRequest],delete:async request=>{deleted.push(request.url);return true;},match:async()=>null,put:async()=>{}};
  const swCtx={URL,Promise,Request:class{constructor(url){this.url=new URL(url,'https://app.test/sw.js').href;}},caches:{open:async()=>swCache},fetch:async()=>({ok:true,clone(){return this;}}),self:{location:{origin:'https://app.test',href:'https://app.test/sw.js'},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,handler)=>swHandlers[name]=handler}};
  vm.createContext(swCtx);vm.runInContext(swSource,swCtx);
  let probeResponded=false;
  swHandlers.fetch({request:{url:checkRequest.url,method:'GET',mode:'same-origin'},respondWith(){probeResponded=true;}});
  assert.equal(probeResponded,false,'sw.js update probe bypasses service-worker runtime caching');
  let activation;swHandlers.activate({waitUntil:promise=>activation=promise});await activation;
  assert.deepEqual(deleted,[checkRequest.url],'activate removes only accumulated sw.js check entries');

  console.log('PASS auto update: single-session safety, SW probe cleanup, retry guard, detection, mock deferral, offline failure');
})().catch(error=>{console.error(error);process.exitCode=1;});
