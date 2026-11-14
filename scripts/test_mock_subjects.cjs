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

const sampleQs=[
 {key:'1:1',block:1,no:1,subject:'テスト科目',answer:'A',choices:'AB',image:'q1.jpg',explanation:'1問目の解説',explanationImage:'e1.jpg'},
 {key:'1:2',block:1,no:2,subject:'テスト科目',answer:'B',choices:'AB',image:'q2.jpg',explanation:'2問目の解説',explanationImages:['e2a.jpg','e2b.jpg']}
];
assert.equal(ctx.mockSubjectSavedMode(null,0),'instant','new subject defaults to instant');
assert.equal(ctx.mockSubjectSavedMode({answers:{'1:1':{picked:'A',answered:true}}},1),'exam','legacy answered save stays exam mode');
assert.equal(ctx.mockSubjectSavedMode({mode:'instant'},1),'instant');
assert.equal(ctx.mockSubjectAnsweredCount(sampleQs,{answers:{'1:1':{picked:'A',answered:true},'1:2':{picked:'B',answered:false}}}),1);

class FakeClassList{
 constructor(initial=''){this.values=new Set(initial.split(/\s+/).filter(Boolean));}
 add(...names){for(const name of names)this.values.add(name);}
 remove(...names){for(const name of names)this.values.delete(name);}
 contains(name){return this.values.has(name);}
 toggle(name,force){const on=force===undefined?!this.contains(name):!!force;on?this.add(name):this.remove(name);return on;}
}
class FakeElement{
 constructor(initial=''){this.classList=new FakeClassList(initial);this.children=[];this.dataset={};this.textContent='';this.disabled=false;this.src='';this.scrollIntoViewCalls=[];}
 set innerHTML(value){this.children=[];this._innerHTML=value;}
 get innerHTML(){return this._innerHTML||'';}
 appendChild(child){this.children.push(child);return child;}
 addEventListener(type,listener){this['on'+type]=listener;}
 setAttribute(name,value){this[name]=String(value);}
 scrollIntoView(options){this.scrollIntoViewCalls.push(options);}
 click(){if(!this.disabled){if(this.onclick)this.onclick();else if(this.onclick===null)return;if(this.onclick===undefined&&this.onclick!==this.onpointerup&&this['onclick'])this['onclick']();}}
}
const hiddenIds=new Set(['mockSubjectPhotoZoom','mockSubjectResult','mockSubjectReviewNav','mockSubjectReview','mockSubjectReviewEmpty']);
const elementIds=['footer','timerChip','mockSubjectTitle','mockSubjectProgress','mockSubjectNumber','mockSubjectImage','mockSubjectZoom','mockSubjectPhotoZoom','mockSubjectChoices','mockSubjectSubmit','mockSubjectResult','mockSubjectExplanations','mockSubjectReviewNav','mockSubjectWrongOnly','mockSubjectReviewEmpty','mockSubjectReviewPrev','mockSubjectReviewNext','mockSubjectReview'];
const elements=Object.fromEntries(elementIds.map(id=>[id,new FakeElement(hiddenIds.has(id)?'hidden':'')]));
elements.mockSubjectReviewEmpty.textContent='不正解の問題はありません';
ctx.el=id=>elements[id];
ctx.document={createElement:()=>new FakeElement(),querySelectorAll:()=>[]};
ctx.showOnly=()=>{};ctx.setProgress=()=>{};ctx.openImageZoom=()=>{};ctx.safeSet=()=>{};
const scrollToCalls=[];ctx.window.cbtUser={uid:'tester'};ctx.window.scrollTo=options=>scrollToCalls.push(options);ctx.setTimeout=callback=>callback();
function setSession(session){ctx.__session=session;vm.runInContext('mockSubjectSession=__session',ctx);}
function render(){ctx.renderMockSubjectPractice();}
function pick(index){elements.mockSubjectChoices.children[index].onclick();}

setSession({subject:'テスト科目',qs:sampleQs,answers:{},mode:'instant',owner:'tester',reviewIndex:0,feedbackKey:null,wrongOnly:false});
render();pick(0);elements.mockSubjectSubmit.onclick();
assert.equal(elements.mockSubjectImage.src,'q1.jpg','instant feedback stays on confirmed question');
assert.match(elements.mockSubjectResult.textContent,/⭕️ 正解.*あなたの回答：A.*正解：A。1問目の解説/);
assert.equal(elements.mockSubjectResult.classList.contains('hidden'),false,'instant shows correctness immediately');
assert.deepEqual(elements.mockSubjectExplanations.children.map(img=>img.src),['e1.jpg'],'instant shows official explanation image');
assert.equal(elements.mockSubjectResult.scrollIntoViewCalls.at(-1)?.behavior,'smooth','instant confirmation uses smooth scrolling');
assert.equal(elements.mockSubjectResult.scrollIntoViewCalls.at(-1)?.block,'start','instant confirmation aligns the result at the start');
assert.equal(scrollToCalls.length,0,'instant confirmation does not scroll to the top');
assert.equal(elements.mockSubjectSubmit.textContent,'次の問題へ ›');
elements.mockSubjectSubmit.onclick();assert.equal(elements.mockSubjectImage.src,'q2.jpg','next advances after instant feedback');assert.equal(scrollToCalls.at(-1)?.top,0,'next keeps scrolling to the top');assert.equal(scrollToCalls.at(-1)?.behavior,'smooth');

setSession({subject:'テスト科目',qs:sampleQs,answers:{'1:1':{picked:'A',answered:true}},mode:'instant',owner:'tester',reviewIndex:0,feedbackKey:null,wrongOnly:false});
render();assert.equal(elements.mockSubjectImage.src,'q2.jpg','resume skips a question whose answer was confirmed before close');pick(1);elements.mockSubjectSubmit.onclick();
assert.equal(elements.mockSubjectSubmit.textContent,'結果を見る');assert.deepEqual(elements.mockSubjectExplanations.children.map(img=>img.src),['e2a.jpg','e2b.jpg']);

setSession({subject:'テスト科目',qs:sampleQs,answers:{},mode:'exam',owner:'tester',reviewIndex:0,feedbackKey:null,wrongOnly:false});
render();assert.equal(elements.mockSubjectSubmit.textContent,'回答を確定して次へ');pick(0);elements.mockSubjectSubmit.onclick();
assert.equal(elements.mockSubjectImage.src,'q2.jpg');
assert.equal(elements.mockSubjectResult.classList.contains('hidden'),true,'exam mode hides correctness until all questions finish');
pick(0);elements.mockSubjectSubmit.onclick();
assert.equal(elements.mockSubjectResult.classList.contains('hidden'),false,'exam mode shows correctness after finish');
assert.match(elements.mockSubjectProgress.textContent,/終了：2問中1問正解/);
assert.equal(elements.mockSubjectReview.children.length,2);
assert.match(elements.mockSubjectReview.children[0].textContent,/^○/);assert.match(elements.mockSubjectReview.children[1].textContent,/^×/);
assert.equal(elements.mockSubjectReviewNext.disabled,false);elements.mockSubjectReviewNext.onclick();
assert.equal(elements.mockSubjectImage.src,'q2.jpg','post-finish next navigation advances review');
elements.mockSubjectWrongOnly.onclick();
assert.equal(elements.mockSubjectReview.children.length,1,'wrong-only limits the bottom list');
assert.match(elements.mockSubjectReview.children[0].textContent,/^×/);
assert.equal(elements.mockSubjectReviewPrev.disabled,true);assert.equal(elements.mockSubjectReviewNext.disabled,true);

setSession({subject:'テスト科目',qs:sampleQs,answers:{'1:1':{picked:'A',answered:true},'1:2':{picked:'B',answered:true}},mode:'instant',owner:'tester',reviewIndex:0,feedbackKey:null,wrongOnly:true});
render();assert.equal(elements.mockSubjectReviewEmpty.classList.contains('hidden'),false);assert.equal(elements.mockSubjectReviewEmpty.textContent,'不正解の問題はありません');
for(const id of ['mockSubjectNumber','mockSubjectImage','mockSubjectZoom','mockSubjectPhotoZoom','mockSubjectChoices','mockSubjectResult','mockSubjectExplanations','mockSubjectReviewPrev','mockSubjectReviewNext','mockSubjectReview'])assert.equal(elements[id].classList.contains('hidden'),true,`${id} is hidden for an empty wrong-only review`);
assert.equal(elements.mockSubjectWrongOnly.classList.contains('hidden'),false,'wrong-only toggle remains available');
elements.mockSubjectWrongOnly.onclick();
for(const id of ['mockSubjectNumber','mockSubjectImage','mockSubjectZoom','mockSubjectChoices','mockSubjectResult','mockSubjectExplanations','mockSubjectReviewPrev','mockSubjectReviewNext','mockSubjectReview'])assert.equal(elements[id].classList.contains('hidden'),false,`${id} returns when wrong-only is disabled`);
assert.equal(elements.mockSubjectReviewEmpty.classList.contains('hidden'),true,'empty message disappears when wrong-only is disabled');

assert.match(source,/data-mock-subject-mode="instant"[^>]*>1問ずつ答え合わせ/);
assert.match(source,/data-mock-subject-mode="exam"[^>]*>本番形式（最後にまとめて）/);
assert.match(source,/20261114-guidepinch/);
console.log('PASS mock subjects: mappings, instant/exam modes, resume, explanations, completed review navigation and wrong-only filtering');
