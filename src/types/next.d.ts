type RouteContext<T extends Record<string, string>> = {
  params: Promise<T> & {
    then: (onfulfilled?: (value: T) => unknown) => Promise<unknown>;
    catch: (onrejected?: (reason: unknown) => unknown) => Promise<unknown>;
    finally: (onfinally?: () => void) => Promise<unknown>;
    [Symbol.toStringTag]: string;
  };
};

export type { RouteContext };
