const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),root=path.resolve(__dirname,'..');
const fixture=`<script>
window.testBlocked=true; // Intentionally no Google SDK: standalone login must work independently.
let authCallback;const fakeAuth={currentUser:null,onAuthStateChanged(fn){authCallback=fn;queueMicrotask(()=>fn(null));},async signInWithEmailAndPassword(email){const user={uid:email.includes('different')?'allowed-fixture':'blocked-fixture',email,emailVerified:true};this.currentUser=user;queueMicrotask(()=>authCallback(user));},async signOut(){this.currentUser=null;queueMicrotask(()=>authCallback(null));}};
const fakeDb={collection(name){return {doc(){return {async get(){return {exists:true,data:()=>name==='accessControl'?{blocked:window.testBlocked}:{username:'Test',email:fakeAuth.currentUser?.email||'',books:{},game:{xp:0}},metadata:{fromCache:false,hasPendingWrites:false}};},onSnapshot(){return ()=>{};}};}};},async runTransaction(fn){await fn({get:async ref=>ref.get(),set(){},delete(){}});}};
window.firebase={initializeApp(){},auth:()=>fakeAuth,firestore:()=>fakeDb};
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
   let page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);await page.waitForFunction(()=>window.cbtAppReady);
   assert.ok(await page.locator('#authEmailBox').isVisible(),'standalone form works without Google SDK');
   assert.ok(await page.locator('#blockedLoginImage').isHidden());
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
   page=await reopened.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
   await page.locator('#blockedLoginImage').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>window.cbtUser),null,'display hint never authorizes access');
   await page.locator('#blockedLoginBack').click();await page.evaluate(()=>{window.testBlocked=false;window.cbtSyncNow=()=>{};});
   await login('i.taigo921+different@gmail.com');
   await page.waitForFunction(()=>document.getElementById('authGate').classList.contains('ok'));
   assert.equal(await page.evaluate(()=>window.cbtUser.uid),'allowed-fixture');
   assert.equal(await page.evaluate(()=>localStorage.getItem(BLOCKED_LOGIN_NOTICE_KEY)),null,'confirmed authorized login clears notice');
   await page.reload();await page.waitForFunction(()=>window.cbtAppReady);
   assert.ok(await page.locator('#blockedLoginImage').isHidden());assert.ok(await page.locator('#authEmailBox').isVisible());
   await reopened.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS standalone actual login flow: block -> signout -> reload/reopen GIF; temporary back; authorized account clears marker; no Google SDK dependency; phone/tablet');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
