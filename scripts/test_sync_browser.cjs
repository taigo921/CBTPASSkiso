// Isolated browser smoke test. No real auth, Firebase requests, or user data.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const file=path.join(root,decodeURIComponent(req.url.split('?')[0])==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 if(file.endsWith('index.html')){
  let html=fs.readFileSync(file,'utf8').replace(/<script src="https:[^>]+><\/script>/g,'');
  html=html.replace(/<!-- ▼ ログイン＆ランキング ロジック（Firebase） -->[\s\S]*?<\/script>/,'<script>window.cbtUser={uid:"sync-test"};document.getElementById("authGate").remove();</script>');
  res.setHeader('Content-Type','text/html');res.end(html);return;
 }
 res.setHeader('Content-Type',file.endsWith('.json')?'application/json':file.endsWith('.js')?'application/javascript':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch();
 try{
  const pages=[],errors=[];
  for(const count of [1977,1692]){
   const context=await browser.newContext({viewport:{width:count===1977?390:1024,height:844},serviceWorkers:'block'});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.cbtAppReady);
   await page.evaluate(count=>{
    statsByBook.book1=emptyStats();statsByBook.book1.perQ.test={correct:count,wrong:0,xpV:true,times:[],history:[]};statsByBook.book1.answered=count;statsByBook.book1.correct=count;stats=statsByBook.book1;saveStats();
    game.xp=count===1977?13179:11294;saveGame();
    safeSet(mockKeyFor(5),{index:count===1977?2:0,updatedAt:count,answers:count===1977?{1:{picked:'A',answered:true,updatedAt:1},2:{picked:'C',answered:true,updatedAt:2}}:{}});
    safeSet(sessionStoreKey('book1'),{uids:['test'],idx:0,resumeIdx:0,records:[],updatedAt:count,mode:'review',book:'book1'});
    renderHome();
   },count);pages.push(page);
  }
  let remote=null;
  for(const page of pages){
   await page.exposeFunction('testRead',()=>remote);
   await page.exposeFunction('testSave',async payload=>{remote=await page.evaluate(([remote,payload])=>cbtMergePayloads(remote,payload),[remote,payload]);});
   await page.evaluate(()=>{window.cbtCloud={readLatest:()=>window.testRead(),save:p=>window.testSave(p)};});
   await page.locator('#syncNowBtn').click();await page.waitForFunction(()=>document.getElementById('cloudStatus').textContent.includes('同期版 9/23'));
  }
  for(const page of pages){
   const payload=await page.evaluate(()=>cbtFullPayload());
   assert.equal(payload.books.book1.answered,1977);assert.equal(payload.game.xp,13179);assert.equal(payload.mockExams[5].index,2);assert.equal(payload.sessions.book1.updatedAt,1977);
   assert.ok(await page.evaluate(()=>localStorage.getItem('togo_sync_backup_20260923_sync-test')));
  }
  const page=pages[0],download=page.waitForEvent('download');await page.locator('#exportProgressBtn').click();assert.match((await download).suggestedFilename(),/^toGO-progress-/);
  await pages[1].evaluate(()=>{window.cbtCloud.save=async()=>{throw {code:'permission-denied'};};});
  await pages[1].locator('#syncNowBtn').click();await pages[1].waitForFunction(()=>document.getElementById('cloudStatus').textContent.includes('permission-denied'));
  assert.equal(await pages[1].evaluate(()=>cbtFullPayload().books.book1.answered),1977);
  await page.evaluate(()=>{window.cbtCloud=null;clearTimeout(_syncT);});
  for(const book of ['book1','book2']){
   const result=await page.evaluate(async book=>{
    await switchBook(book);startSession('order');
    picked=byUid(session.uids[0]).answer;submit(false);const correct=session.records.at(-1).correct;next();
    const q=byUid(session.uids[session.idx]);picked=Object.keys(q.choices).find(k=>k!==q.answer);submit(false);const wrong=!session.records.at(-1).correct;next();
    submit(true);const skipped=session.records.at(-1).skip;saveSession();const count=session.records.length;
    renderHome();resumeSession();return {correct,wrong,skipped,count,resumed:session.records.length};
   },book);
   assert.deepEqual(result,{correct:true,wrong:true,skipped:true,count:3,resumed:3});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS two isolated browsers: 1977/1692 -> 1977/1977, XP 13179, mock frontier 2, resume, automatic backup, JSON export, permission-denied preserves records; both books correct/wrong/skip/home/resume; no page errors. Real Firebase/device verification still required.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
