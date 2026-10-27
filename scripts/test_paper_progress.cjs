const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
const books={book1:[{uid:'a',section:'A-1 intro'},{uid:'b',section:'C-3 body'}],book2:[{uid:'c',section:'E-1-1 basic'},{uid:'d',section:'E-1-2 imaging'},{uid:'e',section:'E-2 body'}]};
const plan={active:true,items:{b:{round:3,due:'2026-10-20',updatedAt:2}},assignments:{day:{done:true}},daily:{count:4},paperProgress:{}};
const ctx={Date,Object,Set,DEFAULT_QUESTIONS_BY_BOOK:books,qkey:q=>q.uid,ensureStudyPlan:()=>plan,dateKey:()=> '2026-10-15',saveStudyPlans(){}};
vm.createContext(ctx);vm.runInContext(slice('// Paper learning is', 'function renderPaperPreview(')+slice('function mergeStudyPlanBook(', 'function cbtMergeCloud('),ctx);
assert.deepEqual(Array.from(ctx.paperRange('book2','E-1')),['c','d']);
assert.equal(ctx.registerPaperProgress('book2','invalid','once'),0);
assert.equal(ctx.registerPaperProgress('book2','E-1','once'),2);
assert.equal(plan.items.c.round,1);assert.equal(plan.items.c.due,'2026-10-15');assert.equal(plan.items.e,undefined);
ctx.registerPaperProgress('book2','E-1','mastered');assert.equal(plan.items.c.round,5);assert.equal(plan.items.c.mastered,false);assert.equal(plan.items.c.correctStreak,0);assert.equal(plan.items.c.due,'2026-10-15');
ctx.registerPaperProgress('book2','E-2','once');assert.equal(plan.items.c.round,5);assert.equal(plan.items.e.round,1);
const actual={round:2,mastered:false,due:'2026-10-16',updatedAt:Date.now()+1};plan.items.c=actual;
ctx.registerPaperProgress('book2','E-1','mastered');assert.equal(plan.items.c,actual,'actual attempts remain authoritative');
ctx.registerPaperProgress('book1','C-3','mastered');assert.equal(plan.items.b.round,3,'existing app history not replaced');assert.equal(plan.assignments.day.done,true);assert.equal(plan.daily.count,4);
for(const [a,b] of [[plan,{items:{},paperProgress:{z:{round:1,updatedAt:1}}}],[{items:{},paperProgress:{z:{round:1,updatedAt:1}}},plan]]){
 const merged=ctx.mergeStudyPlanBook(a,b);assert.equal(merged.paperProgress.c.round,5);assert.equal(merged.paperProgress.z.round,1);
}
const rebuilt={items:{},paperProgress:plan.paperProgress};ctx.applyPaperBaseline(rebuilt);assert.equal(rebuilt.items.c.round,5);
console.log('PASS paper progress: chapter boundaries, both books, paper mastery still requires in-app three-correct streak, repeated reports, actual history and completed day preservation, two-device metadata merge, rebuild baseline');
