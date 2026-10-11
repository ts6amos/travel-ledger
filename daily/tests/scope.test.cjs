const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('travel worker keeps daily cache and does not intercept its requests',async()=>{
const handlers={},deleted=[],daily='daily-ledger-v1.0.0',ctx={URL,location:{origin:'https://ts6amos.github.io'},self:{registration:{scope:'https://ts6amos.github.io/travel-ledger/'},addEventListener:(n,f)=>handlers[n]=f,clients:{claim:()=>Promise.resolve()},skipWaiting:()=>Promise.resolve()},caches:{keys:()=>Promise.resolve([daily,'travel-ledger-v1','other-site']),delete:async k=>{deleted.push(k);}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','..','sw.js'),'utf8'),ctx);
let task;handlers.activate({waitUntil:p=>task=p});await task;assert.deepEqual(deleted,['travel-ledger-v1']);
let handled=false;handlers.fetch({request:{method:'GET',url:'https://ts6amos.github.io/travel-ledger/daily/app.js'},respondWith:()=>handled=true});assert.equal(handled,false);
});
