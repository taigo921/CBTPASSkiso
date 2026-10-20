const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../sw.js'),'utf8');
const handlers={},fetches=[],puts=[];
const cached={old:true};const cache={match:async()=>cached,put:async(r,v)=>puts.push(r.url)};
const ctx={self:{location:{origin:'https://app.test',href:'https://app.test/sw.js'},addEventListener:(n,fn)=>handlers[n]=fn},Request:class{constructor(url){this.url=url;}},URL,caches:{open:async()=>cache},fetch:async(r,o)=>{fetches.push([r.url,o?.cache]);return {ok:true,clone(){return this;}};},Promise};
vm.createContext(ctx);vm.runInContext(source,ctx);
(async()=>{
 await vm.runInContext('warmCache([...APP_SHELL,...FIREBASE_SDKS])',ctx);
 const appShellCount=vm.runInContext('APP_SHELL.length',ctx);
 assert.equal(fetches.length,appShellCount,'existing app shell gets refreshed while cached SDKs remain');assert.ok(fetches.every(x=>x[1]==='reload'));
 let reply;handlers.fetch({request:{url:'https://app.test/',method:'GET',mode:'navigate'},respondWith:p=>reply=p});await reply;assert.equal(fetches.at(-1)[1],'no-store');
 ctx.fetch=async()=>{throw Error('offline');};handlers.fetch({request:{url:'https://app.test/',method:'GET',mode:'navigate'},respondWith:p=>reply=p});assert.equal(await reply,cached,'offline shell still available');
 console.log('PASS app update: cached HTML refreshed on install, navigation bypasses HTTP cache, offline fallback retained');
})().catch(e=>{console.error(e);process.exitCode=1;});
