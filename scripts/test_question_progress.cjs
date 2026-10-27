const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
for(const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);

const recentStart=source.indexOf('function recentQuestionAttempts(');
const recentEnd=source.indexOf('function questionRouteStatus(',recentStart);
assert.ok(recentStart>=0&&recentEnd>recentStart,'question history helpers exist');
const ctx={Math};vm.createContext(ctx);vm.runInContext(source.slice(recentStart,recentEnd),ctx);

const local={history:[
  {correct:true,at:1},{correct:false,at:2},{correct:true,at:3},{correct:true,at:4},{correct:true,at:5},{correct:true,at:6}
]};
let recent=ctx.recentQuestionAttempts('q1',local,5,{rankAttempts:[]});
assert.deepEqual(recent.map(a=>a.correct),[false,true,true,true,true],'shows the newest five local answers');
assert.equal(ctx.recentCorrectStreak(recent),4,'counts the visible trailing correct run');
const longRun=ctx.recentQuestionAttempts('q1',{history:Array.from({length:7},(_,at)=>({correct:true,at}))},20,{rankAttempts:[]});
assert.equal(ctx.recentCorrectStreak(longRun),7,'streak count can exceed the five visible dots');

recent=ctx.recentQuestionAttempts('q1',{history:[{correct:false,skip:true,at:9}]},5,{rankAttempts:[
  {u:'q1',c:1,a:1},{u:'other',c:1,a:2},{u:'q1',c:0,a:3},{u:'q1',c:1,a:4}
]});
assert.deepEqual(recent.map(a=>a.correct),[true,false,true],'uses the longer synced attempt history for this question');
assert.equal(ctx.recentCorrectStreak(recent),1);

const routeStart=source.indexOf('function questionRouteStatus(');
const routeEnd=source.indexOf('function renderQuestionProgress(',routeStart);
Object.assign(ctx,{PLAN_CORRECT_STREAK_TARGET:3,PLAN_MINIMUM_ROUNDS:5,planItemRound:item=>item.round,planFinalReviewDate:()=> '2027-01-22',formatPlanDate:key=>key});
vm.runInContext(source.slice(routeStart,routeEnd),ctx);
let status=ctx.questionRouteStatus('q1',{active:true,items:{q1:{round:3,correctStreak:2,finalReviewDone:false}}});
assert.match(status.title,/3\/5回.*2\/3回/);assert.match(status.detail,/あと2回＋仕上げ確認1回/);
status=ctx.questionRouteStatus('q1',{active:true,items:{q1:{round:5,correctStreak:3,finalReviewDue:'2027-01-22',finalReviewDone:false}}});
assert.match(status.detail,/仕上げ確認/);
status=ctx.questionRouteStatus('q1',{active:true,items:{q1:{round:5,correctStreak:3,finalReviewDone:true}}});
assert.equal(status.done,true);assert.equal(status.title,'ルート完了');

assert.ok(source.includes('id="qProgress"'),'quiz contains the progress panel');
assert.ok(/renderQuestionProgress\(qkey\(q\),r\)/.test(source),'answer immediately refreshes progress');
assert.ok(/renderQuestionProgress\(r\.uid,pr\)/.test(source),'understanding feedback immediately refreshes route progress');
assert.ok(!source.includes('renderQuestionProgress(qkey(q));'),'progress is not rendered before answering');
assert.match(source,/id="resultBlock"[^>]*>[\s\S]*?id="qProgress"/,'progress panel is inside the explanation result block');
console.log('PASS question progress: correct totals, recent five results, streak, five rounds and final review status');
