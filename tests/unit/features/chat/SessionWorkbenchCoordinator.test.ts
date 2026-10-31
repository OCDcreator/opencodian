import type { AgentServiceRegistry } from '../../../../src/core/agents/backend/AgentServiceRegistry';
import type { AgentGoalEvent, AgentGoalReadback } from '../../../../src/core/agents/backend/BackendGoalRuntime';
import type { Conversation } from '../../../../src/core/types';
import { SessionWorkbenchCoordinator, type SessionWorkbenchHost, type WorkbenchSession } from '../../../../src/features/chat/services/conversation/SessionWorkbenchCoordinator';
import { t } from '../../../../src/i18n';

const ready = (objective?: string): AgentGoalReadback => ({status:'ready', observedAt:1, goal: objective ? {
  backend:'opencode2', sessionId:'s1', source:'native', driver:'native', objective, status:'active', rawStatus:'active', execution:'running',
} : null});
const session = (tabId: string, id: string): WorkbenchSession => ({tabId, backend:'opencode2', streaming:false, todos:[], backgroundTasks:[], resources:[],
  conversation:{id, title:id, backend:'opencode2', backendSessionId:id==='c1'?'s1':'s2', createdAt:1, updatedAt:1, messages:[]} as Conversation});
const flush = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };

describe('Goal composer ownership and confirmation', () => {
  let sessions: WorkbenchSession[], active: number, root: HTMLElement, slot: HTMLElement, summary: HTMLElement;
  let listener: (event: AgentGoalEvent) => void;
  let coordinator: SessionWorkbenchCoordinator;
  let host: SessionWorkbenchHost;
  let storage: Map<string, unknown>;
  const read = jest.fn<Promise<AgentGoalReadback>, [string]>();
  const control = jest.fn();
  beforeEach(async () => {
    sessions=[session('t1','c1'),session('t2','c2')]; active=0;
    root=document.body.createDiv(); slot=root.createDiv(); summary=root.createDiv();
    const service={getGoalCapabilities:()=>({source:'native',driver:'native',actions:['set','edit','pause','resume','clear'],pauseMode:'goal',editMode:'replace',budgets:[]}),
      readSessionGoal:read, controlSessionGoal:control, subscribeToGoalEvents:(handler:typeof listener)=>{listener=handler;return {dispose:jest.fn()};}};
    read.mockResolvedValue(ready()); control.mockResolvedValue({status:'confirmed',readback:ready('Original')});
    storage = new Map();
    const app = { scope: new Scope(), keymap: { pushScope: jest.fn(), popScope: jest.fn() },
      loadLocalStorage: (key: string) => storage.get(key), saveLocalStorage: (key: string, value: unknown) => storage.set(key, value) } as unknown as App;
    host={app,getActiveSession:()=>sessions[active],getSessions:()=>sessions,
      getRegistry:()=>({get:(kind:string)=>kind==='opencode2'?service:undefined}) as unknown as AgentServiceRegistry,
      getGoalSlot:()=>slot,getSummaryMount:()=>summary,getComposerShell:()=>null,attachFiles:jest.fn(),mountTools:jest.fn(),updateTools:jest.fn(),
      syncTranscript:jest.fn(async()=>{}),focusComposer:jest.fn(),openMessage:jest.fn(),openResource:jest.fn(),notify:jest.fn()};
    coordinator=new SessionWorkbenchCoordinator(host);
    coordinator.mount(root); await flush();
  });
  afterEach(()=>{coordinator.destroy();root.remove();jest.clearAllMocks();});

  it('keeps the draft pending until matching native state arrives', async()=>{
    slot.querySelector('button')!.click();
    const acknowledge=jest.fn();
    expect(coordinator.prepareGoalSend('Exact objective',acknowledge)).toBe('Exact objective');
    coordinator.onSendPreparation('t1','accepted'); await flush();
    expect(acknowledge).not.toHaveBeenCalled();
    listener({type:'state',sessionId:'s1',readback:ready('Other objective')});
    expect(acknowledge).not.toHaveBeenCalled();
    listener({type:'state',sessionId:'s1',readback:ready('Exact objective')});
    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledWith('accepted');
    expect(coordinator.isArmed()).toBe(false);
  });

  it('toggles explicit Goal intent and returns to a neutral unpressed icon when cancelled', () => {
    const button=slot.querySelector('button')!;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.dataset.goalTone).toBe('muted');
    expect(button.querySelector('svg')?.getAttribute('data-icon')).toBe('opencodian-goal-target');
    button.click();
    expect(coordinator.isArmed()).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.dataset.goalTone).toBe('info');
    expect(button.querySelector('svg')?.getAttribute('data-icon')).toBe('opencodian-goal-target-fill');
    button.click();
    expect(coordinator.isArmed()).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.dataset.goalTone).toBe('muted');
    expect(control).not.toHaveBeenCalled();
  });

  it.each([
    {status:'active',tone:'info',pressed:true},
    {status:'paused',tone:'muted',pressed:true},
    {status:'blocked',tone:'warning',pressed:true},
    {status:'limited',tone:'warning',pressed:true},
    {status:'complete',tone:'success',pressed:false},
    {status:'waiting',tone:'warning',pressed:true},
    {status:'unknown',tone:'muted',pressed:true},
  ] as const)('projects a $status native Goal separately from local arm intent', ({status,tone,pressed}) => {
    const readback=ready('Native objective');readback.goal!.status=status;
    listener({type:'state',sessionId:'s1',readback});
    const button=slot.querySelector('button')!;
    expect(coordinator.isArmed()).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe(String(pressed));
    expect(button.dataset.goalTone).toBe(tone);
    expect(button.querySelector('svg')?.getAttribute('data-icon')).toBe('opencodian-goal-target-fill');
    button.click();
    expect(root.querySelector('.opencodian-workbench-panel')?.hasAttribute('hidden')).toBe(false);
    expect(coordinator.isArmed()).toBe(false);
    expect(control).not.toHaveBeenCalled();
  });

  it('preserves composer pointer focus only for the local Goal arm toggle', () => {
    const button=slot.querySelector('button')!;
    const mouse=new MouseEvent('mousedown',{cancelable:true});button.dispatchEvent(mouse);
    expect(mouse.defaultPrevented).toBe(true);
    const touch=new Event('pointerdown',{cancelable:true});Object.defineProperty(touch,'pointerType',{value:'touch'});
    button.dispatchEvent(touch);expect(touch.defaultPrevented).toBe(true);
    listener({type:'state',sessionId:'s1',readback:ready('Manage an existing goal')});
    const manage=new MouseEvent('mousedown',{cancelable:true});button.dispatchEvent(manage);
    expect(manage.defaultPrevented).toBe(false);
  });

  it('keeps stopped or disarmed native execution muted without discarding the Goal', () => {
    const stopped=ready('Retained objective');stopped.goal!.execution='stopped';
    listener({type:'state',sessionId:'s1',readback:stopped});
    expect(slot.querySelector('button')!.dataset.goalTone).toBe('muted');
    expect(slot.querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
    listener({type:'state',sessionId:'s1',readback:{...stopped,goal:{...stopped.goal!,execution:'idle',armed:false}}});
    expect(slot.querySelector('button')!.dataset.goalTone).toBe('muted');
  });

  it('does not accept another session’s late event after a tab is reused', ()=>{
    slot.querySelector('button')!.click();
    const acknowledge=jest.fn(); coordinator.prepareGoalSend('Exact objective',acknowledge);
    sessions[0]=session('t1','replacement'); coordinator.refresh();
    listener({type:'state',sessionId:'s1',readback:ready('Exact objective')});
    expect(acknowledge).not.toHaveBeenCalled();
    expect(root.querySelector('.opencodian-workbench-objective')?.textContent).not.toBe('Exact objective');
  });

  it('stops the originating Goal when the active tab changes during its read', async()=>{
    let resolve!: (value:AgentGoalReadback)=>void;
    read.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
    const stopping=coordinator.stopActiveGoal(); active=1; coordinator.refresh();
    resolve(ready('Original')); await stopping;
    expect(control).toHaveBeenCalledWith('s1',{action:'pause'});
    expect(control).not.toHaveBeenCalledWith('s2',expect.anything());
  });

  it('preserves an objective and displays the native error after a failed clear', async()=>{
    listener({type:'state',sessionId:'s1',readback:ready('Original')});
    control.mockResolvedValueOnce({status:'failed',readback:{status:'failed',goal:ready('Original').goal,reason:'Permission denied'}});
    await coordinator.controlGoal({action:'clear'});
    expect(root.textContent).toContain('Original');
    expect(root.textContent).toContain('Permission denied');
  });

  it('opens a completed Goal from the composer icon without arming another submission', () => {
    const completed = ready('Completed objective'); completed.goal!.status = 'complete';
    listener({type:'state',sessionId:'s1',readback:completed});
    slot.querySelector('button')!.click();
    expect(coordinator.isArmed()).toBe(false);
    expect(root.querySelector('.opencodian-workbench-panel')?.hasAttribute('hidden')).toBe(false);
  });

  it('dismisses a completed row across reload while retaining native state and its details entry', async () => {
    const completed = ready('Completed objective'); completed.goal!.status = 'complete'; completed.goal!.id = 'g1';
    listener({type:'state',sessionId:'s1',readback:completed});
    const row = () => summary.querySelector<HTMLElement>('.opencodian-composer-goal-summary')!;
    summary.querySelector<HTMLButtonElement>('.opencodian-goal-dismiss')!.click();
    expect(row().hidden).toBe(true);
    expect(control).not.toHaveBeenCalled();
    read.mockResolvedValue(completed);
    coordinator.destroy(); coordinator = new SessionWorkbenchCoordinator(host); coordinator.mount(root); await flush();
    expect(row().hidden).toBe(true);
    slot.querySelector('button')!.click();
    expect(root.querySelector('.opencodian-workbench-objective')?.textContent).toBe('Completed objective');
    expect(coordinator.isArmed()).toBe(false);
    expect(control).not.toHaveBeenCalled();
  });

  it('binds dismissal to the native Goal and shows resumed or new Goals again', () => {
    const completed = ready('Same objective'); completed.goal!.status = 'complete'; completed.goal!.id = 'g1';
    listener({type:'state',sessionId:'s1',readback:completed});
    summary.querySelector<HTMLButtonElement>('.opencodian-goal-dismiss')!.click();
    const row = () => summary.querySelector<HTMLElement>('.opencodian-composer-goal-summary')!;
    expect(row().hidden).toBe(true);
    const next = { ...completed, goal: { ...completed.goal!, id: 'g2' } };
    listener({type:'state',sessionId:'s1',readback:next});
    expect(row().hidden).toBe(false);
    summary.querySelector<HTMLButtonElement>('.opencodian-goal-dismiss')!.click();
    listener({type:'state',sessionId:'s1',readback:{...next,goal:{...next.goal,status:'active'}}});
    expect(row().hidden).toBe(false);
    expect(summary.querySelector('.opencodian-goal-dismiss')).toBeNull();
    listener({type:'state',sessionId:'s1',readback:next});
    expect(row().hidden).toBe(false);
  });

  it('opens actionable Goal details directly from the composer row', () => {
    listener({type:'state',sessionId:'s1',readback:ready('Manage this objective')});
    summary.querySelector<HTMLButtonElement>('.opencodian-composer-goal-description')!.click();
    expect(root.querySelector('.opencodian-workbench-panel')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('.opencodian-workbench-overview [data-section="quota"]')).toBeNull();
    expect(root.querySelector(`button[aria-label="${t('workbench.goal.pause')}"]`)).not.toBeNull();
    expect(root.querySelector(`button[aria-label="${t('workbench.goal.replace')}"]`)).not.toBeNull();
  });

  it('keeps completed-row dismissal scoped to its owning conversation', () => {
    const completed = ready('Same objective'); completed.goal!.status='complete'; completed.goal!.id='g1';
    listener({type:'state',sessionId:'s1',readback:completed});
    summary.querySelector<HTMLButtonElement>('.opencodian-goal-dismiss')!.click();
    active=1; coordinator.refresh();
    listener({type:'state',sessionId:'s2',readback:{...completed,goal:{...completed.goal!,sessionId:'s2'}}});
    expect(summary.querySelector<HTMLElement>('.opencodian-composer-goal-summary')!.hidden).toBe(false);
    active=0; coordinator.refresh();
    expect(summary.querySelector<HTMLElement>('.opencodian-composer-goal-summary')!.hidden).toBe(true);
  });

  it('removes the Goal only after its owning backend confirms clear', async () => {
    listener({type:'state',sessionId:'s1',readback:ready('Incorrect objective')});
    control.mockResolvedValueOnce({status:'confirmed',readback:ready()});
    await coordinator.controlGoal({action:'clear'});
    expect(control).toHaveBeenCalledWith('s1',{action:'clear'});
    expect(summary.querySelector<HTMLElement>('.opencodian-composer-goal-summary')!.hidden).toBe(true);
    expect(slot.querySelector('button')!.classList.contains('has-goal')).toBe(false);
  });

  it('arms an explicit plan-as-Goal action after the preceding Goal completed', async () => {
    const completed=ready('Completed objective'); completed.goal!.status='complete';
    sessions[0].todos=[{id:'todo1',content:'Verify the plan',status:'pending',priority:'medium'}];
    listener({type:'state',sessionId:'s1',readback:completed});
    [...root.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent===t('workbench.plan.asGoal'))!.click();
    await flush();
    expect(coordinator.isArmed()).toBe(true);
    slot.querySelector('button')!.click();
    expect(coordinator.isArmed()).toBe(false);
  });
});
import { type App, Scope } from 'obsidian';
