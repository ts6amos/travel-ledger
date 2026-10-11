(function(root) {
'use strict';
const currencies=['TWD','USD','JPY','EUR','CNY','HKD','GBP','KRW','AUD','SGD','THB'];
const payments=['cash','card','transfer','mobile','other'];
const names={
expense:[['food','餐飲','🍜'],['transport','交通','🚆'],['shopping','購物','🛍️'],['daily','日用品','🧴'],['housing','住房','🏠'],['utilities','水電','💡'],['telecom','通訊','📶'],['medical','醫療','💊'],['fun','娛樂','🎟️'],['education','教育','📚'],['other-out','其他','📝']],
income:[['salary','薪資','💼'],['bonus','獎金','🎉'],['interest','利息','🏦'],['other-in','其他','📝']]
};
const colors=['#e8743b','#3b82c4','#d9468f','#2fa87a','#7c5cbf','#c99a1a','#1fa2b8','#d64545'];
const defaults=()=>Object.entries(names).flatMap(([type,items])=>items.map(([id,name,icon],i)=>({id,name,icon,type,color:colors[i%colors.length]})));
const id=()=>root.crypto.randomUUID();
const clone=v=>JSON.parse(JSON.stringify(v));
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(new Date(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const validMonth=s=>typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const finite=(x,min=0,max=1e12)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const text=(s,max)=>typeof s==='string'&&s.length<=max;
const safeId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(s)&&!['__proto__','constructor','prototype'].includes(s);
const safeKeys=x=>!Object.keys(x).some(k=>['__proto__','constructor','prototype'].includes(k));
function createBook(name,home='TWD',budget=0){return{id:id(),name,home,defaultBudget:budget,budgets:{},categories:defaults(),entries:[],createdAt:Date.now()};}
function validateBooks(books){
const fail=()=>{throw new Error('資料格式不正確，請使用本 App 匯出的日常帳目 JSON');};
if(!Array.isArray(books)||books.length>1000)fail();
const ids=new Set();
for(const b of books){
if(!b||!safeKeys(b)||!safeId(b.id)||ids.has(b.id)||!text(b.name,80)||!b.name.trim()||!currencies.includes(b.home)||!finite(b.defaultBudget)||!finite(b.createdAt,0,1e15))fail();
ids.add(b.id);
if(!b.budgets||typeof b.budgets!=='object'||Array.isArray(b.budgets))fail();
for(const[m,n]of Object.entries(b.budgets))if(!validMonth(m)||!finite(n))fail();
if(!Array.isArray(b.categories)||b.categories.length>300||!Array.isArray(b.entries)||b.entries.length>100000)fail();
const cats=new Map(),entryIds=new Set();
for(const c of b.categories){
if(!c||!safeKeys(c)||!safeId(c.id)||cats.has(c.id)||!text(c.name,40)||!c.name.trim()||!['expense','income'].includes(c.type)||!text(c.icon,20)||!/^#[0-9a-f]{6}$/i.test(c.color))fail();cats.set(c.id,c);
}
for(const e of b.entries){
if(!e||!safeKeys(e)||!safeId(e.id)||entryIds.has(e.id)||!validDate(e.date)||!['income','expense'].includes(e.type)||!finite(e.amount,.01)||!finite(e.rate,.00000001,1e8)||!finite(e.amount*e.rate)||!currencies.includes(e.cur)||!payments.includes(e.pay)||!text(e.note,1000)||!cats.has(e.cat)||cats.get(e.cat).type!==e.type||!finite(e.createdAt,0,1e15))fail();
if(e.cur===b.home&&e.rate!==1)fail();entryIds.add(e.id);
}
}
return books;
}
function parseBackup(raw){if(raw.length>15*1024*1024)throw new Error('備份檔案超過 15 MB');const d=JSON.parse(raw);if(d?.app!=='daily-ledger'||d.version!==1)throw new Error('請選擇日常記帳版匯出的 JSON；旅遊版資料請保留在原 App');return validateBooks(d.books);}
function importBooks(current,incoming){validateBooks(incoming);const result=clone(current);let added=0,copies=0;for(const b of incoming){const old=result.find(x=>x.id===b.id);if(old&&JSON.stringify(old)===JSON.stringify(b))continue;const copy=clone(b);if(old){copy.id=id();copy.name=copy.name.slice(0,70)+'（匯入副本）';copies++;}result.push(copy);added++;}return{books:result,added,copies};}
const amount=e=>Math.round(e.amount*e.rate*100)/100;
function totals(entries){let incomeCents=0,expenseCents=0;const categories={};for(const e of entries){const cents=Math.round(e.amount*e.rate*100);if(e.type==='income')incomeCents+=cents;else{expenseCents+=cents;categories[e.cat]=(categories[e.cat]||0)+cents/100;}}return{income:incomeCents/100,expense:expenseCents/100,balance:(incomeCents-expenseCents)/100,categories,count:entries.length};}
function period(entries,from,to){return entries.filter(e=>(!from||e.date>=from)&&(!to||e.date<=to));}
function monthRange(month){const[y,m]=month.split('-').map(Number);return[month+'-01',`${month}-${new Date(Date.UTC(y,m,0)).getUTCDate()}`];}
const budget=(book,month)=>Object.prototype.hasOwnProperty.call(book.budgets,month)?book.budgets[month]:book.defaultBudget;
const csvCell=value=>'"'+String(value).replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
function csv(book,entries){const rows=[['日期','類型','原幣金額','幣別','換算匯率','帳本幣別','換算金額','分類','付款方式','備註']];const pay={cash:'現金',card:'信用卡',transfer:'銀行轉帳',mobile:'電子支付',other:'其他'};for(const e of entries)rows.push([e.date,e.type==='income'?'收入':'支出',e.amount,e.cur,e.rate,book.home,amount(e),book.categories.find(c=>c.id===e.cat)?.name||'',pay[e.pay],e.note]);return'\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');}
root.DailyModel={currencies,payments,defaults,id,clone,validDate,validMonth,createBook,validateBooks,parseBackup,importBooks,amount,totals,period,monthRange,budget,csv};
})(typeof window==='undefined'?globalThis:window);
