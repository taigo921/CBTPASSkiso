const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
for(const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);

const listStart=source.indexOf("let listFilter='all';");
const listEnd=source.indexOf('/* ============ セクションを選んで解く',listStart);
assert.ok(listStart>=0&&listEnd>listStart,'question-list implementation exists');

class FakeClassList{
  constructor(){this.values=new Set();}
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
const elements={listBody:new FakeElement(),listPracticeBtn:new FakeElement(),listCount:new FakeElement()};
const allButton=new FakeElement(),lowButton=new FakeElement();
allButton.dataset.f='all';lowButton.dataset.f='lowacc';
const context={
  Math,Map,Number,BigInt,
  QUESTIONS:questions,
  stats:{perQ:{
    A:{correct:0,wrong:2},
    B:{correct:0,wrong:5},
    C:{correct:1,wrong:3},
    D:{correct:2,wrong:6},
    E:{correct:1,wrong:0},
    F:{},G:{}
  },rankAttempts:[]},
  document:{
    querySelectorAll:selector=>selector==='#filterBar .fbtn'?[allButton,lowButton]:[],
    createElement:()=>new FakeElement()
  },
  el:id=>elements[id],
  qkey:q=>q.uid,
  qno:q=>q.display_no,
  escapeHtml:value=>String(value),
  groupBySection:arr=>arr.reduce((groups,q)=>{(groups[q.section]||(groups[q.section]=[])).push(q);return groups;},{}),
  recentQuestionAttempts:()=>[],
  startWrongListSession:()=>{},startSectionSession:()=>{},toast:()=>{},session:null
};
vm.createContext(context);
vm.runInContext(source.slice(listStart,listEnd),context);
vm.runInContext("listFilter='lowacc'",context);

assert.equal(context.listQuestions().length,questions.length,'low-accuracy mode targets every question');
context.renderList();
const renderedOrder=()=>elements.listBody.children.filter(child=>child.className==='litem').map(child=>child.innerHTML.match(/class="lno">([^<]+)/)?.[1]);
assert.deepEqual(renderedOrder(),['B','A','D','C','E','F','G'],'sorts by ascending accuracy, then larger total, then original order, with unanswered last');
assert.equal(lowButton.classList.contains('on'),true,'low-accuracy tab has selected state');
assert.equal(allButton.classList.contains('on'),false,'previous tab loses selected state');

context.stats.perQ.B={correct:10,wrong:0};
context.renderList();
assert.deepEqual(renderedOrder(),['A','D','C','B','E','F','G'],'a fresh render reorders after accuracy changes');

const filterHtml=source.match(/<div class="filterbar" id="filterBar">([\s\S]*?)<\/div>/)?.[1]||'';
assert.match(filterHtml,/data-f="all"[\s\S]*data-f="unanswered"[\s\S]*data-f="wrong"[\s\S]*data-f="fav"[\s\S]*data-f="lowacc"/,'existing tabs remain and low-accuracy is last');
assert.match(source,/\.filterbar\{[^}]*overflow-x:auto/,'filter bar keeps horizontal scrolling');
assert.match(source,/\.fbtn\{[^}]*white-space:nowrap/,'filter labels do not break on narrow screens');
assert.match(source,/session\.single&&session\.returnTo==='list'\)[\s\S]{0,80}renderList\(\)/,'returning from an answer rerenders the preserved list filter');
assert.match(source,/const left=a\.correctInt\*b\.totalInt,right=b\.correctInt\*a\.totalInt/,'accuracy comparison uses integer cross-multiplication');

console.log('PASS list low accuracy: ascending accuracy, answer-count and original-order ties, unanswered tail, rerender, selected tab, and narrow-screen scrolling');
