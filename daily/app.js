'use strict';
const M=window.DailyModel;
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today=()=>date(new Date());
const monthNow=()=>today().slice(0,7);
const fmt=(n,c='TWD')=>{const v=new Intl.NumberFormat('zh-TW',{style:'currency',currency:c,maximumFractionDigits:2}).format(n);return c==='TWD'?v.replace(/^(-?)\$/,'$1NT$'):v;};
const pays={cash:'現金',card:'信用卡',transfer:'銀行轉帳',mobile:'電子支付',other:'其他'};
const empty=()=>({version:1,books:[],current:null});
let storageError=false;
let state=load();
const ui={tab:'ledger',month:monthNow(),from:'',to:'',type:'all',cat:'all',pay:'all',query:''};
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4000);}
function load(){try{const raw=localStorage.getItem(window.LedgerCloud.key());if(raw){const s=JSON.parse(raw);M.validateBooks(s.books);return s;}}catch{storageError=true;setTimeout(()=>toast('快取無法讀取，原始資料未清除。請先從設定下載原始快取備份，再處理。'),0);}return empty();}
function commit(next){if(storageError){toast('原始快取異常，已暫停儲存與同步。請先備份原始快取，再匯入有效備份恢復。');return false;}try{M.validateBooks(next.books);window.LedgerCloud.persist(next);state=next;window.LedgerCloud.changed();return true;}catch(e){toast('無法儲存：'+e.message+'。請先匯出備份。');return false;}}
const book=()=>state.books.find(b=>b.id===state.current)||state.books[0]||null;
const cat=(b,id)=>b.categories.find(c=>c.id===id)||{name:'未分類',icon:'📝',color:'#8a94a3'};
function bounds(){return ui.from||ui.to?[ui.from,ui.to]:M.monthRange(ui.month);}
function selected(b,filters=true){const[from,to]=bounds();return M.period(b.entries,from,to).filter(e=>!filters||((ui.type==='all'||e.type===ui.type)&&(ui.cat==='all'||e.cat===ui.cat)&&(ui.pay==='all'||e.pay===ui.pay)&&(!ui.query||(e.note+' '+cat(b,e.cat).name+' '+pays[e.pay]).toLowerCase().includes(ui.query.toLowerCase()))));}
function option(v,label,current){return `<option value="${esc(v)}"${v===current?' selected':''}>${esc(label)}</option>`;}
function monthControl(){return `<section class="card period"><div class="month-row"><button class="btn sm" data-act="prevMonth" aria-label="上個月">‹</button><label class="f">月份<input id="monthPicker" type="month" value="${esc(ui.month)}" aria-label="選擇月份"></label><button class="btn sm" data-act="nextMonth" aria-label="下個月">›</button></div><details${ui.from||ui.to?' open':''}><summary>自訂日期範圍${ui.from||ui.to?' · 已啟用':''}</summary><form id="rangeForm"><div class="row2"><label class="f">開始日期<input name="from" type="date" value="${esc(ui.from)}" required></label><label class="f">結束日期<input name="to" type="date" value="${esc(ui.to)}" required></label></div><div class="btn-row"><button class="btn sm primary">套用範圍</button><button class="btn sm" type="button" data-act="resetRange">回到月份</button></div></form></details></section>`;}
function summary(b){
const st=M.totals(selected(b,false)),monthly=M.totals(M.period(b.entries,...M.monthRange(ui.month))),budget=M.budget(b,ui.month),ratio=budget?monthly.expense/budget:0;
return `<section class="card sum"><div class="lbl">${ui.from||ui.to?'所選日期範圍':ui.month+' 月份'}收支</div><div class="summary-grid"><div><small>收入</small><b class="income">${fmt(st.income,b.home)}</b></div><div><small>支出</small><b>${fmt(st.expense,b.home)}</b></div></div><div class="row"><span>收支結餘</span><strong class="${st.balance<0?'expense':'income'}">${fmt(st.balance,b.home)}</strong></div><p class="hint">期間收入減支出，不代表銀行帳戶餘額。</p>${budget?`<div class="bar ${ratio>=1?'over':ratio>=.8?'warn':''}" role="img" aria-label="${esc(ui.month)}預算已使用 ${Math.round(ratio*100)}%"><i style="width:${Math.min(100,ratio*100)}%"></i></div><div class="row"><span>${ui.month} 預算 ${fmt(budget,b.home)}</span><span>${monthly.expense>budget?'超支':'剩餘'} ${fmt(Math.abs(budget-monthly.expense),b.home)}</span></div>`:'<p class="hint">尚未設定每月預算，可至「預算」設定。</p>'}</section>`;
}
function ledger(b){
const entries=selected(b).sort((a,z)=>z.date.localeCompare(a.date)||z.createdAt-a.createdAt);
const groups=new Map();for(const e of entries){if(!groups.has(e.date))groups.set(e.date,[]);groups.get(e.date).push(e);}
return monthControl()+summary(b)+`<section class="card"><form id="filterForm"><label class="f">搜尋備註或分類<input name="query" type="search" value="${esc(ui.query)}" placeholder="例如：早餐、薪資"></label><div class="filter-grid"><label class="f">收支<select name="type">${option('all','全部',ui.type)}${option('expense','支出',ui.type)}${option('income','收入',ui.type)}</select></label><label class="f">分類<select name="cat">${option('all','全部分類',ui.cat)}${b.categories.map(c=>option(c.id,(c.type==='income'?'收入 · ':'支出 · ')+c.name,ui.cat)).join('')}</select></label><label class="f">付款方式<select name="pay">${option('all','全部方式',ui.pay)}${Object.entries(pays).map(([v,n])=>option(v,n,ui.pay)).join('')}</select></label></div><div class="btn-row"><button class="btn sm primary">篩選</button><button type="button" class="btn sm" data-act="resetFilter">清除篩選</button><button type="button" class="btn sm" data-act="csv">匯出清單 CSV</button></div></form><p class="hint">顯示 ${entries.length} 筆 · 上方總覽統計整個日期範圍。</p></section>`+
(entries.length?[...groups].map(([day,items])=>`<section class="day"><div class="day-h"><b>${esc(day)}</b><span>${items.length} 筆</span></div><div class="list">${items.map(e=>{const c=cat(b,e.cat);return `<button class="item" data-act="edit" data-id="${esc(e.id)}" aria-label="編輯 ${esc(e.note||c.name)}"><span class="ico" style="background:${c.color}18">${esc(c.icon)}</span><span class="mid"><b>${esc(e.note||c.name)}</b><small>${esc(c.name)} · ${pays[e.pay]}</small></span><span class="amt"><b class="${e.type}">${e.type==='income'?'+':'−'}${fmt(M.amount(e),b.home)}</b>${e.cur!==b.home?`<small>${fmt(e.amount,e.cur)}</small>`:'<small>'+(e.type==='income'?'收入':'支出')+'</small>'}</span></button>`;}).join('')}</div></section>`).join(''):`<section class="card empty"><div class="em">🧾</div><h2>${b.entries.length?'這個範圍沒有符合的帳目':'記下第一筆日常收支'}</h2><p>按下 ＋，記錄一筆收入或支出。</p><button class="btn primary" data-act="add">新增帳目</button></section>`);
}
function trend(b){
const[y,m]=ui.month.split('-').map(Number),rows=[];
for(let i=5;i>=0;i--){const d=new Date(y,m-1-i,1),mo=date(d).slice(0,7);rows.push({month:mo,...M.totals(M.period(b.entries,...M.monthRange(mo)))});}
const max=Math.max(1,...rows.flatMap(r=>[r.income,r.expense]));
return `<section class="card"><h2>最近六個月收支趨勢</h2><p class="hint">截至 ${ui.month}，與搜尋篩選無關 · 綠色收入／橘色支出</p><svg class="bars fit" viewBox="0 0 540 200" role="img" aria-label="六個月收入支出比較"><line class="grid" x1="0" y1="165" x2="540" y2="165"/>${rows.map((r,i)=>`<rect x="${i*90+23}" y="${165-r.income/max*130}" width="18" height="${r.income/max*130}" fill="#24936a"/><rect x="${i*90+46}" y="${165-r.expense/max*130}" width="18" height="${r.expense/max*130}" fill="#e8743b"/><text x="${i*90+44}" y="187">${r.month.slice(2)}</text>`).join('')}</svg><div class="scroll-x"><table class="tbl"><thead><tr><th>月份</th><th class="r">收入</th><th class="r">支出</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.month}</td><td class="r income">${fmt(r.income,b.home)}</td><td class="r">${fmt(r.expense,b.home)}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function stats(b){
const st=M.totals(selected(b,false)),categories=Object.entries(st.categories).sort((a,z)=>z[1]-a[1]);let start=0;
const gradient=categories.map(([id,n])=>{const end=start+n/(st.expense||1)*100,s=`${cat(b,id).color} ${start}% ${end}%`;start=end;return s;}).join(',');
const days=new Map();for(const e of selected(b,false)){if(!days.has(e.date))days.set(e.date,[]);days.get(e.date).push(e);}
return monthControl()+summary(b)+`<section class="card"><h2>支出分類與占比</h2>${st.expense?`<div class="donut-wrap"><div class="daily-donut" style="background:conic-gradient(${gradient})" role="img" aria-label="支出分類占比"><div><small>期間支出</small><strong>${fmt(st.expense,b.home)}</strong></div></div><ul class="legend">${categories.map(([id,n])=>`<li><span class="dot" style="background:${cat(b,id).color}"></span><span class="nm">${esc(cat(b,id).name)}</span><span class="pc">${(n/st.expense*100).toFixed(1)}%</span><span class="vl">${fmt(n,b.home)}</span></li>`).join('')}</ul></div>`:'<p class="hint">尚無支出資料。</p>'}</section>`+trend(b)+`<section class="card"><h2>每日收支</h2><div class="scroll-x"><table class="tbl"><thead><tr><th>日期</th><th class="r">收入</th><th class="r">支出</th></tr></thead><tbody>${[...days].sort((a,z)=>z[0].localeCompare(a[0])).map(([day,es])=>{const s=M.totals(es);return `<tr><td>${day}</td><td class="r income">${fmt(s.income,b.home)}</td><td class="r">${fmt(s.expense,b.home)}</td></tr>`;}).join('')||'<tr><td colspan="3">尚無資料</td></tr>'}</tbody></table></div></section>`;
}
function budgetView(b){
const n=M.budget(b,ui.month),st=M.totals(M.period(b.entries,...M.monthRange(ui.month)));
return `<section class="card"><h2>每月支出預算</h2><p class="hint">預算計算支出，不以收入抵銷。0 表示不設定上限。</p><form id="budgetForm"><label class="f">預算月份<input type="month" name="month" value="${esc(ui.month)}" required></label><div class="row2"><label class="f">本月預算（${b.home}）<input name="budget" type="number" min="0" max="1000000000000" step="0.01" value="${n}" required></label><label class="f">其他月份預設值（${b.home}）<input name="defaultBudget" type="number" min="0" max="1000000000000" step="0.01" value="${b.defaultBudget}" required></label></div><button class="btn primary">儲存預算</button></form></section><section class="card sum"><div class="lbl">${ui.month} 已支出</div><div class="big">${fmt(st.expense,b.home)}</div><p>${n?'預算 '+fmt(n,b.home)+' · '+(st.expense>n?'超支 ':'剩餘 ')+fmt(Math.abs(n-st.expense),b.home):'尚未設定預算'}</p></section>`;
}
function settings(b){return `<section class="card"><h2>帳本設定</h2><p><b>${esc(b.name)}</b> · ${b.home}</p><p class="hint">帳本按登入帳號隔離。不同帳號不會因帳本名稱相同而共用資料。</p><div class="btn-row"><button class="btn" data-act="editBook">修改帳本</button><button class="btn" data-act="newBook">新增帳本</button><button class="btn danger" data-act="deleteBook">刪除目前帳本</button></div></section><section class="card"><h2>分類管理</h2><div class="btn-row"><button class="btn primary" data-act="addCategory">新增分類</button></div>${b.categories.map(c=>`<div class="category-row"><span>${esc(c.icon)} ${esc(c.name)} <small>· ${c.type==='income'?'收入':'支出'}</small></span><span><button class="btn sm" data-act="editCategory" data-id="${esc(c.id)}">修改</button> <button class="btn sm danger" data-act="deleteCategory" data-id="${esc(c.id)}">刪除</button></span></div>`).join('')}</section>`+commonSettings();}
function commonSettings(){return `<section class="card"><h2>資料備份與匯入</h2><p class="hint">JSON 備份包含目前資料空間全部帳本，不包含密碼或登入 Token。雲端同步不能代替備份。</p><div class="btn-row"><button class="btn primary" data-act="backup">備份全部資料 JSON</button><button class="btn" data-act="import">匯入 JSON</button><button class="btn" data-act="rawBackup">下載原始快取</button></div><p class="hint">相同 ID 且相同內容會跳過；內容不同會新增副本。舊備份中的已刪除帳目可能再次匯入，請先核對。</p></section><section class="card"><h2>外觀與安裝</h2><label class="f">主題<select id="themePicker">${option('auto','跟隨系統',localStorage.getItem('dailyLedger.theme')||'auto')}${option('light','淺色',localStorage.getItem('dailyLedger.theme'))}${option('dark','深色',localStorage.getItem('dailyLedger.theme'))}</select></label><p class="hint">手機瀏覽器可加入主畫面。離線功能須先在線上完整開啟一次；首次登入與註冊需要網路。</p><p class="hint">日日記帳 v1.0 · 保留旅費記帳的青綠色介面與操作方式。</p></section>`;}
function render(){
const b=book();
$('#top').innerHTML=`<button class="tripbtn" data-act="books" aria-label="切換帳本"><span>📒</span><span class="name">${esc(b?.name||'日日記帳')}</span><span>▾</span></button><span class="badge">${b?.home||'TWD'} · 日常版</span>`;
$('#fab').classList.toggle('hidden',!b||ui.tab==='settings');
document.querySelectorAll('#nav button').forEach(n=>n.dataset.tab===ui.tab?n.setAttribute('aria-current','page'):n.removeAttribute('aria-current'));
$('#main').innerHTML=b?({ledger,stats,budget:budgetView,settings}[ui.tab])(b):`<section class="card empty"><div class="em">📒</div><h2>讓每一筆收支都有紀錄</h2><p>建立第一本帳本，從今天開始。<br>登入同一帳號，就能在手機與電腦同步。</p><button class="btn primary" data-act="newBook">建立帳本</button><button class="btn" data-act="import">匯入日常帳目</button></section>`+(ui.tab==='settings'?commonSettings():'');
}
function modal(title,body,footer=''){$('#sheet').innerHTML=`<div class="sheet"><div class="sheet-h"><h2>${esc(title)}</h2><button class="x" data-act="close" aria-label="關閉">✕</button></div><div class="sheet-b">${body}</div>${footer?`<div class="sheet-f">${footer}</div>`:''}</div>`;if(!$('#sheet').open)$('#sheet').showModal();}
function close(){if($('#sheet').open)$('#sheet').close();window.LedgerCloud.sync();}
function editBook(existing){
modal(existing?'修改帳本':'建立帳本',`<form id="bookForm"><label class="f">帳本名稱<input name="name" type="text" maxlength="80" value="${esc(existing?.name||'個人帳本')}" required></label><label class="f">帳本幣別<select name="home"${existing?.entries.length?' disabled':''}>${M.currencies.map(c=>option(c,c,existing?.home||'TWD')).join('')}</select></label><label class="f">預設每月預算<input name="budget" type="number" min="0" max="1000000000000" step="0.01" value="${existing?.defaultBudget||0}" required></label><p class="hint">已有帳目後，帳本幣別固定，避免舊帳換算錯誤。可以另建不同幣別帳本。</p></form>`,`<button class="btn" data-act="close">取消</button><button class="btn primary" form="bookForm">儲存帳本</button>`);
$('#bookForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target),name=f.get('name').trim();if(!name)return toast('請輸入帳本名稱');const next=M.clone(state),budget=Number(f.get('budget'));if(existing){const b=next.books.find(x=>x.id===existing.id);b.name=name;b.defaultBudget=budget;if(!b.entries.length)b.home=f.get('home');}else{const b=M.createBook(name,f.get('home'),budget);next.books.push(b);next.current=b.id;}if(commit(next)){close();render();toast('帳本已儲存');}});
}
function bookPicker(){modal('我的帳本',state.books.map(b=>`<button class="list-btn" data-act="chooseBook" data-id="${esc(b.id)}"><span>📒</span><span class="t"><b>${esc(b.name)}</b><small>${b.home} · ${b.entries.length} 筆帳目</small></span>${book()?.id===b.id?'<span class="ck">✓</span>':''}</button>`).join('')||'<p>尚未建立帳本。</p>',`<button class="btn primary" data-act="newBook">新增帳本</button>`);}
function entryForm(existing){
const b=book();if(!b)return;const initType=existing?.type||'expense',initCur=existing?.cur||b.home;
modal(existing?'修改帳目':'新增帳目',`<form id="entryForm"><div class="row2"><label class="f">收支類型<select name="type">${option('expense','支出',initType)}${option('income','收入',initType)}</select></label><label class="f">日期<input name="date" type="date" value="${esc(existing?.date||today())}" required></label></div><div class="amtrow"><label class="f">金額<input id="fAmt" name="amount" type="number" inputmode="decimal" min="0.01" max="1000000000000" step="0.01" value="${existing?.amount||''}" required autofocus></label><label class="f">幣別<select name="cur">${M.currencies.map(c=>option(c,c,initCur)).join('')}</select></label></div><label class="f" id="rateField">1 單位原幣 = 多少 ${b.home}<input name="rate" type="number" inputmode="decimal" min="0.00000001" max="100000000" step="any" value="${existing?.rate||1}" required></label><div class="prev" id="entryPreview" role="status"></div><label class="f">分類<select name="cat"></select></label><label class="f">付款方式<select name="pay">${Object.entries(pays).map(([v,n])=>option(v,n,existing?.pay||'cash')).join('')}</select></label><label class="f">備註<input name="note" type="text" maxlength="1000" value="${esc(existing?.note||'')}" placeholder="例如：早餐、十月份薪資"></label><p class="hint">外幣匯率手動輸入並保存於每筆帳目，後續修改匯率不會改變其他歷史帳目。</p></form>`,`${existing?`<button class="btn danger" data-act="deleteEntry" data-id="${esc(existing.id)}">刪除</button>`:'<button class="btn" data-act="close">取消</button>'}<button class="btn primary" form="entryForm">儲存帳目</button>`);
const form=$('#entryForm');
const updateCats=()=>{const current=form.elements.cat.value||existing?.cat;form.elements.cat.innerHTML=b.categories.filter(c=>c.type===form.elements.type.value).map(c=>option(c.id,c.icon+' '+c.name,current)).join('');};updateCats();
const preview=()=>{const same=form.elements.cur.value===b.home;$('#rateField').classList.toggle('hidden',same);form.elements.rate.disabled=same;if(same)form.elements.rate.value='1';const n=Number(form.elements.amount.value)*Number(form.elements.rate.value);$('#entryPreview').textContent=Number.isFinite(n)?'換算為 '+fmt(n,b.home):'請輸入金額與匯率';};preview();
form.elements.type.addEventListener('change',updateCats);form.addEventListener('input',preview);
form.addEventListener('submit',e=>{
e.preventDefault();const f=new FormData(form),next=M.clone(state),target=next.books.find(x=>x.id===b.id);
const item={id:existing?.id||M.id(),type:f.get('type'),date:f.get('date'),amount:Number(f.get('amount')),cur:f.get('cur'),rate:f.get('cur')===b.home?1:Number(f.get('rate')),cat:f.get('cat'),pay:f.get('pay'),note:f.get('note').trim(),createdAt:existing?.createdAt||Date.now()};
if(!item.cat)return toast('請先在設定新增這個收支類型的分類');const index=target.entries.findIndex(x=>x.id===item.id);if(index>=0)target.entries[index]=item;else target.entries.push(item);
if(commit(next)){ui.month=item.date.slice(0,7);ui.from=ui.to='';close();render();toast('帳目已儲存');}
});
}
function categoryForm(existing){
const b=book(),used=existing&&b.entries.some(e=>e.cat===existing.id);
modal(existing?'修改分類':'新增分類',`<form id="categoryForm"><label class="f">分類名稱<input name="name" type="text" maxlength="40" value="${esc(existing?.name||'')}" required></label><label class="f">收支類型<select name="type"${used?' disabled':''}>${option('expense','支出',existing?.type||'expense')}${option('income','收入',existing?.type||'expense')}</select></label><label class="f">圖示（可使用 Emoji）<input name="icon" type="text" maxlength="20" value="${esc(existing?.icon||'📝')}" required></label><label class="f">顏色<input name="color" type="color" value="${existing?.color||'#0e7c86'}"></label>${used?'<p class="hint">已有帳目使用此分類，收支類型固定。</p>':''}</form>`,`<button class="btn" data-act="close">取消</button><button class="btn primary" form="categoryForm">儲存分類</button>`);
$('#categoryForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target),next=M.clone(state),target=next.books.find(x=>x.id===b.id),c={id:existing?.id||M.id(),name:f.get('name').trim(),icon:f.get('icon').trim(),type:used?existing.type:f.get('type'),color:f.get('color')};const i=target.categories.findIndex(x=>x.id===c.id);if(i>=0)target.categories[i]=c;else target.categories.push(c);if(commit(next)){close();render();toast('分類已儲存');}});
}
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function backup(){download(JSON.stringify({app:'daily-ledger',version:1,exportedAt:new Date().toISOString(),books:state.books},null,2),'daily-ledger-'+today()+'.json','application/json');}
function changeMonth(delta){const[y,m]=ui.month.split('-').map(Number);ui.month=date(new Date(y,m-1+delta,1)).slice(0,7);ui.from=ui.to='';render();}
document.addEventListener('click',e=>{
const nav=e.target.closest('[data-tab]');if(nav){ui.tab=nav.dataset.tab;render();return;}
const el=e.target.closest('[data-act]');if(!el)return;const b=book(),action=el.dataset.act,id=el.dataset.id;
switch(action){
case'close':close();break;case'books':bookPicker();break;case'newBook':editBook();break;case'editBook':editBook(b);break;
case'chooseBook':{const next={...state,current:id};if(commit(next)){ui.cat='all';close();render();}break;}
case'add':entryForm();break;case'edit':entryForm(b.entries.find(x=>x.id===id));break;
case'prevMonth':changeMonth(-1);break;case'nextMonth':changeMonth(1);break;
case'resetRange':ui.from=ui.to='';render();break;case'resetFilter':ui.type=ui.cat=ui.pay='all';ui.query='';render();break;
case'backup':backup();break;case'rawBackup':download(localStorage.getItem(window.LedgerCloud.key())||'{}','daily-ledger-raw-cache-'+today()+'.json','application/json');break;
case'csv':download(M.csv(b,selected(b)),'daily-ledger-'+ui.month+'.csv','text/csv;charset=utf-8');break;case'import':$('#importFile').click();break;
case'deleteEntry':{if(!confirm('確定刪除這筆帳目？刪除也會同步到其他裝置。'))break;const next=M.clone(state);next.books.find(x=>x.id===b.id).entries=next.books.find(x=>x.id===b.id).entries.filter(x=>x.id!==id);if(commit(next)){close();render();toast('帳目已刪除');}break;}
case'deleteBook':{if(!confirm(`確定刪除「${b.name}」及其中 ${b.entries.length} 筆帳目？建議先備份。`))break;const next=M.clone(state);next.books=next.books.filter(x=>x.id!==b.id);next.current=next.books[0]?.id||null;if(commit(next)){render();toast('帳本已刪除');}break;}
case'addCategory':categoryForm();break;case'editCategory':categoryForm(b.categories.find(x=>x.id===id));break;
case'deleteCategory':{if(b.entries.some(x=>x.cat===id)){toast('此分類仍有帳目，請先修改帳目的分類');break;}if(!confirm('確定刪除此分類？'))break;const next=M.clone(state);next.books.find(x=>x.id===b.id).categories=next.books.find(x=>x.id===b.id).categories.filter(x=>x.id!==id);if(commit(next))render();break;}
}
});
document.addEventListener('change',e=>{if(e.target.id==='monthPicker'&&M.validMonth(e.target.value)){ui.month=e.target.value;ui.from=ui.to='';render();}if(e.target.id==='themePicker'){localStorage.setItem('dailyLedger.theme',e.target.value);theme();}});
document.addEventListener('submit',e=>{
if(e.target.id==='rangeForm'){e.preventDefault();const f=new FormData(e.target),a=f.get('from'),z=f.get('to');if(!M.validDate(a)||!M.validDate(z)||a>z)return toast('請選擇正確的日期範圍');ui.from=a;ui.to=z;render();}
if(e.target.id==='filterForm'){e.preventDefault();const f=new FormData(e.target);for(const k of['type','cat','pay','query'])ui[k]=f.get(k);render();}
if(e.target.id==='budgetForm'){e.preventDefault();const f=new FormData(e.target),month=f.get('month');if(!M.validMonth(month))return toast('請選擇正確月份');const next=M.clone(state),b=next.books.find(x=>x.id===book().id);b.budgets[month]=Number(f.get('budget'));b.defaultBudget=Number(f.get('defaultBudget'));if(commit(next)){ui.month=month;render();toast('預算已儲存');}}
});
$('#importFile').addEventListener('change',async e=>{
const file=e.target.files[0];e.target.value='';if(!file)return;
try{
if(file.size>15*1024*1024)throw new Error('檔案超過 15 MB');
const incoming=M.parseBackup(await file.text());
if(!confirm(`匯入 ${incoming.length} 本帳本？現有資料會保留，相同 ID 不同內容會新增副本。請核對舊備份中曾經刪除的資料。`))return;
const imported=M.importBooks(state.books,incoming),next={...state,books:imported.books};if(!next.current)next.current=next.books[0]?.id||null;
if(storageError){if(!confirm('快取異常。接下來會下載原始快取，再以這份有效備份恢復目前資料空間。確認繼續？'))return;download(localStorage.getItem(window.LedgerCloud.key())||'{}','daily-ledger-raw-cache-'+today()+'.json','application/json');window.LedgerCloud.persist(next,[]);storageError=false;}
if(commit(next)){render();toast(`已匯入 ${imported.added} 本帳本，其中 ${imported.copies} 本為副本`);}
}catch(err){toast('匯入失敗：'+err.message);}
});
$('#sheet').addEventListener('close',()=>window.LedgerCloud.sync());
function theme(){const v=localStorage.getItem('dailyLedger.theme');if(v&&v!=='auto')document.documentElement.dataset.theme=v;else delete document.documentElement.dataset.theme;}
theme();render();
let activeKey=window.LedgerCloud.key();
window.LedgerCloud.start({get:()=>state,set:s=>{
try{M.validateBooks(s.books);storageError=false;state=s;}catch{storageError=true;state=empty();toast('帳號快取異常，已暫停同步。請先在設定下載原始快取。');}
if(activeKey!==window.LedgerCloud.key()){activeKey=window.LedgerCloud.key();ui.cat=ui.type=ui.pay='all';ui.query='';}
if(ui.cat!=='all'&&!book()?.categories.some(c=>c.id===ui.cat))ui.cat='all';render();
},empty,editing:()=>$('#sheet').open||storageError,toast});
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>toast('離線快取尚未啟用，請確認使用 HTTPS 或 localhost'));
