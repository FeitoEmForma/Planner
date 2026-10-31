const CACHE='feito-em-forma-online-studio-v12-mobile-75';
const ASSETS=['./','./index.html','./style.css','./app.js','./studio-enhancements.css','./studio-enhancements.js','./icone.svg','./icone-192.png','./icone-512.png','./manifest.webmanifest','./calculadora/index.html','./calculadora/assets/js/app.js','./calculadora/assets/js/catalogo.js','./calculadora/assets/css/styles.css','./calculadora/assets/css/redesign.css','./calculadora/assets/css/embedded.css','./calculadora/assets/css/catalogo.css','./calculadora/assets/img/brand-symbol.svg','./calculadora/assets/img/logo-feito-em-forma.png','./calculadora/assets/img/favicon.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return; // Nao armazenar respostas de login e API
  if(url.pathname.endsWith('/config.js'))return; // Sempre buscar configuracao atual
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});}
    return response;
  }).catch(()=>caches.match(event.request)));
});
