const root = new URL('./', self.location.href);
const PREFIX = 'ngu-' + encodeURIComponent(root.pathname) + '-';
const CACHE = PREFIX + '__VERSION__';
const ASSETS = __ASSETS__;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path => new URL(path,root).href))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);await self.clients.claim();})());
});
self.addEventListener('fetch', event => {
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==root.origin)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(event.request.mode==='navigate')return (await cache.match(new URL('index.html',root).href)) || fetch(event.request);
    // All cached files are our static build. Ignore preview hosts' Vary: Origin:
    // module requests carry an Origin header whereas precache requests do not.
    return (await cache.match(event.request, { ignoreVary: true })) || fetch(event.request);
  })());
});
self.addEventListener('notificationclick', event=>{
  event.notification.close();event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=windows.find(client=>client.url.startsWith(root.href));if(existing)await existing.focus();else await self.clients.openWindow(root.href);})());
});
