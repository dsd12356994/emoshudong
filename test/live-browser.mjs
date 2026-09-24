// Explicit smoke test; sends one synthetic message to the configured paid provider.
import {chromium} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const browser=await chromium.launch({channel:'msedge',headless:true});
const base=process.env.TEST_URL || 'http://127.0.0.1:3180';
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);
 await page.getByText('对话只暂存在当前页面，刷新或关闭会清除。',{exact:true}).waitFor();
 await page.screenshot({path:fileURLToPath(new URL('../test-results/live-desktop.png',import.meta.url)),fullPage:true});
 await page.locator('#message').fill('今天有一点累，想找个地方说说。请简短回应。');
 await page.locator('#consent').check();
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/chat'),{timeout:75000});
 await page.locator('#send').click();
 const response=await responsePromise;
 if(response.status()!==200)throw new Error('Live model request failed: '+response.status());
 await page.locator('.message.assistant .message-body:not(.pending)').waitFor();
 const reply=await page.locator('.message.assistant .message-body').textContent();
 if(!reply || reply.length<5 || errors.length)throw new Error('Invalid live reply or browser error');
 await page.screenshot({path:fileURLToPath(new URL('../test-results/live-conversation.png',import.meta.url)),fullPage:true});
 console.log(JSON.stringify({endpoint:base,status:response.status(),reply,browserErrors:errors}));
}finally{await browser.close();}
