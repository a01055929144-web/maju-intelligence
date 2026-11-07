import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
assert.equal(process.env.STAGE_A_INTEGRATION, 'isolated');
assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:3001');
assert.equal(process.env.PGDATABASE, 'maju_stage_a_integration');
const secret = process.env.PGRST_JWT_SECRET;
assert(secret?.length >= 32);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const parts = `${encode({alg:'HS256',typ:'JWT'})}.${encode({role:'service_role',exp:Math.floor(Date.now()/1000)+7200})}`;
const key = `${parts}.${createHmac('sha256',secret).update(parts).digest('base64url')}`;
// The throwaway service JWT remains in process memory; never print or persist it.
for (let attempt=0; attempt<30; attempt++) {
  const response = await fetch('http://127.0.0.1:3002/product_catalog?select=id&limit=1', {headers:{Authorization:`Bearer ${key}`}}).catch(()=>null);
  if (response?.ok) break;
  if (attempt===29) throw new Error('Isolated PostgREST schema is not ready');
  await new Promise(resolve=>setTimeout(resolve,500));
}
// This is only a path-prefix gateway. Every core REST request reaches real PostgREST/PG17.
const gateway = http.createServer((request, response) => {
  if (!request.url?.startsWith('/rest/v1/')) { response.writeHead(404).end(); return; }
  const upstream = http.request({ hostname: '127.0.0.1', port: 3002,
    path: request.url.slice('/rest/v1'.length), method: request.method, headers: { ...request.headers, host: '127.0.0.1:3002' } }, result => {
    response.writeHead(result.statusCode || 502, result.headers); result.pipe(response);
  });
  upstream.on('error', () => { response.writeHead(502).end('Isolated REST unavailable'); });
  request.pipe(upstream);
});
await new Promise(resolve => gateway.listen(3001, '127.0.0.1', resolve));
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3101'], { stdio: 'inherit', env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: key, CI_LAYOUT_FIXTURES: 'disabled' } });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { app.kill(signal); gateway.close(); });
app.on('exit', code => { gateway.close(); process.exit(code || 0); });
