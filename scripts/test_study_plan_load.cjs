const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
for(const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);

const start=source.indexOf('function planReviewCountForEffort(');
const end=source.indexOf('function planReviewMaximum(',start);
assert.ok(start>=0&&end>start,'adaptive review helper exists');
const ctx={Math,Number,Infinity};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);

const efforts=Array(200).fill(80);
assert.equal(ctx.planReviewCountForEffort(efforts,3200),40,'lighter remaining load gets fewer reviews');
assert.equal(ctx.planReviewCountForEffort(efforts,5600),70,'70 is a possible calculated result, not a fixed limit');
assert.equal(ctx.planReviewCountForEffort(efforts,8000),100,'heavier remaining load can exceed the old 70 cap');
assert.equal(ctx.planReviewCountForEffort(efforts,16000,30),30,'intentional light-day cap remains');
assert.equal(ctx.planReviewCountForEffort([],8000),0);
assert.equal(ctx.planReviewCountForEffort(efforts,0),0);

assert.ok(!source.includes('PLAN_REVIEW_BASE_LIMIT'),'fixed normal-day review cap removed');
assert.ok(/dueEntries\.map\(\(\[,item\]\)=>planNextEffort\(item\)\),todayBudget/.test(source),'today uses remaining-work budget');
assert.ok(/ready\.map\(item=>PLAN_EFFORTS\[Math\.min\(item\.round,4\)\]\),budget/.test(source),'upcoming preview uses the same budget');
assert.match(source,/const CAMPUS_SCHOOL_OFF=new Set\(\[[^\]]*'2026-10-30'/,'October 30 school holiday is part of the high-load calendar');

const highLoadStart=source.indexOf('function planIsHighLoadDay(');
const highLoadEnd=source.indexOf('function planReviewCountForEffort(',highLoadStart);
Object.assign(ctx,{CAMPUS_SCHOOL_OFF:new Set(['2026-10-30']),JP_HOLIDAYS:new Set(),planIsLightDay:()=>false,planIsAugustPrep:()=>false});
vm.runInContext(source.slice(highLoadStart,highLoadEnd),ctx);
const octoberPlan={schoolOff:{'2026-10-30':true}};
assert.equal(ctx.planIsHighLoadDay('2026-10-30',octoberPlan),true,'October 30 is shown as a high-load day');
assert.equal(ctx.planDayFactor('2026-10-30',octoberPlan),1.5,'October 30 receives 1.5x study capacity');

const migrateStart=source.indexOf('function migrateAdaptiveTodayAssignment(');
const migrateEnd=source.indexOf('function updateStudyPlan(',migrateStart);
const storage={},removed=[];
Object.assign(ctx,{
 Date,Set,PLAN_ADAPTIVE_LOAD_VERSION:1,sharedPlanSessionKey:()=>'plan-session',
 safeGet:key=>storage[key],safeRemove:key=>{removed.push(key);delete storage[key];},saveStudyPlans(){},
 planAssignmentProgress(assignment){
  const completed=Object.keys(assignment.completedUids||{}).length;
  return {completed,done:assignment.done===true||assignment.uids.length>0&&completed>=assignment.uids.length};
 }
});
vm.runInContext(source.slice(migrateStart,migrateEnd),ctx);
const old={assignments:{today:{uids:Array.from({length:70},(_,i)=>'old'+i),completedUids:{},assigned:70,completed:0,done:false}},updatedAt:0};
storage['plan-session']={mode:'plan',assignmentDate:'today',idx:0,records:[]};
ctx.migrateAdaptiveTodayAssignment(old,'today',Array.from({length:100},(_,i)=>'review'+i),[]);
assert.equal(old.assignments.today.assigned,100,'untouched old 70-question assignment recalculated immediately');
assert.equal(old.assignments.today.adaptiveLoadV,1);assert.deepEqual(removed,['plan-session']);
const partial={assignments:{today:{uids:['a','b'],completedUids:{a:true},assigned:2,completed:1,done:false}},updatedAt:0};
ctx.migrateAdaptiveTodayAssignment(partial,'today',['c','d','e'],[]);
assert.deepEqual(partial.assignments.today.uids,['a','b'],'started assignment remains stable');
console.log('PASS adaptive study-plan load: remaining work and days vary review count; light-day cap retained');
