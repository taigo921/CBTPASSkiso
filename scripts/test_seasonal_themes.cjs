const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const early=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).find(script=>script.includes('window.toGOSeasonTheme'));
const runtime=source.slice(source.indexOf('function xmasMotionReduced()'),source.indexOf('/* ============ タイマー ============ */'));
assert.ok(early&&runtime,'season theme scripts are present');

class ClassList{
  constructor(owner){this.owner=owner;this.values=new Set();}
  add(...names){names.forEach(name=>this.values.add(name));this.sync();}
  remove(...names){names.forEach(name=>this.values.delete(name));this.sync();}
  contains(name){return this.values.has(name);}
  toggle(name,force){const add=force===undefined?!this.contains(name):force;add?this.values.add(name):this.values.delete(name);this.sync();return add;}
  set(value){this.values=new Set(String(value||'').split(/\s+/).filter(Boolean));this.sync();}
  sync(){this.owner._className=[...this.values].join(' ');}
}
class Node{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.classList=new ClassList(this);this.attributes={};this.listeners={};this.style={setProperty(name,value){this[name]=value;}};this.textContent='';}
  set className(value){this.classList.set(value);}get className(){return this._className||'';}
  get childElementCount(){return this.children.length;}
  get firstElementChild(){return this.children[0]||null;}
  cloneNode(deep){const copy=new Node(this.tagName);copy.className=this.className;copy.attributes={...this.attributes};if(deep)this.children.forEach(child=>copy.appendChild(child.cloneNode(true)));return copy;}
  appendChild(node){if(node.tagName==='FRAGMENT'){node.children.slice().forEach(child=>{child.remove();this.appendChild(child);});return node;}node.parentNode=this;this.children.push(node);return node;}
  prepend(node){node.parentNode=this;this.children.unshift(node);return node;}
  replaceChildren(...nodes){this.children.forEach(node=>node.parentNode=null);this.children=[];nodes.forEach(node=>this.appendChild(node));}
  remove(){if(!this.parentNode)return;this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}
  setAttribute(name,value){this.attributes[name]=String(value);}getAttribute(name){return this.attributes[name]??null;}
  addEventListener(name,handler){this.listeners[name]=handler;}
  querySelector(selector){return queryAll(this,selector)[0]||null;}
  querySelectorAll(selector){return queryAll(this,selector);}
}
function descendants(root){return root.children.flatMap(child=>[child,...descendants(child)]);}
function queryAll(root,selector){
  const nodes=descendants(root),parts=selector.split(',').map(part=>part.trim().split(/\s+/).at(-1));
  return nodes.filter(node=>parts.some(part=>part.startsWith('.')?node.classList.contains(part.slice(1)):part.startsWith('#')?node.attributes.id===part.slice(1):false));
}
function makeHarness(year,month,day,search=''){
  const root=new Node('html'),body=new Node('body'),home=new Node(),hero=new Node(),snow=new Node(),meta=new Node('meta'),authGate=new Node();
  home.setAttribute('id','home');hero.className='hero';home.appendChild(hero);snow.setAttribute('id','xmasSnow');authGate.setAttribute('id','authGate');meta.setAttribute('name','theme-color');meta.setAttribute('content','#173A78');
  const elements={xmasSnow:snow,authGate},listeners={},intervals=[],observers=[];
  for(const match of source.matchAll(/<template id="(\w+)"[^>]*>\s*<div class="([^"]+)"/g)){
    const content=new Node('fragment'),child=new Node();child.className=match[2];child.setAttribute('data-template',match[1]);content.appendChild(child);
    elements[match[1]]={content};
  }
  let reducedMotion=false;
  const document={documentElement:root,body,hidden:false,
    createElement:tag=>new Node(tag),
    addEventListener:(name,handler)=>(listeners[name]||(listeners[name]=[])).push(handler),
    querySelector(selector){if(selector==='meta[name="theme-color"]')return meta;if(selector==='#home .hero')return hero;return [...queryAll(home,selector),...queryAll(body,selector)][0]||null;},
    querySelectorAll:selector=>[...queryAll(home,selector),...queryAll(body,selector)]
  };
  const OriginalDate=Date;let nowMs=new OriginalDate(year,month-1,day,12).getTime();
  class MockDate extends OriginalDate{constructor(...args){super(...(args.length?args:[nowMs]));}static now(){return nowMs;}}
  const context={document,location:{search},URLSearchParams,Date:MockDate,Math,Promise,performance:{now:()=>1000},innerWidth:390,innerHeight:844,
    matchMedia:()=>({matches:reducedMotion}),setTimeout:()=>0,setInterval:handler=>{intervals.push(handler);return intervals.length;},
    MutationObserver:class{constructor(handler){this.handler=handler;observers.push(this);}observe(){}},
    el:id=>elements[id]||null,console};
  context.window=context;vm.createContext(context);vm.runInContext(early,context);vm.runInContext(runtime,context);vm.runInContext('initXmasThemeRuntime()',context);
  return {context,root,hero,snow,meta,listeners,intervals,observers,setReducedMotion:value=>{reducedMotion=value;},setDate:(y,m,d)=>{nowMs=new OriginalDate(y,m-1,d,12).getTime();},season:()=>vm.runInContext('window.toGOSeasonTheme.currentSeason()',context)};
}
function assertDecorations(harness,season,count,greeting){
  assert.equal(harness.season(),season);assert.equal(harness.snow.childElementCount,count);
  assert.equal(harness.hero.querySelectorAll('.xmas-garland').length,season?1:0,'one garland/curtain at most');
  assert.equal(harness.hero.querySelectorAll('.xmas-greeting').length,season?1:0,'one greeting at most');
  if(greeting)assert.match(harness.hero.querySelector('.xmas-greeting').textContent,greeting);
}

function assertEffects(harness,flightId,wrongId){
  const {context}=harness,document=context.document,authGate=context.el('authGate');
  const trigger=()=>vm.runInContext("xmasSleighFlight('home');xmasSleighFlight('home');xmasAnswerFx(false);xmasAnswerFx(false)",context);
  if(wrongId!=='xmasFxNgTemplate'){
    authGate.classList.remove('ok');trigger();
    assert.equal(document.querySelectorAll('.xmas-sleigh-flight,.xa-fx').length,0);
  }
  authGate.classList.add('ok');
  document.hidden=true;trigger();
  assert.equal(document.querySelectorAll('.xmas-sleigh-flight,.xa-fx').length,0);
  document.hidden=false;
  trigger();
  const flights=document.querySelectorAll('.xmas-sleigh-flight'),overlays=document.querySelectorAll('.xa-fx');
  assert.equal(flights.length,1);assert.equal(overlays.length,1);
  assert.equal(flights[0].firstElementChild.getAttribute('data-template'),flightId);
  assert.equal(overlays[0].getAttribute('data-template'),wrongId);
  const overlay=overlays[0],timeouts=[];
  context.setTimeout=(handler,delay)=>{timeouts.push({handler,delay});};
  vm.runInContext('xmasAnswerFx(false)',context);
  const replacement=document.querySelector('.xa-fx');
  assert.equal(overlay.parentNode,null,'another answer replaces the old overlay');
  assert.equal(timeouts.length,1);
  assert.equal(timeouts[0].delay,wrongId==='newyearFxNgTemplate'?3100:2200);
  if(wrongId!=='xmasFxNgTemplate'){
    const animationEnd=replacement.listeners.animationend;
    animationEnd({target:new Node(),animationName:'xaNgDim'});
    animationEnd({target:replacement,animationName:'xaCaption'});
    assert.equal(replacement.parentNode,document.body,'only the overlay fade can end the effect');
    animationEnd({target:replacement,animationName:'xaNgDim'});
    assert.equal(replacement.parentNode,null);
    vm.runInContext('xmasAnswerFx(false)',context);
    assert.equal(timeouts.length,2);
    timeouts[0].handler();
    assert.ok(document.querySelector('.xa-fx'),'the old timer leaves the new overlay alone');
  }
  timeouts.at(-1).handler();
  assert.equal(document.querySelector('.xa-fx'),null,'the fallback timer removes the overlay');
  context.setTimeout=()=>0;
  flights[0].remove();
  harness.setReducedMotion(true);trigger();
  assert.equal(document.querySelectorAll('.xmas-sleigh-flight,.xa-fx').length,0);
  harness.setReducedMotion(false);
}

const h=makeHarness(2026,12,25);
assertDecorations(h,'xmas',30,/Merry Christmas/);
assertEffects(h,'xmasSleighTemplate','xmasFxNgTemplate');
assert.deepEqual(Object.fromEntries(['visibilitychange','click','pointerdown'].map(name=>[name,h.listeners[name]?.length||0])),{visibilitychange:1,click:1,pointerdown:1});
assert.equal(h.intervals.length,1,'one minute date checker is registered');assert.equal(h.observers.length,1,'one auth observer is registered');
vm.runInContext('initXmasThemeRuntime()',h.context);
assert.deepEqual(Object.fromEntries(['visibilitychange','click','pointerdown'].map(name=>[name,h.listeners[name]?.length||0])),{visibilitychange:1,click:1,pointerdown:1},'runtime initialization does not duplicate listeners');

h.setDate(2026,12,26);h.listeners.visibilitychange[0]();assertDecorations(h,'winter',40,/良いお年を/);assert.equal(h.meta.getAttribute('content'),'#132840');
assertEffects(h,'winterSleighTemplate','winterFxNgTemplate');
h.setDate(2026,12,31);h.intervals[0]();assertDecorations(h,'winter',40,/良いお年を/);
h.setDate(2027,1,1);h.intervals[0]();assertDecorations(h,'newyear',18,/あけまして/);assert.equal(h.meta.getAttribute('content'),'#7A1420');
assertEffects(h,'newyearKiteTemplate','newyearFxNgTemplate');
h.setDate(2027,1,7);h.intervals[0]();assertDecorations(h,'newyear',18,/あけまして/);
h.setDate(2027,1,8);h.intervals[0]();assertDecorations(h,'',0);assert.equal(h.meta.getAttribute('content'),'#173A78','theme color returns to its original value');
assert.deepEqual(Object.fromEntries(['visibilitychange','click','pointerdown'].map(name=>[name,h.listeners[name]?.length||0])),{visibilitychange:1,click:1,pointerdown:1},'date transitions do not duplicate listeners');

const forced=makeHarness(2026,12,25,'?season=xmas');forced.setDate(2027,1,8);forced.listeners.visibilitychange[0]();
assertDecorations(forced,'xmas',30,/Merry Christmas/);assert.equal(forced.intervals.length,0,'URL override disables periodic date reevaluation');
assert.match(source,/html\.xmas \.xa-newyear\{[^}]*animation-duration:3s/);
assert.match(source,/\.xa-newyear \.xa-caption\{[^}]*animation:xaCaption 3s both/);
console.log('PASS seasonal themes: date transitions, effect templates and guards, cleanup, URL override, and single listener registration.');
