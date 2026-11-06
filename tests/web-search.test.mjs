import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createConfig, sessionConfig } from '../server/config.mjs';
import { createApiHandler } from '../server/api.mjs';
import { extractSearchResult } from '../server/web-search.mjs';

const sample = { output: [{ type: 'web_search_call', status: 'completed' }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'The answer is current.', annotations: [{ type: 'url_citation', title: 'Example', url: 'https://example.com/story' }, { type: 'url_citation', title: 'Bad', url: 'javascript:alert(1)' }] }] }] };

async function fixture(t, upstream, env={}) {
  const config=createConfig({OPENAI_API_KEY:'sk-local-test', PORT:'3000', ...env});
  const handler=createApiHandler(config, upstream);
  const server=createServer(async (req,res)=>{if (!await handler(req,res)) {res.writeHead(404);res.end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  t.after(()=>new Promise(done=>server.close(done)));
  const request=(query, headers={})=>fetch(`http://127.0.0.1:${server.address().port}/api/search`,{method:'POST',headers:{Origin:'http://localhost:3000','X-Silo-Client':'1','Content-Type':'application/json',...headers},body:JSON.stringify({query})});
  return {request,config};
}

test('search tool is enabled in Realtime sessions and is described for current information',()=>{
  const config=sessionConfig(createConfig({}));
  assert.equal(config.tools[0].name,'search_web');
  assert.equal(config.tool_choice,'auto');
  assert.match(config.instructions,/search_web/);
});

test('search runs via server-side Responses API without exposing API key or raw citations',async t=>{
  let request;
  const {request: post}=await fixture(t,async (url,options)=>{
    request={url,options};
    return Response.json(sample);
  });
  const res=await post('Latest launch news');
  assert.equal(res.status,200);
  const data=await res.json();
  assert.equal(data.answer,'The answer is current.');
  assert.deepEqual(data.sources,[{title:'Example',url:'https://example.com/story'}]);
  assert.equal(request.url,'https://api.openai.com/v1/responses');
  assert.equal(request.options.headers.Authorization,'Bearer sk-local-test');
  assert.equal(JSON.parse(request.options.body).tools[0].type,'web_search');
  assert.ok(!JSON.stringify(data).includes('sk-local-test'));
});

test('foreign origins cannot trigger paid web searches',async t=>{
  let calls=0;
  const {request}=await fixture(t,async()=>{calls++;return Response.json(sample)});
  const result=await request('Current time in London',{Origin:'https://attacker.invalid'});
  assert.equal(result.status,403);
  assert.equal(calls,0);
});

test('invalid queries are rejected before paid searches',async t=>{
  let calls=0;
  const {request}=await fixture(t,async()=>{calls++;return Response.json(sample)});
  assert.equal((await request(' ')).status,400);
  assert.equal((await request('x'.repeat(501))).status,400);
  assert.equal(calls,0);
});

test('upstream errors produce sanitized status without leaking keys',async t=>{
  const {request}=await fixture(t,async()=>Response.json({error:{message:'Key sk-local-test is wrong'}},{status:429}));
  const res=await request('A current fact');
  assert.equal(res.status,429);
  assert.match((await res.json()).error,/rate limit|billing|quota/i);
});

test('extractSearchResult drops dangerous URLs and deduplicates trusted sources',()=>{
  const result=extractSearchResult(sample);
  assert.equal(result.answer,'The answer is current.');
  assert.deepEqual(result.sources,[{title:'Example',url:'https://example.com/story'}]);
});
