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
  const GRADES=['A','B','C'];
  let progress=normalizeProgress(null);
  let mode='all';
  let sortOrder='published';
  let sessionMode='all';
  let sessionSort='published';
  let sessionIndices=null;
  let sessionPosition=0;
  let returnToList=false;
  let currentIndex=0;
  let picked='';
  let answered=false;

  const $=id=>document.getElementById(id);
  const owner=()=>window.cbtUser?.uid||'local';
  const source=()=>SOURCES[sourceKey];
  const supportsGrades=()=>sourceKey!=='dentalMaterials';
  const activeSort=()=>supportsGrades()?sortOrder:'published';
  const storeKey=()=>source().prefix+owner();

  function normalizeProgress(value){
    const normalized=value&&typeof value==='object'&&!Array.isArray(value)?value:{answers:{},favorites:{},index:0,updatedAt:0};
    if(!normalized.answers||typeof normalized.answers!=='object'||Array.isArray(normalized.answers))normalized.answers={};
    if(!normalized.favorites||typeof normalized.favorites!=='object'||Array.isArray(normalized.favorites))normalized.favorites={};
    if(!normalized.grades||typeof normalized.grades!=='object'||Array.isArray(normalized.grades))normalized.grades={};
    normalized.index=Number.isInteger(normalized.index)?normalized.index:0;
    return normalized;
  }

  function loadProgress(){
    try{progress=normalizeProgress(JSON.parse(localStorage.getItem(storeKey())||'null'));}
    catch(_){progress=normalizeProgress(null);}
    return progress;
  }

  function resumeIndexForSave(activeMode,index,previous,order='published'){return activeMode==='all'&&order==='published'?index:previous;}

  function saveProgress(){
    progress.index=resumeIndexForSave(sessionMode,currentIndex,progress.index,sessionSort);
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

  function dictionaryGroup(sourceId){return sourceId.startsWith('E')?sourceId.slice(0,2):sourceId.slice(0,1);}

  function groupFor(sourceId){
    if(source().groups){const item=manifest?.items.find(entry=>entry.sourceId===sourceId);return item?.group||source().groups[0];}
    if(source().mock){const item=manifest?.items.find(entry=>entry.sourceId===sourceId);return item?`B${item.block}`:'';}
    return dictionaryGroup(sourceId);
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
    if(selectedMode==='ungraded')return items.flatMap((item,index)=>GRADES.includes(value?.grades?.[item.sourceId]?.g)?[]:[index]);
    if(GRADES.includes(selectedMode))return items.flatMap((item,index)=>value?.grades?.[item.sourceId]?.g===selectedMode?[index]:[]);
    return [];
  }

  function validAttempts(answer){
    return Array.isArray(answer?.attempts)?answer.attempts.filter(attempt=>typeof attempt?.correct==='boolean'):[];
  }

  function orderedIndices(selectedMode,order,items,value){
    const indices=filteredIndices(selectedMode,items,value);
    if(order!=='lowacc')return indices;
    return indices.map(index=>{
      const attempts=validAttempts(value?.answers?.[items[index].sourceId]);
      return {index,correct:attempts.filter(attempt=>attempt.correct).length,total:attempts.length};
    }).sort((a,b)=>{
      if(!a.total||!b.total)return b.total-a.total||a.index-b.index;
      return a.correct*b.total-b.correct*a.total||b.total-a.total||a.index-b.index;
    }).map(item=>item.index);
  }

  function listRows(selectedMode,order,items,value){
    return orderedIndices(selectedMode,order,items,value).map(index=>{
      const {sourceId,mock,block}=items[index];
      const answer=value?.answers?.[sourceId],attempts=validAttempts(answer);
      const grade=value?.grades?.[sourceId]?.g;
      return {
        index,sourceId,group:mock?`ブロック${block}`:dictionaryGroup(sourceId),
        lastCorrect:answer?.lastCorrect,favorite:value?.favorites?.[sourceId]?.on===true,
        grade:GRADES.includes(grade)?grade:null,
        recent:attempts.slice(-5).map(attempt=>attempt.correct),
        correct:attempts.filter(attempt=>attempt.correct).length,total:attempts.length
      };
    });
  }

  function appendListRow(fragment,row,start){
    const state=row.lastCorrect===true?'ok':row.lastCorrect===false?'ng':'non';
    const mark={ok:'○',ng:'✗',non:'・'}[state];
    const recent=row.recent.length?`<span class="lstats-recent">${row.recent.map(correct=>`<b class="lstats-result ${correct?'ok':'ng'}" aria-label="${correct?'正解':'不正解'}">${correct?'○':'×'}</b>`).join('')}</span>`:'未解答';
    const accuracy=row.total?`${Math.round(row.correct/row.total*100)}%（${row.correct}/${row.total}）`:'—';
    const favorite=row.favorite?'<span class="star" aria-label="お気に入り">★</span>':'';
    const grade=row.grade?`<span class="cf ${{A:'sure',B:'anx',C:'skip'}[row.grade]}">${row.grade}</span>`:'';
    const button=document.createElement('button');button.type='button';button.className='litem';
    button.innerHTML=`<span class="lrow"><span class="lno"></span><span class="lst ${state}">${mark}</span>
      <span class="lq"></span><span class="lic">${favorite}${grade}</span></span>
      <span class="lstats"><span>直近：${recent}</span><span class="lstats-sep">｜</span><span>正答率 ${accuracy}</span></span>`;
    button.querySelector('.lno').textContent=row.sourceId;
    button.querySelector('.lq').textContent=row.group;
    button.addEventListener('click',start);
    fragment.appendChild(button);
  }

  function renderList(){
    const selectedMode=mode,order=sortOrder;
    const rows=listRows(selectedMode,order,manifest.items,progress);
    const body=$('dictionaryListBody');
    $('dictionaryListCount').textContent=`${rows.length} 問${selectedMode==='all'?'':'（絞り込み中）'}`;
    if(!rows.length){body.innerHTML='<div class="empty">該当する問題がありません。</div>';return;}
    const indices=rows.map(row=>row.index);
    const fragment=document.createDocumentFragment();
    let previousGroup=null;
    rows.forEach((row,position)=>{
      const group=order==='lowacc'?'正答率が低い順':row.group;
      if(group!==previousGroup){
        previousGroup=group;
        let count=rows.length;
        if(order==='published'){
          let end=position+1;
          while(end<rows.length&&rows[end].group===group)end++;
          count=end-position;
        }
        const heading=document.createElement('div');heading.className='lsec';heading.textContent=group;
        const badge=document.createElement('span');badge.className='cnt';badge.textContent=count;
        heading.appendChild(badge);fragment.appendChild(heading);
      }
      appendListRow(fragment,row,()=>startSession(row.index,selectedMode,order,indices,true));
    });
    body.replaceChildren(fragment);
  }

  async function openList(){
    if(!supportsGrades()||window.canUseExtraMaterials?.()===false)return;
    const requestedKey=sourceKey;
    try{if(!manifest)await loadManifest();}
    catch(error){console.error(error);return;}
    if(sourceKey!==requestedKey||!manifest||window.canUseExtraMaterials?.()===false)return;
    loadProgress();renderHomeMode();
    $('dictionaryListTitle').textContent=`📋 ${source().shortTitle} 問題一覧`;
    renderList();
    window.showOnly('dictionaryList');
    $('footer').classList.add('hidden');
    $('timerChip').classList.remove('show');
    $('pbarFill').style.width='0%';
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function moveSnapshotPosition(indices,position,delta){return Math.max(0,Math.min(indices.length-1,position+delta));}

  function setSource(next){
    if(!SOURCES[next]||next===sourceKey)return false;
    sourceKey=next;manifest=null;loadPromise=null;progress=normalizeProgress(null);currentIndex=0;mode='all';sessionMode='all';sessionSort='published';sessionIndices=null;sessionPosition=0;
    return true;
  }

  function modeLabel(selectedMode){return {all:'すべて',wrong:'間違えた問題',fav:'お気に入り',A:'評価A',B:'評価B',C:'評価C',ungraded:'未評価'}[selectedMode];}

  function renderHomeMode(){
    if(!manifest)return;
    const selected=filteredIndices(mode,manifest.items,progress);
    document.querySelectorAll('[data-dictionary-mode]').forEach(button=>{
      const key=button.dataset.dictionaryMode;
      if(!supportsGrades()&&button.hasAttribute('data-dictionary-grade-filter'))return;
      button.classList.toggle('on',key===mode);
      button.setAttribute('aria-pressed',String(key===mode));
      const count=button.querySelector('span');
      if(count)count.textContent=(key===mode?selected:filteredIndices(key,manifest.items,progress)).length;
    });
    const start=$('dictionaryStart');
    const order=activeSort();
    document.querySelectorAll('[data-dictionary-sort]').forEach(button=>{
      const on=button.dataset.dictionarySort===order;
      button.classList.toggle('on',on);button.setAttribute('aria-pressed',String(on));
    });
    if(mode==='all'&&order==='published'){
      start.textContent=summary().answered?'続きから再開':'最初から始める';
      start.disabled=false;
    }else if(selected.length){
      start.textContent=`${modeLabel(mode)}を${order==='lowacc'?'正答率が低い順で':''}解く（${selected.length}問）`;
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
    for(const id of ['dictionaryFilterLabel','dictionarySortControls'])$(id)?.classList.toggle('hidden',!supportsGrades());
    document.querySelectorAll('[data-dictionary-grade-filter]').forEach(button=>button.classList.toggle('hidden',!supportsGrades()));
    const listButton=$('dictionaryOpenList');
    listButton?.classList.toggle('hidden',!supportsGrades());
    if(listButton)listButton.disabled=!supportsGrades()||!manifest;
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
      if(listButton)listButton.disabled=!supportsGrades();
    }catch(error){
      if(sourceKey!==requestedKey)return;
      console.error(error);status.textContent=`${source().shortTitle}を読み込めませんでした。通信を確認して開き直してください。`;
      $('dictionaryStart').disabled=true;
    }
  }

  function selectSource(next){if(setSource(next))renderHome('dictionary');}

  async function open(index,requestedMode=mode,group){
    const requestedSource=sourceKey,order=activeSort();
    try{await loadManifest();if(sourceKey!==requestedSource||!manifest)return;loadProgress();}
    catch(error){console.error(error);return;}
    if(!supportsGrades()&&(GRADES.includes(requestedMode)||requestedMode==='ungraded'))requestedMode='all';
    const resume=requestedMode==='all'&&order==='published';
    const indices=resume&&!group?null:orderedIndices(requestedMode,order,manifest.items,progress);
    if(group){
      index=indices.find(index=>groupFor(manifest.items[index].sourceId)===group);
      if(index===undefined){renderHomeMode();return;}
    }
    if(indices&&!indices.length){renderHomeMode();return;}
    startSession(index,requestedMode,order,resume?null:indices);
  }

  function startSession(index,requestedMode,order,indices,fromList=false){
    sessionMode=requestedMode;sessionSort=order;
    returnToList=fromList;
    sessionIndices=indices;
    if(sessionIndices){
      sessionPosition=Math.max(0,sessionIndices.indexOf(index));
      currentIndex=sessionIndices[sessionPosition];
    }else{
      sessionPosition=0;
      currentIndex=Math.max(0,Math.min(manifest.items.length-1,Number.isInteger(index)?index:progress.index));
    }
    saveProgress();renderQuestion();
  }

  function sessionLength(){return sessionIndices?sessionIndices.length:manifest.items.length;}
  function sessionOrdinal(){return sessionIndices?sessionPosition+1:currentIndex+1;}
  function isFirst(){return sessionOrdinal()===1;}
  function isLast(){return sessionOrdinal()===sessionLength();}

  function renderFavorite(){
    const item=manifest.items[currentIndex],on=progress.favorites[item.sourceId]?.on===true,button=$('dictionaryFavBtn');
    if(!button)return;
    button.textContent=on?'★':'☆';button.classList.toggle('on',on);button.setAttribute('aria-pressed',String(on));
  }

  function renderGrade(){
    const visible=answered&&supportsGrades();
    $('dictionaryGrade')?.classList.toggle('hidden',!visible);
    const grade=visible?progress.grades[manifest.items[currentIndex].sourceId]?.g:null;
    document.querySelectorAll('#dictionaryGrade [data-grade]').forEach(button=>{
      const on=button.dataset.grade===grade;
      button.classList.toggle('on',on);button.setAttribute('aria-pressed',String(on));
    });
  }

  function toggleGrade(grade){
    if(!answered||!supportsGrades()||!GRADES.includes(grade))return;
    const id=manifest.items[currentIndex].sourceId,previous=progress.grades[id];
    const prevAt=Number.isFinite(+previous?.at)?+previous.at:0;
    progress.grades[id]={g:previous?.g===grade?null:grade,at:Math.max(Date.now(),prevAt+1)};
    saveProgress();renderGrade();
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
    $('dictionaryHomeBack').textContent=sourceKey==='dentalMaterials'?'歯科理工へ':returnToList?'問題一覧へ':'辞典一覧へ';
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
    renderGrade();
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
    answered=true;renderGrade();
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
    $('dictionarySubmit').disabled=false;$('dictionarySubmit').textContent=isLast()?(returnToList?'問題一覧へ戻る':'ホームへ戻る'):'次の問題へ';
  }

  function move(delta){
    saveProgress();
    if(!sessionIndices)currentIndex=Math.max(0,Math.min(manifest.items.length-1,currentIndex+delta));
    else{sessionPosition=moveSnapshotPosition(sessionIndices,sessionPosition,delta);currentIndex=sessionIndices[sessionPosition];}
    renderQuestion();
  }

  function bindGroupButtons(){
    document.querySelectorAll('[data-dictionary-group]').forEach(button=>button.addEventListener('click',()=>open(undefined,mode,button.dataset.dictionaryGroup)));
  }

  function returnFromPractice(){
    if(returnToList)openList();
    else window.renderHome();
  }

  function updateReviewControls(){
    renderHomeMode();
    const list=$('dictionaryList');
    if(list&&!list.classList.contains('hidden')&&supportsGrades())renderList();
  }

  function bind(){
    $('dictionaryOpenList')?.addEventListener('click',openList);
    $('dictionaryListBack')?.addEventListener('click',()=>window.renderHome());
    $('dictionaryStart')?.addEventListener('click',()=>open(undefined,mode));
    document.querySelectorAll('[data-dictionary-source]').forEach(button=>button.addEventListener('click',()=>selectSource(button.dataset.dictionarySource)));
    document.querySelectorAll('[data-dictionary-mode]').forEach(button=>button.addEventListener('click',()=>{if(!supportsGrades()&&button.hasAttribute('data-dictionary-grade-filter'))return;mode=button.dataset.dictionaryMode;updateReviewControls();}));
    document.querySelectorAll('[data-dictionary-sort]').forEach(button=>button.addEventListener('click',()=>{if(!supportsGrades())return;sortOrder=button.dataset.dictionarySort;updateReviewControls();}));
    document.querySelectorAll('#dictionaryGrade [data-grade]').forEach(button=>button.addEventListener('click',()=>toggleGrade(button.dataset.grade)));
    bindGroupButtons();
    $('dictionaryHomeBack')?.addEventListener('click',returnFromPractice);
    $('dictionaryFavBtn')?.addEventListener('click',toggleFavorite);
    $('dictionaryPrev')?.addEventListener('click',()=>move(-1));
    $('dictionaryNext')?.addEventListener('click',()=>move(1));
    $('dictionarySubmit')?.addEventListener('click',()=>{if(!answered)submit();else if(!isLast())move(1);else returnFromPractice();});
    for(const id of ['dictionaryQuestionImage','dictionaryExplanationImage'])$(id)?.addEventListener('click',event=>window.openImageZoom(event.currentTarget.currentSrc||event.currentTarget.src,event.currentTarget.alt));
  }

  window.dictionaryPractice={renderHome,open,openList,listRows,reloadProgress:loadProgress,filteredIndices,orderedIndices,moveSnapshotPosition,resumeIndexForSave,summaryProgress,normalizeProgress};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
