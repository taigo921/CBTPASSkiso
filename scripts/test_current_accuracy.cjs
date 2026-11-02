const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
const context={console,Math,Number,Object,Array,Map,Set};vm.createContext(context);
vm.runInContext(`
const emptyStats=()=>({perQ:{},rankAttempts:[],answered:0,correct:0,bestStreak:0,dayStreak:0});
${slice('function latestQuestionOutcome(', 'function fullStatsPayload(')}
${slice('function mergeStatsTarget(', 'function mergeStudyPlanBook(')}
`,context);

const stats={perQ:{
  q1:{correct:1,wrong:1,last:'correct',history:[{correct:false,at:1},{correct:true,at:2}],times:[20,10]},
  q2:{correct:9,wrong:1,last:'wrong',history:[],times:[8]},
  q3:{correct:0,wrong:0,last:null,fav:true,history:[]},
  q4:{correct:4,wrong:2,last:'correct',history:[{correct:true,at:3},{correct:false,skip:true,at:4}],times:[9,7]}
},answered:18,correct:14,bestStreak:6,dayStreak:2,rankAttempts:[]};
const summary=context.statsSummaryFor(stats);
assert.deepEqual(JSON.parse(JSON.stringify(summary)),{answered:18,correct:14,accuracy:33.3,distinct:3,accuracyAnswered:3,accuracyCorrect:1,bestStreak:6,dayStreak:2});
const compact=context.compactStatsPayload(stats);
assert.equal(compact.answered,18);assert.equal(compact.correct,14);assert.equal(compact.accuracy,33.3);
const synced=context.statsSummaryFor({perQ:{a:{c:8,w:3,l:'wrong',h:{correct:true,at:20}},b:{c:2,w:1,l:'wrong',h:{correct:false,at:21}}}});
assert.equal(synced.answered,14);assert.equal(synced.correct,10);assert.equal(synced.accuracy,50);

const local=vm.runInContext('emptyStats()',context);
local.perQ.q={correct:1,wrong:1,last:'correct',history:[{correct:true,at:100}],times:[],pre:[],post:[]};
context.mergeStatsTarget(local,{perQ:{q:{c:1,w:1,l:'correct',h:{correct:false,at:200}}}});
assert.equal(local.perQ.q.last,'wrong','newer device answer replaces stale latest state');
assert.equal(context.statsSummaryFor(local).accuracy,0);
const newerLocal=vm.runInContext('emptyStats()',context);
newerLocal.perQ.q={correct:1,wrong:0,last:'wrong',history:[{correct:false,at:300}],times:[],pre:[],post:[]};
context.mergeStatsTarget(newerLocal,{perQ:{q:{c:7,w:2,l:'correct',h:{correct:true,at:200}}}});
assert.equal(newerLocal.perQ.q.correct,7,'larger cumulative counters are retained');
assert.equal(newerLocal.perQ.q.last,'wrong','newer latest answer wins even when its device has fewer cumulative attempts');
console.log('PASS current accuracy: totals remain cumulative while each attempted question contributes only its newest answer to accuracy.');
