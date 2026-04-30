import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Zap } from 'lucide-react';
import { EditorPane } from './components/EditorPane';
import { ResultPane } from './components/ResultPane';
import { TopPane } from './components/TopPane';
import { executeInBrowser } from './lib/executeInBrowser';
import { executeInNode } from './lib/executeInNode';
import { loadIntellisense, type EditorLib } from './lib/intellisense';
import type { LogEntry, Mode, RunEvent, RunState } from './lib/types';

const defaultCode = `import * as pkg from "your-package-name";

console.log("Available exports:", Object.keys(pkg));

return pkg;`;

const storageKeys = {
  code: 'runpak:code',
  mode: 'runpak:mode',
  packagePath: 'runpak:packagePath'
} as const;

function readStoredValue(key: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

function readStoredMode(): Mode {
  const value = readStoredValue(storageKeys.mode, 'browser');
  return value === 'node' ? 'node' : 'browser';
}

const initialRunState: RunState = {
  logs: [],
  returnValue: undefined,
  hasReturn: false,
  running: false
};

function entryId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function eventToLog(event: RunEvent): LogEntry | null {
  if (event.type === 'console') {
    return { id: entryId(), level: event.level, values: event.values };
  }
  if (event.type === 'stderr') {
    return { id: entryId(), level: 'stderr', values: [event.message] };
  }
  if (event.type === 'error') {
    return { id: entryId(), level: 'error', values: [event.stack ?? event.message] };
  }
  return null;
}

export function App() {
  const [packagePath, setPackagePath] = useState(() => readStoredValue(storageKeys.packagePath, ''));
  const [mode, setMode] = useState<Mode>(() => readStoredMode());
  const [code, setCode] = useState(() => readStoredValue(storageKeys.code, defaultCode));
  const [runState, setRunState] = useState<RunState>(initialRunState);
  const [editorLibs, setEditorLibs] = useState<EditorLib[]>([]);
  const [packageName, setPackageName] = useState<string | null>(null);
  const [editorWidth, setEditorWidth] = useState(58);
  const [resultTopHeight, setResultTopHeight] = useState(50);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const canRun = useMemo(() => packagePath.trim().length > 0 && !runState.running, [packagePath, runState.running]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.packagePath, packagePath);
  }, [packagePath]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.code, code);
  }, [code]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.mode, mode);
  }, [mode]);

  useEffect(() => {
    const trimmedPath = packagePath.trim();
    if (!trimmedPath) {
      setEditorLibs([]);
      setPackageName(null);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const result = await loadIntellisense(trimmedPath);
        if (!controller.signal.aborted) {
          setEditorLibs(result.libs);
          setPackageName(result.packageName);
        }
      } catch {
        if (!controller.signal.aborted) {
          setEditorLibs([]);
          setPackageName(null);
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [packagePath]);

  useEffect(() => {
    if (!packageName || !code.includes('your-package-name')) return;
    setCode((current) => current.replaceAll('your-package-name', packageName));
  }, [code, packageName]);

  function startVerticalResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) return;

    const move = (moveEvent: globalThis.PointerEvent) => {
      const percent = ((moveEvent.clientX - bounds.left) / bounds.width) * 100;
      setEditorWidth(Math.min(75, Math.max(35, percent)));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  function startHorizontalResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = resultRef.current?.getBoundingClientRect();
    if (!bounds) return;

    const move = (moveEvent: globalThis.PointerEvent) => {
      const percent = ((moveEvent.clientY - bounds.top) / bounds.height) * 100;
      setResultTopHeight(Math.min(78, Math.max(22, percent)));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  async function run() {
    if (!canRun) return;

    setRunState({ ...initialRunState, running: true });

    const emit = (event: RunEvent) => {
      setRunState((current) => {
        const log = eventToLog(event);
        if (event.type === 'return') {
          return { ...current, returnValue: event.value, hasReturn: true };
        }
        if (event.type === 'done') {
          return { ...current, running: false };
        }
        if (log) {
          return { ...current, logs: [...current.logs, log] };
        }
        return current;
      });
    };

    try {
      if (mode === 'browser') {
        await executeInBrowser(packagePath, code, emit);
      } else {
        await executeInNode(packagePath, code, emit);
      }
    } catch (error) {
      emit({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      emit({ type: 'done', exitCode: 1 });
    }
  }

  function clearSavedInput() {
    window.localStorage.removeItem(storageKeys.packagePath);
    window.localStorage.removeItem(storageKeys.code);
    window.localStorage.removeItem(storageKeys.mode);
    setPackagePath('');
    setMode('browser');
    setPackageName(null);
    setEditorLibs([]);
    setCode(defaultCode);
  }

  return (
    <div className={`app-shell mode-${mode}`}>
      <TopPane
        packagePath={packagePath}
        mode={mode}
        onPackagePathChange={setPackagePath}
        onModeChange={setMode}
        onClearSaved={clearSavedInput}
      />
      <main
        className="workspace"
        ref={workspaceRef}
        style={{ '--editor-width': `${editorWidth}%` } as CSSProperties}
      >
        <div className="editor-column">
          <EditorPane code={code} editorLibs={editorLibs} onChange={setCode} />
          <button className="run-button" disabled={!canRun} onClick={run} type="button">
            <Play size={18} aria-hidden="true" />
            {runState.running ? 'Running...' : 'Run'}
          </button>
        </div>
        <div
          className="vertical-resizer"
          onPointerDown={startVerticalResize}
          role="separator"
          aria-orientation="vertical"
        />
        <div
          className="result-wrap"
          ref={resultRef}
          style={{ '--result-top-height': `${resultTopHeight}%` } as CSSProperties}
        >
          <ResultPane
            logs={runState.logs}
            returnValue={runState.returnValue}
            hasReturn={runState.hasReturn}
            onResizeStart={startHorizontalResize}
          />
        </div>
      </main>
      <footer className="status-bar">
        <div className="runtime-status">
          <span className="status-dot" aria-hidden="true" />
          {mode === 'browser' ? 'Browser runtime' : 'Node.js runtime'}
        </div>
        <div className="ready-status">
          <Zap size={16} aria-hidden="true" />
          {runState.running ? 'Running' : 'Ready'}
        </div>
      </footer>
    </div>
  );
}
