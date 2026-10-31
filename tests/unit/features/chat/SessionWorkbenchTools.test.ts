import type { WorkbenchHostRuntime } from '../../../../src/core/runtime/WorkbenchHostRuntime';
import type { SessionWorkbenchState } from '../../../../src/features/chat/ui/SessionWorkbench';
import { SessionWorkbenchTools } from '../../../../src/features/chat/ui/SessionWorkbenchTools';
import { t } from '../../../../src/i18n';

const state = (identity: string): SessionWorkbenchState => ({identity,title:identity,backend:'codex',sessionId:identity,
  goal:{status:'ready',goal:null},capabilities:null,armed:false,busy:false,todos:[],tasks:[],resources:[]});

describe('workbench browser session ownership', () => {
  let root: HTMLElement, tools: SessionWorkbenchTools;
  const attachImage = jest.fn();
  beforeEach(() => {
    root=document.body.createDiv();
    tools=new SessionWorkbenchTools({runtime:{listTerminals:()=>[],getTerminal:()=>null} as unknown as WorkbenchHostRuntime,
      workingDirectory:()=>'/owned',openResource:jest.fn(),openBrowser:jest.fn(),attachUrl:jest.fn(),attachImage,
      openSettings:jest.fn(),openMemory:jest.fn(),setDraft:jest.fn(),defaultWorktreeDirectory:()=>'/worktrees'});
    tools.mount(root); tools.update(state('first')); tools.openTool('browser');
  });
  afterEach(()=>{tools.destroy();root.remove();jest.clearAllMocks();});

  it('clears another session’s preview and restores only its own URL on return', () => {
    const old=root.querySelector('webview')!;
    Object.assign(old,{getURL:()=> 'https://first.example/'});
    old.dispatchEvent(new Event('did-navigate'));
    tools.update(state('second'));
    expect(root.querySelector('webview')).not.toBe(old);
    expect(root.querySelector<HTMLInputElement>('.opencodian-workbench-tool-browser input')!.value).toBe('');
    old.dispatchEvent(new Event('did-navigate'));
    expect(root.querySelector<HTMLInputElement>('.opencodian-workbench-tool-browser input')!.value).toBe('');
    tools.update(state('first'));
    expect(root.querySelector<HTMLInputElement>('.opencodian-workbench-tool-browser input')!.value).toBe('https://first.example/');
  });

  it('rejects a screenshot that finishes after switching sessions', async () => {
    let resolve!: (value:{toPNG():Uint8Array})=>void;
    const old=root.querySelector('webview')!;
    Object.assign(old,{capturePage:()=>new Promise(done=>{resolve=done;})});
    root.querySelector<HTMLInputElement>('.opencodian-workbench-tool-browser input')!.value='https://first.example/';
    old.dispatchEvent(new Event('dom-ready'));
    [...root.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent===t('workbench.browser.capture'))!.click();
    for(let i=0;i<4;i++)await Promise.resolve();
    tools.update(state('second'));
    resolve({toPNG:()=>new Uint8Array([1,2,3])});
    for(let i=0;i<8;i++)await Promise.resolve();
    expect(attachImage).not.toHaveBeenCalled();
    expect(root.textContent).toContain(t('workbench.desktop.returnToSource'));
  });
});
