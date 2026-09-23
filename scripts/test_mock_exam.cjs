// Run with Node.js. Tests the real mock-exam functions with a minimal DOM.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const match of source.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(match[1]);
let checks=0;
function check(value,label){assert.ok(value,label);checks++;}
class Element{
 constructor(){this.children=[];this.events={};this.classes=new Set();this.dataset={};this.disabled=false;this.textContent='';this.classList={add:(...xs)=>xs.forEach(x=>this.classes.add(x)),remove:(...xs)=>xs.forEach(x=>this.classes.delete(x)),contains:x=>this.classes.has(x),toggle:(x,on)=>{on=on===undefined?!this.classes.has(x):on;on?this.classes.add(x):this.classes.delete(x);}};}
 set innerHTML(v){this.children=[];} get innerHTML(){return '';}
 set className(v){this.classes=new Set(v.split(' '));}
 appendChild(e){this.children.push(e);}
 setAttribute(k,v){this[k]=v;} removeAttribute(k){delete this[k];}
 addEventListener(k,f){this.events[k]=f;}
 querySelectorAll(){return this.children;}
 click(){if(!this.disabled)this.events.click?.();}
}
const elements={},storage={},context={window:{cbtUser:{uid:'test-a'},scrollTo(){}},document:{createElement:()=>new Element(),querySelectorAll:()=>[]},el:id=>elements[id]||(elements[id]=new Element()),safeGet:k=>storage[k]?JSON.parse(storage[k]):null,safeSet:(k,v)=>{storage[k]=JSON.stringify(v);},setInterval:()=>1,clearInterval(){},toast(){},showOnly(){},openImageZoom(){},check,console};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'mock-assets/azabu-2026/blocks.js'),'utf8'),context);
const data=source.slice(source.indexOf('const AZABU_MOCK_2026_BLOCK1='),source.indexOf('const DEFAULT_QUESTIONS_BY_BOOK'));
const logic=source.slice(source.indexOf('function formatMockExamTime('),source.indexOf('function setProgress('));
vm.runInContext(data+logic+`
function renderHome(){renderMockHome();}
check([1,2,3,4,5,6].map(b=>mockQuestions(b).length).join(',')==='60,60,60,60,40,40','all 320 questions');
for(let block=1;block<=4;block++){
 selectedMockBlock=block;openMockExam(12);check(mockExamState.index===12,'free navigation');
 el('mockExamChoices').children[2].click();loadMockProgress();check(mockProgress.answers[13].picked==='C','selection saved');
 submitMockExam();check(mockProgress.answers[13].answered,'answer saved');
 openMockExam();check(mockExamState.index===12&&mockExamState.answered,'resume graded question');
 check(!el('mockExamResult').classList.contains('hidden'),'result visible');
 moveMockQuestion(-1);check(mockExamState.index===11,'previous question');
 moveMockQuestion(1);check(mockExamState.index===12,'next question');
}
for(const block of [5,6]){
 selectedMockBlock=block;openMockExam(30);check(mockExamState.index===0,'cannot skip future linked question');
 for(let i=0;i<40;i++){
  check(mockExamState.index===i,'linked frontier');
  check(el('mockPrevBtn').disabled&&el('mockNextBtn').disabled,'navigation disabled');
  check(el('mockExamChoices').children.length===mockQuestions()[i].choices.length,'choice count matches source');
  moveMockQuestion(-1);check(mockExamState.index===i,'back handler cannot bypass lock');
  moveMockQuestion(1);check(mockExamState.index===i,'next handler cannot skip');
  el('mockExamChoices').children.find(b=>b.textContent===mockQuestions()[i].answer).click();
  openMockExam();check(mockExamState.picked===mockQuestions()[i].answer,'unconfirmed selection resumes');
  check(el('mockExamResult').classList.contains('hidden'),'no premature solution');
  submitMockExam();check(mockFrontier()===i+1,'confirmation advances exactly one');
  loadMockProgress();check(mockProgress.index===i+1,'frontier persists');
  if(i<39){openMockExam(0);check(mockExamState.index===i+1,'reload cannot reopen confirmed question');
   renderMockHome();check(el('mockQuestionList').children.filter(b=>!b.disabled).length===1,'only current list item enabled');
   check(!el('mockSummary').textContent.includes('正解 '),'score hidden until completion');openMockExam();}
 }
 renderMockHome();check(el('mockResumeBtn').disabled,'completed linked block cannot be resumed');
 check(el('mockSummary').textContent.includes('正解 40問'),'all answers graded');
 openMockExplanation(mockQuestions()[0]);check(el('mockExamSubmit').classList.contains('hidden'),'review is read-only');
 const prior=mockProgress.answers[1].picked;mockExamState.index=0;mockExamState.picked=prior==='A'?'B':'A';mockExamState.answered=false;saveMockProgress();loadMockProgress();
 check(mockProgress.answers[1].picked===prior&&mockProgress.answers[1].answered,'confirmed answer immutable');
 openMockExam(0);check(el('mockResumeBtn').disabled,'completed reload stays complete');
}
selectedMockBlock=2;loadMockProgress();check(mockProgress.answers[13].answered,'blocks isolated');
window.cbtUser.uid='test-b';loadMockProgress();check(!Object.keys(mockProgress.answers).length,'users isolated');
window.cbtUser.uid='test-a';selectedMockBlock=5;loadMockProgress();check(mockProgress.answers[8].picked==='I','I choice persisted');
selectedMockBlock=1;loadMockProgress();check(mockProgress.answers[13].picked==='C','legacy block1 key preserved');
`,context);
for(const [block,qs] of Object.entries(context.window.TOGO_MOCK_BLOCKS)){
 for(const [i,q] of qs.entries()){
  check(q.no===i+1,`block ${block} order`);check(q.choices.includes(q.answer),`block ${block} answer`);
  for(const file of [q.image,...q.explanationImages])check(fs.existsSync(path.join(root,file)),file);
 }
}
console.log(`PASS: ${checks} checks; JavaScript syntax, 320 question counts, block/user isolation, save/resume, 80 linked confirmations, navigation locks, choices, and assets.`);
