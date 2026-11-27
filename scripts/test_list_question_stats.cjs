const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
for(const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);

const recentStart=source.indexOf('function recentQuestionAttempts(');
const recentEnd=source.indexOf('function recentCorrectStreak(',recentStart);
const listStatsStart=source.indexOf('function listQuestionStatsHtml(');
const listStatsEnd=source.indexOf('function renderList(',listStatsStart);
assert.ok(recentStart>=0&&recentEnd>recentStart&&listStatsStart>=0&&listStatsEnd>listStatsStart,'list-stat helpers exist');
const context={Math,Map,Number,stats:{rankAttempts:[]}};
vm.createContext(context);
vm.runInContext(source.slice(recentStart,recentEnd)+source.slice(listStatsStart,listStatsEnd),context);
const grouped=vm.runInContext('new Map()',context);
const html=(uid,record,map=grouped)=>context.listQuestionStatsHtml(uid,record,map);

let rendered=html('empty',{});
assert.match(rendered,/直近：未解答/);
assert.match(rendered,/正答率 —/);

rendered=html('three',{correct:1,wrong:2,history:[
  {correct:true,at:1},{correct:false,skip:true,at:2},{correct:false,at:3}
]});
assert.equal([...rendered.matchAll(/lstats-result (ok|ng)/g)].map(match=>match[1]).join(' '),'ng ng ok','three attempts are shown newest first and skip is wrong');

rendered=html('seven',{correct:4,wrong:3,history:Array.from({length:7},(_,index)=>({correct:index%2===0,at:index+1}))});
assert.equal([...rendered.matchAll(/lstats-result (ok|ng)/g)].map(match=>match[1]).join(' '),'ok ng ok ng ok','only the latest five of seven attempts are shown newest first');
assert.equal((rendered.match(/lstats-result/g)||[]).length,5);

rendered=html('rounding',{correct:2,wrong:1,history:[]});
assert.match(rendered,/正答率 67%（2\/3）/);

const rankGrouped=vm.runInContext(`new Map([['ranked',[
  {u:'ranked',c:1,a:1},{u:'ranked',c:0,a:2},{u:'ranked',c:1,a:3},{u:'ranked',c:0,a:4}
]]])`,context);
rendered=html('ranked',{correct:2,wrong:2,history:[{correct:true,at:9}]},rankGrouped);
assert.equal([...rendered.matchAll(/lstats-result (ok|ng)/g)].map(match=>match[1]).join(' '),'ng ok ng ok','longer rankAttempts history wins without scanning the global array');

rendered=html('anomaly',{correct:Infinity,wrong:NaN,history:[{correct:true,at:1}]});
assert.doesNotMatch(rendered,/NaN|Infinity/);
assert.match(rendered,/正答率 —/,'invalid cumulative totals do not use history as the accuracy denominator');

assert.match(source,/\.litem\{[^}]*flex-direction:column/,'list items stack the original row and stats row');
assert.match(source,/<div class="lrow"><span class="lno">[\s\S]{0,250}<span class="lic">\$\{ic\}<\/span><\/div>\$\{listQuestionStatsHtml/,'the existing first-row fields remain together above stats');
assert.match(source,/const rankAttemptsByUid=new Map\(\);[\s\S]{0,300}\(stats\.rankAttempts\|\|\[\]\)\.forEach/,'renderList groups rank attempts once');
assert.match(source,/document\.querySelectorAll\('#filterBar \.fbtn'\)[\s\S]{0,180}renderList\(\)/,'switching list filters rerenders stats');
assert.match(source,/session\.single&&session\.returnTo==='list'\)[\s\S]{0,80}renderList\(\)/,'returning after an answer rerenders fresh stats');
assert.match(source,/function openList\(\)[\s\S]{0,180}renderList\(\)/,'opening the list rerenders fresh stats');
console.log('PASS list question stats: empty, newest-first recent five, skip, cumulative rounding, grouped rank attempts, refresh paths, and anomaly safety');
