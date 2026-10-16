const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
const admin={uid:'owner',email:'itaigo921@gmail.com',emailVerified:true};
const data={users:{learner:{username:'Test',email:'test@example.test',progressDataV1:'private'}},accessControl:{},leaderboard:{learner:{answered:4}}};
let reads=0,listener,errorListener,signouts=0,stops=0;
const node=()=>({textContent:'',classList:{remove(k){this[k]=false;}}});
const ctx={window:{cbtUser:admin,addEventListener(){}},document:{getElementById:()=>node(),addEventListener(){}},gate:node(),errEl:node(),auth:{currentUser:admin,signOut:async()=>{signouts++;}},firebase:{firestore:{FieldValue:{serverTimestamp:()=>42}}},clearTimeout(){},updateLeaderboardAccess(){},stopTimer(){stops++;},Map,console};
ctx.db={collection(name){return {get:async o=>{reads++;assert.equal(o.source,'server');return {forEach(fn){for(const [id,v] of Object.entries(data[name]))fn({id,data:()=>v});}};},doc(uid){return {name,uid,get:async o=>{reads++;assert.equal(o.source,'server');return {exists:!!data[name][uid],data:()=>data[name][uid]};},onSnapshot(fn,err){listener=fn;errorListener=err;return ()=>{};}};}};},async runTransaction(fn){await fn({get:async r=>({exists:!!data[r.name][r.uid]}),set(r,v){data[r.name][r.uid]=v;},delete(r){delete data[r.name][r.uid];}});}};
vm.createContext(ctx);vm.runInContext(slice('const LEADERBOARD_ENABLED=','function updateLeaderboardAccess()')+'let stopCloudSubscription=null,_syncT=null;'+slice('  let stopAccessSubscription=','  // ログイン状態の監視'),ctx);
const api=vm.runInContext('({'+slice('    fetchAccessUsers: async function(){','    fetchLeaderboard: async function(){')+'})',ctx);
(async()=>{
 for(const user of [null,{uid:'other',email:'x@test',emailVerified:true,allowed:true},{...admin,emailVerified:false}]){ctx.auth.currentUser=user;await assert.rejects(api.fetchAccessUsers());await assert.rejects(api.setUserBlocked('learner',true));}
 assert.equal(reads,0);ctx.auth.currentUser=admin;
 for(const [uid,value] of [['owner',true],['bad/id',true],['learner','true'],['missing',true]])await assert.rejects(api.setUserBlocked(uid,value));
 const before=JSON.stringify(data.users);await api.setUserBlocked('learner',true);
 assert.equal(data.leaderboard.learner,undefined,'blocking removes public ranking');
 const rows=await api.fetchAccessUsers();assert.equal(rows[0].blocked,true);assert.equal(rows[0].progressDataV1,undefined);
 await assert.rejects(ctx.requireAccess({uid:'learner'}),e=>e.code==='access-blocked');
 await api.setUserBlocked('learner',false);await ctx.requireAccess({uid:'learner'});assert.equal(JSON.stringify(data.users),before);
 ctx.watchAccess(admin,0);
 listener({exists:true,data:()=>({blocked:true}),metadata:{fromCache:true}});assert.equal(signouts,0);
 listener({exists:true,data:()=>({blocked:true}),metadata:{hasPendingWrites:true}});assert.equal(signouts,0);
 listener({exists:true,data:()=>({blocked:true}),metadata:{}});assert.equal(signouts,1);assert.equal(ctx.window.cbtUser,null);assert.ok(stops>0);
 ctx.window.cbtUser=admin;errorListener();assert.equal(ctx.window.cbtUser,null);
 ctx.db.collection=()=>({doc:()=>({get:async()=>{throw Error('offline');}})});await assert.rejects(ctx.requireAccess(admin));
 console.log('PASS access API and gate: admin-only, self protection, reversible block, progress retained, server check, active stop, stale cache ignored, errors lock');
})().catch(e=>{console.error(e);process.exitCode=1;});
