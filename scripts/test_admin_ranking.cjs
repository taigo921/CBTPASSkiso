const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
assert.ok(!source.includes('id="lbVisibility"'));assert.ok(!source.includes('getLeaderboardVisibility:'));
const nodes={};const ctx={window:{},el:id=>nodes[id]??={textContent:'',classList:{toggle(k,v){this[k]=v;}}},Map,Set,console};vm.createContext(ctx);
vm.runInContext('let leaderboardUsersCache=null;'+slice('const LEADERBOARD_ENABLED=','const offlineCacheWrites='),ctx);
for(const user of [null,{uid:'member',email:'approved@test',emailVerified:true,allowed:true},{uid:'owner',email:'itaigo921@gmail.com',emailVerified:true,allowed:true}]){
 ctx.window.cbtUser=user;ctx.updateLeaderboardAccess();assert.equal(nodes.rankBtn.classList.hidden,!user);assert.equal(nodes.accessAdminBtn.classList.hidden,user?.uid!=='owner');
}
ctx.safeAvatar=()=>'';vm.runInContext(slice('function combinedLeaderboardStats(','async function renderLeaderboard('),ctx);
const data={username:'Test',email:'approved@test',leaderboardVisible:false,books:{book1:{answered:10,correct:9},book2:{answered:30,correct:15}},game:{xp:100},progressDataV1:'private'};
const publicData=ctx.leaderboardPublicSummary(data);assert.equal(publicData.answered,40);assert.equal(publicData.correct,24);assert.equal(publicData.email,undefined);assert.equal(publicData.progressDataV1,undefined);
let reads=[],writes=[],deletes=[];const profiles={member:data,blocked:{...data,email:'blocked@test'},outsider:{...data,email:'no@test'}};
const admin={uid:'owner',email:'itaigo921@gmail.com',emailVerified:true,allowed:true};const member={uid:'member',email:'approved@test',emailVerified:true,allowed:true,getIdTokenResult:async()=>({claims:{email:'approved@test',email_verified:true}})};
ctx.auth={currentUser:member};ctx.window.cbtUser=member;ctx.isAllowedEmail=async e=>['approved@test','blocked@test'].includes(e);ctx.firebase={firestore:{FieldValue:{serverTimestamp:()=>42}}};
ctx.db={collection(name){return {doc(uid){return {name,uid};},async get(o){assert.equal(o.source,'server');reads.push(name);const rows=name==='users'?profiles:name==='accessControl'?{blocked:{blocked:true}}:{blocked:{},old:{}};return {forEach(fn){for(const [id,v] of Object.entries(rows))fn({id,data:()=>v});}};} };},async runTransaction(fn){await fn({get:async()=>({exists:true,data:()=>data}),set(ref,v){writes.push([ref.uid,v]);}});},batch(){return {set(ref,v){writes.push([ref.uid,v]);},delete(ref){deletes.push(ref.uid);},async commit(){}};}};
const api=vm.runInContext('({'+slice('    publishLeaderboard:','    fetchAccessUsers:')+'})',ctx);
(async()=>{
 await api.publishLeaderboard();assert.equal(writes.length,1,'old false preference no longer blocks automatic publication');assert.equal(writes[0][1].answered,40);
 await assert.rejects(api.refreshLeaderboardMembers());assert.equal(reads.length,0,'ordinary member cannot read private member list');
 ctx.auth.currentUser=admin;ctx.window.cbtUser=admin;writes=[];await api.refreshLeaderboardMembers();assert.deepEqual(writes.map(x=>x[0]),['member']);assert.deepEqual(deletes.sort(),['blocked','old']);assert.equal(writes[0][1].email,undefined);
 const fetcher=vm.runInContext('({'+slice('    fetchLeaderboard:','    subscribe:')+'})',ctx);
 ctx.auth.currentUser=member;ctx.window.cbtUser=member;reads=[];await fetcher.fetchLeaderboard();assert.deepEqual(reads,['leaderboard']);
 console.log('PASS all-member ranking: no opt-out UI, member reads only public summaries, automatic publication ignores old preferences, admin backfill excludes blocked/unapproved, access management owner-only');
})().catch(e=>{console.error(e);process.exitCode=1;});
