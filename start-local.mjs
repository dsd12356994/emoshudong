import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './server.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const config = process.env.ENV_FILE || (existsSync(join(root,'.env')) ? join(root,'.env') : join(homedir(),'.config','shudong','.env'));
if (existsSync(config)) process.loadEnvFile(config);
// Local development never inherits the deployment binding or port.
const host='127.0.0.1';
const port=Number(process.env.LOCAL_PORT || 3180);
createApp({liveAssets:true}).listen(port,host,()=>console.log(`Local treehole ready: http://${host}:${port}`));
