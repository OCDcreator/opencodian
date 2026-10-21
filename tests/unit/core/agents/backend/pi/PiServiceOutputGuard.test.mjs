import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const service=new URL('../../../../../../assets/pi/service.mjs',import.meta.url).href;
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pi-output-regression-'));
const sdkRoot=path.join(scratch,'sdk');fs.mkdirSync(path.join(sdkRoot,'core'),{recursive:true});fs.mkdirSync(path.join(sdkRoot,'utils'));
fs.writeFileSync(path.join(sdkRoot,'package.json'),'{}');
fs.writeFileSync(path.join(sdkRoot,'core','settings-manager.js'),'export class FileSettingsStorage {}');
fs.writeFileSync(path.join(sdkRoot,'core','output-guard.js'),
 "let original;export function takeOverStdout(){original??=process.stdout.write.bind(process.stdout);process.stdout.write=process.stderr.write.bind(process.stderr);}export function isStdoutTakenOver(){return!!original;}");
fs.writeFileSync(path.join(sdkRoot,'index.js'),
 "import{spawnSync}from'node:child_process';import{isStdoutTakenOver}from'./core/output-guard.js';export const VERSION='fixture';export async function getAgentDir(){return '.';}export async function createAgentSessionServices(){spawnSync(process.execPath,['-e','console.log(\"OWNED_NPM_INSTALL_OUTPUT\")'],{stdio:isStdoutTakenOver()?['ignore',2,2]:'inherit'});}await createAgentSessionServices();");
// A startup import which performs package setup must have stdout guarded before
// it runs. This fixture intentionally exits before constructing a fake AgentSession.
function probe(file){return new Promise(resolve=>{const src="import{startPiService}from"+JSON.stringify(service)+";try{await startPiService("+JSON.stringify(file)+",{workingDirectory:process.cwd(),sessionDirectory:process.cwd()});}catch{}process.stdout.write('SIDE_EFFECT_AFTER_STARTUP');";const child=spawn(process.execPath,['--input-type=module','--eval',src],{cwd:scratch,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('exit',code=>resolve({code,out,err}));});}
test('keeps SDK package-install output away from JSONL stdout before startup',async()=>{const r=await probe(path.join(sdkRoot,'index.js'));assert.equal(r.code,0);assert.equal(r.out.includes('OWNED_NPM_INSTALL_OUTPUT'),false);assert.equal(r.err.includes('OWNED_NPM_INSTALL_OUTPUT'),true);});

// Use the production embedded bootstrap, including its error framing, after
// stdout takeover rather than asserting generated source text.
test('rejects a protected service startup failure through JSONL',async()=>{
 const pkg=path.join(scratch,'bootstrap-sdk');fs.mkdirSync(path.join(pkg,'dist'),{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@mariozechner/pi-coding-agent',bin:{pi:'dist/cli.js'}}));fs.writeFileSync(path.join(pkg,'dist','cli.js'),'');fs.writeFileSync(path.join(pkg,'dist','index.js'),'');
 const binary=path.join(pkg,'dist','pi');fs.symlinkSync(path.join(pkg,'dist','cli.js'),binary);const executable=path.join(pkg,'dist',process.platform==='win32'?'node.exe':'node');fs.symlinkSync(process.execPath,executable);
 const outfile=path.join(scratch,'client.cjs');const source="export async function startPiService(){process.stdout.write=process.stderr.write.bind(process.stderr);throw new Error('OWNED_STARTUP_FAILURE');}";
 await build({entryPoints:[new URL('../../../../../../src/core/agents/backend/pi/PiRpcClient.ts',import.meta.url).pathname],outfile,bundle:true,platform:'node',format:'cjs',define:{PI_SERVICE_SOURCE:JSON.stringify(source)},logLevel:'silent'});
 const require=createRequire(import.meta.url);const {PiRpcClient}=require(outfile);const client=new PiRpcClient({workingDirectory:scratch,sessionDirectory:scratch,executablePath:binary});
 try{await assert.rejects(client.request({type:'get_state'},1000),/OWNED_STARTUP_FAILURE/);}finally{client.close();}
});
