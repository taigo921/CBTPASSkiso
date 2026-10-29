const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const feature=fs.readFileSync(path.join(root,'features/dictionary-practice/dictionary-practice.js'),'utf8');
const groups=['A','B','C','D','E1','E2','E3','E4'].map(group=>`<button data-dictionary-group="${group}">${group}<span></span></button>`).join('');
const fixture=`<!doctype html><html><body>
<div id="dictionaryHome"><span id="dictionaryAnswered"></span><span id="dictionaryCorrect"></span><span id="dictionaryAttempts"></span><button id="dictionaryStart" disabled></button><div>${groups}</div><p id="dictionaryStatus"></p></div>
<section id="dictionaryPractice"><button id="dictionaryHomeBack"></button><span id="dictionaryNumber"></span><span id="dictionaryProgress"></span><img id="dictionaryQuestionImage"><p id="dictionaryHistory" class="hidden"></p><div id="dictionaryChoices"></div><button id="dictionaryPrev"></button><button id="dictionarySubmit"></button><button id="dictionaryNext"></button><div id="dictionaryResult" class="hidden"></div><div id="dictionaryExplanation" class="hidden"><img id="dictionaryExplanationImage"></div></section>
<div id="footer"></div><div id="timerChip"></div><div id="routeBackBtn"></div><div id="pbarFill"></div>
<script>window.cbtUser={uid:'dictionary-test'};window.showOnly=()=>{};window.renderHome=()=>{};window.openImageZoom=()=>{};</script><script>${feature}</script></body></html>`;
const server=http.createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,'http://local').pathname);
  if(pathname==='/'){response.setHeader('Content-Type','text/html; charset=utf-8');response.end(fixture);return;}
  const file=path.join(root,pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){response.writeHead(404);response.end();return;}
  response.setHeader('Content-Type',file.endsWith('.json')?'application/json':file.endsWith('.webp')?'image/webp':'application/octet-stream');
  response.end(fs.readFileSync(file));
});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
    const browserErrors=[];page.on('pageerror',error=>browserErrors.push(error.message));page.on('requestfailed',request=>browserErrors.push(`${request.url()} ${request.failure()?.errorText}`));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(()=>window.dictionaryPractice.renderHome());
    try{await page.waitForFunction(()=>document.getElementById('dictionaryStatus').textContent.includes('956'));}
    catch(error){throw new Error(`${error.message}; status=${await page.locator('#dictionaryStatus').textContent()}; debug=${JSON.stringify(await page.evaluate(()=>({ready:document.readyState,feature:typeof window.dictionaryPractice,startDisabled:document.getElementById('dictionaryStart').disabled})))}; browser=${browserErrors.join(' | ')}`);}
    assert.equal(await page.locator('#dictionaryStart').isEnabled(),true);
    assert.equal(await page.locator('[data-dictionary-group="E3"] span').textContent(),'300問');
    await page.locator('#dictionaryStart').click();
    assert.equal(await page.locator('#dictionaryNumber').textContent(),'A001');
    await page.waitForFunction(()=>document.getElementById('dictionaryQuestionImage').naturalWidth>0);
    assert.equal(await page.locator('#dictionaryChoices button').count(),5);
    await page.locator('#dictionaryChoices button',{hasText:'B'}).click();await page.locator('#dictionarySubmit').click();
    assert.match(await page.locator('#dictionaryResult').textContent(),/○ 正解/);
    await page.waitForFunction(()=>document.getElementById('dictionaryExplanationImage').naturalWidth>0);
    assert.equal(await page.locator('#dictionaryExplanation').evaluate(node=>node.classList.contains('hidden')),false);
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('togo_dictionary2_progress_v1_dictionary-test')));
    assert.equal(stored.answers.A001.lastCorrect,true);assert.equal(stored.answers.A001.attempts.length,1);
    await page.locator('[data-dictionary-group="E4"]').click();assert.equal(await page.locator('#dictionaryNumber').textContent(),'E4001');
    await page.reload();await page.evaluate(()=>window.dictionaryPractice.renderHome());await page.waitForFunction(()=>document.getElementById('dictionaryStatus').textContent.includes('956'));
    assert.equal(await page.locator('#dictionaryAnswered').textContent(),'1');
    await page.locator('#dictionaryStart').click();assert.equal(await page.locator('#dictionaryNumber').textContent(),'E4001');
    console.log('PASS dictionary browser: manifest load, group navigation, answer grading, official explanation, and per-user resume.');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
