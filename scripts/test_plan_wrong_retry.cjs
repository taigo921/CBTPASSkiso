const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
for(const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const retryCode=slice('function planAssignmentProgress(', 'function pendingPlanAssignment(');

// A wrong first answer consumes today's streak chance; resolving it in retry does not raise the route.
{
  let clock=1000;const assignment={date:'2026-11-10',uids:['a'],retry:{}},plan={assignments:{'2026-11-10':assignment}};
  const ctx={Math,Date:{now:()=>++clock},dateKey:()=> '2026-11-10',planFor:()=>plan,saveStudyPlans(){}};
  vm.createContext(ctx);vm.runInContext(`const PLAN_CORRECT_STREAK_TARGET=3;let session={mode:'plan',assignmentDate:'2026-11-10'};${slice('function advancePlanCorrectStreak(', '// ルート開始前')}${retryCode}`,ctx);
  let item=ctx.advancePlanCorrectStreak(null,false,'2026-11-10');ctx.recordPlanRetryAnswer('a',false);
  item=ctx.advancePlanCorrectStreak(item,true,'2026-11-10');ctx.recordPlanRetryAnswer('a',true);
  assert.equal(item.correctStreak,0,'same-day correction does not count after reading the explanation');
  assert.equal(ctx.planRetryPendingUids(assignment).length,0,'the wrong-retry item is still resolved');
}

// Two main-assignment mistakes are retried; a remaining mistake is the only item in round two.
{
  let clock=1000,finished=0,renders=0;const toasts=[];
  const assignment={date:'2026-11-10',uids:['a','b','c'],completedUids:{},assigned:3,completed:0,done:false};
  const plan={assignments:{'2026-11-10':assignment},updatedAt:0};
  const ctx={Object,Math,Date:{now:()=>++clock},dateKey:()=> '2026-11-10',planFor:()=>plan,ensureStudyPlan:()=>plan,createPlanAssignment:()=>assignment,saveStudyPlans(){},saveSession(){},commitExplanationTime(){},renderQuestion(){renders++;},toast:text=>toasts.push(text),finish(){finished++;},clearSession(){},renderList(){},showOnly(){},openStats(){},openStudyPlan(){},el:()=>({classList:{add(){}}}),planBookForUid:uid=>uid==='b'?'book2':'book1'};
  vm.createContext(ctx);vm.runInContext(`let answered=true,session={mode:'plan',uids:['a','b','c'],bookByUid:{a:'book1',b:'book2',c:'book1'},assignmentDate:'2026-11-10',idx:0,records:[],sessionCorrect:0};${retryCode}${slice('function next(', 'function prev(')}`,ctx);
  ctx.recordPlanRetryAnswer('a',false);ctx.markPlanAssignment('a');
  vm.runInContext('session.idx=1',ctx);ctx.recordPlanRetryAnswer('b',false);ctx.markPlanAssignment('b');
  vm.runInContext('session.idx=2',ctx);ctx.recordPlanRetryAnswer('c',true);ctx.markPlanAssignment('c');
  assert.equal(assignment.done,true);assert.deepEqual(Array.from(ctx.planRetryPendingUids(assignment)),['a','b']);
  ctx.next();
  assert.deepEqual(Array.from(vm.runInContext('session.uids',ctx)),['a','b','c','a','b']);
  assert.equal(vm.runInContext('session.idx',ctx),3);assert.equal(vm.runInContext('session.retryRound',ctx),1);
  assert.equal(toasts.at(-1),'間違えた2問をもう一度。正解するまで繰り返します');
  ctx.recordPlanRetryAnswer('a',true);ctx.next();
  assert.equal(vm.runInContext('session.idx',ctx),4);
  ctx.recordPlanRetryAnswer('b',false);ctx.next();
  assert.deepEqual(Array.from(vm.runInContext('session.uids',ctx)),['a','b','c','a','b','b']);
  assert.equal(vm.runInContext('session.retryRound',ctx),2);assert.equal(toasts.at(-1),'間違えた1問をもう一度。正解するまで繰り返します');
  ctx.recordPlanRetryAnswer('b',true);ctx.next();
  assert.equal(finished,1);assert.equal(ctx.planRetryPendingUids(assignment).length,0);assert.equal(renders,3);
  ctx.markPlanAssignment('b');
  assert.equal(assignment.completed,3);assert.equal(assignment.assigned,3,'marking a completed uid again is harmless');
}

// An interrupted completed assignment resumes from today's pending retry items only.
{
  const assignment={date:'2026-11-10',uids:['a','b','c'],completedUids:{a:true,b:true,c:true},assigned:3,completed:3,done:true,retry:{a:{wrongAt:20,clearedAt:0},b:{wrongAt:30,clearedAt:30},c:{wrongAt:40,clearedAt:0}}};
  const plan={assignments:{'2026-11-10':assignment}},saved={mode:'plan',uids:['a','b','c','a'],idx:4,resumeIdx:4,retryRound:3,assignmentDate:'2026-11-10',records:[]};
  let today='2026-11-10',rendered=0,removed=0,home=0;const ctx={Object,Math,Number,Array,planAssignmentProgress:null,dateKey:()=>today,studyPlanSummary:()=>({p:plan,today,studyToday:true,lightDay:false,augustPrep:false}),savedExtraSessionForToday(){},safeGet:()=>saved,sharedPlanSessionKey:()=> 'shared',sessionStoreKey:()=> 'book',safeRemove(){removed++;},renderHome(){home++;},toast(){},planRouteAllows:()=>true,planRouteOrder:u=>u,planBookForUid:()=> 'book1',byUid:()=>true,el:()=>({classList:{remove(){}}}),renderQuestion(){rendered++;},openStudyPlan(){},startStudyPlan(){}};
  vm.createContext(ctx);vm.runInContext(`let session=null;${retryCode}${slice('function resumeSession(', '/* ============ 問題描画')}`,ctx);
  ctx.resumeSession(saved);
  assert.deepEqual(Array.from(vm.runInContext('session.uids',ctx)),['a','c']);assert.equal(vm.runInContext('session.idx',ctx),0);assert.equal(vm.runInContext('session.retryRound',ctx),3);assert.equal(rendered,1);assert.equal(removed,0);
  today='2026-11-11';ctx.resumeSession({...saved,uids:['a'],idx:0,resumeIdx:0});
  assert.equal(removed,1);assert.equal(home,1,'stale-day retry is not resumed or shown');
}

// An interrupted unfinished assignment resumes its remaining main questions, then starts retry.
{
  const assignment={date:'2026-11-10',uids:['a','b','c'],completedUids:{a:true},assigned:3,completed:1,done:false,retry:{a:{wrongAt:20,clearedAt:0}}};
  const plan={assignments:{'2026-11-10':assignment}},saved={mode:'plan',uids:['a','b','c'],idx:1,resumeIdx:1,assignmentDate:'2026-11-10',records:[]};
  let rendered=0,finished=0;const messages=[];
  const ctx={Object,Math,Number,Array,dateKey:()=> '2026-11-10',planFor:()=>plan,studyPlanSummary:()=>({p:plan,today:'2026-11-10',studyToday:true,lightDay:false,augustPrep:false}),savedExtraSessionForToday(){},safeGet:()=>saved,sharedPlanSessionKey:()=> 'shared',sessionStoreKey:()=> 'book',safeRemove(){},renderHome(){},toast:text=>messages.push(text),planRouteAllows:()=>true,planRouteOrder:u=>u,planBookForUid:()=> 'book1',byUid:()=>true,el:()=>({classList:{remove(){},add(){}}}),renderQuestion(){rendered++;},openStudyPlan(){},startStudyPlan(){},commitExplanationTime(){},saveSession(){},finish(){finished++;},clearSession(){},renderList(){},showOnly(){},openStats(){}};
  vm.createContext(ctx);vm.runInContext(`let answered=true,session=null;${retryCode}${slice('function resumeSession(', '/* ============ 問題描画')}${slice('function next(', 'function prev(')}`,ctx);
  ctx.resumeSession(saved);
  assert.deepEqual(Array.from(vm.runInContext('session.uids',ctx)),['a','b','c'],'pending retry does not replace an unfinished main queue');
  assert.equal(vm.runInContext('session.idx',ctx),1,'resume continues at the first remaining main question');
  Object.assign(assignment.completedUids,{b:true,c:true});Object.assign(assignment,{completed:3,done:true});
  vm.runInContext('session.idx=2;session.resumeIdx=2;answered=true',ctx);ctx.next();
  assert.deepEqual(Array.from(vm.runInContext('session.uids',ctx)),['a','b','c','a'],'retry is appended after the main assignment completes');
  assert.equal(vm.runInContext('session.idx',ctx),3);assert.equal(finished,0);assert.equal(rendered,2);
  assert.equal(messages.at(-1),'間違えた1問をもう一度。正解するまで繰り返します');
}

// Previous-day answers do not create retry state, and extra study is blocked while today has pending retries.
{
  const assignment={date:'2026-11-10',uids:['a'],completedUids:{a:true},assigned:1,completed:1,done:true,retry:{a:{wrongAt:5,clearedAt:0}}},plan={assignments:{'2026-11-10':assignment}};
  const messages=[];const ctx={Object,Math,Date:{now:()=>10},dateKey:()=> '2026-11-10',planFor:()=>plan,ensureStudyPlan:()=>plan,createPlanAssignment(){},saveStudyPlans(){},studyPlanSummary:()=>({p:plan,today:'2026-11-10'}),toast:text=>messages.push(text),savedExtraSessionForToday(){throw new Error('pending retry must be checked first');}};
  vm.createContext(ctx);vm.runInContext(`let session={mode:'plan',assignmentDate:'2026-11-09'};${retryCode}${slice('function startExtraStudy(', 'function routeReviewUids(')}`,ctx);
  ctx.recordPlanRetryAnswer('a',false);assert.equal(assignment.retry.a.wrongAt,5);
  ctx.startExtraStudy(10,false);assert.equal(messages.at(-1),'先に今日の間違い直しを終えてください');
  assert.equal(assignment.date==='2026-11-11'?ctx.planRetryPendingUids(assignment).length:0,0,'next day does not consult stale retry state');
}

// Cloud merge keeps all retry uids and takes each timestamp's maximum independently.
{
  const ctx={Object,Math,Set};vm.createContext(ctx);vm.runInContext(slice('function mergeStudyPlanBook(', 'function cbtMergeCloud('),ctx);
  const base={active:true,assignments:{today:{date:'today',uids:['a','local'],completedUids:{},assigned:2,retry:{a:{wrongAt:10,clearedAt:50},local:{wrongAt:7,clearedAt:0}},updatedAt:1}}};
  const cloud={active:true,assignments:{today:{date:'today',uids:['a','cloud'],completedUids:{},assigned:2,retry:{a:{wrongAt:40,clearedAt:20},cloud:{wrongAt:9,clearedAt:3}},updatedAt:2}}};
  const merged=ctx.mergeStudyPlanBook(base,cloud).assignments.today;
  assert.deepEqual(Array.from(merged.uids),['a','local','cloud']);
  assert.deepEqual({...merged.retry.a},{wrongAt:40,clearedAt:50});assert.deepEqual({...merged.retry.local},{wrongAt:7,clearedAt:0});assert.deepEqual({...merged.retry.cloud},{wrongAt:9,clearedAt:3});
}

assert.match(source,/間違い直し 残り\$\{retryPending\.length\}問（今日中に正解するまで）/);
assert.match(source,/今日間違えた\$\{retryPending\.length\}問を正解するまで出題します/);
assert.match(source,/間違い直し 残り\$\{planRetryPendingUids\(assignment\)\.length\}問/);
assert.match(source,/retryActive\?session\.uids\.slice\(session\.idx\)\.filter\(planQuestion\):planRouteOrder/,'retry queues are not removed by normal route mastery filtering');

// Home shows a completed assignment's retry count and routes its card through startStudyPlan without deleting the saved session.
{
  const assignment={date:'2026-11-10',uids:['a','b','c'],completedUids:{a:true,b:true,c:true},assigned:3,completed:3,done:true,retry:{a:{wrongAt:20,clearedAt:0},c:{wrongAt:40,clearedAt:0}}};
  const plan={active:true,items:{},assignments:{'2026-11-10':assignment}},saved={mode:'plan',uids:['a','b','c'],idx:3,resumeIdx:3,assignmentDate:'2026-11-10',records:[]};
  const elements={planHomeCount:{textContent:''}};let removed=0,started=0,opened=0;
  const summary={p:plan,today:'2026-11-10',studyToday:true,total:0,mastered:0,pool:[],due:[],fresh:[],augustPrep:false,lightDay:false};
  const ctx={Object,Math,Number,Array,Set,Date,activeBook:'book1',isAnswerBook:()=>false,toast(){},dateKey:()=> '2026-11-10',planFor:()=>plan,studyPlanSummary:()=>summary,safeGet:key=>key==='shared'?saved:null,sharedPlanSessionKey:()=> 'shared',safeRemove(){removed++;},saveStudyPlans(){},planQuestion:()=>true,planBookForUid:()=> 'book1',planRouteOrder:u=>u,el:id=>elements[id]||(elements[id]={}),startStudyPlan(){started++;},openStudyPlan(){opened++;}};
  vm.createContext(ctx);vm.runInContext(slice('function planAssignmentProgress(', 'function renderPlanCalendar('),ctx);
  const homePlanCode=slice('  const hp=planFor();', "  el('slowSec').value=settings.slowSec;");
  vm.runInContext(`(()=>{${homePlanCode}})()`,ctx);
  assert.match(elements.planHomeCount.textContent,/間違い直し 残り2問/,'home prioritizes the pending retry count over assignment complete');
  assert.equal(removed,0,'rendering home keeps the saved plan session intact');
  vm.runInContext(slice('function openPlanFromHome(', 'function startStudyPlan('),ctx);ctx.openPlanFromHome();
  assert.equal(started,1,'tapping the home route card enters startStudyPlan for retry');assert.equal(opened,0);assert.equal(removed,0);
}
console.log('PASS plan wrong retry: repeat rounds, resume, stale-day isolation, extra block, harmless completion, merge and UI copy');
