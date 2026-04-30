export type Mode = 'browser' | 'node';

export type ConsoleLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

export type LogEntry = {
  id: string;
  level: ConsoleLevel | 'stderr';
  values: unknown[];
};

export type RunState = {
  logs: LogEntry[];
  returnValue: unknown;
  hasReturn: boolean;
  running: boolean;
};

export type RunEvent =
  | { type: 'console'; level: ConsoleLevel; values: unknown[] }
  | { type: 'stderr'; message: string }
  | { type: 'return'; value: unknown }
  | { type: 'error'; message: string; stack?: string }
  | { type: 'done'; exitCode: number | null };
