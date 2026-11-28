const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'features/dictionary-practice/dictionary-practice.js'),'utf8');
const context={
  window:{},
  document:{readyState:'loading',addEventListener(){}},
  console
};
vm.createContext(context);
vm.runInContext(source,context);
const helpers=context.window.dictionaryPractice;
const items=[{sourceId:'A001'},{sourceId:'A002'},{sourceId:'B001'},{sourceId:'B002'}];
const progress={
  index:3,
  answers:{
    A001:{lastCorrect:false,attempts:[{correct:false}]},
    A002:{lastCorrect:true,attempts:[{correct:true}]},
    B001:{lastCorrect:false,attempts:[{correct:false},{correct:false}]}
  },
  favorites:{A002:{on:true,at:10},B001:{on:false,at:20},B002:{on:true,at:30}}
};

assert.deepEqual([...helpers.filteredIndices('wrong',items,progress)],[0,2],'wrong mode uses lastCorrect === false only');
assert.deepEqual([...helpers.filteredIndices('fav',items,progress)],[1,3],'favorite mode uses favorites[sourceId].on only');

progress.grades={A001:{g:'A'},A002:{g:'B'},B001:{g:'C'},B002:{g:null}};
for(const [mode,index] of [['A',0],['B',1],['C',2],['ungraded',3]]){
  assert.deepEqual([...helpers.filteredIndices(mode,items,progress)],[index]);
}
assert.deepEqual([...helpers.filteredIndices('ungraded',items,{grades:{A001:{g:'invalid'}}})],[0,1,2,3]);
assert.equal(Object.keys(helpers.normalizeProgress({grades:[]}).grades).length,0);
assert.deepEqual([...helpers.orderedIndices('all','lowacc',items,progress)],[2,0,1,3]);
assert.deepEqual([...helpers.orderedIndices('wrong','lowacc',items,progress)],[2,0]);
assert.deepEqual([...helpers.orderedIndices('wrong','published',items,progress)],[0,2]);
const tied={answers:{
  A001:{attempts:[{correct:true},{correct:false}]},
  A002:{attempts:[{correct:false},{correct:true},{correct:false},{correct:true}]},
  B001:{attempts:[{correct:false},{correct:true}]},
  B002:{attempts:[null,{correct:'false'}]}
}};
assert.deepEqual([...helpers.orderedIndices('all','lowacc',items,tied)],[1,0,2,3]);
assert.equal(helpers.resumeIndexForSave('all',1,progress.index,'lowacc'),3);

const snapshot=[...helpers.filteredIndices('wrong',items,progress)];
progress.answers.A001.lastCorrect=true;
assert.deepEqual(snapshot,[0,2],'the filtered session snapshot does not shrink after a correct answer');
assert.equal(helpers.moveSnapshotPosition(snapshot,0,1),1);
assert.equal(snapshot[helpers.moveSnapshotPosition(snapshot,0,1)],2,'snapshot navigation advances to the next captured manifest index');
assert.equal(helpers.moveSnapshotPosition(snapshot,1,1),1,'snapshot navigation clamps at the end');
assert.equal(helpers.moveSnapshotPosition(snapshot,0,-1),0,'snapshot navigation clamps at the beginning');

assert.equal(helpers.resumeIndexForSave('wrong',0,progress.index),3,'wrong review does not overwrite the all-mode resume index');
assert.equal(helpers.resumeIndexForSave('fav',1,progress.index),3,'favorite review does not overwrite the all-mode resume index');
assert.equal(helpers.resumeIndexForSave('all',1,progress.index),1,'all mode still updates its resume index');

const before=helpers.summaryProgress(progress);
progress.favorites.EXTRA={on:true,at:40};
progress.grades.EXTRA={g:'A',at:41};
assert.deepEqual(helpers.summaryProgress(progress),before,'favorites are excluded from answered, correct and attempt summaries');
assert.equal(Object.keys(helpers.normalizeProgress({answers:{},favorites:null,index:2}).favorites).length,0,'missing or invalid favorites default to an empty object');

const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const id of ['dictionaryModes','dictionaryFavBtn','dictionarySortControls','dictionaryGrade'])assert.match(html,new RegExp(`id="${id}"`));
for(const mode of ['all','wrong','fav','A','B','C','ungraded'])assert.match(html,new RegExp(`data-dictionary-mode="${mode}"`));
assert.match(html,/title="お気に入り"/);
assert.match(source,/progress\.favorites\[item\.sourceId\]=\{on:/);
assert.match(source,/sessionMode==='all'/);
const modes=['all','wrong','fav','A','B','C','ungraded'];
const orders=['published','lowacc'];
const history=[false,true,true,false,true,false];
const row=helpers.listRows('all','published',[{sourceId:'001',mock:2,block:3}],{
  answers:{'001':{lastCorrect:false,attempts:history.map(correct=>({correct}))}},
  favorites:{'001':{on:true}},grades:{'001':{g:'B'}}
})[0];
assert.deepEqual({...row,recent:[...row.recent]},{
  index:0,sourceId:'001',group:'ブロック3',lastCorrect:false,favorite:true,grade:'B',
  recent:history.slice(-5),correct:3,total:6
});

function element(dataset={}){
  const classes=new Set(),children=[],listeners={};
  return {
    dataset,children,textContent:'',style:{},
    classList:{
      add:name=>classes.add(name),remove:name=>classes.delete(name),
      contains:name=>classes.has(name),toggle:(name,on)=>on?classes.add(name):classes.delete(name)
    },
    set innerHTML(value){this.markup=value;children.length=0;},
    appendChild:child=>children.push(child),
    replaceChildren:fragment=>children.splice(0,children.length,...fragment.children),
    querySelector(selector){return (this.nodes??={})[selector]??=element();},
    querySelectorAll(){return children;},
    addEventListener:(name,handler)=>{listeners[name]=handler;},
    click:()=>listeners.click?.(),
    setAttribute(){},removeAttribute(){},hasAttribute(){return false;}
  };
}

(async()=>{
  const data=JSON.parse(fs.readFileSync(path.join(root,'dictionary-assets/exercises/manifest.json'),'utf8'));
  const sample=data.items.slice(0,4);
  const lastResults=[false,true,false,true];
  const saved={index:7,answers:{},favorites:{},grades:{}};
  sample.forEach(({sourceId},index)=>{
    const correct=lastResults[index];
    saved.answers[sourceId]={lastCorrect:correct,attempts:index===0?[{correct:true},{correct}]:[{correct}]};
    saved.favorites[sourceId]={on:index!==0};
    if(index!==3)saved.grades[sourceId]={g:'ABC'[index]};
  });
  const store=new Map([['togo_dictionary2_progress_v1_local',JSON.stringify(saved)]]);
  const nodes=new Map(),get=id=>{
    if(!nodes.has(id))nodes.set(id,element());
    return nodes.get(id);
  };
  const homeModeButtons=modes.map(dictionaryMode=>element({dictionaryMode}));
  const modeButtons=modes.map(dictionaryMode=>element({dictionaryMode}));
  const sortButtons=orders.map(dictionarySort=>element({dictionarySort}));
  const runtime={
    console,
    window:{
      showOnly(id){
        for(const screen of ['dictionaryList','dictionaryPractice','home'])get(screen).classList.toggle('hidden',screen!==id);
      },
      renderHome(){this.showOnly('home');},scrollTo(){}
    },
    document:{
      readyState:'complete',getElementById:get,createElement:()=>element(),createDocumentFragment:()=>element(),
      querySelector:()=>null,
      querySelectorAll(selector){
        if(selector==='[data-dictionary-mode]')return [...homeModeButtons,...modeButtons];
        return selector==='[data-dictionary-sort]'?sortButtons:[];
      }
    },
    localStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)},
    fetch:async url=>({ok:true,json:async()=>url.includes('dental-materials')
      ?JSON.parse(fs.readFileSync(path.join(root,url),'utf8')):data})
  };
  vm.runInNewContext(source,runtime);
  const feature=runtime.window.dictionaryPractice;
  runtime.window.showOnly('home');
  await feature.renderHome();
  await get('dictionaryOpenList').click();
  assert.match(get('dictionaryListTitle').textContent,/CBTの辞典② 問題一覧/);
  assert.equal(get('footer').classList.contains('hidden'),true);
  for(const [modeIndex,mode] of modes.entries()){
    modeButtons[modeIndex].click();
    assert.equal(homeModeButtons[modeIndex].classList.contains('on'),true);
    for(const [orderIndex,order] of orders.entries()){
      sortButtons[orderIndex].click();
      const expected=[...feature.orderedIndices(mode,order,data.items,saved)];
      const body=get('dictionaryListBody');
      const rows=body.children.filter(node=>node.className==='litem');
      const headings=body.children.filter(node=>node.className==='lsec');
      assert.deepEqual(rows.map(node=>node.querySelector('.lno').textContent),expected.map(index=>data.items[index].sourceId));
      assert.equal(get('dictionaryListCount').textContent,`${expected.length} 問${mode==='all'?'':'（絞り込み中）'}`);
      if(order==='lowacc'){
        assert.equal(headings.length,1);
        assert.equal(headings[0].textContent,'正答率が低い順');
      }
      assert.equal(headings.reduce((total,heading)=>total+heading.children[0].textContent,0),expected.length);
      const start=Math.min(1,rows.length-1);
      rows[start].click();
      assert.equal(get('dictionaryNumber').textContent,data.items[expected[start]].sourceId);
      assert.equal(get('dictionaryHomeBack').textContent,'問題一覧へ');
      if(start){
        get('dictionaryPrev').click();
        assert.equal(get('dictionaryNumber').textContent,data.items[expected[0]].sourceId);
        get('dictionaryNext').click();
      }
      for(let position=start+1;position<expected.length;position++){
        get('dictionaryNext').click();
        assert.equal(get('dictionaryNumber').textContent,data.items[expected[position]].sourceId);
      }
      assert.equal(get('dictionaryNext').disabled,true);
      await get('dictionaryHomeBack').click();
      assert.equal(get('dictionaryList').classList.contains('hidden'),false);
    }
  }
  store.set('togo_dictionary2_progress_v1_local',JSON.stringify({}));
  await feature.openList();
  modeButtons[modes.indexOf('wrong')].click();
  assert.equal(get('dictionaryListCount').textContent,'0 問（絞り込み中）');
  assert.match(get('dictionaryListBody').markup,/該当する問題がありません。/);
  get('dictionaryListBack').click();
  assert.equal(get('dictionaryList').classList.contains('hidden'),true);
  await feature.renderHome('dentalMaterials');
  assert.equal(get('dictionaryOpenList').classList.contains('hidden'),true);
  await feature.openList();
  assert.equal(get('dictionaryList').classList.contains('hidden'),true);
  await get('dictionaryStart').click();
  assert.equal(get('dictionaryHomeBack').textContent,'歯科理工へ');
  console.log('PASS dictionary review modes: filters, accuracy sort, list order and row sessions, return navigation, Forms isolation, and resume isolation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
