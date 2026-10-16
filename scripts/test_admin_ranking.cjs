const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
for(const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
const nodes={};
const context={window:{},el:id=>nodes[id]??=( {textContent:'old',addEventListener(){},classList:{toggle(name,value){this[name]=value;}}})};
vm.createContext(context);
vm.runInContext('let leaderboardUsersCache=[1];'+source.slice(source.indexOf('const LEADERBOARD_ENABLED='),source.indexOf('function updateLeaderboardAccess()'))+source.slice(source.indexOf('function updateLeaderboardAccess()'),source.indexOf('\n}',source.indexOf('function updateLeaderboardAccess()'))+2),context);
vm.runInContext(source.slice(source.indexOf('let leaderboardVisibilityBusy='),source.indexOf('async function openAccessAdmin(')),context);
for(const [user,allowed,visible] of [[null,false,false],[{uid:'other',email:'other@example.test',allowed:false,emailVerified:true},false,false],[{uid:'member',email:'approved@example.test',allowed:true,emailVerified:false},false,true],[{uid:'member',email:'approved@example.test',allowed:true,emailVerified:true},true,true],[{uid:'admin',email:'itaigo921@gmail.com',allowed:true,emailVerified:true},true,true]]){
 context.window.cbtUser=user;assert.equal(context.canViewLeaderboard(),allowed);
 context.updateLeaderboardAccess();assert.equal(nodes.rankBtn.classList.hidden,!visible);
 assert.equal(nodes.accessAdminBtn.classList.hidden,!(user?.email==='itaigo921@gmail.com'&&user?.emailVerified===true));
 assert.equal(nodes.lbBody.textContent,'');assert.equal(vm.runInContext('leaderboardUsersCache',context),null);
}
context.window.cbtUser={uid:'settings',allowed:true,emailVerified:true};context.updateLeaderboardVisibility();
assert.equal(nodes.lbVisibility.disabled,true);assert.match(nodes.lbVisibilityStatus.textContent,/確認中/);
context.window.cbtUser.leaderboardVisible=false;context.updateLeaderboardVisibility();assert.equal(nodes.lbVisibility.checked,false);assert.equal(nodes.lbVisibility.disabled,false);
context.window.cbtUser.leaderboardVisible=true;context.window.cbtUser.emailVerified=false;context.updateLeaderboardVisibility();assert.equal(nodes.lbVisibility.disabled,false,'unverified owners may turn visibility off');
vm.runInContext(source.slice(source.indexOf('function safeAvatar('),source.indexOf('function fileAsDataUrl(')),context);
vm.runInContext(source.slice(source.indexOf('function combinedLeaderboardStats('),source.indexOf('async function renderLeaderboard(')),context);
const legacy={answered:12,correct:9,accuracy:75,game:{xp:100}};
assert.equal(context.combinedLeaderboardStats(legacy).answered,12);
const original={uid:'test',answered:999,correct:999,game:{xp:100},books:{book1:{answered:10,correct:9,accuracy:90,bestStreak:6,lastDay:'2026-10-06',dayStreak:8},book2:{answered:30,correct:15,accuracy:50,bestStreak:4,lastDay:'2026-10-07',dayStreak:2}},mockExams:{answered:100}};
const snapshot=JSON.stringify(original),combined=context.combinedLeaderboardStats(original);
assert.equal(combined.answered,40);assert.equal(combined.correct,24);assert.equal(combined.accuracy,60);
assert.equal(combined.bestStreak,6);assert.equal(combined.lastDay,'2026-10-07');assert.equal(combined.dayStreak,2);
assert.equal(combined.game.xp,100);assert.equal(JSON.stringify(original),snapshot);
assert.equal(context.combinedLeaderboardStats({books:{book2:{answered:20,correct:5}}}).accuracy,25);
assert.equal(context.combinedLeaderboardStats({books:{book1:{answered:0,correct:0}}}).accuracy,0);
const summary=context.leaderboardPublicSummary({...original,email:'private@example.test',perQ:{x:1},studyPlans:{},progressDataV1:'private'});
assert.equal(summary.answered,40);assert.equal(summary.correct,24);assert.equal(summary.accuracy,60);
assert.deepEqual(Object.keys(summary).sort(),['username','avatar','answered','correct','accuracy','bestStreak','dayStreak','lastDay','game'].sort());
const fetchCode=source.slice(source.indexOf('fetchLeaderboard: async function(){'),source.indexOf('\n    subscribe:',source.indexOf('fetchLeaderboard: async function(){'))).trim().replace(/,$/,'');
let reads=0;
context.auth={currentUser:null};context.isAllowedEmail=async email=>['approved@example.test','itaigo921@gmail.com'].includes(email);
context.db={collection:name=>{assert.equal(name,'leaderboard');return {get:async options=>{reads++;assert.equal(options.source,'server');return {forEach(fn){fn({id:'test',data:()=>({...original,email:'private@example.test',progressDataV1:'private'})});}};}};}};
const api=vm.runInContext('({'+fetchCode+'})',context);
(async()=>{
 for(const user of [null,{uid:'other',email:'other@example.test',allowed:false,emailVerified:true},{uid:'unverified',email:'approved@example.test',allowed:true,emailVerified:false}]){
  context.auth.currentUser=user;context.window.cbtUser=user;await assert.rejects(api.fetchLeaderboard());
 }
 assert.equal(reads,0);
 const user={uid:'member',email:'approved@example.test',allowed:true,emailVerified:true,getIdTokenResult:async()=>({claims:{email:'approved@example.test',email_verified:false}})};
 context.auth.currentUser=user;context.window.cbtUser=user;
 await assert.rejects(api.fetchLeaderboard());assert.equal(reads,0);
 user.getIdTokenResult=async()=>({claims:{email:'unapproved@example.test',email_verified:true}});
 await assert.rejects(api.fetchLeaderboard());assert.equal(reads,0);
 user.getIdTokenResult=async()=>({claims:{email:'approved@example.test',email_verified:true}});
 const users=await api.fetchLeaderboard();assert.equal(reads,1);assert.equal(users[0].uid,'test');assert.equal(users[0].answered,40);
 assert.equal(users[0].email,undefined);assert.equal(users[0].progressDataV1,undefined);assert.equal(users[0].books,undefined);
 const publishCode=source.slice(source.indexOf('publishLeaderboard: async function(){'),source.indexOf('    fetchLeaderboard:',source.indexOf('publishLeaderboard: async function(){'))).trim().replace(/,$/,'');
 let published=null,deleted=0,visible;
 context.firebase={firestore:{FieldValue:{serverTimestamp:()=> 'serverTimestamp',delete:()=> 'deleteField'}}};
 const preferenceData=()=>({...original,email:'private@example.test',progressDataV1:'private',...(visible===undefined?{}:{leaderboardVisible:visible})});
 context.db={collection:name=>({doc:uid=>({collection:name,id:uid,get:async options=>{assert.equal(options.source,'server');return {exists:true,data:preferenceData};}})}),runTransaction:async fn=>fn({
  get:async ref=>{assert.equal(ref.collection,'users');assert.equal(ref.id,'member');return {exists:true,data:preferenceData};},
  set:(ref,data)=>{if(ref.collection==='users')visible=data.leaderboardVisible;else published=data;},
  delete:ref=>{assert.equal(ref.collection,'leaderboard');assert.equal(ref.id,'member');published=null;deleted++;}
 })};
 const publisher=vm.runInContext('({'+publishCode+'})',context);
 await publisher.publishLeaderboard();assert.equal(published,null);assert.equal(deleted,1,'default is private');
 visible=true;await publisher.publishLeaderboard();
 assert.ok(published);assert.equal(published.answered,40);assert.equal(published.updatedAt,'serverTimestamp');
 for(const key of ['email','perQ','progressDataV1','studyPlans','books','sessions','mockExams','leaderboardVisible'])assert.equal(published[key],undefined);
 const visibilityCode=source.slice(source.indexOf('getLeaderboardVisibility: async function(){'),source.indexOf('    publishLeaderboard:',source.indexOf('getLeaderboardVisibility: async function(){'))).trim().replace(/,$/,'');
 const settings=vm.runInContext('({'+visibilityCode+'})',context);
 assert.equal(await settings.getLeaderboardVisibility(),true);
 await settings.setLeaderboardVisibility(false);assert.equal(visible,false);assert.equal(published,null);
 await publisher.publishLeaderboard();assert.equal(published,null,'background publish cannot opt back in');
 await settings.setLeaderboardVisibility(true);assert.equal(visible,true);assert.ok(published);
 user.emailVerified=false;await assert.rejects(settings.setLeaderboardVisibility(true));
 await settings.setLeaderboardVisibility(false);assert.equal(published,null,'unverified owners can still remove their listing');user.emailVerified=true;
 // A progress payload must not overwrite the independently stored visibility setting.
 const saveCode=source.slice(source.indexOf('save: async function(payload){'),source.indexOf('    // cache ではなく',source.indexOf('save: async function(payload){'))).trim().replace(/,$/,'');
 context.encodeCloudProgress=p=>p;context.decodeCloudProgress=p=>p;context.window.cbtMergePayloads=(remote,local)=>({...remote,...local});
 let savedFields;
 context.db.runTransaction=async fn=>fn({get:async()=>({exists:true,data:()=>({leaderboardVisible:false})}),set:(ref,body,options)=>{savedFields=options.mergeFields;assert.equal(body.leaderboardVisible,undefined);}});
 await vm.runInContext('({'+saveCode+'})',context).save({leaderboardVisible:true});
 assert.ok(!savedFields.includes('leaderboardVisible'));
 console.log('PASS ranking: approved member visibility, verification and logout guards, combined stats, server-only public summary reads/writes, private fields excluded');
})().catch(e=>{console.error(e);process.exitCode=1;});
