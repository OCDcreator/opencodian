// Real current-generation Pi acceptance. Uses only a local fixture provider.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const clientDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-modern-client-'));
const clientFile = process.env.PI_ACCEPTANCE_CLIENT || path.join(clientDirectory, 'client.cjs');
if (!process.env.PI_ACCEPTANCE_CLIENT) {
  const { build } = await import('esbuild');
  const { bundlePiServiceSource } = await import('./build-utils.mjs');
  await build({ entryPoints: ['src/core/agents/backend/pi/PiRpcClient.ts'], outfile: clientFile, bundle: true,
    platform: 'node', format: 'cjs', define: { PI_SERVICE_SOURCE: JSON.stringify(bundlePiServiceSource()) } });
}
const { PiRpcClient, resolvePiCommand } = require(clientFile);
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pi-windows-acceptance-'));
 const agentDirectory=path.join(directory,'agent');fs.mkdirSync(agentDirectory);
 const server=http.createServer(async(req,res)=>{
  for await(const chunk of req){};
  res.writeHead(200,{'content-type':'text/event-stream'});
  res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',model:'fixture',choices:[{index:0,delta:{role:'assistant',content:'PI_WINDOWS_OK'},finish_reason:null}]})+'\n\n');
  res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:4,total_tokens:24}})+'\n\n');
  res.end('data: [DONE]\n\n');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const model={id:'fixture',name:'Fixture',reasoning:false,input:['text'],contextWindow:10000,maxTokens:1000,cost:{input:1,output:2,cacheRead:0,cacheWrite:0}};
 fs.writeFileSync(path.join(agentDirectory,'models.json'),JSON.stringify({providers:{audit:{baseUrl:'http://127.0.0.1:'+server.address().port+'/v1',api:'openai-completions',apiKey:'test-only',models:[model]}}}));
 fs.writeFileSync(path.join(agentDirectory,'settings.json'),JSON.stringify({defaultProvider:'audit',defaultModel:'fixture',compaction:{enabled:false}}));
 const options={workingDirectory:directory,sessionDirectory:path.join(directory,'sessions'),agentDirectory,executablePath:process.env.PI_SMOKE_EXECUTABLE || ''};
 const report={passed:false,resolution:resolvePiCommand(options.executablePath),checks:[]};let client,config;
 try{
  config=new PiRpcClient({...options,configurationOnly:true});
  let settings=await config.request({type:'get_configuration'});assert(settings.sdkVersion);report.sdkVersion=settings.sdkVersion;report.checks.push('configuration');
  let models=await config.request({type:'get_model_configuration'});
  models=await config.request({type:'save_model_configuration',revision:models.revision,value:models.value});assert.equal(models.value.providers.audit.models[0].id,'fixture');report.checks.push('model-save-validates-native-sdk');
  await assert.rejects(config.request({type:'save_model_configuration',revision:models.revision,value:{providers:{bad:{models:[{id:'broken',contextWindow:-1}]}}}}));report.checks.push('invalid-model-rejected');
  client=new PiRpcClient(options);
  for(const type of ['get_state','get_available_models','get_tools','get_commands','get_resources','get_auth','get_queue','get_messages','get_session_stats']){await client.request({type});report.checks.push(type);}
  const auth=await client.request({type:'get_auth'});report.oauthProviders=auth.oauthProviders.length;
  await client.request({type:'set_api_key',provider:'audit',apiKey:'fixture-stored-key'});
  assert.equal(JSON.parse(fs.readFileSync(path.join(agentDirectory,'auth.json'),'utf8')).audit.key,'fixture-stored-key');report.checks.push('api-key-persisted');
  await client.request({type:'logout',provider:'audit'});assert(!JSON.parse(fs.readFileSync(path.join(agentDirectory,'auth.json'),'utf8')).audit);report.checks.push('logout-persisted');
  await client.request({type:'new_session'});
  await client.request({type:'prompt',message:'Reply with fixture marker'},30000);
  const reply=await client.request({type:'get_last_assistant_text'});assert.equal(reply.text,'PI_WINDOWS_OK');report.checks.push('prompt-stream-and-reply');
  const state=await client.request({type:'get_state'});assert(state.sessionFile);report.checks.push('session-persisted');
  await client.request({type:'clone'});report.checks.push('clone');
  await client.request({type:'reload'});report.checks.push('reload');
  report.passed=true;
 }catch(e){report.error=e.stack;process.exitCode=1;}
 finally{client?.close();config?.close();server.closeAllConnections();server.close();}
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
