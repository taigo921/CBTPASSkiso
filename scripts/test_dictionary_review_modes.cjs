const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'features/dictionary-practice/dictionary-practice.js'),'utf8');
const context={
  window:{},
  document:{readyState:'loading',addEventListener(){}},
  console
};
vm.createContext(context);
vm.runInContext(source,context);
const helpers=context.window.dictionaryPractice;
const items=[{sourceId:'A001'},{sourceId:'A002'},{sourceId:'B001'},{sourceId:'B002'}];
const progress={
  index:3,
  answers:{
    A001:{lastCorrect:false,attempts:[{correct:false}]},
    A002:{lastCorrect:true,attempts:[{correct:true}]},
    B001:{lastCorrect:false,attempts:[{correct:false},{correct:false}]}
  },
  favorites:{A002:{on:true,at:10},B001:{on:false,at:20},B002:{on:true,at:30}}
};

assert.deepEqual([...helpers.filteredIndices('wrong',items,progress)],[0,2],'wrong mode uses lastCorrect === false only');
assert.deepEqual([...helpers.filteredIndices('fav',items,progress)],[1,3],'favorite mode uses favorites[sourceId].on only');

const snapshot=[...helpers.filteredIndices('wrong',items,progress)];
progress.answers.A001.lastCorrect=true;
assert.deepEqual(snapshot,[0,2],'the filtered session snapshot does not shrink after a correct answer');
assert.equal(helpers.moveSnapshotPosition(snapshot,0,1),1);
assert.equal(snapshot[helpers.moveSnapshotPosition(snapshot,0,1)],2,'snapshot navigation advances to the next captured manifest index');
assert.equal(helpers.moveSnapshotPosition(snapshot,1,1),1,'snapshot navigation clamps at the end');
assert.equal(helpers.moveSnapshotPosition(snapshot,0,-1),0,'snapshot navigation clamps at the beginning');

assert.equal(helpers.resumeIndexForSave('wrong',0,progress.index),3,'wrong review does not overwrite the all-mode resume index');
assert.equal(helpers.resumeIndexForSave('fav',1,progress.index),3,'favorite review does not overwrite the all-mode resume index');
assert.equal(helpers.resumeIndexForSave('all',1,progress.index),1,'all mode still updates its resume index');

const before=helpers.summaryProgress(progress);
progress.favorites.EXTRA={on:true,at:40};
assert.deepEqual(helpers.summaryProgress(progress),before,'favorites are excluded from answered, correct and attempt summaries');
assert.equal(Object.keys(helpers.normalizeProgress({answers:{},favorites:null,index:2}).favorites).length,0,'missing or invalid favorites default to an empty object');

const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const id of ['dictionaryModes','dictionaryFavBtn'])assert.match(html,new RegExp(`id="${id}"`));
for(const mode of ['all','wrong','fav'])assert.match(html,new RegExp(`data-dictionary-mode="${mode}"`));
assert.match(html,/title="お気に入り"/);
assert.match(source,/progress\.favorites\[item\.sourceId\]=\{on:/);
assert.match(source,/sessionMode==='all'/);
console.log('PASS dictionary review modes: wrong/favorite filters, fixed snapshots, resume isolation, and summary isolation.');
