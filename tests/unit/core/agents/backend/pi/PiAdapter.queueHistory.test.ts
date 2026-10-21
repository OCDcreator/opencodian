import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { PiAdapter } from "../../../../../../src/core/agents/backend/pi/PiAdapter";
import { PI_CONFIG_COMMANDS, PI_RPC_COMMANDS, PI_SDK_COMMANDS } from "../../../../../../src/core/agents/backend/pi/PiProtocol";
import type { PiLaunchOptions, PiRecord, PiRpcPort } from "../../../../../../src/core/agents/backend/pi/PiRpcClient";
import { toPiChatMessages } from "../../../../../../src/core/agents/backend/pi/PiStreamMapper";
import type { ChatMessage, Conversation, StreamChunk } from "../../../../../../src/core/types/chat";
import { buildLocalStreamOutcome } from "../../../../../../src/features/chat/runtime/buildLocalStreamOutcome";
import type { SendPipelineTabRuntime, StreamChunkRouterResult } from "../../../../../../src/features/chat/runtime/SendPipelineTypes";
import { mergePiNativeConversationMessages } from '../../../../../../src/features/chat/services/ConversationAuthoritativeMessageMergeCoordinator';
import type { PreparedMessageSend } from "../../../../../../src/features/chat/services/MessageSendPreparationService";

const nativeRows: PiRecord[] = [
 {id:'prior-user',role:'user',content:'Prior'}, {id:'prior-assistant',role:'assistant',content:[{type:'text',text:'Prior answer'}],provider:'krill-gpt',model:'gpt-5.6-luna',timestamp:2},
 {id:'primary-user',role:'user',content:'Primary',timestamp:3}, {id:'primary-assistant',role:'assistant',content:[{type:'text',text:'Primary answer'}],provider:'krill-gpt',model:'gpt-6.1-sol',timestamp:4},
 {id:'queued-user',role:'user',content:'Queued',timestamp:5}, {id:'queued-assistant',role:'assistant',content:[{type:'text',text:'Queued answer'}],provider:'krill-gpt',model:'gpt-6.1-sol',timestamp:6},
];
class QueuedClient implements PiRpcPort {
 listeners=new Set<(event:PiRecord)=>void>();prompted=false;
 constructor(private options:PiLaunchOptions){}
 subscribe(fn:(event:PiRecord)=>void){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 close(){}
 async request(c:PiRecord):Promise<PiRecord>{
  if(c.type==='get_state')return {serviceProtocol:1,commands:[...PI_RPC_COMMANDS,...PI_SDK_COMMANDS,...PI_CONFIG_COMMANDS],sessionFile:this.options.sessionPath,model:{provider:'krill-gpt',id:'gpt-6.1-sol',contextWindow:200000},isStreaming:false};
  if(c.type==='get_messages')return {entries:this.prompted?nativeRows:nativeRows.slice(0,2),messages:[{role:'assistant',stopReason:'stop'}]};
  if(c.type==='get_session_stats')return {tokens:{},cost:0,contextUsage:{tokens:0,contextWindow:200000}};
  if(c.type==='get_last_assistant_text')return {text:'Queued answer'};
  if(c.type==='prompt'){this.prompted=true;for(const text of ['Primary answer','Queued answer']){for(const fn of this.listeners)fn({type:'message_start',message:{role:'assistant'}});for(const fn of this.listeners)fn({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:text}});}return {};}
  return {};
 }
}
function outcome(backend:Conversation['backend'],status:Partial<StreamChunkRouterResult>={}){
 const conversation:Conversation={id:'c',title:'C',createdAt:1,updatedAt:1,backend,backendSessionId:'s',messages:[]};
 const prepared={conversation,activeModelId:'krill-gpt/gpt-6.1-sol'} as PreparedMessageSend;
 const runtime:SendPipelineTabRuntime={isStreaming:false,streamingMessageEl:document.createElement('div'),streamingContentEl:document.createElement('div'),pendingEditedFiles:new Set(),pendingQuestionResolution:null,isConversationSyncInFlight:false};
 const routed:StreamChunkRouterResult={streamCompleted:true,streamInterrupted:false,streamTimedOut:false,latestErrorMessage:null,finalizedAssistantMetadata:null,finalizedBackendSessionId:null,logAssistantFinalizationStage:jest.fn(),resetStreamingState:jest.fn(),cleanupPendingIndicator:jest.fn(),...status};
 return buildLocalStreamOutcome({preparedSend:prepared,runtime,streamController:null,routedStream:routed});
}
describe('Pi native queued transcript regression',()=>{
 it('binds the UI request to the first new native user, excluding prior and queued users',async()=>{
  const sessionDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'opencodian-pi-queue-history-'));
  const adapter=new PiAdapter({workingDirectory:sessionDirectory,sessionDirectory,createClient:o=>new QueuedClient(o)});
  try{const id=await adapter.createSession('Owned regression');const chunks:StreamChunk[]=[];for await(const c of adapter.sendMessage({sessionId:id,content:'Primary'}))chunks.push(c);expect(chunks.filter(c=>c.type==='user_message_identity')).toEqual([{type:'user_message_identity',uuid:'primary-user',sessionId:id}]);}finally{adapter.dispose();for(const file of fs.readdirSync(sessionDirectory)){const created=path.join(sessionDirectory,file);expect(fs.statSync(created).isFile()).toBe(true);fs.unlinkSync(created);}fs.rmdirSync(sessionDirectory);}
 });
 it('retains actual provider/model identity in native history',()=>{expect(toPiChatMessages(nativeRows)[3]).toMatchObject({id:'primary-assistant',sourceMessageId:'primary-assistant',modelId:'krill-gpt/gpt-6.1-sol'});});
 it('schedules successful Pi transcript reconciliation',()=>{expect(outcome('pi').shouldSyncFromServer).toBe(true);});
 it.each([{streamTimedOut:true},{streamInterrupted:true},{latestErrorMessage:'Failed'}])('keeps failed/interrupted Pi streams local %j',status=>{expect(outcome('pi',status).shouldSyncFromServer).toBe(false);});
 it.each(['codex','claude-code','zcode'] as const)('keeps %s on its existing finalization path',backend=>{expect(outcome(backend).shouldSyncFromServer).toBe(false);});
 it('replaces joined queued blocks and repairs a cached source ID belonging to another native user',()=>{
  const local:ChatMessage[]=[{id:'local-primary',sourceMessageId:'queued-user',role:'user',content:'Primary',timestamp:3},{id:'queued-assistant',sourceMessageId:'queued-assistant',role:'assistant',content:'Primary answerQueued answer',timestamp:6,contentBlocks:[{type:'text',text:'Primary answerQueued answer'}],toolCalls:[{id:'old-tool',name:'write',input:{},status:'error'}]}];
  const before=JSON.stringify(local);const native:ChatMessage[]=[{id:'primary-user',sourceMessageId:'primary-user',role:'user',content:'Primary',timestamp:3},{id:'primary-assistant',sourceMessageId:'primary-assistant',role:'assistant',content:'Primary answer',timestamp:4,contentBlocks:[{type:'text',text:'Primary answer'}]},{id:'queued-user',sourceMessageId:'queued-user',role:'user',content:'Queued',timestamp:5},{id:'queued-assistant',sourceMessageId:'queued-assistant',role:'assistant',content:'Queued answer',timestamp:6,contentBlocks:[{type:'text',text:'Queued answer'}]}];
  const merged=mergePiNativeConversationMessages(local,native);expect(merged).toHaveLength(4);expect(merged[0]).toMatchObject({id:'local-primary',sourceMessageId:'primary-user',content:'Primary'});expect(merged[2].content).toBe('Queued');expect(merged[3].contentBlocks).toEqual([{type:'text',text:'Queued answer'}]);expect(merged[3].toolCalls).toBeUndefined();expect(JSON.stringify(local)).toBe(before);
 });
 it('keeps local SDK command input without reusing its stale native identity',()=>{
  const local:ChatMessage[]=[{id:'local-primary',sourceMessageId:'primary-user',role:'user',content:'Primary',timestamp:3},{id:'local-command',sourceMessageId:'primary-user',role:'user',content:'/owned-plan on',timestamp:4},{id:'notice',role:'assistant',content:'Local notice',timestamp:6,displayStyle:'notice'}];
  const native:ChatMessage[]=[{id:'primary-user',sourceMessageId:'primary-user',role:'user',content:'Primary',timestamp:3},{id:'primary-assistant',sourceMessageId:'primary-assistant',role:'assistant',content:'Primary answer',timestamp:5}];
  const merged=mergePiNativeConversationMessages(local,native);expect(merged[0].id).toBe('local-primary');expect(merged[1]).toMatchObject({id:'local-command',content:'/owned-plan on'});expect(merged[1].sourceMessageId).toBeUndefined();expect(merged.at(-1)?.id).toBe('notice');
 });
});


describe('Pi canonical tool cards retain native terminal state', () => {
 it.each([true, false])('renders the native tool result rather than running (isError=%s)', isError => {
  const result = isError ? 'Owned acceptance permission denied' : 'Owned write completed';
  const mapped = toPiChatMessages([{ id: 'native-assistant', role: 'assistant', content: [{ type: 'toolCall', id: 'owned-tool', name: 'write', arguments: { path: 'owned.txt', content: 'CONTROL\n' } }] }, { id: 'native-result', role: 'toolResult', toolCallId: 'owned-tool', isError, content: [{ type: 'text', text: result }], details: { exitCode: isError ? 1 : 0 } }]);
  const toolBlock = mapped[0].contentBlocks?.find(block => block.type === 'tool_use');
  expect(toolBlock).toMatchObject({ toolId: 'owned-tool', toolStatus: isError ? 'error' : 'completed', toolResult: result + '\n\n' + JSON.stringify({ exitCode: isError ? 1 : 0 }, null, 2), toolMetadata: { exitCode: isError ? 1 : 0 } });
  expect(mapped[0].toolCalls?.[0].status).toBe(toolBlock?.toolStatus);
 });
});
