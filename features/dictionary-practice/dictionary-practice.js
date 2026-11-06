(function(){
  'use strict';

  const SOURCES={
    dictionary2:{title:'CBTの辞典② 基礎臨床',shortTitle:'CBTの辞典②',url:'dictionary-assets/exercises/manifest.json',count:956,schema:2,prefix:'togo_dictionary2_progress_v1_'},
    mock1:{title:'CBTの辞典③ 誌上模試1',shortTitle:'辞典③ 模試1',url:'dictionary-assets/mock-exams/manifest.json',count:320,schema:1,mock:1,prefix:'togo_dictionary3_mock1_progress_v1_'},
    mock2:{title:'CBTの辞典③ 誌上模試2',shortTitle:'辞典③ 模試2',url:'dictionary-assets/mock-exams/manifest.json',count:304,schema:1,mock:2,prefix:'togo_dictionary3_mock2_progress_v1_'},
    dentalMaterials:{title:'学校配布 歯科理工 Forms',shortTitle:'歯科理工 Forms',url:'dictionary-assets/dental-materials/manifest.json',count:47,schema:1,prefix:'togo_dental_materials_forms_progress_v1_',allowUnresolved:true,groups:['2024 Forms'],explanationTitle:'学校Formsの正答参照画像'}
  };
  let sourceKey='dictionary2';
  let manifest=null;
  let loadPromise=null;
  let progress={answers:{},index:0,updatedAt:0};
  let currentIndex=0;
  let picked='';
  let answered=false;

  const $=id=>document.getElementById(id);
  const owner=()=>window.cbtUser?.uid||'local';
  const source=()=>SOURCES[sourceKey];
  const storeKey=()=>source().prefix+owner();

  function loadProgress(){
    try{
      const raw=JSON.parse(localStorage.getItem(storeKey())||'null');
      progress=raw&&typeof raw==='object'?raw:{answers:{},index:0,updatedAt:0};
    }catch(_){ progress={answers:{},index:0,updatedAt:0}; }
    if(!progress.answers||typeof progress.answers!=='object')progress.answers={};
    progress.index=Number.isInteger(progress.index)?progress.index:0;
  }

  function saveProgress(){
    progress.index=currentIndex;
    progress.updatedAt=Date.now();
    try{localStorage.setItem(storeKey(),JSON.stringify(progress));}
    catch(error){console.warn('dictionary progress save failed',error);}
    if(typeof window.cloudSyncSoon==='function')window.cloudSyncSoon();
  }

  async function loadManifest(){
    if(manifest)return manifest;
    const requestedKey=sourceKey,selected=source();
    if(!loadPromise){
      let guarded;
      const pending=fetch(selected.url,{cache:'no-cache'}).then(async response=>{
      if(!response.ok)throw new Error(`manifest HTTP ${response.status}`);
      const data=await response.json();
      if(data.schemaVersion!==selected.schema||(!selected.allowUnresolved&&data.unresolved?.length))throw new Error(`${selected.shortTitle}の検証済みデータではありません`);
      const items=selected.mock?data.items?.filter(item=>item.mock===selected.mock):data.items;
      if(items?.length!==selected.count)throw new Error(`${selected.shortTitle}の問題数が一致しません`);
      const loaded={...data,count:items.length,items};
      if(sourceKey===requestedKey&&loadPromise===guarded)manifest=loaded;
      return loaded;
      });
      guarded=pending.catch(error=>{if(loadPromise===guarded)loadPromise=null;throw error;});
      loadPromise=guarded;
    }
    return loadPromise;
  }

  function groupFor(sourceId){
    if(source().groups){const item=manifest?.items.find(entry=>entry.sourceId===sourceId);return item?.group||source().groups[0];}
    if(source().mock){const item=manifest?.items.find(entry=>entry.sourceId===sourceId);return item?`B${item.block}`:'';}
    return sourceId.startsWith('E')?sourceId.slice(0,2):sourceId.slice(0,1);
  }

  function groupKeys(){return source().groups|| (source().mock?['B1','B2','B3','B4','B5','B6']:['A','B','C','D','E1','E2','E3','E4']);}

  function renderGroupButtons(){
    const groups=$('dictionaryGroups');if(!groups)return;
    groups.innerHTML=groupKeys().map(group=>`<button type="button" class="dictionary-group" data-dictionary-group="${group}">${source().groups?group:(source().mock?`ブロック${group.slice(1)}`:group)}<span>準備中</span></button>`).join('');
    bindGroupButtons();
  }

  function summary(){
    const entries=Object.values(progress.answers);
    return {
      answered:entries.length,
      correct:entries.filter(item=>item.lastCorrect===true).length,
      attempts:entries.reduce((sum,item)=>sum+(Array.isArray(item.attempts)?item.attempts.length:0),0)
    };
  }

  function setSource(next){
    if(!SOURCES[next]||next===sourceKey)return false;
    sourceKey=next;manifest=null;loadPromise=null;progress={answers:{},index:0,updatedAt:0};currentIndex=0;
    return true;
  }

  async function renderHome(scope='dictionary'){
    if(scope==='dentalMaterials')setSource('dentalMaterials');
    else if(sourceKey==='dentalMaterials')setSource('dictionary2');
    const requestedKey=sourceKey,selected=source();
    const status=$('dictionaryStatus');
    if(status)status.textContent=`${selected.shortTitle}を読み込み中…`;
    $('dictionaryHomeTitle').textContent=`📚 ${selected.title}`;
    const description=$('dictionaryHomeDescription');
    if(description)description.textContent=scope==='dentalMaterials'
      ?'学校配布の歯科理工Formsを解きます。回答成績はランキングに含まれますが、通常問題集・CBT辞典・学習ルート・XPとは別記録です。'
      :'辞典②・③の問題画像を解き、回答後に公式解説を確認できます。回答成績はランキングに含まれますが、通常問題集・学習ルート・XPとは別記録です。';
    document.querySelector('.dictionary-sources')?.classList.toggle('hidden',scope==='dentalMaterials');
    document.querySelectorAll('[data-dictionary-source]').forEach(button=>button.classList.toggle('on',button.dataset.dictionarySource===sourceKey));
    renderGroupButtons();
    try{
      const loaded=await loadManifest();
      if(sourceKey!==requestedKey)return;
      manifest=loaded;loadProgress();
      const sums=summary();
      $('dictionaryAnswered').textContent=sums.answered;
      $('dictionaryCorrect').textContent=sums.correct;
      $('dictionaryAttempts').textContent=sums.attempts;
      $('dictionaryStart').textContent=sums.answered?'続きから再開':'最初から始める';
      $('dictionaryStart').disabled=false;
      const gap=sourceKey==='mock2'?' ／ 原本PDFに存在しない16問は未収録':'';
      const formsGap=sourceKey==='dentalMaterials'?` ／ 原本50問中、正答表示のない${manifest.unresolved.length}問は未収録`:'';
      status.textContent=`原本ID・正答・解説画面を検証済み（全${manifest.count}問）${gap}${formsGap}`;
      document.querySelectorAll('[data-dictionary-group]').forEach(button=>{
        const count=manifest.items.filter(item=>groupFor(item.sourceId)===button.dataset.dictionaryGroup).length;
        button.querySelector('span').textContent=`${count}問`;
        button.disabled=!count;
      });
    }catch(error){
      if(sourceKey!==requestedKey)return;
      console.error(error);status.textContent=`${source().shortTitle}を読み込めませんでした。通信を確認して開き直してください。`;
      $('dictionaryStart').disabled=true;
    }
  }

  function selectSource(next){
    if(setSource(next))renderHome('dictionary');
  }

  async function open(index){
    try{await loadManifest();loadProgress();}
    catch(error){console.error(error);return;}
    currentIndex=Math.max(0,Math.min(manifest.items.length-1,Number.isInteger(index)?index:progress.index));
    saveProgress();renderQuestion();
  }

  function firstIndexForGroup(group){
    return manifest.items.findIndex(item=>groupFor(item.sourceId)===group);
  }

  function renderQuestion(){
    const item=manifest.items[currentIndex];
    const saved=progress.answers[item.sourceId];
    picked='';answered=false;
    window.showOnly('dictionaryPractice');
    $('footer').classList.add('hidden');
    $('timerChip').classList.remove('show');
    $('routeBackBtn').classList.add('hidden');
    $('pbarFill').style.width=`${(currentIndex+1)/manifest.items.length*100}%`;
    $('dictionaryPracticeTitle').textContent=source().shortTitle;
    $('dictionaryHomeBack').textContent=sourceKey==='dentalMaterials'?'歯科理工へ':'辞典一覧へ';
    $('dictionaryNumber').textContent=item.sourceId;
    $('dictionaryProgress').textContent=`${currentIndex+1} / ${manifest.items.length}問`;
    $('dictionaryQuestionImage').src=item.questionImage;
    $('dictionaryQuestionImage').alt=`${source().shortTitle} ${item.sourceId} の問題`;
    $('dictionaryExplanationTitle').textContent=source().explanationTitle||'公式解説';
    $('dictionaryPrev').disabled=currentIndex===0;
    $('dictionaryNext').disabled=currentIndex===manifest.items.length-1;
    const choices=$('dictionaryChoices');choices.innerHTML='';choices.classList.toggle('with-labels',Boolean(item.choiceLabels));
    const requiredChoices=item.answer.length;
    for(const key of item.choices){
      const button=document.createElement('button');button.type='button';button.className='dictionary-choice';button.dataset.choice=key;
      const label=item.choiceLabels?.[key];button.textContent=label?`${key}　${label}`:key;
      button.addEventListener('click',()=>{
        if(answered)return;
        if(requiredChoices===1){
          picked=key;
          choices.querySelectorAll('button').forEach(node=>node.classList.toggle('selected',node===button));
        }else{
          const selected=new Set(picked);
          if(selected.has(key))selected.delete(key);
          else if(selected.size<requiredChoices)selected.add(key);
          picked=[...item.choices].filter(choice=>selected.has(choice)).join('');
          choices.querySelectorAll('button').forEach(node=>node.classList.toggle('selected',picked.includes(node.dataset.choice)));
        }
        $('dictionarySubmit').disabled=picked.length!==requiredChoices;
      });
      choices.appendChild(button);
    }
    $('dictionarySubmit').disabled=true;$('dictionarySubmit').textContent='回答する';
    $('dictionaryResult').classList.add('hidden');
    $('dictionaryExplanation').classList.add('hidden');
    $('dictionaryExplanationImage').removeAttribute('src');
    if(saved){
      $('dictionaryHistory').textContent=`この問題の回答回数 ${saved.attempts?.length||0}回 ・ 前回 ${saved.lastCorrect?'○':'×'}`;
      $('dictionaryHistory').classList.remove('hidden');
    }else $('dictionaryHistory').classList.add('hidden');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function submit(){
    if(answered||!picked)return;
    const item=manifest.items[currentIndex];
    answered=true;
    const correct=picked===item.answer;
    $('dictionaryChoices').querySelectorAll('button').forEach(button=>{
      button.disabled=true;button.classList.remove('selected');
      if(item.answer.includes(button.dataset.choice))button.classList.add('correct');
      else if(picked.includes(button.dataset.choice))button.classList.add('wrong');
    });
    const result=$('dictionaryResult');result.classList.remove('hidden');result.classList.toggle('bad',!correct);
    result.textContent=`${correct?'○ 正解':'× 不正解'}　あなたの回答：${picked} ／ 正解：${item.answer}`;
    $('dictionaryExplanationImage').src=item.explanationImage;
    $('dictionaryExplanationImage').alt=`${source().shortTitle} ${item.sourceId} の公式解説`;
    $('dictionaryExplanation').classList.remove('hidden');
    const record=progress.answers[item.sourceId]||{attempts:[]};
    if(!Array.isArray(record.attempts))record.attempts=[];
    record.attempts.push({picked,correct,at:Date.now()});record.lastCorrect=correct;record.lastPicked=picked;
    progress.answers[item.sourceId]=record;saveProgress();
    $('dictionaryHistory').textContent=`この問題の回答回数 ${record.attempts.length}回 ・ 今回 ${correct?'○':'×'}`;
    $('dictionaryHistory').classList.remove('hidden');
    $('dictionarySubmit').disabled=false;$('dictionarySubmit').textContent=currentIndex<manifest.items.length-1?'次の問題へ':'ホームへ戻る';
  }

  function move(delta){
    saveProgress();currentIndex=Math.max(0,Math.min(manifest.items.length-1,currentIndex+delta));renderQuestion();
  }

  function bindGroupButtons(){
    document.querySelectorAll('[data-dictionary-group]').forEach(button=>button.addEventListener('click',async()=>{
      await loadManifest();const index=firstIndexForGroup(button.dataset.dictionaryGroup);if(index>=0)open(index);
    }));
  }

  function bind(){
    $('dictionaryStart')?.addEventListener('click',()=>open(progress.index));
    document.querySelectorAll('[data-dictionary-source]').forEach(button=>button.addEventListener('click',()=>selectSource(button.dataset.dictionarySource)));
    bindGroupButtons();
    $('dictionaryHomeBack')?.addEventListener('click',()=>window.renderHome());
    $('dictionaryPrev')?.addEventListener('click',()=>move(-1));
    $('dictionaryNext')?.addEventListener('click',()=>move(1));
    $('dictionarySubmit')?.addEventListener('click',()=>{
      if(!answered)submit();else if(currentIndex<manifest.items.length-1)move(1);else window.renderHome();
    });
    for(const id of ['dictionaryQuestionImage','dictionaryExplanationImage'])$(id)?.addEventListener('click',event=>window.openImageZoom(event.currentTarget.currentSrc||event.currentTarget.src,event.currentTarget.alt));
  }

  window.dictionaryPractice={renderHome,open,reloadProgress:loadProgress};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
