const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),root=path.resolve(__dirname,'..');
const fixture=`<script>
window.testProfileReads=0;window.testSchoolPolicy={enabled:false,exemptDates:[]};window.testBlocked=true; // Intentionally no Google SDK: standalone login must work independently.
let authCallback;const fakeAuth={currentUser:null,onAuthStateChanged(fn){authCallback=fn;queueMicrotask(()=>fn(null));},async signInWithEmailAndPassword(email){const user={uid:email.includes('different')?'allowed-fixture':'blocked-fixture',email,emailVerified:true};this.currentUser=user;queueMicrotask(()=>authCallback(user));},async signOut(){this.currentUser=null;queueMicrotask(()=>authCallback(null));}};
const fakeDb={collection(name){return {doc(){return {async get(){if(name==='users')window.testProfileReads++;return {exists:true,data:()=>name==='accessControl'?{blocked:window.testBlocked}:name==='schoolAccess'?window.testSchoolPolicy:{username:'Test',email:fakeAuth.currentUser?.email||'',books:{},game:{xp:0}},metadata:{fromCache:false,hasPendingWrites:false}};},async set(data){if(name==='schoolAccess'){window.testSchoolPolicy=data;if(window.testSchoolListener)window.testSchoolListener({exists:true,data:()=>data,metadata:{fromCache:false,hasPendingWrites:false}});}},onSnapshot(fn){if(name==='schoolAccess')window.testSchoolListener=fn;return ()=>{if(name==='schoolAccess'&&window.testSchoolListener===fn)window.testSchoolListener=null;};}};}};},async runTransaction(fn){return await fn({get:async ref=>ref.get(),set(ref,data){ref.set(data);},delete(){}});}};
window.firebase={initializeApp(){},auth:()=>fakeAuth,firestore:Object.assign(()=>fakeDb,{FieldValue:{serverTimestamp:()=>42}})};
</script>`;
const server=http.createServer((req,res)=>{const file=path.join(root,req.url.split('?')[0]==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+'/')||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
if(file.endsWith('index.html')){let html=fs.readFileSync(file,'utf8').replace(/<script src="https:[^>]+><\/script>/g,'');html=html.replace('<!-- ▼ ログイン＆ランキング ロジック（Firebase） -->',fixture+'<!-- ▼ ログイン＆ランキング ロジック（Firebase） -->');res.setHeader('Content-Type','text/html');res.end(html);}else{res.setHeader('Content-Type',file.endsWith('.gif')?'image/gif':file.endsWith('.json')?'application/json':'application/javascript');res.end(fs.readFileSync(file));}});

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
  const errors=[],url='http://127.0.0.1:'+server.address().port;
  for(const width of [390,1024]){
   const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
   await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
   let page=await context.newPage();await page.clock.install({time:new Date('2026-10-18T00:00:00Z')});page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);await page.waitForFunction(()=>window.cbtAppReady);
   assert.ok(await page.locator('#authEmailBox').isVisible(),'standalone form works without Google SDK');
   assert.ok(await page.locator('#blockedLoginImage').isHidden());
   assert.equal(await page.locator('#schoolGateImage').getAttribute('src'),null,'ordinary login does not fetch class GIF');
   const login=async email=>{await page.locator('#authEmail').fill(email);await page.locator('#authPassword').fill('synthetic-password');await page.locator('#emailLoginBtn').click();};
   await login('i.taigo921+blocked@gmail.com');
   await page.waitForFunction(()=>document.getElementById('blockedLoginImage').naturalWidth===560);
   assert.ok(await page.locator('#blockedLoginImage').isVisible());
   assert.equal(await page.evaluate(()=>localStorage.getItem(BLOCKED_LOGIN_NOTICE_KEY)),'1');
   assert.equal(await page.evaluate(()=>window.cbtUser),null);
   await page.reload();await page.locator('#blockedLoginImage').waitFor({state:'visible'});
   assert.ok(await page.locator('#authGate .auth-card').isHidden(),'relaunch shows GIF before another sign-in');
   await page.locator('#blockedLoginBack').click();assert.ok(await page.locator('#authGate').isVisible());
   assert.equal(await page.evaluate(()=>localStorage.getItem(BLOCKED_LOGIN_NOTICE_KEY)),'1','back only dismisses current view');
   await page.reload();await page.locator('#blockedLoginImage').waitFor({state:'visible'});
   // A new browser context with retained storage models closing and reopening the app.
   const storageState=await context.storageState();await context.close();
   const reopened=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',storageState});
   await reopened.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
   page=await reopened.newPage();await page.clock.install({time:new Date('2026-10-18T00:00:00Z')});page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
   await page.locator('#blockedLoginImage').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>window.cbtUser),null,'display hint never authorizes access');
   await page.locator('#blockedLoginBack').click();await page.evaluate(()=>{window.testBlocked=false;window.cbtSyncNow=()=>{};});
   await login('i.taigo921+different@gmail.com');
   await page.waitForFunction(()=>document.getElementById('authGate').classList.contains('ok'));
   assert.equal(await page.evaluate(()=>window.cbtUser.uid),'allowed-fixture');
   assert.equal(await page.evaluate(()=>localStorage.getItem(BLOCKED_LOGIN_NOTICE_KEY)),null,'confirmed authorized login clears notice');
   await page.reload();await page.waitForFunction(()=>window.cbtAppReady);
   assert.ok(await page.locator('#blockedLoginImage').isHidden());assert.ok(await page.locator('#authEmailBox').isVisible());
   // Actual login handler must defer private reads during class, then open at the break.
   await page.clock.setSystemTime(new Date('2026-10-19T01:09:59Z'));
   await page.evaluate(()=>window.cbtSyncNow=()=>{});
   await page.evaluate(()=>{window.testBlocked=false;window.testSchoolPolicy={enabled:true,exemptDates:[]};});
   const beforeReads=await page.evaluate(()=>window.testProfileReads);
   await login('i.taigo921+different@gmail.com');
   await page.locator('#schoolGate').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.getElementById('schoolGateImage').naturalWidth===560);
   const imageBounds=await page.locator('#schoolGateImage').boundingBox();
   assert.deepEqual(imageBounds,{x:0,y:0,width,height:844},'class GIF fills the viewport');
   assert.equal(await page.locator('#schoolGateImage').evaluate(n=>getComputedStyle(n).objectFit),'cover');
   assert.equal(await page.locator('#schoolGateTitle').textContent(),'授業中のため利用を制限しています');
   assert.match(await page.locator('#schoolGateMessage').textContent(),/10:10/);
   await page.screenshot({path:`/tmp/class-gif-${width}.png`});
   assert.equal(await page.evaluate(()=>document.getElementById('authGate').inert),true,'underlying login cannot receive keyboard input');
   assert.equal(await page.evaluate(()=>window.cbtUser),null,'class login waits before profile reads');
   assert.equal(await page.evaluate(()=>window.testProfileReads),beforeReads,'no private reads while class is active');
   await page.clock.runFor(1100);
   await page.waitForFunction(()=>document.getElementById('authGate').classList.contains('ok'));
   assert.ok(await page.locator('#schoolGate').isHidden(),'10:10 break automatically opens');
   assert.equal(await page.locator('#schoolGateImage').getAttribute('src'),null,'break removes the class GIF');
   assert.equal(await page.evaluate(()=>document.getElementById('authGate').inert),false);
   await page.clock.fastForward(15*60000);await page.clock.runFor(1100);
   assert.ok(await page.locator('#schoolGate').isVisible(),'10:25 locks an already open app');
   assert.equal(await page.evaluate(()=>window.cbtUser.uid),'allowed-fixture','class pause keeps the account and records');
   await assert.rejects(()=>page.evaluate(()=>window.cbtCloud.setSchoolPolicy({enabled:false,exemptDates:[]})),'regular learner cannot change policy');
   await assert.rejects(()=>page.evaluate(()=>window.cbtCloud.releaseSchoolClass()),'only the owner can release a class');
   await page.clock.fastForward(90*60000);await page.clock.runFor(1100);
   assert.ok(await page.locator('#schoolGate').isHidden(),'11:55 unlocks automatically');
   await page.evaluate(()=>{schoolPolicy={enabled:true,exemptDates:[20261019]};});
   await page.clock.fastForward(60*60000);
   assert.ok(await page.locator('#schoolGate').isHidden(),'registered school holiday stays open');
   await page.evaluate(()=>{schoolPolicy={enabled:true,exemptDates:[]};});
   await page.clock.runFor(1000);
   assert.ok(await page.locator('#schoolGate').isVisible());
   await page.evaluate(()=>{const policy={enabled:true,exemptDates:[],releasedPeriod:currentSchoolPeriodKey()};window.testSchoolPolicy=policy;window.testSchoolListener({exists:true,data:()=>policy,metadata:{fromCache:false,hasPendingWrites:false}});});
   await page.locator('#schoolGate').waitFor({state:'hidden'});
   await page.clock.fastForward(105*60000);await page.clock.runFor(1100);
   assert.ok(await page.locator('#schoolGate').isVisible(),'the next class locks again after an early release');
   await page.locator('#schoolLogout').click();
   await page.locator('#schoolGate').waitFor({state:'hidden'});
   await login('itaigo921@gmail.com');
   await page.waitForFunction(()=>document.getElementById('authGate').classList.contains('ok'));
   assert.ok(await page.locator('#schoolGate').isHidden(),'verified owner bypasses class lock');
   await page.evaluate(async()=>{showOnly('accessAdmin');await renderSchoolSettings();});
   await page.locator('#schoolReleaseClass').click();
   await page.waitForFunction(()=>document.getElementById('schoolReleaseStatus').textContent.includes('解除しました'));
   assert.equal(await page.evaluate(()=>window.testSchoolPolicy.releasedPeriod),202610194);
   assert.equal(await page.locator('#schoolReleaseClass').textContent(),'この授業は解除済み');
   assert.ok(await page.locator('#schoolReleaseClass').isDisabled());
   await page.locator('#schoolExemptDate').fill('2026-10-20');await page.locator('#schoolAddDate').click();
   await page.waitForFunction(()=>document.getElementById('schoolAdminStatus').textContent==='保存しました');
   assert.deepEqual(await page.evaluate(()=>window.testSchoolPolicy.exemptDates),[20261020]);
   assert.equal(await page.evaluate(()=>window.testSchoolPolicy.releasedPeriod),202610194,'editing school holidays preserves the temporary release');
   await page.locator('#schoolExemptList button').click();
   await page.waitForFunction(()=>window.testSchoolPolicy.exemptDates.length===0);
   await page.locator('#schoolEnabled').uncheck();
   await page.waitForFunction(()=>window.testSchoolPolicy.enabled===false);
   assert.equal(await page.evaluate(()=>window.testSchoolPolicy.updatedBy),'blocked-fixture');
   await reopened.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS standalone actual login flow: block -> signout -> reload/reopen GIF; temporary back; authorized account clears marker; no Google SDK dependency; class login/private-read deferral, automatic break/start, owner bypass, school settings controls; phone/tablet');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
