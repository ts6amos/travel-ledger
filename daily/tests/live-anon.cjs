const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','cloud-config.js'),'utf8'),ctx);
(async()=>{
const cfg=ctx.window.DAILY_CLOUD;
for(const name of['daily_ledger_read','daily_ledger_write']){
const response=await fetch(cfg.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify(name.endsWith('write')?{expected_revision:0,new_books:[]}:{})});
if(![401,403].includes(response.status))throw new Error(name+' anonymous request must be rejected, received '+response.status);
console.log(name+': anonymous access correctly rejected ('+response.status+')');
}
})().catch(e=>{console.error(e.message);process.exit(1);});
