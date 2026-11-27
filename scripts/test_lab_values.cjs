const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'index.html'),'utf8');

const expected=[
  ['赤血球','(男性) 420〜560万/μL','(女性) 380〜500万/μL'],
  ['ヘモグロビン〈Hb〉','(男性) 13.5〜17.5g/dL','(女性) 11.5〜15.5g/dL'],
  ['ヘマトクリット〈Ht〉','(男性) 40〜50%','(女性) 35〜45%'],
  ['白血球','3,500〜9,000/μL'],['白血球分画'],['桿状核好中球','3〜6%'],['分葉核好中球','45〜60%'],
  ['好酸球','0〜5%'],['好塩基球','0〜1%'],['単球','1.5〜8%'],['リンパ球','25〜40%'],['血小板','15〜35万/μL'],
  ['プロトロンビン時間','PT：10〜13秒','PT-INR：0.9〜1.1'],
  ['pH（血液）','7.35〜7.45'],['PaCO₂','35〜45Torr'],['PaO₂','90〜100Torr'],
  ['経皮的動脈血酸素飽和度〈SpO₂〉','96%以上'],['推算糸球体濾過量〈eGFR〉','90mL/分/1.73m²以上*'],
  ['総タンパク〈TP〉','6.5〜8.2g/dL'],['アルブミン〈Alb〉','4.0〜5.0g/dL'],['総ビリルビン','0.2〜1.2mg/dL'],
  ['直接ビリルビン','0〜0.4mg/dL'],['AST','10〜40IU/L'],['ALT','5〜40IU/L'],['尿素窒素〈BUN〉','8〜20mg/dL'],
  ['クレアチニン〈Cr〉','(男性) 0.6〜1.2mg/dL','(女性) 0.5〜1.0mg/dL'],['{随時} 血糖','140mg/dL以下'],
  ['空腹時血糖〈FBS〉','70〜109mg/dL'],['HbA1c','4.6〜6.2%'],['総コレステロール〈TC〉','130〜220mg/dL'],
  ['トリグリセリド〈TG〉','50〜150mg/dL'],['Na','135〜145mEq/L'],['K','3.5〜5.0mEq/L'],
  ['Fe','(男性) 55〜190μg/dL','(女性) 40〜160μg/dL'],['C反応性タンパク〈CRP〉','定性法：陰性','定量法：0.3mg/dL以下']
];
for(const strings of expected)for(const value of strings)assert.ok(source.includes(value),`lab values table contains: ${value}`);
assert.ok(source.includes('※基準値は検査機器や測定方法などで異なるため、文献によって値が異なります。本表の数値はあくまでも目安として覚えてください。'));
assert.ok(source.includes('*クレアチニンクリアランスと近似'));
assert.match(source,/<div class="lab-values-dialog hidden" id="labValuesDialog" role="dialog" aria-modal="true" aria-labelledby="labValuesTitle" aria-hidden="true">/);
assert.match(source,/@media\(min-width:680px\)\{\.lab-values-columns\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
assert.match(source,/bottom:calc\(98px \+ env\(safe-area-inset-bottom\)\)/);
assert.match(source,/\.lab-values-table\{width:100%;[^}]*table-layout:fixed/,'fixed table layout prevents narrow-screen overflow');
assert.match(source,/\.lab-values-table th,\.lab-values-table td\{[^}]*overflow-wrap:anywhere/,'long labels wrap at 320px');

const start=source.indexOf("const LAB_VALUES_SCREEN_IDS="),end=source.indexOf('function showOnly(id){',start);
assert.ok(start>=0&&end>start,'lab values behavior helpers are present');
class FakeClassList{
  constructor(...values){this.values=new Set(values);}
  contains(value){return this.values.has(value);}
  add(value){this.values.add(value);}
  remove(value){this.values.delete(value);}
  toggle(value,force){const on=force===undefined?!this.contains(value):!!force;on?this.add(value):this.remove(value);return on;}
}
class FakeElement{
  constructor(...classes){this.classList=new FakeClassList(...classes);this.attributes={};this.style={};this.scrollTop=0;this.focusCount=0;this.tagName='DIV';this.focusables=[];}
  setAttribute(name,value){this.attributes[name]=String(value);}
  removeAttribute(name){delete this.attributes[name];}
  hasAttribute(name){return Object.hasOwn(this.attributes,name);}
  querySelectorAll(){return this.focusables;}
  contains(node){return node===this||this.focusables.includes(node);}
  focus(){this.focusCount++;context.document.activeElement=this;}
}
const header=new FakeElement(),wrap=new FakeElement(),footer=new FakeElement(),preInert=new FakeElement();preInert.setAttribute('inert','');
const elements={
  authGate:new FakeElement('ok'),labValuesButton:new FakeElement('hidden'),labValuesDialog:new FakeElement('hidden'),
  labValuesScroll:new FakeElement(),labValuesClose:new FakeElement(),quiz:new FakeElement(),mockExam:new FakeElement('hidden'),
  mockSubjectPractice:new FakeElement('hidden'),dictionaryPractice:new FakeElement('hidden')
};
elements.labValuesDialog.focusables=[elements.labValuesClose];
const bodyChildren=[elements.authGate,header,wrap,footer,elements.labValuesButton,preInert,elements.labValuesDialog];
const context={document:{body:{style:{overflow:'auto'},children:bodyChildren},documentElement:{style:{overflow:'visible'}},activeElement:null},el:id=>elements[id]};vm.createContext(context);vm.runInContext(source.slice(start,end),context);
for(const id of ['quiz','mockExam','mockSubjectPractice','dictionaryPractice'])assert.equal(vm.runInContext(`labValuesAvailable('${id}',false)`,context),true,`${id} shows the button`);
for(const id of ['home','studyPlan','finish','stats','list','sectionList','sectionStart','leaderboard','accessAdmin'])assert.equal(vm.runInContext(`labValuesAvailable('${id}',false)`,context),false,`${id} hides the button`);
assert.equal(vm.runInContext("labValuesAvailable('quiz',true)",context),false,'auth gate hides the button');

vm.runInContext('openLabValues()',context);
assert.equal(elements.labValuesDialog.classList.contains('hidden'),false,'open shows dialog');
assert.equal(elements.labValuesDialog.attributes['aria-hidden'],'false');
assert.equal(context.document.body.style.overflow,'hidden','open locks background scrolling');
assert.equal(context.document.documentElement.style.overflow,'hidden','open locks root scrolling');
assert.equal(elements.labValuesClose.focusCount,1,'open focuses close button');
for(const node of [elements.authGate,header,wrap,footer,elements.labValuesButton])assert.equal(node.hasAttribute('inert'),true,'open makes app background inert');
assert.equal(elements.labValuesDialog.hasAttribute('inert'),false,'dialog remains interactive');
assert.equal(preInert.hasAttribute('inert'),true,'pre-existing inert state remains intact');
let prevented=0;
vm.runInContext('trapLabValuesFocus(__event)',Object.assign(context,{__event:{key:'Tab',shiftKey:false,preventDefault(){prevented++;}}}));
assert.equal(prevented,1,'Tab wraps at the last dialog control');
vm.runInContext('trapLabValuesFocus(__event)',Object.assign(context,{__event:{key:'Tab',shiftKey:true,preventDefault(){prevented++;}}}));
assert.equal(prevented,2,'Shift+Tab wraps at the first dialog control');
elements.labValuesScroll.scrollTop=321;vm.runInContext('closeLabValues()',context);
assert.equal(elements.labValuesDialog.classList.contains('hidden'),true,'close hides dialog');
assert.equal(elements.labValuesDialog.attributes['aria-hidden'],'true');
assert.equal(context.document.body.style.overflow,'auto','close restores background scrolling');
assert.equal(context.document.documentElement.style.overflow,'visible','close restores root scrolling');
assert.equal(elements.labValuesButton.focusCount,1,'close restores focus to trigger');
for(const node of [elements.authGate,header,wrap,footer,elements.labValuesButton])assert.equal(node.hasAttribute('inert'),false,'close removes app background inert');
assert.equal(preInert.hasAttribute('inert'),true,'close preserves unrelated pre-existing inert');
vm.runInContext('openLabValues()',context);assert.equal(elements.labValuesScroll.scrollTop,321,'reopen restores sheet scroll position');

elements.authGate.classList.remove('ok');vm.runInContext('handleLabValuesAuthChange()',context);
assert.equal(elements.labValuesButton.classList.contains('hidden'),true,'auth gate relock hides trigger without showOnly');
assert.equal(elements.labValuesDialog.classList.contains('hidden'),true,'auth gate relock closes an open sheet');
assert.equal(context.document.body.style.overflow,'auto','auth gate relock releases body scroll lock');
assert.equal(context.document.documentElement.style.overflow,'visible','auth gate relock releases root scroll lock');
for(const node of [header,wrap,footer,elements.labValuesButton])assert.equal(node.hasAttribute('inert'),false,'auth gate relock releases app inert state');
assert.equal(elements.labValuesButton.focusCount,1,'auth gate close does not focus hidden trigger');

assert.match(source,/event\.target===el\('labValuesDialog'\)\)closeLabValues\(\)/,'backdrop closes the dialog');
assert.match(source,/event\.key==='Escape'.*labValuesDialog.*closeLabValues\(\)/,'Escape closes the dialog');
assert.match(source,/new MutationObserver\(handleLabValuesAuthChange\)\.observe\(el\('authGate'\),\{attributes:true,attributeFilter:\['class'\]\}\)/,'auth gate class changes are observed');
assert.match(source,/screens\.forEach[\s\S]{0,180}syncLabValuesButton\(id\)/,'showOnly updates lab values visibility');
assert.match(source,/const SERVICE_WORKER_BUILD='20261127-list-stats'/);
console.log(`PASS lab values: ${expected.length} rows/groups, screen/auth gating, inert background, Tab trap, dialog focus and scroll restoration.`);
