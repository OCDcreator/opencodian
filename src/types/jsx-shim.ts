declare global {
  namespace JSX {
    type Element = unknown;

    interface ElementClass {
      render?: unknown;
    }

    type ElementType =
      | string
      | ((props: Record<string, unknown>) => Element | null)
      | (new (props: Record<string, unknown>) => ElementClass);

    interface IntrinsicElements {
      [elemName: string]: Record<string, unknown>;
    }
  }
}

export {};
