// Travel app cache; keep the daily app's separate cache and registration.
const CACHE = 'travel-ledger-v2-cloud-scope';
const ASSETS = ['./', './index.html', './app.css', './app.js', './cloud-config.js', './sync-merge.js', './cloud.js', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', e => {e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate', e => {e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('travel-ledger-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch', e => {
 const req=e.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith(new URL('./daily/',self.registration.scope).pathname))return;
 e.respondWith(caches.open(CACHE).then(async cache=>{
 const hit=await cache.match(req,{ignoreSearch:true});
 const net=fetch(req).then(res=>{if(res.ok)cache.put(req,res.clone());return res;}).catch(()=>hit);
 return hit||net;
 }));
});
