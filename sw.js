const APP_BUILD='20261030-mock-block1-crops-1';
const CACHE_NAME='cbtpass-offline-v1';
const APP_SHELL=['./','./index.html','./mock-assets/azabu-2026/blocks.js','./mock-assets/azabu-2026/subjects.js','./mock-assets/azabu-2026/photo-pages.js','./features/dictionary-practice/dictionary-practice.css','./features/dictionary-practice/dictionary-practice.js','./dictionary-assets/exercises/manifest.json'];
// Remove stale copies of source-image data. Each selected book is fetched and cached on demand,
// avoiding a roughly 57 MB download during service-worker installation.
const UPDATED_DATA_FILES=[
  './data/1-60.json','./data/61-90.json','./data/91-120.json','./data/121-144.json',
  './data/145-174.json','./data/175-204.json','./data/C3-034-118.json','./data/C3-119-204.json',
  './data/C4-001-094.json','./data/C5-001-055.json','./data/C6-001-088.json',
  './data/D1-001-034.json','./data/D2-001-076.json','./data/E1.json','./data/E2.json',
  './data/E3.json','./data/E4.json','./data/E5.json'
];
const FIREBASE_SDKS=[
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];

async function putIfCacheable(cache,request,response){
  if(response&&(response.ok||response.type==='opaque'))await cache.put(request,response.clone());
  return response;
}

async function warmCache(urls){
  const cache=await caches.open(CACHE_NAME);
  await Promise.all(urls.map(async url=>{
    const request=new Request(url);
    if(!APP_SHELL.includes(url)&&await cache.match(request))return;
    try{await putIfCacheable(cache,request,await fetch(request,{cache:'reload'}));}catch(_){}
  }));
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    await warmCache([...APP_SHELL,...FIREBASE_SDKS]);
    const cache=await caches.open(CACHE_NAME);
    await Promise.all(UPDATED_DATA_FILES.map(url=>cache.delete(new Request(new URL(url,self.location.href)))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  const sameOrigin=url.origin===self.location.origin;
  const firebaseSdk=url.origin==='https://www.gstatic.com'&&url.pathname.startsWith('/firebasejs/');
  if(!sameOrigin&&!firebaseSdk)return;

  // HTMLはオンライン時に必ず最新版を優先する。問題JSON・画像はキャッシュを即時表示し、裏で更新する。
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME);
      try{return await putIfCacheable(cache,request,await fetch(request,{cache:'no-store'}));}
      catch(_){return (await cache.match(request))||(await cache.match('./index.html'));}
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const cached=await cache.match(request);
    if(cached){
      event.waitUntil(fetch(request).then(response=>putIfCacheable(cache,request,response)).catch(()=>{}));
      return cached;
    }
    return putIfCacheable(cache,request,await fetch(request));
  })());
});
