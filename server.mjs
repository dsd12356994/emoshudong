import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { randomBytes, createHmac } from 'node:crypto';
import { SYSTEM_PROMPT, InputError, validateChat, birthContext } from './lib/domain.mjs';

const root = dirname(fileURLToPath(import.meta.url));
export function createApp(options = {}) {
  const env = options.env ?? process.env;
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  const dataDir = options.dataDir ?? join(root,'data');
  mkdirSync(dataDir,{recursive:true});
  const quotaFile = join(dataDir,'quota.json');
  let quota = {day:'', total:0, ips:{}, salt:randomBytes(32).toString('hex')};
  if (existsSync(quotaFile)) quota = JSON.parse(readFileSync(quotaFile,'utf8'));
  const inFlight = new Set();
  const upstream = options.upstream ?? 'https://api.deepseek.com/chat/completions';
  function number(name,fallback,max) { const n = Number(env[name] ?? fallback); if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`Invalid ${name}`); return n; }
  const globalLimit = number('DAILY_GLOBAL_LIMIT',100,10000);
  const ipLimit = number('DAILY_IP_LIMIT',30,1000);
  const tokens = number('MAX_OUTPUT_TOKENS',800,2000);
  const assets = new Map(['/','/app.js','/style.css','/favicon.svg'].map(url => [url,readFileSync(join(root,'public',url === '/' ? 'index.html' : url.slice(1)))]));
  const types = {'/':'text/html; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/style.css':'text/css; charset=utf-8','/favicon.svg':'image/svg+xml'};
  function send(res,status,data) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
  function reserve(ip) {
    const day = new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
    if (quota.day !== day) quota = {day,total:0,ips:{},salt:randomBytes(32).toString('hex')};
    const hash = createHmac('sha256',quota.salt).update(ip).digest('hex');
    if (quota.total >= globalLimit || (quota.ips[hash] ?? 0) >= ipLimit) return false;
    quota.total++; quota.ips[hash] = (quota.ips[hash] ?? 0)+1;
    writeFileSync(quotaFile+'.tmp',JSON.stringify(quota),{mode:0o600});
    renameSync(quotaFile+'.tmp',quotaFile);
    return true;
  }
  const server = http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    const url = new URL(req.url,'http://localhost');
    if (req.method === 'GET' && assets.has(url.pathname)) {res.writeHead(200,{'Content-Type':types[url.pathname]});return res.end(options.liveAssets ? readFileSync(join(root,'public',url.pathname === '/' ? 'index.html' : url.pathname.slice(1))) : assets.get(url.pathname));}
    if (req.method === 'GET' && url.pathname === '/api/status') return send(res,200,{ready:!!apiKey,provider:'DeepSeek',privatePreview:true});
    if (req.method !== 'POST' || !['/api/chat','/api/birth'].includes(url.pathname)) return send(res,404,{error:'没有找到这个页面。'});
    // Browser-only JSON calls, no CORS. Origin compares to the actual request authority.
    let originAllowed=true;
    try {if(req.headers.origin) originAllowed=new URL(req.headers.origin).host === req.headers.host;} catch {originAllowed=false;}
    if (req.headers['sec-fetch-site'] === 'cross-site' || !originAllowed) return send(res,403,{error:'请求来源不匹配。'});
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return send(res,415,{error:'请求格式必须为JSON。'});
    let bytes=0, chunks=[];
    try {
      for await (const chunk of req) {bytes+=chunk.length;if(bytes>90000) throw new InputError('内容太长了，请分几次说。');chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (url.pathname === '/api/birth') return send(res,200,{birth:birthContext(body)});
      const chat=validateChat(body);
      if (!apiKey) return send(res,503,{error:'树洞尚未接通模型，请等待站主配置。你的文字没有发送给模型。'});
      const ip=req.socket.remoteAddress ?? 'unknown';
      if (inFlight.has(ip) || inFlight.size >= 3) return send(res,429,{error:'上一段回应还在生成，请稍等。'});
      if (!reserve(ip)) return send(res,429,{error:'今天的对话额度已用完，请明天再来。'});
      inFlight.add(ip);
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),65000);
      const cancel=()=>{if(!res.writableEnded)controller.abort();};
      res.on('close',cancel);
      try {
        const context = `对话模式：${chat.mode === 'listen' ? '倾听' : '建议'}。${chat.birth ? '用户自愿提供的传统文化参考（不代表人格或关系事实）：'+JSON.stringify(chat.birth) : '未开启生辰参考，不主动引入命理。'}`;
        const response=await fetch(upstream,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model:env.DEEPSEEK_MODEL || 'deepseek-flash',messages:[{role:'system',content:SYSTEM_PROMPT+'\n'+context},...chat.messages],thinking:{type:'disabled'},stream:false,max_tokens:tokens,temperature:0.8})});
        if (!response.ok) {await response.body?.cancel();return send(res,502,{error:response.status === 402 ? '模型账户余额不足，请联系站主。' : '模型服务暂时不可用，请稍后重试。'});}
        const result=await response.json();
        const content=result.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) return send(res,502,{error:'这次没有收到有效回应，请重试。'});
        send(res,200,{content:content.slice(0,10000),truncated:result.choices?.[0]?.finish_reason === 'length'});
      } catch { if(!res.destroyed)send(res,504,{error:'这次回应超时或连接中断了。你可以稍后重试。'}); }
      finally {clearTimeout(timeout);res.off('close',cancel);inFlight.delete(ip);}
    } catch(error) {if(!res.headersSent && !res.destroyed)send(res,error instanceof InputError || error instanceof SyntaxError ? 400 : 500,{error:error instanceof InputError ? error.message : '请求没有完成，请稍后重试。'});}
  });
  server.requestTimeout=15000;
  server.headersTimeout=10000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.env.ENV_FILE) process.loadEnvFile(process.env.ENV_FILE);
  else if(existsSync(join(root,'.env'))) process.loadEnvFile(join(root,'.env'));
  const host=process.env.HOST || '127.0.0.1';
  const port=Number(process.env.PORT || 3080);
  createApp().listen(port,host,()=>console.log(`回声已启动 http://${host}:${port}`));
}
