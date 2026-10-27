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

const planStart=source.indexOf('function planItemStreak(');
const planEnd=source.indexOf('function planFor(',planStart);
Object.assign(ctx,{PLAN_CORRECT_STREAK_TARGET:3,PLAN_EFFORTS:[100,80,70],PLAN_INTERVALS:[1,3,7],planFinishDate:()=> '2027-01-22',planPersonalInterval:(_uid,days)=>days,addPlanDays:(key,days)=>{
  const date=new Date(key+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);
}});
vm.runInContext(source.slice(planStart,planEnd),ctx);
let learning={correctStreak:1,correctStreakDate:'2026-10-27'};
assert.equal(ctx.advancePlanCorrectStreak(learning,true,'2026-10-27').correctStreak,2,'same-day correct answer advances the attempt streak');
assert.equal(ctx.advancePlanCorrectStreak({correctStreak:2},false,'2026-10-27').correctStreak,0,'a wrong answer resets the streak');
assert.equal(ctx.planIsMastered({correctStreak:3}),true,'three consecutive correct answers finish the question');
assert.equal(ctx.planRemainingEffort({correctStreak:2}),70,'only one answer remains after a two-correct streak');
assert.equal(ctx.planNextDue('q1',3,true,'2026-10-27',{}),'9999-12-31','mastered question is no longer scheduled');

const routeStart=source.indexOf('function questionRouteStatus(');
const routeEnd=source.indexOf('function renderQuestionProgress(',routeStart);
vm.runInContext(source.slice(routeStart,routeEnd),ctx);
let status=ctx.questionRouteStatus('q1',{active:true,items:{q1:{round:8,correctStreak:2}}});
assert.equal(status.title,'連続正解 2/3回');assert.equal(status.detail,'あと1回連続正解で終了');
status=ctx.questionRouteStatus('q1',{active:true,items:{q1:{round:3,correctStreak:3}}});
assert.equal(status.done,true);assert.equal(status.title,'ルート完了');

assert.ok(source.includes('id="qProgress"'),'quiz contains the progress panel');
assert.ok(/renderQuestionProgress\(qkey\(q\),r\)/.test(source),'answer immediately refreshes progress');
assert.ok(/renderQuestionProgress\(r\.uid,pr\)/.test(source),'understanding feedback immediately refreshes route progress');
assert.ok(/if\(planFor\(\)\.active\)updateStudyPlan\(qkey\(q\),correct\);/.test(source),'every practice mode advances the active three-correct route');
assert.ok(!source.includes('renderQuestionProgress(qkey(q));'),'progress is not rendered before answering');
assert.match(source,/id="resultBlock"[^>]*>[\s\S]*?id="qProgress"/,'progress panel is inside the explanation result block');
console.log('PASS question progress: correct totals, recent five results, streak-only route completion status');
