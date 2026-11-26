const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

class FixedDate extends Date{static now(){return 999999;}}
const old={
  active:true,examDate:'2027-01-26',finishLeadDays:30,unavailable:{},schoolOff:{},lightDays:{},paperProgress:{},
  items:{
    explained:{round:4,stage:1,due:'2026-11-20',last:'2026-11-19',explained:true,correctStreak:0,correctStreakDate:null,mastered:false,completed:false,updatedAt:101},
    three:{round:3,stage:2,due:'9999-12-31',last:'2026-11-18',explained:false,correctStreak:3,correctStreakDate:'2026-11-18',streakDay:'2026-11-18',mastered:true,completed:true,updatedAt:102},
    raised:{round:1,stage:1,due:'2026-11-22',last:'2026-11-21',explained:false,correctStreak:1,correctStreakDate:'2026-11-21',streakDay:'2026-11-21',mastered:false,completed:false,updatedAt:103},
    oldOnly:{round:2,stage:1,due:'2026-11-23',last:'2026-11-22',explained:false,correctStreak:1,updatedAt:104},
    stable:{round:2,stage:1,due:'2026-11-26',last:'2026-11-25',explained:false,correctStreak:1,correctStreakDate:'2026-11-25',streakDay:'2026-11-25',mastered:false,completed:false,updatedAt:105}
  },assignments:{oldDay:{uids:['raised']}},daily:{date:'2026-11-24',count:1},updatedAt:200
};
const histories={explained:0,three:1,raised:2,stable:1,newOnly:1};
const statsByBook={book1:{perQ:{explained:{correct:1,wrong:0},three:{correct:1,wrong:0},raised:{correct:2,wrong:0},stable:{correct:1,wrong:1},newOnly:{correct:1,wrong:0}},rankAttempts:[]},book2:{perQ:{},rankAttempts:[]}};
const studyPlans={shared:old};let saved;
const context={
  Date:FixedDate,Math,Number,Object,Set,ROUTE_BOOK_KEYS:['book1','book2'],statsByBook,studyPlans,
  PLAN_CORRECT_STREAK_TARGET:3,PLAN_STREAK_ONLY_VERSION:1,PLAN_HISTORY_STREAK_VERSION:2,PLAN_INTERVALS:[1,3,7],
  planFor:()=>studyPlans.shared,planHistoryStreak:uid=>histories[uid]||0,dateKey:()=> '2026-11-25',
  addPlanDays:()=> '2026-11-26',applyPaperBaseline(){},saveStudyPlans(){saved=studyPlans.shared;},toast(){}
};
vm.createContext(context);
vm.runInContext(slice('function planItemStreak(', 'function planRemainingEffort(')+slice('function samePlanItemContent(', 'function ensureStudyPlan('),context);
const rebuilt=context.rebuildStudyPlan(false);

assert.equal(rebuilt.items.explained.explained,true);
assert.equal(context.planIsMastered(rebuilt.items.explained),true,'explainable item remains mastered');
assert.equal(rebuilt.items.explained.mastered,true);assert.equal(rebuilt.items.explained.completed,true);
assert.equal(rebuilt.items.explained.due,'9999-12-31');assert.equal(rebuilt.items.explained.updatedAt,101);

assert.equal(rebuilt.items.three.correctStreak,3,'route streak does not drop to the lower history streak');
assert.equal(context.planIsMastered(rebuilt.items.three),true);assert.equal(rebuilt.items.three.updatedAt,102,'unchanged mastered item keeps its timestamp');

assert.equal(rebuilt.items.raised.correctStreak,2,'higher history streak raises the route streak');
assert.equal(rebuilt.items.raised.updatedAt,FixedDate.now(),'raised item receives a new timestamp');
assert.equal(rebuilt.items.oldOnly.updatedAt,104,'item absent from answer history is retained');
assert.equal(rebuilt.items.stable.updatedAt,105,'unchanged non-mastered item keeps its timestamp');
assert.equal(rebuilt.items.newOnly.correctStreak,1);assert.equal(rebuilt.items.newOnly.explained,false,'new history item is created as before');
assert.deepEqual(Object.keys(rebuilt.assignments),[],'daily assignments are rebuilt');
assert.equal(saved,rebuilt);
assert.match(source,/習得済み・「説明できる」状態と連続正解数を保ったまま、毎日の課題を回答履歴から作り直しますか？/);
console.log('PASS plan rebuild: explainable/mastered items and higher route streaks keep timestamps, history can raise streaks, old-only items remain, and assignments reset');
