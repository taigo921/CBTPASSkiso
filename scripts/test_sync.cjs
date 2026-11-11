// No live Firebase credentials or user records. Exercise production merge/sync functions.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
let checks=0;
const context={console:{warn(){}},Date,JSON,Math,Map,Set,Object,Number,String,window:{cbtUser:{uid:'test'}},navigator:{onLine:true},setTimeout:()=>1,clearTimeout(){},el:()=>({addEventListener(){}}),assert:(v,m)=>{assert.ok(v,m);checks++;}};
vm.createContext(context);
context.Blob=Blob;
vm.runInContext(`const ROUTE_BOOK_KEYS=['book1','book2'];
const ANSWER_BOOK_KEYS=['answer1','answer2','answer3','answer4'];
const QUESTION_BOOK_KEYS=[...ROUTE_BOOK_KEYS,...ANSWER_BOOK_KEYS];
const emptyStats=()=>({perQ:{},rankAttempts:[]});
function dateKey(value){const date=value||new Date();return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
${slice('function latestQuestionOutcome(', 'function fullStatsPayload(')}
${slice('function mergeStatsTarget(', 'function cbtMergeCloud(')}
${slice('function recentQuestionAttempts(', 'function questionRouteStatus(')}
${slice('function mockKeyFor(', 'function progressBackupData(')}
${slice('function mergeCloudPayloads(', "el('syncNowBtn').addEventListener")}
`,context);
vm.runInContext(`
function payload(n,xp){return {activeBook:'book1',books:{book1:{perQ:{q:{c:n,w:0}}},book2:{perQ:{b:{c:3,w:2}}}},game:{xp},studyTime:{days:{'2026-09-23':{seconds:n,questions:5,book1:n,book2:0}}},studyPlans:{shared:{updatedAt:n,items:{q:{updatedAt:n,round:n}},assignments:{day:{uids:['q'],completedUids:{q:true},updatedAt:n}}}},practiceSets:{dictionary2:{index:1,updatedAt:n,answers:{A001:{attempts:[{picked:'B',correct:true,at:n}],lastCorrect:true,lastPicked:'B'}}}}};}
const phone=payload(1977,13179),ipad=payload(1692,11294);
for(const [a,b] of [[phone,ipad],[ipad,phone]]){
 const merged=mergeCloudPayloads(a,b);
 const encoded=encodeCloudProgress(merged),decoded=decodeCloudProgress(encoded);
 for(const key of ['books','studyPlans','mockExams','practiceSets','sessions'])assert(JSON.stringify(merged[key])===JSON.stringify(decoded[key]),'packed roundtrip '+key);
 assert(merged.books.book1.answered===1977&&merged.books.book1.correct===1977,'cumulative book1 totals survive both directions');
 assert(merged.books.book2.answered===5&&merged.books.book2.correct===3,'cumulative book2 totals remain separate');
 assert(merged.game.xp===13179,'XP never rolled back');
 assert(merged.studyTime.days['2026-09-23'].seconds===1977,'study time retained');
 assert(merged.studyPlans.shared.items.q.round===1977,'latest plan item retained');
 assert(merged.practiceSets.dictionary2.answers.A001.attempts.length===2,'dictionary attempts from both devices are retained');
 assert(mergeCloudPayloads(merged,merged).books.book1.answered===1977,'idempotent cumulative totals');
}
const old={5:{index:0,answers:{1:{picked:'B',answered:false,updatedAt:50}}}},fresh={5:{index:2,answers:{1:{picked:'A',answered:true,updatedAt:10},2:{picked:'C',answered:true,updatedAt:20}}}};
for(const [a,b] of [[old,fresh],[fresh,old]]){const m=mergeMockPayload(a,b);assert(m[5].index===2,'linked frontier retained');assert(m[5].answers[1].picked==='A','confirmed answer beats newer unconfirmed selection');}
assert(mergeSessionPayload({book1:{idx:3,updatedAt:1}},{book1:{idx:9,updatedAt:2}}).book1.idx===9,'resume follows newer device');
assert(mergeSessionPayload({book1:{deleted:true,updatedAt:3}},{book1:{idx:9,updatedAt:2}}).book1.deleted,'deleted resume does not resurrect');
const streakPayload=compactStatsPayload({perQ:{q:{correct:3,wrong:0,last:'correct',history:[{correct:true,at:20}],streak:3,streakDay:'2026-11-10'}},rankAttempts:[]});
assert(streakPayload.perQ.q.s===3&&streakPayload.perQ.q.sd==='2026-11-10','compact payload keeps the per-question streak and update day');
const cloudNewer=mergeStatsTarget(emptyStats(),{perQ:{q:{c:3,w:0,h:{correct:true,at:20},s:3,sd:'2026-11-10'}}});
assert(cloudNewer.perQ.q.streak===3&&cloudNewer.perQ.q.streakDay==='2026-11-10','newer cloud answer adopts its streak and update day');
const newerHistoryLocal={perQ:{q:{correct:2,wrong:0,last:'correct',history:[{correct:true,at:30}],streak:2}},rankAttempts:[]};
mergeStatsTarget(newerHistoryLocal,{perQ:{q:{c:3,w:0,h:{correct:true,at:20},s:3}}});
assert(newerHistoryLocal.perQ.q.streak===2,'newer local answer keeps its local streak');
const cloudHistoryNewer={perQ:{q:{correct:3,wrong:0,last:'correct',history:[{correct:true,at:10}],streak:1}},rankAttempts:[]};
mergeStatsTarget(cloudHistoryNewer,{perQ:{q:{c:2,w:0,h:{correct:true,at:20},s:2}}});
assert(cloudHistoryNewer.perQ.q.streak===2,'newer cloud history adopts its streak even when local counts are larger');
const sameHistoryNoLocalStreak={perQ:{q:{correct:3,wrong:0,last:'correct',history:[{correct:true,at:20}]}},rankAttempts:[]};
mergeStatsTarget(sameHistoryNoLocalStreak,{perQ:{q:{c:3,w:0,h:{correct:true,at:20},s:3}}});
assert(sameHistoryNoLocalStreak.perQ.q.streak===3,'same latest answer adopts cloud streak when local streak is absent');
const sameHistoryLowerLocalStreak={perQ:{q:{correct:3,wrong:0,last:'correct',history:[{correct:true,at:20}],streak:1}},rankAttempts:[]};
mergeStatsTarget(sameHistoryLowerLocalStreak,{perQ:{q:{c:3,w:0,h:{correct:true,at:20},s:3,sd:'2026-11-11'}}});
assert(sameHistoryLowerLocalStreak.perQ.q.streak===3&&sameHistoryLowerLocalStreak.perQ.q.streakDay==='2026-11-11','same latest answer keeps the higher cloud streak and newer update day');
const sameHistoryNewerLocalDay={perQ:{q:{correct:3,wrong:0,last:'correct',history:[{correct:true,at:20}],streak:3,streakDay:'2026-11-12'}},rankAttempts:[]};
mergeStatsTarget(sameHistoryNewerLocalDay,{perQ:{q:{c:3,w:0,h:{correct:true,at:20},s:3,sd:'2026-11-11'}}});
assert(sameHistoryNewerLocalDay.perQ.q.streakDay==='2026-11-12','equal timestamps keep the larger local streak update day');
const oldPayload=mergeStatsTarget(emptyStats(),{perQ:{q:{c:1,w:0,h:{correct:true,at:10}}}});
assert(oldPayload.perQ.q.correct===1&&oldPayload.perQ.q.streak===undefined&&oldPayload.perQ.q.streakDay===undefined,'old payload without streak fields still merges');
const restoredDay=new Date(2026,10,10,12).getTime();
const restoredWrongThenCorrect=mergeStatsTarget(emptyStats(),{perQ:{q:{c:1,w:1,h:{correct:true,at:restoredDay},s:0,sd:'2026-11-10'}}});
assert(questionCorrectStreak('q',restoredWrongThenCorrect.perQ.q,restoredWrongThenCorrect)===0,'cloud restore keeps the synced x then o daily streak when h only has the last o');
const restoredCorrectThenWrong=mergeStatsTarget(emptyStats(),{perQ:{q:{c:1,w:1,h:{correct:false,at:restoredDay},s:1,sd:'2026-11-10'}}});
assert(questionCorrectStreak('q',restoredCorrectThenWrong.perQ.q,restoredCorrectThenWrong)===1,'cloud restore keeps the synced o then x daily streak when h only has the last x');
const packed=encodeCloudProgress(mergeCloudPayloads({},phone));
const mixed=decodeCloudProgress({...packed,books:payload(2200,14000).books});
assert(mixed.books.book1.answered===2200&&mixed.books.book1.perQ.q.c===2200,'legacy cumulative attempt history survives while accuracy counts the latest result only');
let rejected=false;try{decodeCloudProgress({progressDataV1:'broken'});}catch(_){rejected=true;}assert(rejected,'invalid packed data blocks overwrite');
const oversized={books:{book1:{perQ:{q:{note:'あ'.repeat(400000)}}},book2:{perQ:{b:{note:'x'.repeat(300000)}}}},studyPlans:{shared:{}},mockExams:{},practiceSets:{},sessions:{book1:{uids:['q']}}};
const chunked=encodeCloudProgressV2(oversized);
assert(chunked.chunks.length>1,'progress beyond the Firestore field limit is split');
assert(chunked.chunks.every(chunk=>new Blob([chunk]).size<=CLOUD_PROGRESS_CHUNK_BYTES),'each progress chunk stays below its byte limit');
assert(chunked.root.progressDataV1===undefined&&chunked.root.progressDataV2.chunkCount===chunked.chunks.length,'root stores only the v2 manifest');
const chunkDocuments=chunked.chunks.map((data,index)=>({version:2,generation:chunked.generation,index,data}));
const chunkRoundtrip=decodeCloudProgressV2(chunked.root,chunkDocuments);
assert(chunkRoundtrip.books.book1.perQ.q.note.length===400000&&chunkRoundtrip.books.book2.perQ.b.note.length===300000,'chunked progress roundtrip is lossless');
rejected=false;try{decodeCloudProgressV2(chunked.root,chunkDocuments.slice(1));}catch(_){rejected=true;}assert(rejected,'missing progress chunks block overwrite');
let states=[],details=[],backups=0,reads=0,localCount=1977,serverCount=1692;
function setCloudSyncState(state,detail){states.push(state);details.push(detail);}
function ensureProgressBackup(){backups++;}
function cbtMergeCloud(data){localCount=Math.max(localCount,data.count);}
function fullStatsPayload(){return {count:localCount};}
window.cbtCloud={readLatest:async()=>{reads++;return {count:serverCount};},save:async p=>{serverCount=Math.max(serverCount,p.count);return {count:serverCount};}};
`,context);
(async()=>{
 if(process.env.PROGRESS_BACKUP){
  const backup=JSON.parse(fs.readFileSync(process.env.PROGRESS_BACKUP,'utf8'));
  const values=Object.fromEntries(Object.entries(backup.current.values).map(([k,v])=>[k,JSON.parse(v)]));
  context.backupValues=values;
  const measurement=vm.runInContext(`(()=>{
   const v=backupValues,s=v.cbt_stats_books_v1;
   const mocks={},sessions={};
   for(const [key,value] of Object.entries(v)){const match=key.match(/^togo_mock_azabu2026_block([1-6])_v1_/);if(match)mocks[match[1]]=value;}
   for(const book of ['book1','book2','shared-plan']){const key='cbt_session_v3_'+book,value=v[key],deleted=v[key+'_deleted']||0;if(value&&(value.updatedAt||0)>=deleted)sessions[book]=value;else if(deleted)sessions[book]={deleted:true,updatedAt:deleted};}
   const original=mergeCloudPayloads({}, {activeBook:'book1',books:{book1:compactStatsPayload(s.book1),book2:compactStatsPayload(s.book2)},game:v.cbt_game_v1,studyTime:v.cbt_study_time_v1,studyPlans:v.cbt_study_plan_v1,mockExams:mocks,sessions});
   const encoded=encodeCloudProgress(original),decoded=decodeCloudProgress(encoded);
   for(const key of ['books','studyPlans','mockExams','sessions'])assert(JSON.stringify(original[key])===JSON.stringify(decoded[key]),'real backup roundtrip '+key);
   function count(value){if(Array.isArray(value))return 2+new Set(value.map(x=>JSON.stringify(x))).size;if(value&&typeof value==='object')return 2+Object.values(value).reduce((sum,x)=>sum+count(x),0);return 2;}
   assert(count(encoded)-2<40000,'packed backup under default index limit');
   return {answered:decoded.books.book1.answered,beforeIndexEstimate:count(original)-2,afterIndexEstimate:count(encoded)-2,packedBytes:new Blob([JSON.stringify(encoded)]).size};
  })()`,context);
  console.log('Backup check (no live database writes):',measurement);
 }
 await vm.runInContext(`runCloudSync()`,context);
 vm.runInContext(`assert(backups===1,'backup precedes sync');assert(serverCount===1977,'phone uploads latest');assert(reads===0,'transaction result avoids redundant document downloads');assert(states.at(-1)==='ready','ready after committed merge');
 states=[];window.cbtCloud.save=async()=>{throw {code:'invalid-argument',message:'Document exceeds maximum size'};};`,context);
 await vm.runInContext('runCloudSync()',context);
 vm.runInContext(`assert(states.at(-1)==='unavailable','failed save never ready');assert(localCount===1977,'failed save keeps local records');assert(details.at(-1).error.includes('invalid-argument')&&details.at(-1).error.includes('Document exceeds maximum size')&&details.at(-1).error.includes('進捗の保存'),'diagnostic keeps code, full reason and stage');
 states=[];window.cbtCloud.save=async()=>{_syncDirty=true;};`,context);
 await vm.runInContext('runCloudSync()',context);
 vm.runInContext(`assert(states.at(-1)==='pending','new answer during sync is not falsely acknowledged');`,context);
 assert.match(source,/if\(metadata\?\.fromCache\|\|metadata\?\.hasPendingWrites\)return/);checks++;
 assert.match(source,/await db\.runTransaction/);checks++;
 let mirrorAttempts=0;
 context.canViewLeaderboard=()=>true;
 context.window.cbtCloud.publishLeaderboard=async()=>{mirrorAttempts++;throw {code:'permission-denied'};};
 context.window.cbtCloud.save=async()=>{};
 vm.runInContext('states=[];_syncDirty=false;',context);
 await vm.runInContext('runCloudSync()',context);await Promise.resolve();
 vm.runInContext("assert(states.at(-1)==='ready','public ranking failure never invalidates private sync');assert(localCount===1977,'ranking failure preserves private progress');",context);
 assert.equal(mirrorAttempts,1);checks++;
 const timers=new Map();let timerId=0,clock=0;
 class FakeDate extends Date{static now(){return clock;}}
 const pendingResolvers=[],readResolvers=[],eventListeners={},documentListeners={};
 const timeoutContext={
  console:{warn(){}},Date:FakeDate,JSON,Math,Blob,navigator:{onLine:true},
  window:{cbtUser:{uid:'test'},cbtCloud:{save:()=>{timeoutContext.saveCount++;return new Promise(resolve=>pendingResolvers.push(resolve));},readLatest:()=>{timeoutContext.readCount++;return new Promise(resolve=>readResolvers.push(resolve));}},addEventListener(type,listener){eventListeners[type]=listener;}},
  document:{hidden:false,addEventListener(type,listener){documentListeners[type]=listener;}},
  saveCount:0,readCount:0,states:[],details:[],merges:0,localProgress:1,toasts:[],
  setCloudSyncState(state,detail){timeoutContext.states.push(state);timeoutContext.details.push(detail);},
  ensureProgressBackup(){},fullStatsPayload(){return {count:1};},cbtMergeCloud(data){timeoutContext.merges++;timeoutContext.localProgress=data.count;},mergeCloudPayloads(){},canViewLeaderboard(){return false;},
  toast(message){timeoutContext.toasts.push(message);},renderOfflineStatus(){},renderCloudStatus(){},
  cloudErrorDetail(error){return String(error?.message||error||'error');},
  setTimeout(fn,delay=0){const id=++timerId;timers.set(id,{at:clock+delay,fn});return id;},clearTimeout(id){timers.delete(id);},
  el:()=>({addEventListener(){}})
 };
 vm.createContext(timeoutContext);
 vm.runInContext(slice('const CLOUD_SYNC_DEBOUNCE_MS=',"window.cbtStatsSummary=statsSummary;"),timeoutContext);
 async function advance(ms){
  clock+=ms;
  for(;;){
   const due=[...timers].filter(([,timer])=>timer.at<=clock).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0]);
   if(!due.length)break;
   for(const [id,timer] of due){if(!timers.delete(id))continue;timer.fn();await Promise.resolve();}
  }
  await Promise.resolve();
 }
 vm.runInContext('runCloudSync()',timeoutContext);await Promise.resolve();
 assert.equal(timeoutContext.saveCount,1);checks++;
 timeoutContext.states.length=0;vm.runInContext('cloudSyncSoon()',timeoutContext);
 assert.equal(timeoutContext.states.length,0,'answering during an active sync does not overwrite the display with pending');checks++;
 await advance(120000);
 assert.equal(vm.runInContext('_syncBusy',timeoutContext),false,'a permanently pending save releases the lock after 120 seconds');
 assert.equal(timeoutContext.states.at(-1),'unavailable');checks+=2;
 await advance(4000);
 assert.equal(timeoutContext.saveCount,2,'the abandoned attempt is retried with backoff');checks++;
 const stateBeforeOld=timeoutContext.states.at(-1),failuresBeforeOld=vm.runInContext('_syncFailures',timeoutContext);
 pendingResolvers[0]({count:9});await Promise.resolve();await Promise.resolve();
 assert.equal(timeoutContext.readCount,0,'a stale save result does not read the cloud again');
 assert.equal(timeoutContext.merges,0,'a stale save result does not merge into local progress');
 assert.equal(timeoutContext.localProgress,1,'a stale save result leaves local progress unchanged');
 assert.equal(vm.runInContext('_syncBusy',timeoutContext),true,'a late old result does not unlock the current attempt');
 assert.equal(vm.runInContext('_syncFailures',timeoutContext),failuresBeforeOld,'a late old result does not reset failure state');
 assert.equal(timeoutContext.states.at(-1),stateBeforeOld,'a late old result does not overwrite sync status');checks+=6;
 await advance(30000);vm.runInContext('cloudSyncSoon(true)',timeoutContext);await advance(0);
 assert.equal(timeoutContext.saveCount,3,'manual sync abandons an attempt older than 30 seconds and starts a new one');
 assert.equal(vm.runInContext('_syncBusy',timeoutContext),true);checks+=2;
 vm.runInContext('_syncAttempt++;_syncBusy=false;_syncFailures=1;_syncDirty=true;_syncBlockedUntil=Date.now()+3600000;',timeoutContext);
 const quotaBlockedUntil=vm.runInContext('_syncBlockedUntil',timeoutContext),quotaSaveCount=timeoutContext.saveCount;
 eventListeners.online();await advance(0);
 assert.equal(timeoutContext.saveCount,quotaSaveCount,'online does not bypass quota backoff');
 assert.equal(vm.runInContext('_syncBlockedUntil',timeoutContext),quotaBlockedUntil,'online preserves the quota deadline');
 assert.equal(timeoutContext.toasts.length,0,'online toast is hidden when no resend is scheduled');checks+=3;
 documentListeners.visibilitychange();await advance(0);
 assert.equal(timeoutContext.saveCount,quotaSaveCount,'visibility change does not bypass quota backoff');
 assert.equal(vm.runInContext('_syncBlockedUntil',timeoutContext),quotaBlockedUntil,'visibility change preserves the quota deadline');checks+=2;
 vm.runInContext('_syncBlockedUntil=0;',timeoutContext);eventListeners.online();await advance(0);
 assert.equal(timeoutContext.saveCount,quotaSaveCount+1,'online immediately retries a non-quota failure');
 assert.equal(timeoutContext.toasts.length,1,'online toast is shown when resend is scheduled');checks+=2;
 pendingResolvers[3]();await Promise.resolve();await Promise.resolve();
 assert.equal(timeoutContext.readCount,1,'a current save without a result starts the compatibility read');checks++;
 await advance(120000);readResolvers[0]({count:7});await Promise.resolve();await Promise.resolve();
 assert.equal(timeoutContext.merges,0,'a readLatest result arriving after abandonment is not merged');
 assert.equal(timeoutContext.localProgress,1,'a stale readLatest result leaves local progress unchanged');checks+=2;
 console.log('PASS sync: '+checks+' checks (stale devices, two books, XP, study time, plans, linked mock, resume deletion, backup, save error, pending changes).');
})().catch(e=>{console.error(e);process.exitCode=1;});
