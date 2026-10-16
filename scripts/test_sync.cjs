// No live Firebase credentials or user records. Exercise production merge/sync functions.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
let checks=0;
const context={console:{warn(){}},Date,JSON,Math,Map,Set,Object,Number,String,window:{cbtUser:{uid:'test'}},navigator:{onLine:true},setTimeout:()=>1,clearTimeout(){},el:()=>({addEventListener(){}}),assert:(v,m)=>{assert.ok(v,m);checks++;}};
vm.createContext(context);
context.Blob=Blob;
vm.runInContext(`const emptyStats=()=>({perQ:{},rankAttempts:[]});
${slice('function statsSummaryFor(', 'function fullStatsPayload(')}
${slice('function mergeStatsTarget(', 'function cbtMergeCloud(')}
${slice('function mockKeyFor(', 'function progressBackupData(')}
${slice('function mergeCloudPayloads(', "el('syncNowBtn').addEventListener")}
`,context);
vm.runInContext(`
function payload(n,xp){return {activeBook:'book1',books:{book1:{perQ:{q:{c:n,w:0}}},book2:{perQ:{b:{c:3,w:2}}}},game:{xp},studyTime:{days:{'2026-09-23':{seconds:n,questions:5,book1:n,book2:0}}},studyPlans:{shared:{updatedAt:n,items:{q:{updatedAt:n,round:n}},assignments:{day:{uids:['q'],completedUids:{q:true},updatedAt:n}}}}};}
const phone=payload(1977,13179),ipad=payload(1692,11294);
for(const [a,b] of [[phone,ipad],[ipad,phone]]){
 const merged=mergeCloudPayloads(a,b);
 const encoded=encodeCloudProgress(merged),decoded=decodeCloudProgress(encoded);
 for(const key of ['books','studyPlans','mockExams','sessions'])assert(JSON.stringify(merged[key])===JSON.stringify(decoded[key]),'packed roundtrip '+key);
 assert(merged.books.book1.answered===1977,'latest count preserved in both directions');
 assert(merged.books.book2.answered===5,'book2 remains separate');
 assert(merged.game.xp===13179,'XP never rolled back');
 assert(merged.studyTime.days['2026-09-23'].seconds===1977,'study time retained');
 assert(merged.studyPlans.shared.items.q.round===1977,'latest plan item retained');
 assert(mergeCloudPayloads(merged,merged).books.book1.answered===1977,'idempotent stats');
}
const old={5:{index:0,answers:{1:{picked:'B',answered:false,updatedAt:50}}}},fresh={5:{index:2,answers:{1:{picked:'A',answered:true,updatedAt:10},2:{picked:'C',answered:true,updatedAt:20}}}};
for(const [a,b] of [[old,fresh],[fresh,old]]){const m=mergeMockPayload(a,b);assert(m[5].index===2,'linked frontier retained');assert(m[5].answers[1].picked==='A','confirmed answer beats newer unconfirmed selection');}
assert(mergeSessionPayload({book1:{idx:3,updatedAt:1}},{book1:{idx:9,updatedAt:2}}).book1.idx===9,'resume follows newer device');
assert(mergeSessionPayload({book1:{deleted:true,updatedAt:3}},{book1:{idx:9,updatedAt:2}}).book1.deleted,'deleted resume does not resurrect');
const packed=encodeCloudProgress(mergeCloudPayloads({},phone));
const mixed=decodeCloudProgress({...packed,books:payload(2200,14000).books});
assert(mixed.books.book1.answered===2200,'new answers from legacy clients survive packed migration');
let rejected=false;try{decodeCloudProgress({progressDataV1:'broken'});}catch(_){rejected=true;}assert(rejected,'invalid packed data blocks overwrite');
let states=[],details=[],backups=0,localCount=1977,serverCount=1692;
function setCloudSyncState(state,detail){states.push(state);details.push(detail);}
function ensureProgressBackup(){backups++;}
function cbtMergeCloud(data){localCount=Math.max(localCount,data.count);}
function fullStatsPayload(){return {count:localCount};}
window.cbtCloud={readLatest:async()=>({count:serverCount}),save:async p=>{serverCount=Math.max(serverCount,p.count);}};
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
 vm.runInContext(`assert(backups===1,'backup precedes sync');assert(serverCount===1977,'phone uploads latest');assert(states.at(-1)==='ready','ready after readback');
 states=[];window.cbtCloud.save=async()=>{throw {code:'invalid-argument',message:'Document exceeds maximum size'};};`,context);
 await vm.runInContext('runCloudSync()',context);
 vm.runInContext(`assert(states.at(-1)==='unavailable','failed save never ready');assert(localCount===1977,'failed save keeps local records');assert(details.at(-1).error.includes('invalid-argument')&&details.at(-1).error.includes('Document exceeds maximum size')&&details.at(-1).error.includes('進捗の保存'),'diagnostic keeps code, full reason and stage');
 states=[];window.cbtCloud.save=async()=>{_syncDirty=true;};`,context);
 await vm.runInContext('runCloudSync()',context);
 vm.runInContext(`assert(states.at(-1)==='pending','new answer during sync is not falsely acknowledged');`,context);
 assert.match(source,/if\(metadata\?\.fromCache\|\|metadata\?\.hasPendingWrites\)return/);checks++;
 assert.match(source,/await db\.runTransaction/);checks++;
 console.log('PASS sync: '+checks+' checks (stale devices, two books, XP, study time, plans, linked mock, resume deletion, backup, save error, pending changes).');
})().catch(e=>{console.error(e);process.exitCode=1;});
