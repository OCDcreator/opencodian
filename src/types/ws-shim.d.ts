declare module 'ws' {
  // Minimal ambient declaration for the Node `ws` package loaded dynamically
  // at runtime from the plugin directory. Only text WebSocket usage is required.
  class WebSocket {
    constructor(url: string);
    onopen: ((event?: unknown) => void) | null;
    onmessage: ((event: { data: string | Buffer }) => void) | null;
    onclose: ((event?: unknown) => void) | null;
    onerror: ((event?: unknown) => void) | null;
    send(data: string): void;
    close(): void;
    readyState: number;
  }
  export = WebSocket;
}
