const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'dictionary-assets/exercises/manifest.json'),'utf8'));
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const feature=fs.readFileSync(path.join(root,'features/dictionary-practice/dictionary-practice.js'),'utf8');

assert.equal(manifest.schemaVersion,2);
assert.equal(manifest.source,'CBTの辞典② 基礎臨床');
assert.equal(manifest.count,956);
assert.equal(manifest.expectedCount,956);
assert.equal(manifest.matchedExplanationCount,956);
assert.deepEqual(manifest.missingExplanationIds,[]);
assert.deepEqual(manifest.unresolved,[]);
assert.equal(manifest.sourceFileSha256,'8c3e30f0d7c251871cb1a545d69442002141eef981849be9cd363806ce836099');

const expectedGroups={A:18,B:88,C:145,D:35,E1:81,E2:175,E3:300,E4:114};
const actualGroups={};
const ids=new Set(),uids=new Set();
for(const [index,item] of manifest.items.entries()){
  assert.match(item.sourceId,/^(?:[A-D]\d{3}|E[1-4]\d{3})$/);
  assert.equal(item.number,index+1);
  assert.ok('ABCDE'.includes(item.answer),`${item.sourceId} answer`);
  assert.equal(item.choices,'ABCDE');
  assert.ok(!ids.has(item.sourceId),`${item.sourceId} unique`);ids.add(item.sourceId);
  assert.ok(!uids.has(item.uid),`${item.uid} unique`);uids.add(item.uid);
  const group=item.sourceId.startsWith('E')?item.sourceId.slice(0,2):item.sourceId[0];
  actualGroups[group]=(actualGroups[group]||0)+1;
  for(const key of ['questionImage','explanationImage']){
    const file=path.join(root,item[key]);
    assert.ok(fs.existsSync(file),`${item.sourceId} ${key}`);
    const bytes=fs.readFileSync(file);
    assert.equal(bytes.subarray(0,4).toString(),'RIFF',`${item.sourceId} ${key} WebP RIFF`);
    assert.equal(bytes.subarray(8,12).toString(),'WEBP',`${item.sourceId} ${key} WebP signature`);
  }
}
assert.deepEqual(actualGroups,expectedGroups);
assert.equal(manifest.items[0].sourceId,'A001');
assert.equal(manifest.items.at(-1).sourceId,'E4114');

for(const id of ['dictionaryHome','dictionaryPractice','dictionaryStart','dictionaryQuestionImage','dictionaryChoices','dictionarySubmit','dictionaryExplanationImage'])assert.match(html,new RegExp(`id="${id}"`));
assert.match(html,/data-book="dictionary"/);
assert.match(html,/features\/dictionary-practice\/dictionary-practice\.js/);
assert.match(feature,/STORE_PREFIX='togo_dictionary2_progress_v1_'/);
assert.match(html,/通常問題集・学習ルート・ランキング/);
new Function(feature);

console.log('PASS dictionary practice: 956 canonical IDs, answers, question/explanation WebPs, group counts, isolated progress, and UI wiring.');
