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
  let progress={answers:{},favorites:{},index:0,updatedAt:0};
  let mode='all';
  let sessionMode='all';
  let sessionIndices=null;
  let sessionPosition=0;
  let currentIndex=0;
  let picked='';
  let answered=false;

  const $=id=>document.getElementById(id);
  const owner=()=>window.cbtUser?.uid||'local';
  const source=()=>SOURCES[sourceKey];
  const storeKey=()=>source().prefix+owner();

  function normalizeProgress(value){
    const normalized=value&&typeof value==='object'&&!Array.isArray(value)?value:{answers:{},favorites:{},index:0,updatedAt:0};
    if(!normalized.answers||typeof normalized.answers!=='object'||Array.isArray(normalized.answers))normalized.answers={};
    if(!normalized.favorites||typeof normalized.favorites!=='object'||Array.isArray(normalized.favorites))normalized.favorites={};
    normalized.index=Number.isInteger(normalized.index)?normalized.index:0;
    return normalized;
  }

  function loadProgress(){
    try{progress=normalizeProgress(JSON.parse(localStorage.getItem(storeKey())||'null'));}
    catch(_){progress=normalizeProgress(null);}
    return progress;
  }

  function resumeIndexForSave(activeMode,index,previous){return activeMode==='all'?index:previous;}

  function saveProgress(){
    progress.index=resumeIndexForSave(sessionMode,currentIndex,progress.index);
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

  function groupKeys(){return source().groups||(source().mock?['B1','B2','B3','B4','B5','B6']:['A','B','C','D','E1','E2','E3','E4']);}

  function renderGroupButtons(){
    const groups=$('dictionaryGroups');if(!groups)return;
    groups.innerHTML=groupKeys().map(group=>`<button type="button" class="dictionary-group" data-dictionary-group="${group}">${source().groups?group:(source().mock?`ブロック${group.slice(1)}`:group)}<span>準備中</span></button>`).join('');
    bindGroupButtons();
  }

  function summaryProgress(value){
    const answers=value?.answers&&typeof value.answers==='object'&&!Array.isArray(value.answers)?value.answers:{};
    const entries=Object.values(answers);
    return {
      answered:entries.length,
      correct:entries.filter(item=>item?.lastCorrect===true).length,
      attempts:entries.reduce((sum,item)=>sum+(Array.isArray(item?.attempts)?item.attempts.length:0),0)
    };
  }

  function summary(){return summaryProgress(progress);}

  function filteredIndices(selectedMode,items,value){
    if(selectedMode==='all')return items.map((_,index)=>index);
    if(selectedMode==='wrong')return items.flatMap((item,index)=>value?.answers?.[item.sourceId]?.lastCorrect===false?[index]:[]);
    if(selectedMode==='fav')return items.flatMap((item,index)=>value?.favorites?.[item.sourceId]?.on===true?[index]:[]);
    return [];
  }

  function moveSnapshotPosition(indices,position,delta){return Math.max(0,Math.min(indices.length-1,position+delta));}

  function setSource(next){
    if(!SOURCES[next]||next===sourceKey)return false;
    sourceKey=next;manifest=null;loadPromise=null;progress=normalizeProgress(null);currentIndex=0;mode='all';sessionMode='all';sessionIndices=null;sessionPosition=0;
    return true;
  }

  function modeLabel(selectedMode){return selectedMode==='wrong'?'間違えた問題':'お気に入り';}

  function renderHomeMode(){
    if(!manifest)return;
    const allIndices=filteredIndices('all',manifest.items,progress);
    const wrongIndices=filteredIndices('wrong',manifest.items,progress);
    const favIndices=filteredIndices('fav',manifest.items,progress);
    const byMode={all:allIndices,wrong:wrongIndices,fav:favIndices};
    document.querySelectorAll('[data-dictionary-mode]').forEach(button=>{
      button.classList.toggle('on',button.dataset.dictionaryMode===mode);
      button.setAttribute('aria-pressed',String(button.dataset.dictionaryMode===mode));
      const count=button.querySelector('span');
      if(count)count.textContent=byMode[button.dataset.dictionaryMode].length;
    });
    const selected=byMode[mode];
    const start=$('dictionaryStart');
    if(mode==='all'){
      start.textContent=summary().answered?'続きから再開':'最初から始める';
      start.disabled=false;
    }else if(selected.length){
      start.textContent=`${modeLabel(mode)}を解く（${selected.length}問）`;
      start.disabled=false;
    }else{
      start.textContent=`${modeLabel(mode)}はありません`;
      start.disabled=true;
    }
    document.querySelectorAll('[data-dictionary-group]').forEach(button=>{
      const count=selected.filter(index=>groupFor(manifest.items[index].sourceId)===button.dataset.dictionaryGroup).length;
      button.querySelector('span').textContent=`${count}問`;
      button.disabled=!count;
    });
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
      const gap=sourceKey==='mock2'?' ／ 原本PDFに存在しない16問は未収録':'';
      const formsGap=sourceKey==='dentalMaterials'?` ／ 原本50問中、正答表示のない${manifest.unresolved.length}問は未収録`:'';
      status.textContent=`原本ID・正答・解説画面を検証済み（全${manifest.count}問）${gap}${formsGap}`;
      renderHomeMode();
    }catch(error){
      if(sourceKey!==requestedKey)return;
      console.error(error);status.textContent=`${source().shortTitle}を読み込めませんでした。通信を確認して開き直してください。`;
      $('dictionaryStart').disabled=true;
    }
  }

  function selectSource(next){if(setSource(next))renderHome('dictionary');}

  async function open(index,requestedMode=mode){
    try{await loadManifest();loadProgress();}
    catch(error){console.error(error);return;}
    sessionMode=requestedMode;
    if(sessionMode==='all'){
      sessionIndices=null;sessionPosition=0;
      currentIndex=Math.max(0,Math.min(manifest.items.length-1,Number.isInteger(index)?index:progress.index));
    }else{
      sessionIndices=filteredIndices(sessionMode,manifest.items,progress);
      if(!sessionIndices.length){renderHomeMode();return;}
      const requestedPosition=sessionIndices.indexOf(index);
      sessionPosition=requestedPosition>=0?requestedPosition:0;
      currentIndex=sessionIndices[sessionPosition];
    }
    saveProgress();renderQuestion();
  }

  function firstIndexForGroup(group,indices=filteredIndices(mode,manifest.items,progress)){
    return indices.find(index=>groupFor(manifest.items[index].sourceId)===group)??-1;
  }

  function sessionLength(){return sessionMode==='all'?manifest.items.length:sessionIndices.length;}
  function sessionOrdinal(){return sessionMode==='all'?currentIndex+1:sessionPosition+1;}
  function isFirst(){return sessionOrdinal()===1;}
  function isLast(){return sessionOrdinal()===sessionLength();}

  function renderFavorite(){
    const item=manifest.items[currentIndex],on=progress.favorites[item.sourceId]?.on===true,button=$('dictionaryFavBtn');
    if(!button)return;
    button.textContent=on?'★':'☆';button.classList.toggle('on',on);button.setAttribute('aria-pressed',String(on));
  }

  function renderQuestion(){
    const item=manifest.items[currentIndex];
    const saved=progress.answers[item.sourceId];
    picked='';answered=false;
    window.showOnly('dictionaryPractice');
    window.xmasSleighQuestionShown?.(`dictionary:${sourceKey}:${item.sourceId}`);
    $('footer').classList.add('hidden');
    $('timerChip').classList.remove('show');
    $('routeBackBtn').classList.add('hidden');
    $('pbarFill').style.width=`${sessionOrdinal()/sessionLength()*100}%`;
    $('dictionaryPracticeTitle').textContent=source().shortTitle;
    $('dictionaryHomeBack').textContent=sourceKey==='dentalMaterials'?'歯科理工へ':'辞典一覧へ';
    $('dictionaryNumber').textContent=item.sourceId;
    $('dictionaryProgress').textContent=sessionMode==='all'?`${sessionOrdinal()} / ${sessionLength()}問`:`${sessionOrdinal()} / ${sessionLength()}問（${modeLabel(sessionMode)}）`;
    renderFavorite();
    $('dictionaryQuestionImage').src=item.questionImage;
    $('dictionaryQuestionImage').alt=`${source().shortTitle} ${item.sourceId} の問題`;
    $('dictionaryExplanationTitle').textContent=source().explanationTitle||'公式解説';
    $('dictionaryPrev').disabled=isFirst();
    $('dictionaryNext').disabled=isLast();
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
        progress.pendingPick={sourceId:item.sourceId,picked};
        saveProgress();
        $('dictionarySubmit').disabled=picked.length!==requiredChoices;
      });
      choices.appendChild(button);
    }
    const pending=progress.pendingPick;
    if(pending?.sourceId===item.sourceId&&typeof pending.picked==='string'&&[...pending.picked].every(key=>item.choices.includes(key))){
      picked=[...item.choices].filter(key=>pending.picked.includes(key)).join('');
      choices.querySelectorAll('button').forEach(button=>button.classList.toggle('selected',picked.includes(button.dataset.choice)));
    }else if(pending)delete progress.pendingPick;
    $('dictionarySubmit').disabled=picked.length!==requiredChoices;$('dictionarySubmit').textContent='回答する';
    $('dictionaryResult').classList.add('hidden');
    $('dictionaryExplanation').classList.add('hidden');
    $('dictionaryExplanationImage').removeAttribute('src');
    if(saved){
      $('dictionaryHistory').textContent=`この問題の回答回数 ${saved.attempts?.length||0}回 ・ 前回 ${saved.lastCorrect?'○':'×'}`;
      $('dictionaryHistory').classList.remove('hidden');
    }else $('dictionaryHistory').classList.add('hidden');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function toggleFavorite(){
    const item=manifest?.items?.[currentIndex];if(!item)return;
    progress.favorites[item.sourceId]={on:progress.favorites[item.sourceId]?.on!==true,at:Date.now()};
    saveProgress();renderFavorite();
  }

  function submit(){
    if(answered||!picked)return;
    const item=manifest.items[currentIndex];
    delete progress.pendingPick;
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
    $('dictionarySubmit').disabled=false;$('dictionarySubmit').textContent=isLast()?'ホームへ戻る':'次の問題へ';
  }

  function move(delta){
    saveProgress();
    if(sessionMode==='all')currentIndex=Math.max(0,Math.min(manifest.items.length-1,currentIndex+delta));
    else{sessionPosition=moveSnapshotPosition(sessionIndices,sessionPosition,delta);currentIndex=sessionIndices[sessionPosition];}
    renderQuestion();
  }

  function bindGroupButtons(){
    document.querySelectorAll('[data-dictionary-group]').forEach(button=>button.addEventListener('click',async()=>{
      await loadManifest();
      const indices=filteredIndices(mode,manifest.items,progress),index=firstIndexForGroup(button.dataset.dictionaryGroup,indices);
      if(index>=0)open(index,mode);
    }));
  }

  function bind(){
    $('dictionaryStart')?.addEventListener('click',()=>open(mode==='all'?progress.index:undefined,mode));
    document.querySelectorAll('[data-dictionary-source]').forEach(button=>button.addEventListener('click',()=>selectSource(button.dataset.dictionarySource)));
    document.querySelectorAll('[data-dictionary-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.dictionaryMode;renderHomeMode();}));
    bindGroupButtons();
    $('dictionaryHomeBack')?.addEventListener('click',()=>window.renderHome());
    $('dictionaryFavBtn')?.addEventListener('click',toggleFavorite);
    $('dictionaryPrev')?.addEventListener('click',()=>move(-1));
    $('dictionaryNext')?.addEventListener('click',()=>move(1));
    $('dictionarySubmit')?.addEventListener('click',()=>{if(!answered)submit();else if(!isLast())move(1);else window.renderHome();});
    for(const id of ['dictionaryQuestionImage','dictionaryExplanationImage'])$(id)?.addEventListener('click',event=>window.openImageZoom(event.currentTarget.currentSrc||event.currentTarget.src,event.currentTarget.alt));
  }

  window.dictionaryPractice={renderHome,open,reloadProgress:loadProgress,filteredIndices,moveSnapshotPosition,resumeIndexForSave,summaryProgress,normalizeProgress};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
