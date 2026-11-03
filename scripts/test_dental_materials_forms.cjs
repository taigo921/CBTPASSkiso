const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'dictionary-assets/dental-materials/manifest.json'),'utf8'));

assert.equal(manifest.schemaVersion,1);
assert.equal(manifest.source,'学校配布 歯科理工 Forms 50問（2024版）');
assert.equal(manifest.sourceFileSha256,'c72730f7648a1d41b737ad5919615c2683c04b7a83297b1788048036b0688c37');
assert.equal(manifest.sourceQuestionCount,50);
assert.equal(manifest.count,38);
assert.deepEqual(manifest.unresolved.map(item=>item.formQuestionNumber),[13,18,19,24,25,26,27,32,43,44,48,52]);

const covered=[...manifest.items.map(item=>item.formQuestionNumber),...manifest.unresolved.map(item=>item.formQuestionNumber)].sort((a,b)=>a-b);
assert.deepEqual(covered,Array.from({length:50},(_,index)=>index+3));
const expectedAnswers={3:'D',4:'C',5:'D',6:'B',7:'A',8:'C',9:'B',10:'C',11:'D',12:'C',14:'A',15:'B',16:'E',17:'A',20:'C',21:'D',22:'D',23:'A',28:'C',29:'E',30:'C',31:'A',33:'C',34:'B',35:'E',36:'A',37:'A',38:'E',39:'A',40:'B',41:'E',42:'C',45:'E',46:'C',47:'B',49:'E',50:'B',51:'B'};
assert.deepEqual(Object.fromEntries(manifest.items.map(item=>[item.formQuestionNumber,item.answer])),expectedAnswers);

const ids=new Set();
for(const [index,item] of manifest.items.entries()){
  assert.equal(item.number,index+1);
  assert.match(item.uid,/^DENTAL-MATERIALS-\d{3}$/);
  assert.ok(!ids.has(item.uid));ids.add(item.uid);
  assert.equal(item.choices,'ABCDE');
  assert.ok(item.choices.includes(item.answer));
  for(const key of ['questionImage','explanationImage']){
    const file=path.join(root,item[key]);assert.ok(fs.existsSync(file),`${item.uid} ${key}`);
    const bytes=fs.readFileSync(file);assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');
  }
}
const app=fs.readFileSync(path.join(root,'features/dictionary-practice/dictionary-practice.js'),'utf8');
assert.match(app,/dentalMaterials:\{title:'学校配布 歯科理工 Forms'/);
assert.match(app,/togo_dental_materials_forms_progress_v1_/);
assert.match(app,/data\.unresolved/);
assert.match(app,/item\.choiceLabels/);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.match(html,/data-dictionary-source="dentalMaterials"/);
assert.match(html,/id="dictionaryExplanationTitle"/);
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
assert.match(sw,/dictionary-assets\/dental-materials\/manifest\.json/);
assert.match(sw,/20261103-dental-materials-forms-1/);
console.log('PASS dental materials Forms: 38 answer-verified questions, 12 explicit unresolved items, isolated progress, assets, UI source, and cache manifest.');
