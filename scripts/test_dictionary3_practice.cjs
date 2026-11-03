const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'dictionary-assets/mock-exams/manifest.json'),'utf8'));

assert.equal(manifest.schemaVersion,1);
assert.equal(manifest.source,'CBTの辞典③ 誌上問題篇');
assert.equal(manifest.sourceFileSha256,'292e05997547741cf382ddb4dd2b53a5dbccb92ca53ee33c6ca344a3e3995e10');
assert.equal(manifest.expectedFromAvailableSource,624);
assert.equal(manifest.count,624);
assert.deepEqual(manifest.mockCounts,{1:320,2:304});
assert.deepEqual(manifest.sourceGap,{mock:2,block:6,coverCount:40,availableCount:24,missingCount:16,lastAvailableId:'266-4'});
assert.deepEqual(manifest.unresolved,[]);

const expectedBlocks={'1-1':60,'1-2':60,'1-3':60,'1-4':60,'1-5':40,'1-6':40,'2-1':60,'2-2':60,'2-3':60,'2-4':60,'2-5':40,'2-6':24};
const blocks={},uids=new Set();
for(const [index,item] of manifest.items.entries()){
  assert.equal(item.number,index+1);
  assert.match(item.uid,/^DICT3-M[12]-/);
  assert.ok(!uids.has(item.uid),`${item.uid} unique`);uids.add(item.uid);
  assert.match(item.choices,/^ABCDE(?:F(?:G(?:H(?:I(?:J)?)?)?)?)?$/);
  assert.ok(item.choices.includes(item.answer),`${item.uid} answer ${item.answer} is offered`);
  blocks[`${item.mock}-${item.block}`]=(blocks[`${item.mock}-${item.block}`]||0)+1;
  for(const key of ['questionImage','explanationImage']){
    const file=path.join(root,item[key]);assert.ok(fs.existsSync(file),`${item.uid} ${key}`);
    const bytes=fs.readFileSync(file);assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');
  }
}
assert.deepEqual(blocks,expectedBlocks);
assert.equal(manifest.items[0].uid,'DICT3-M1-001');
assert.equal(manifest.items[319].uid,'DICT3-M1-270-4');
assert.equal(manifest.items[320].uid,'DICT3-M2-001');
assert.equal(manifest.items.at(-1).uid,'DICT3-M2-266-4');
console.log('PASS dictionary 3: 624 source-backed questions, official answers/explanations, block counts, source gap, and WebP assets.');
