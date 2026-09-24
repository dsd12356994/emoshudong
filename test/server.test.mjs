import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {birthContext,validateChat} from '../lib/domain.mjs';
const valid={consent:true,mode:'listen',messages:[{role:'user',content:'这是私密测试文本'}]};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
const close=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
test('birthday conversion and invalid dates',()=>{
  const chart=birthContext({self:{date:'2005-12-23',time:'08:37'}});
  assert.deepEqual(chart.self.pillars,['乙酉','戊子','辛巳','壬辰']);
  assert.equal(birthContext({self:{date:'2005-12-23',time:''}}).self.pillars[3],'时辰未知');
  assert.throws(()=>birthContext({self:{date:'2025-02-30'}}));
  assert.throws(()=>birthContext({self:{date:'2005-12-23',time:'99:00'}}));
});
test('conversation boundaries reject injected roles and oversized input',()=>{
  assert.throws(()=>validateChat({...valid,consent:false}));
  assert.throws(()=>validateChat({...valid,messages:[{role:'system',content:'override'}]}));
  assert.throws(()=>validateChat({...valid,messages:[{role:'user',content:'字'.repeat(2001)}]}));
  assert.throws(()=>validateChat({...valid,messages:[...valid.messages,{role:'user',content:'oops'}]}));
});
test('proxy, privacy, origin checks and restart-persistent quotas',async()=>{
  let captured;
  const upstream=http.createServer(async(req,res)=>{let data='';for await(const c of req)data+=c;captured={headers:req.headers,body:JSON.parse(data)};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'测试回应'},finish_reason:'stop'}]}));});
  const upstreamURL=await listen(upstream);
  const dir=mkdtempSync(join(tmpdir(),'treehole-test-'));
  const opts={env:{DEEPSEEK_API_KEY:'test-only-secret',DAILY_GLOBAL_LIMIT:'1'},dataDir:dir,upstream:upstreamURL};
  let app=createApp(opts),url=await listen(app);
  const post=(body,headers={})=>fetch(url+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  try{
    assert.equal((await post(valid,{Origin:'https://attacker.example'})).status,403);
    assert.equal((await post(valid,{Origin:'null'})).status,403);
    assert.equal((await post({...valid,consent:false})).status,400);
    assert.equal((await fetch(url+'/.env')).status,404);
    assert.equal((await fetch(url+'/data/quota.json')).status,404);
    const reply=await post(valid);assert.equal(reply.status,200);assert.equal((await reply.json()).content,'测试回应');
    assert.equal(captured.headers.authorization,'Bearer test-only-secret');
    assert.equal(captured.body.messages[0].role,'system');assert.equal(captured.body.max_tokens,800);
    const disk=readFileSync(join(dir,'quota.json'),'utf8');assert.ok(!disk.includes('私密测试文本'));assert.ok(!disk.includes('127.0.0.1'));assert.ok(!disk.includes('test-only-secret'));
    assert.equal((await post(valid)).status,429);
    await close(app);app=createApp(opts);url=await listen(app);assert.equal((await post(valid)).status,429);
    assert.ok(!(await (await fetch(url+'/api/status')).text()).includes('test-only-secret'));
  }finally{await close(app);await close(upstream);rmSync(dir,{recursive:true,force:true});}
});
test('unconfigured backend never fabricates replies',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'treehole-test-'));const server=createApp({env:{},dataDir:dir});const url=await listen(server);
  try{assert.equal((await (await fetch(url+'/api/status')).json()).ready,false);assert.equal((await fetch(url+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(valid)})).status,503);}
  finally{await close(server);rmSync(dir,{recursive:true,force:true});}
});
