(function(){
  'use strict';

  const MANIFEST_URL='dictionary-assets/exercises/manifest.json';
  const STORE_PREFIX='togo_dictionary2_progress_v1_';
  let manifest=null;
  let loadPromise=null;
  let progress={answers:{},index:0,updatedAt:0};
  let currentIndex=0;
  let picked='';
  let answered=false;

  const $=id=>document.getElementById(id);
  const owner=()=>window.cbtUser?.uid||'local';
  const storeKey=()=>STORE_PREFIX+owner();

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
  }

  async function loadManifest(){
    if(manifest)return manifest;
    if(!loadPromise)loadPromise=fetch(MANIFEST_URL,{cache:'no-cache'}).then(async response=>{
      if(!response.ok)throw new Error(`manifest HTTP ${response.status}`);
      const data=await response.json();
      if(data.schemaVersion!==2||data.count!==956||data.items?.length!==956||data.unresolved?.length)throw new Error('辞典②の検証済みデータではありません');
      manifest=data;
      return data;
    }).catch(error=>{loadPromise=null;throw error;});
    return loadPromise;
  }

  function groupFor(sourceId){
    return sourceId.startsWith('E')?sourceId.slice(0,2):sourceId.slice(0,1);
  }

  function summary(){
    const entries=Object.values(progress.answers);
    return {
      answered:entries.length,
      correct:entries.filter(item=>item.lastCorrect===true).length,
      attempts:entries.reduce((sum,item)=>sum+(Array.isArray(item.attempts)?item.attempts.length:0),0)
    };
  }

  async function renderHome(){
    const status=$('dictionaryStatus');
    if(status)status.textContent='辞典②を読み込み中…';
    try{
      await loadManifest();loadProgress();
      const sums=summary();
      $('dictionaryAnswered').textContent=sums.answered;
      $('dictionaryCorrect').textContent=sums.correct;
      $('dictionaryAttempts').textContent=sums.attempts;
      $('dictionaryStart').textContent=sums.answered?'続きから再開':'最初から始める';
      $('dictionaryStart').disabled=false;
      status.textContent=`原本ID・正答・公式解説を検証済み（全${manifest.count}問）`;
      document.querySelectorAll('[data-dictionary-group]').forEach(button=>{
        const count=manifest.items.filter(item=>groupFor(item.sourceId)===button.dataset.dictionaryGroup).length;
        button.querySelector('span').textContent=`${count}問`;
        button.disabled=!count;
      });
    }catch(error){
      console.error(error);status.textContent='辞典②を読み込めませんでした。通信を確認して開き直してください。';
      $('dictionaryStart').disabled=true;
    }
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
    $('dictionaryNumber').textContent=item.sourceId;
    $('dictionaryProgress').textContent=`${currentIndex+1} / ${manifest.items.length}問`;
    $('dictionaryQuestionImage').src=item.questionImage;
    $('dictionaryQuestionImage').alt=`辞典② ${item.sourceId} の問題`;
    $('dictionaryPrev').disabled=currentIndex===0;
    $('dictionaryNext').disabled=currentIndex===manifest.items.length-1;
    const choices=$('dictionaryChoices');choices.innerHTML='';
    for(const key of item.choices){
      const button=document.createElement('button');button.type='button';button.className='dictionary-choice';button.textContent=key;
      button.addEventListener('click',()=>{
        if(answered)return;picked=key;
        choices.querySelectorAll('button').forEach(node=>node.classList.toggle('selected',node===button));
        $('dictionarySubmit').disabled=false;
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
      if(button.textContent===item.answer)button.classList.add('correct');
      else if(button.textContent===picked)button.classList.add('wrong');
    });
    const result=$('dictionaryResult');result.classList.remove('hidden');result.classList.toggle('bad',!correct);
    result.textContent=`${correct?'○ 正解':'× 不正解'}　あなたの回答：${picked} ／ 正解：${item.answer}`;
    $('dictionaryExplanationImage').src=item.explanationImage;
    $('dictionaryExplanationImage').alt=`辞典② ${item.sourceId} の公式解説`;
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

  function bind(){
    $('dictionaryStart')?.addEventListener('click',()=>open(progress.index));
    document.querySelectorAll('[data-dictionary-group]').forEach(button=>button.addEventListener('click',async()=>{
      await loadManifest();const index=firstIndexForGroup(button.dataset.dictionaryGroup);if(index>=0)open(index);
    }));
    $('dictionaryHomeBack')?.addEventListener('click',()=>window.renderHome());
    $('dictionaryPrev')?.addEventListener('click',()=>move(-1));
    $('dictionaryNext')?.addEventListener('click',()=>move(1));
    $('dictionarySubmit')?.addEventListener('click',()=>{
      if(!answered)submit();else if(currentIndex<manifest.items.length-1)move(1);else window.renderHome();
    });
    for(const id of ['dictionaryQuestionImage','dictionaryExplanationImage'])$(id)?.addEventListener('click',event=>window.openImageZoom(event.currentTarget.currentSrc||event.currentTarget.src,event.currentTarget.alt));
  }

  window.dictionaryPractice={renderHome,open};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
