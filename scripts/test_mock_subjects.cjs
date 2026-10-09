const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'index.html'),'utf8'),ctx={window:{}};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'mock-assets/azabu-2026/blocks.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'mock-assets/azabu-2026/subjects.js'),'utf8'),ctx);
vm.runInContext(source.slice(source.indexOf('const AZABU_MOCK_2026_BLOCK1='),source.indexOf('const DEFAULT_QUESTIONS_BY_BOOK')),ctx);
const metadata=ctx.window.TOGO_MOCK_SUBJECTS;
let count=0;
for(const block of [1,2,3,4,5,6]){
 const qs=ctx.mockQuestions(block),codes=metadata.blocks[block];assert.equal(codes.length,qs.length);
 for(const q of qs){assert.ok(ctx.mockQuestionSubject(block,q.no));count++;}
}
assert.equal(count,320);assert.equal(Object.keys(metadata.names).length,21);
assert.equal(ctx.mockQuestionSubject(1,1),'歯科理工学／材料学');assert.equal(ctx.mockQuestionSubject(2,10),'口腔病理学');
assert.equal(ctx.mockQuestionSubject(3,41),'衛生学');assert.equal(ctx.mockQuestionSubject(4,14),'口腔生化学');
assert.equal(ctx.mockQuestionSubject(5,8),'冠橋義歯学');assert.equal(ctx.mockQuestionSubject(6,29),'インプラント');
const keys=new Set();let grouped=0;
for(const subject of Object.values(metadata.names)){
 const qs=ctx.mockSubjectQuestions(subject);assert.ok(qs.length);
 for(const q of qs){assert.equal(q.subject,subject);assert.ok(!keys.has(q.key));keys.add(q.key);grouped++;}
 for(const block of [5,6]){
  const groupSize=block===5?2:4;
  for(const q of qs.filter(q=>q.block===block)){
   const first=Math.floor((q.no-1)/groupSize)*groupSize+1;
   for(let no=first;no<first+groupSize;no++)assert.ok(qs.some(q=>q.block===block&&q.no===no),'linked group remains complete');
  }
 }
}
assert.equal(grouped,320);assert.equal(ctx.mockSubjectQuestions('unknown').length,0);
ctx.window.cbtUser={uid:'a'};const first=ctx.mockSubjectKey('衛生学');ctx.window.cbtUser={uid:'b'};assert.notEqual(ctx.mockSubjectKey('衛生学'),first);
console.log('PASS mock subjects: 320 mappings, 21 subjects, original block identities, complete linked groups, separate per-user practice keys');
