const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
for(const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
const nodes={};
const context={window:{},el:id=>nodes[id]??=( {textContent:'old',classList:{toggle(name,value){this[name]=value;}}})};
vm.createContext(context);
vm.runInContext('let leaderboardUsersCache=[1];'+source.slice(source.indexOf('const LEADERBOARD_ENABLED='),source.indexOf('function updateLeaderboardAccess()'))+source.slice(source.indexOf('function updateLeaderboardAccess()'),source.indexOf('\n}',source.indexOf('function updateLeaderboardAccess()'))+2),context);
for(const [user,allowed] of [[null,false],[{email:'other@example.com',emailVerified:true},false],[{email:'taigo921@gmail.com',emailVerified:true},false],[{email:'itaigo921@gmail.com',emailVerified:false},false],[{email:'itaigo921@gmail.com',emailVerified:true},true]]){
 context.window.cbtUser=user;
 assert.equal(context.canViewLeaderboard(),allowed);
 context.updateLeaderboardAccess();
 assert.equal(nodes.rankBtn.classList.hidden,!(user&&user.email==='itaigo921@gmail.com'));
 assert.equal(nodes.lbBody.textContent,'');
 assert.equal(vm.runInContext('leaderboardUsersCache',context),null);
}
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
const fetchCode=source.slice(source.indexOf('fetchLeaderboard: async function(){'),source.indexOf('\n    subscribe:',source.indexOf('fetchLeaderboard: async function(){'))).trim().replace(/,$/,'');
let reads=0;
context.auth={currentUser:null};
context.db={collection:()=>({get:async options=>{reads++;assert.equal(options.source,'server');return {forEach(){}};}})};
const api=vm.runInContext('({'+fetchCode+'})',context);
(async()=>{
 for(const user of [null,{email:'other@example.com',emailVerified:true},{email:'taigo921@gmail.com',emailVerified:true},{email:'itaigo921@gmail.com',emailVerified:false}]){
  context.auth.currentUser=user;await assert.rejects(api.fetchLeaderboard());
 }
 assert.equal(reads,0);
 context.auth.currentUser={uid:'admin',email:'itaigo921@gmail.com',emailVerified:true,getIdTokenResult:async()=>({claims:{email:'itaigo921@gmail.com',email_verified:false}})};
 await assert.rejects(api.fetchLeaderboard());assert.equal(reads,0);
 context.auth.currentUser.getIdTokenResult=async()=>({claims:{email:'itaigo921@gmail.com',email_verified:true}});
 await api.fetchLeaderboard();assert.equal(reads,1);
 console.log('PASS: syntax, admin visibility, logout clearing, request guards and server-only read');
})().catch(e=>{console.error(e);process.exitCode=1;});
