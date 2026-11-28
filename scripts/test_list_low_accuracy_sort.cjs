const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
for(const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);

const listStart=source.indexOf("let listFilter='all';");
const listEnd=source.indexOf('/* ============ セクションを選んで解く',listStart);
assert.ok(listStart>=0&&listEnd>listStart,'question-list implementation exists');

class FakeClassList{
  constructor(){this.values=new Set();}
  remove(name){this.values.delete(name);}
  toggle(name,force){if(force)this.values.add(name);else this.values.delete(name);return !!force;}
  contains(name){return this.values.has(name);}
}
class FakeElement{
  constructor(){this.children=[];this.classList=new FakeClassList();this.dataset={};this.textContent='';this._innerHTML='';}
  set className(value){this._className=value;}
  get className(){return this._className||'';}
  set innerHTML(value){this._innerHTML=value;if(value==='')this.children=[];}
  get innerHTML(){return this._innerHTML;}
  appendChild(child){this.children.push(child);return child;}
  addEventListener(){}
}

const questions=['A','B','C','D','E','F','G'].map(uid=>({uid,display_no:uid,section:uid<'D'?'前半':'後半',question:`問題 ${uid}`}));
const elements={listBody:new FakeElement(),listPracticeBtn:new FakeElement(),listCount:new FakeElement(),footer:new FakeElement()};
const allButton=new FakeElement(),wrongButton=new FakeElement(),gradeButton=new FakeElement();
allButton.dataset.f='all';wrongButton.dataset.f='wrong';gradeButton.dataset={f:'A',answerFilter:''};
const publishedButton=new FakeElement(),lowButton=new FakeElement();
publishedButton.dataset.sort='published';lowButton.dataset.sort='lowacc';
const buttonsBySelector={
  '#filterBar .fbtn':[allButton,wrongButton,gradeButton],
  '#listSortBar .fbtn':[publishedButton,lowButton]
};
const context={
  Math,Map,Number,BigInt,
  QUESTIONS:questions,
  activeBook:'answer1',
  isAnswerBook:book=>book==='answer1',
  stats:{perQ:{
    A:{correct:0,wrong:2,last:'wrong',grade:'A'},
    B:{correct:0,wrong:5,last:'wrong',grade:'B'},
    C:{correct:1,wrong:3,last:'wrong',grade:'A'},
    D:{correct:2,wrong:6,last:'wrong',grade:'A'},
    E:{correct:1,wrong:0,last:'correct',grade:'A'},
    F:{},G:{}
  },rankAttempts:[]},
  document:{
    querySelectorAll:selector=>buttonsBySelector[selector]||[],
    createElement:()=>new FakeElement()
  },
  el:id=>elements[id],
  qkey:q=>q.uid,
  qno:q=>q.display_no,
  escapeHtml:value=>String(value),
  groupBySection:arr=>arr.reduce((groups,q)=>{(groups[q.section]||(groups[q.section]=[])).push(q);return groups;},{}),
  recentQuestionAttempts:()=>[],
  renderQuestion:()=>{},startSectionSession:()=>{},toast:()=>{},session:null
};
vm.createContext(context);
vm.runInContext(source.slice(listStart,listEnd),context);
vm.runInContext("listSort='lowacc'",context);

const listedOrder=()=>Array.from(context.listQuestions(),q=>q.uid);
const allSorted=['B','A','D','C','E','F','G'];
assert.deepEqual(listedOrder(),allSorted,'listQuestions sorts by accuracy, answer count, and original order, with unanswered last');
context.renderList();
const renderedOrder=()=>elements.listBody.children.filter(child=>child.className==='litem').map(child=>child.innerHTML.match(/class="lno">([^<]+)/)?.[1]);
assert.deepEqual(renderedOrder(),allSorted,'rendered rows follow listQuestions order');
assert.equal(lowButton.classList.contains('on'),true,'low-accuracy sort is selected');
assert.equal(publishedButton.classList.contains('on'),false,'published sort loses selected state');
assert.equal(allButton.classList.contains('on'),true,'changing sort preserves the all filter');

vm.runInContext("listFilter='wrong'",context);
context.renderList();
assert.deepEqual(listedOrder(),['B','A','D','C'],'low-accuracy sort applies to wrong answers');
assert.deepEqual(renderedOrder(),listedOrder(),'wrong-answer rows follow the sorted list');
assert.equal(wrongButton.classList.contains('on'),true,'wrong filter is selected');
assert.equal(lowButton.classList.contains('on'),true,'changing the filter preserves the sort');
assert.equal(elements.listPracticeBtn.classList.contains('hidden'),false,'wrong-answer batch practice is visible');
context.startWrongListSession();
assert.deepEqual(Array.from(context.session.uids),renderedOrder(),'batch practice follows the on-screen order');
assert.equal(context.session.idx,0,'batch practice starts at the first displayed question');

vm.runInContext("listFilter='A'",context);
context.renderList();
assert.deepEqual(listedOrder(),['A','D','C','E'],'low-accuracy sort applies to ANSWER grade A');
assert.deepEqual(renderedOrder(),listedOrder(),'grade A rows follow the sorted list');
assert.equal(gradeButton.classList.contains('on'),true,'grade A filter is selected');

vm.runInContext("listFilter='all'",context);
context.stats.perQ.B={correct:10,wrong:0};
context.renderList();
assert.deepEqual(renderedOrder(),['A','D','C','B','E','F','G'],'a fresh render reorders after accuracy changes');

const filterHtml=source.match(/<div\b[^>]*id="filterBar"[^>]*>([\s\S]*?)<\/div>/)?.[1]||'';
const sortHtml=source.match(/<div\b[^>]*id="listSortBar"[^>]*>([\s\S]*?)<\/div>/)?.[1]||'';
assert.deepEqual(Array.from(filterHtml.matchAll(/<button\b[^>]*\bdata-f="([^"]+)"/g),match=>match[1]),['all','unanswered','wrong','fav','A','B','C','ungraded']);
assert.deepEqual(Array.from(sortHtml.matchAll(/<button\b[^>]*\bdata-sort="([^"]+)"/g),match=>match[1]),['published','lowacc']);
assert.match(source,/\.filterbar\{[^}]*overflow-x:auto/,'filter bar keeps horizontal scrolling');
assert.match(source,/\.fbtn\{[^}]*white-space:nowrap/,'filter labels do not break on narrow screens');
assert.match(source,/session\.single&&session\.returnTo==='list'\)[\s\S]{0,80}renderList\(\)/,'returning from an answer rerenders the preserved list filter');
assert.match(source,/const left=a\.correctInt\*b\.totalInt,right=b\.correctInt\*a\.totalInt/,'accuracy comparison uses integer cross-multiplication');

console.log('PASS list low accuracy: sorted results and rows, wrong and grade A filters, batch practice order, rerender, and narrow-screen scrolling');
