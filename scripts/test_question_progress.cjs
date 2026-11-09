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

const twoCorrect=[{correct:true,at:1},{correct:true,at:2}];
assert.equal(ctx.questionCorrectStreak('filled',{correct:3,wrong:0,history:twoCorrect},{rankAttempts:[]}),3,'confirmed missing older correct answer extends the streak');
assert.equal(ctx.questionCorrectStreak('unknownWrong',{correct:3,wrong:1,history:twoCorrect},{rankAttempts:[]}),2,'missing answers are not filled while an incorrect answer is unaccounted for');
assert.equal(ctx.questionCorrectStreak('knownWrong',{correct:3,wrong:1,history:[{correct:false,at:1},{correct:true,at:2}]},{rankAttempts:[]}),1,'a known wrong answer keeps only the trailing correct run');
assert.equal(ctx.questionCorrectStreak('latestWrong',{correct:3,wrong:1,streak:3,history:[{correct:true,at:1},{correct:false,at:2}]},{rankAttempts:[]}),0,'latest wrong answer resets a synced streak');

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
assert.equal(ctx.planIsMastered({correctStreak:0,explained:true}),true,'explanation mastery button finishes the question');
assert.equal(ctx.planRemainingEffort({correctStreak:2}),70,'only one answer remains after a two-correct streak');
assert.equal(ctx.planNextDue('q1',3,true,'2026-10-27',{}),'9999-12-31','mastered question is no longer scheduled');

// Answers made before the route (or the streak counter) existed still count toward the route streak.
ctx.statsByBook={book1:{perQ:{q2:{correct:2,wrong:0,history:[{correct:true,at:1},{correct:true,at:2}]},q3:{correct:2,wrong:1,history:[{correct:true,at:1},{correct:false,at:2},{correct:true,at:3}]},q4:{correct:5,wrong:0,history:Array.from({length:5},(_,at)=>({correct:true,at}))}},rankAttempts:[]},book2:{perQ:{},rankAttempts:[]}};
assert.equal(ctx.planHistoryStreak('q2'),2,'two earlier consecutive correct answers give a 2/3 route streak');
assert.equal(ctx.planHistoryStreak('q3'),1,'a wrong answer in history resets the route streak');
assert.equal(ctx.planHistoryStreak('q4'),3,'history streak is capped at the route target');
assert.equal(ctx.planHistoryStreak('missing'),0,'unanswered questions have no streak');
const assignmentPlan={items:{q4:{correctStreak:3},q2:{correctStreak:2}},assignments:{day:{uids:['q4','q2'],completedUids:{},done:false}}};
ctx.planCompleteMasteredAssignments(assignmentPlan);
assert.equal(assignmentPlan.assignments.day.completed,1,'mastered items count as completed in open assignments');
assert.equal(assignmentPlan.assignments.day.done,false);
ctx.statsByBook.book1.perQ.filled={correct:3,wrong:0,history:twoCorrect};
const filledPlan={items:{filled:{correctStreak:2,due:'2026-10-28'}},assignments:{day:{uids:['filled'],completedUids:{},done:false}}};
assert.equal(ctx.raisePlanItemHistoryStreak(filledPlan,'filled','2026-10-27'),true);
ctx.planCompleteMasteredAssignments(filledPlan);
assert.equal(filledPlan.items.filled.correctStreak,3,'confirmed history raises the route streak to three');
assert.equal(filledPlan.items.filled.completed,true,'three confirmed correct answers complete the route item');
assert.equal(filledPlan.assignments.day.done,true,'three confirmed correct answers complete its assignment');

const renderStart=source.indexOf('function renderQuestionProgress('),renderEnd=source.indexOf('function migrateGameData(',renderStart);
const progressBox={innerHTML:''};
Object.assign(ctx,{stats:{perQ:{filled:ctx.statsByBook.book1.perQ.filled}},el:()=>progressBox,questionRouteStatus:()=>null});
vm.runInContext(source.slice(renderStart,renderEnd),ctx);
ctx.renderQuestionProgress('filled',ctx.stats.perQ.filled);
assert.match(progressBox.innerHTML,/記録なし">・<\/i><i class="question-result-dot empty" aria-label="記録なし">・<\/i><i class="question-result-dot ok" aria-label="正解">○<\/i><i class="question-result-dot ok" aria-label="正解">○<\/i><i class="question-result-dot ok" aria-label="正解">○<\/i>/,'confirmed missing correct fills an older empty dot slot');
assert.match(progressBox.innerHTML,/○ 3連続/);

const feedbackStart=source.indexOf('function setPlanExplanation(');
const feedbackEnd=source.indexOf('function studyPlanSummary(',feedbackStart);
ctx.testPlan={active:true,items:{q1:{correctStreak:0,due:'2026-10-28',explained:false}},assignments:{day:{uids:['q1'],completedUids:{},assigned:1,completed:0,done:false}}};
Object.assign(ctx,{planFor:()=>ctx.testPlan,dateKey:()=> '2026-10-27',saveStudyPlans:()=>{}});
vm.runInContext(source.slice(feedbackStart,feedbackEnd),ctx);
ctx.setPlanExplanation('q1',true);
assert.equal(ctx.testPlan.items.q1.mastered,true,'explanation mastery button marks the item mastered');
assert.equal(ctx.testPlan.items.q1.due,'9999-12-31','explanation mastery removes the item from future scheduling');
assert.equal(ctx.testPlan.assignments.day.done,true,'explanation mastery completes an assignment containing the item');
ctx.setPlanExplanation('q1',false);
assert.equal(ctx.testPlan.items.q1.mastered,false,'removing explanation mastery reopens an item without a three-answer streak');
assert.equal(ctx.testPlan.items.q1.due,'2026-10-27','reopened item becomes due again');

const routeStart=source.indexOf('function questionRouteStatus(');
const routeEnd=source.indexOf('function renderQuestionProgress(',routeStart);
vm.runInContext(source.slice(routeStart,routeEnd),ctx);
let status=ctx.questionRouteStatus('q1',{active:true,items:{q1:{round:8,correctStreak:2}}});
assert.equal(status.title,'連続正解 2/3回');assert.equal(status.detail,'あと1回連続正解で終了');
status=ctx.questionRouteStatus('q1',{active:true,items:{q1:{round:3,correctStreak:3}}});
assert.equal(status.done,true);assert.equal(status.title,'ルート完了');
status=ctx.questionRouteStatus('q1',{active:true,items:{q1:{round:1,correctStreak:0,explained:true}}});
assert.equal(status.done,true);assert.equal(status.detail,'誤答理由まで説明できる');

assert.ok(source.includes('id="qProgress"'),'quiz contains the progress panel');
assert.ok(/renderQuestionProgress\(qkey\(q\),r\)/.test(source),'answer immediately refreshes progress');
assert.ok(/renderQuestionProgress\(r\.uid,pr\)/.test(source),'understanding feedback immediately refreshes route progress');
assert.ok(/if\(planFor\(\)\.active\)updateStudyPlan\(qkey\(q\),correct\);/.test(source),'every practice mode advances the active three-correct route');
assert.ok(!source.includes('renderQuestionProgress(qkey(q));'),'progress is not rendered before answering');
assert.match(source,/id="resultBlock"[^>]*>[\s\S]*?id="qProgress"/,'progress panel is inside the explanation result block');
assert.match(source,/historyStreakV/,'existing plans migrate route streaks from answer history once');
assert.match(source,/correctStreak:streak,correctStreakDate:streak\?last:null/,'rebuilt plans start from the answer-history streak');
console.log('PASS question progress: correct totals, recent five results, history-based route streak, and streak/explanation mastery completion status');
