const{chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
const url='https://ts6amos.github.io/travel-ledger/daily/';
let good=false;
for(let i=0;i<20;i++){
try{const r=await fetch(url+'?release=daily-v1',{cache:'no-store'});const html=await r.text();if(r.ok&&html.includes('日日記帳')&&html.includes('model.js')){good=true;break;}}catch{}
await new Promise(r=>setTimeout(r,3000));
}
assert.equal(good,true,'Public daily app must return the deployed HTML');
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto(url,{waitUntil:'networkidle'});
assert.equal(await page.title(),'日日記帳');
await page.getByRole('button',{name:'建立帳本',exact:true}).waitFor();
await page.locator('#cloudPanel summary').click();
await page.locator('#cloudLogin').waitFor();
assert.ok((await page.locator('#cloudStatus').innerText()).includes('本機模式'));
assert.equal(await page.evaluate(()=>window.DAILY_CLOUD.url),'https://tyddgqqphpezhsvblbuw.supabase.co');
assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#nav')).position),'fixed');
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
assert.deepEqual(errors,[]);
console.log('PASS: public HTTPS site loads mobile layout, configured login and offline worker without page errors');
await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
