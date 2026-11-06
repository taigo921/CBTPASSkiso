const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
assert.ok(!source.includes('id="lbVisibility"'));assert.ok(!source.includes('getLeaderboardVisibility:'));
const nodes={};const ctx={window:{},el:id=>nodes[id]??={textContent:'',classList:{toggle(k,v){this[k]=v;}}},Map,Set,console,Date};vm.createContext(ctx);
vm.runInContext('let leaderboardUsersCache=null;'+slice('const LEADERBOARD_ENABLED=','const offlineCacheWrites='),ctx);
vm.runInContext(slice('function latestQuestionOutcome(', 'function compactStatsPayload('),ctx);
for(const user of [null,{uid:'member',email:'approved@test',emailVerified:true,allowed:true},{uid:'owner',email:'itaigo921@gmail.com',emailVerified:true,allowed:true}]){
 ctx.window.cbtUser=user;ctx.updateLeaderboardAccess();assert.equal(nodes.rankBtn.classList.hidden,!user);assert.equal(nodes.accessAdminBtn.classList.hidden,user?.uid!=='owner');
}
ctx.safeAvatar=()=>'';vm.runInContext(slice('function leaderboardDateKey(','async function renderLeaderboard('),ctx);
ctx.mockQuestions=()=>[{no:1,answer:'A'}];
const data={username:'Test',email:'approved@test',leaderboardVisible:false,books:{book1:{answered:10,correct:9,lastDay:'2026-9-22',dayStreak:8},book2:{answered:30,correct:15,lastDay:'2026-10-16',dayStreak:2}},lastDay:'2026-9-22',game:{xp:100},progressDataV1:'private'};
const publicData=ctx.leaderboardPublicSummary(data);assert.equal(publicData.answered,40);assert.equal(publicData.correct,24);assert.equal(publicData.email,undefined);assert.equal(publicData.progressDataV1,undefined);
assert.equal(publicData.lastDay,'2026-10-16');assert.equal(publicData.dayStreak,2);
assert.equal(ctx.leaderboardPublicSummary({username:'Old',lastDay:'2026-9-2'}).lastDay,'2026-09-02');
assert.equal(ctx.leaderboardDateKey('2026-2-30'),null);assert.equal(ctx.leaderboardDateKey('invalid'),null);
assert.equal(data.books.book1.lastDay,'2026-9-22','original progress dates unchanged');
const current=ctx.leaderboardPublicSummary({username:'Current',books:{book1:{perQ:{a:{c:8,w:2,l:'wrong',h:{correct:true,at:2}},b:{c:4,w:1,l:'correct',h:{correct:false,at:3}}}},book2:{perQ:{c:{c:1,w:0,l:'correct'}}}},game:{xp:0}});
assert.equal(current.answered,16);assert.equal(current.correct,13);assert.equal(current.accuracy,66.7);
const allMaterials=ctx.leaderboardPublicSummary({username:'All',books:{book1:{perQ:{a:{c:2,w:1,h:{correct:false,at:10}}}},book2:{perQ:{b:{c:1,w:0,h:{correct:true,at:20}}}}},mockExams:{1:{updatedAt:200,answers:{1:{picked:'A',answered:true,updatedAt:200}}}},practiceSets:{dictionary2:{updatedAt:300,answers:{A001:{attempts:[{picked:'B',correct:true,at:100},{picked:'C',correct:false,at:300}]}}},dentalMaterials:{updatedAt:400,answers:{'FORM-003':{attempts:[{picked:'D',correct:true,at:400}]}}}},game:{xp:0}});
assert.equal(allMaterials.answered,8);assert.equal(allMaterials.correct,6);assert.equal(allMaterials.accuracy,60);assert.equal(allMaterials.bestStreak,2);
let reads=[],writes=[],deletes=[];const profiles={member:data,blocked:{...data,email:'blocked@test'},outsider:{...data,email:'no@test'}};
const admin={uid:'owner',email:'itaigo921@gmail.com',emailVerified:true,allowed:true};const member={uid:'member',email:'approved@test',emailVerified:true,allowed:true,getIdTokenResult:async()=>({claims:{email:'approved@test',email_verified:true}})};
ctx.auth={currentUser:member};ctx.window.cbtUser=member;ctx.isAllowedEmail=async e=>['approved@test','blocked@test'].includes(e);ctx.transactionCloudProgress=async(_transaction,_ref,snapshot)=>snapshot.data();ctx.firebase={firestore:{FieldValue:{serverTimestamp:()=>42}}};
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
