const CACHE_NAME='cbtpass-offline-v1';
const APP_SHELL=['./','./index.html'];
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
    if(await cache.match(request))return;
    try{await putIfCacheable(cache,request,await fetch(request));}catch(_){}
  }));
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    await warmCache([...APP_SHELL,...FIREBASE_SDKS]);
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
      try{return await putIfCacheable(cache,request,await fetch(request));}
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
