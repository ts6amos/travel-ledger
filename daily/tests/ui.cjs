const{chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const ROOT=path.resolve(__dirname,'..'),OUTPUT=process.env.TEST_OUTPUT||path.join(ROOT,'test-output');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const u=req.url.split('?')[0];const file=path.resolve(ROOT,'.'+decodeURIComponent(u==='/'?'/index.html':u));if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));});
const URL='http://localhost:8876',pause=ms=>new Promise(r=>setTimeout(r,ms));
async function add(p,type,amount,note,extra={}){
await p.locator('#fab').click();const f=p.locator('#entryForm');await f.locator('[name=type]').selectOption(type);await f.locator('[name=date]').fill('2026-10-12');await f.locator('[name=amount]').fill(String(amount));
if(extra.cur){await f.locator('[name=cur]').selectOption(extra.cur);await f.locator('[name=rate]').fill(String(extra.rate));}
await f.locator('[name=note]').fill(note);await p.getByRole('button',{name:'儲存帳目',exact:true}).click();await p.locator('#sheet').waitFor({state:'hidden'});
}
async function create(p,name){await p.getByRole('button',{name:'建立帳本',exact:true}).click();await p.locator('#bookForm [name=name]').fill(name);await p.getByRole('button',{name:'儲存帳本',exact:true}).click();}
async function login(p,email='daily@test.invalid'){if(!await p.locator('#cloudPanel details').evaluate(e=>e.open))await p.locator('#cloudPanel summary').click();await p.locator('#cloudLogin [name=email]').fill(email);await p.locator('#cloudLogin [name=password]').fill('test-password');await p.locator('#cloudLogin').getByRole('button',{name:'登入',exact:true}).click();await p.locator('#syncNow').waitFor();await synced(p);}
async function synced(p){await p.waitForFunction(()=>document.getElementById('cloudStatus').textContent.startsWith('已同步'));}
async function sync(p){await p.locator('#syncNow').click();await synced(p);}
async function stored(p){return p.evaluate(()=>JSON.parse(localStorage.getItem(window.LedgerCloud.key())).books);}
async function run(){
await new Promise(r=>server.listen(8876,'127.0.0.1',r));fs.mkdirSync(OUTPUT,{recursive:true});
const browser=await chromium.launch({headless:true});const errors=[],watch=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());};
// Blank configuration on the local/offline test, so no real accounts or calls.
const local=await browser.newContext({viewport:{width:390,height:844}});
await local.route('**/cloud-config.js',r=>r.fulfill({contentType:'text/javascript',body:'window.DAILY_CLOUD={url:"",key:""};'}));
const p=await local.newPage();watch(p);await p.goto(URL);
assert.equal(await p.locator('[data-act=sample]').count(),0);await create(p,'我的日常');
await add(p,'income',50000,'十月薪資');await add(p,'expense',100,'早餐');await add(p,'expense',3,'咖啡',{cur:'USD',rate:32.15});
assert.equal((await stored(p))[0].entries.length,3);assert.ok((await p.locator('.sum').innerText()).includes('196.45'));
await p.locator('[data-tab=budget]').click();await p.locator('#budgetForm [name=budget]').fill('1000');await p.locator('#budgetForm [name=defaultBudget]').fill('800');await p.getByRole('button',{name:'儲存預算'}).click();assert.equal((await stored(p))[0].budgets['2026-10'],1000);
await p.locator('[data-tab=ledger]').click();await p.locator('#filterForm [name=query]').fill('早餐');await p.locator('#filterForm').getByRole('button',{name:'篩選',exact:true}).click();assert.equal(await p.locator('.item').count(),1);
await p.getByRole('button',{name:'清除篩選'}).click();await p.evaluate(()=>scrollTo(0,0));await pause(4200);await p.screenshot({path:path.join(OUTPUT,'mobile-ledger.png'),fullPage:true});
await p.locator('[data-tab=stats]').click();assert.equal(await p.locator('.daily-donut').count(),1);assert.equal(await p.locator('.bars rect').count(),12);await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(OUTPUT,'mobile-stats.png'),fullPage:true});
await p.locator('[data-tab=settings]').click();await p.getByRole('button',{name:'新增分類',exact:true}).click();await p.locator('#categoryForm [name=name]').fill('寵物');await p.getByRole('button',{name:'儲存分類',exact:true}).click();assert.ok((await stored(p))[0].categories.some(c=>c.name==='寵物'));
const downloadEvent=p.waitForEvent('download');await p.getByRole('button',{name:'備份全部資料 JSON'}).click();const dl=await downloadEvent,backup=await dl.path(),contents=JSON.parse(fs.readFileSync(backup,'utf8'));assert.equal(contents.app,'daily-ledger');assert.equal(contents.books[0].entries.length,3);
await p.locator('#importFile').setInputFiles(backup);await p.waitForFunction(()=>document.getElementById('toast').textContent.includes('已匯入 0'));assert.equal((await stored(p)).length,1);
await p.locator('[data-tab=ledger]').click();await p.getByRole('button',{name:'編輯 早餐',exact:true}).click();await p.locator('#entryForm [name=amount]').fill('120');await p.getByRole('button',{name:'儲存帳目'}).click();assert.equal((await stored(p))[0].entries.find(e=>e.note==='早餐').amount,120);
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
await local.setOffline(true);await p.reload();assert.ok((await p.locator('#top').innerText()).includes('我的日常'));await add(p,'expense',50,'離線車資');await p.reload();assert.equal((await stored(p))[0].entries.length,4);await local.setOffline(false);
await p.setViewportSize({width:1280,height:900});await p.evaluate(()=>scrollTo(0,0));await pause(4200);await p.screenshot({path:path.join(OUTPUT,'desktop-ledger.png'),fullPage:true});
console.log('PASS: browser local CRUD, currencies, filters, budget, category, backup import, responsive width, offline reload');
const rows=new Map();
async function cloudContext(viewport){
const c=await browser.newContext({viewport,serviceWorkers:'block'});
await c.route('**/cloud-config.js',r=>r.fulfill({contentType:'text/javascript',body:"window.DAILY_CLOUD={url:'https://test.supabase.co',key:'sb_publishable_test'};"}));
await c.route('https://test.supabase.co/**',async r=>{
const req=r.request(),u=new globalThis.URL(req.url()),body=req.postDataJSON()||{},user=req.headers().authorization?.replace('Bearer ','');let data;
if(u.pathname==='/auth/v1/token'){const id=u.searchParams.get('grant_type')==='refresh_token'?body.refresh_token:body.email;data={access_token:id,refresh_token:id,expires_in:3600,user:{id,email:id}};}
else if(u.pathname==='/auth/v1/signup')data={user:{id:body.email}};
else if(u.pathname==='/auth/v1/logout')data={};
else{const row=rows.get(user)||{books:[],revision:0};if(u.pathname.endsWith('daily_ledger_read'))data=row;else if(u.pathname.endsWith('daily_ledger_write')){if(body.expected_revision!==row.revision)data={ok:false,revision:row.revision};else{data={ok:true,books:body.new_books,revision:row.revision+1};rows.set(user,JSON.parse(JSON.stringify(data)));}}else throw new Error('Unexpected endpoint '+u.pathname);}
await r.fulfill({contentType:'application/json',body:JSON.stringify(data)});
});return c;
}
const ca=await cloudContext({width:1280,height:900}),cb=await cloudContext({width:390,height:844}),a=await ca.newPage(),b=await cb.newPage();watch(a);watch(b);
await a.goto(URL);await create(a,'同步測試');await add(a,'expense',100,'午餐');await login(a);assert.equal(await a.locator('.item').count(),0);
await a.locator('#migrateLocal').click();await synced(a);assert.equal((await stored(a))[0].entries.length,1);
await b.goto(URL);await login(b);assert.equal((await stored(b))[0].entries[0].amount,100);
await b.getByRole('button',{name:'編輯 午餐',exact:true}).click();await b.locator('#entryForm [name=amount]').fill('120');await b.getByRole('button',{name:'儲存帳目'}).click();await b.evaluate(()=>window.LedgerCloud.sync());await synced(b);await sync(a);assert.equal((await stored(a))[0].entries[0].amount,120);
await ca.setOffline(true);await add(a,'expense',50,'離線車資');await add(b,'income',1000,'收入測試');await b.evaluate(()=>window.LedgerCloud.sync());await synced(b);await ca.setOffline(false);await sync(a);await sync(b);assert.equal((await stored(a))[0].entries.length,3);assert.equal((await stored(b))[0].entries.length,3);
await ca.setOffline(true);await a.getByRole('button',{name:'編輯 午餐',exact:true}).click();await a.locator('#entryForm [name=amount]').fill('200');await a.getByRole('button',{name:'儲存帳目'}).click();
await b.getByRole('button',{name:'編輯 午餐',exact:true}).click();await b.locator('#entryForm [name=amount]').fill('300');await b.getByRole('button',{name:'儲存帳目'}).click();await b.evaluate(()=>window.LedgerCloud.sync());await synced(b);await ca.setOffline(false);await a.evaluate(()=>window.LedgerCloud.sync());await a.waitForFunction(()=>document.getElementById('cloudStatus').textContent.includes('同步衝突'));assert.equal((await stored(a))[0].entries[0].amount,200);
await a.locator('#keepRemote').click();await synced(a);assert.equal((await stored(a))[0].entries[0].amount,300);
await a.getByRole('button',{name:'編輯 午餐',exact:true}).click();await a.getByRole('button',{name:'刪除',exact:true}).click();await a.evaluate(()=>window.LedgerCloud.sync());await synced(a);await sync(b);assert.equal((await stored(b))[0].entries.length,2);
await b.locator('#cloudLogout').click();await b.locator('#cloudLogin').waitFor();await login(b,'other@test.invalid');assert.equal(await b.locator('.item').count(),0);assert.equal((await stored(b)).length,0);
await a.evaluate(()=>{const s=JSON.parse(localStorage.getItem('dailyLedger.cloud.session'));s.expires_at=1;localStorage.setItem('dailyLedger.cloud.session',JSON.stringify(s));});await a.reload();await a.locator('#cloudPanel summary').click();await synced(a);assert.ok(await a.evaluate(()=>JSON.parse(localStorage.getItem('dailyLedger.cloud.session')).expires_at>Date.now()/1000));
assert.deepEqual(errors,[]);console.log('PASS: mock Supabase browser login, migration, two-device edits/deletion, offline merge, conflict resolution, account separation, refresh');
await browser.close();await new Promise(r=>server.close(r));
}
run().catch(e=>{console.error(e);server.close();process.exit(1);});
