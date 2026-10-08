import { PiAdapter } from "../../../../../../src/core/agents/backend/pi/PiAdapter";
import { PiAuxQuerySession } from "../../../../../../src/core/agents/backend/pi/PiAuxQuerySession";

describe('Pi auxiliary provider domain environment',()=>{
 it('passes the live domain callback to the auxiliary factory without a stale snapshot',async()=>{
  let current={PI_CODING_AGENT_DIR:'/owned/first'};const getExtraEnv=()=>current;
  const rejected=new Error('factory boundary');const create=jest.spyOn(PiAuxQuerySession,'create').mockRejectedValue(rejected);
  const adapter=new PiAdapter({workingDirectory:'/owned/vault',getExtraEnv});
  try{await expect(adapter.startAuxQuerySession({systemPrompt:'Read only',workingDirectory:'/owned/vault'})).rejects.toBe(rejected);
   const options=create.mock.calls[0][0] as typeof create.mock.calls[0][0]&{getExtraEnv?:()=>Record<string,string>};
   expect(options.getExtraEnv).toBe(getExtraEnv);current={PI_CODING_AGENT_DIR:'/owned/second'};expect(options.getExtraEnv?.()).toEqual(current);
  }finally{adapter.dispose();create.mockRestore();}
 });
});
