import {
  MarkdownRenderScheduler,
  STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS,
} from '../../../../src/utils/streaming/MarkdownRenderScheduler';

describe('MarkdownRenderScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('exports the shared streaming markdown interval', () => {
    expect(STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS).toBe(96);
  });

  it('renders on the leading edge and coalesces bursts into a trailing render', async () => {
    const rendered: string[] = [];
    let content = '';
    const scheduler = new MarkdownRenderScheduler(async () => {
      rendered.push(content);
    });

    content = 'a';
    scheduler.schedule();
    content = 'ab';
    scheduler.schedule();
    content = 'abc';
    scheduler.schedule();

    // Leading edge fires immediately (zero-delay timer).
    await jest.advanceTimersByTimeAsync(0);
    expect(rendered).toEqual(['abc']);

    // The burst requested more renders; exactly one trailing render follows
    // after the interval, with the latest content.
    content = 'abcd';
    scheduler.schedule();
    await jest.advanceTimersByTimeAsync(STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS);
    expect(rendered).toEqual(['abc', 'abcd']);

    await jest.advanceTimersByTimeAsync(500);
    expect(rendered).toHaveLength(2);
  });

  it('spaces consecutive renders by at least the interval', async () => {
    // Modern fake timers also drive Date.now, so the scheduler's pacing and
    // the recorded render times share the same fake clock.
    const renderTimes: number[] = [];
    const scheduler = new MarkdownRenderScheduler(async () => {
      renderTimes.push(Date.now());
    });

    scheduler.schedule();
    await jest.advanceTimersByTimeAsync(0);
    expect(renderTimes).toHaveLength(1);

    scheduler.schedule();
    await jest.advanceTimersByTimeAsync(STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS - 1);
    expect(renderTimes).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(renderTimes).toHaveLength(2);
    expect(renderTimes[1] - renderTimes[0]).toBeGreaterThanOrEqual(
      STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS,
    );
  });

  it('flush renders the latest content immediately and cancels the pending timer', async () => {
    const rendered: string[] = [];
    let content = '';
    const scheduler = new MarkdownRenderScheduler(async () => {
      rendered.push(content);
    });

    scheduler.schedule();
    await jest.advanceTimersByTimeAsync(0);
    content = 'latest';
    scheduler.schedule();

    await scheduler.flush();
    expect(rendered).toEqual(['', 'latest']);

    await jest.advanceTimersByTimeAsync(500);
    expect(rendered).toHaveLength(2);
  });

  it('flush waits for an in-flight render before rendering the latest content', async () => {
    const rendered: string[] = [];
    let content = 'first';
    let gate: Promise<void> | null = null;
    let signalRenderStarted: () => void = () => {};
    const renderStarted = new Promise<void>((resolve) => {
      signalRenderStarted = resolve;
    });
    const scheduler = new MarkdownRenderScheduler(async () => {
      rendered.push(content);
      if (gate) {
        signalRenderStarted();
        await gate;
      }
    });

    scheduler.schedule();
    await jest.advanceTimersByTimeAsync(0);
    expect(rendered).toEqual(['first']);

    // The second render starts, then parks behind a manually released gate.
    let release: () => void = () => {};
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    content = 'second';
    scheduler.schedule();
    const advance = jest.advanceTimersByTimeAsync(STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS);
    // Wait until the gated render has actually started; only then is the
    // render in flight and flush must wait for it.
    await renderStarted;
    expect(rendered).toEqual(['first', 'second']);

    content = 'third';
    let flushResolved = false;
    const flushPromise = scheduler.flush().then(() => {
      flushResolved = true;
    });
    // While the in-flight render is parked, flush must not resolve.
    await Promise.resolve();
    expect(flushResolved).toBe(false);

    release();
    await advance;
    await flushPromise;

    expect(flushResolved).toBe(true);
    expect(rendered).toEqual(['first', 'second', 'third']);
  });

  it('cancel drops a pending render', async () => {
    const render = jest.fn().mockResolvedValue(undefined);
    const scheduler = new MarkdownRenderScheduler(render);

    scheduler.schedule();
    scheduler.cancel();
    await jest.advanceTimersByTimeAsync(500);

    expect(render).not.toHaveBeenCalled();
  });

  it('does not flush a cancelled scheduler into a detached render target', async () => {
    const render = jest.fn().mockResolvedValue(undefined);
    const scheduler = new MarkdownRenderScheduler(render);

    scheduler.schedule();
    scheduler.cancel();
    await scheduler.flush();

    expect(render).not.toHaveBeenCalled();
  });
});
