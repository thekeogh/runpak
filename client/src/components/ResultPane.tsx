import type { PointerEvent, ReactNode } from 'react';
import { CornerDownRight, Terminal } from 'lucide-react';
import { displayValue } from '../lib/format';
import type { LogEntry } from '../lib/types';

type ResultPaneProps = {
  logs: LogEntry[];
  returnValue: unknown;
  hasReturn: boolean;
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
};

function HighlightedReturn({ value }: { value: unknown }) {
  const output = displayValue(value);
  const tokenPattern =
    /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|\b(true|false)\b|\b(null|undefined)\b|(-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)/gi;
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of output.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(output.slice(lastIndex, index));
    }

    const className = match[1]
      ? 'syntax-key'
      : match[2]
        ? 'syntax-string'
        : match[3]
          ? 'syntax-boolean'
          : match[4]
            ? 'syntax-null'
            : 'syntax-number';

    parts.push(
      <span className={className} key={`${index}-${match[0]}`}>
        {match[0]}
      </span>
    );
    lastIndex = index + match[0].length;
  }

  if (lastIndex < output.length) {
    parts.push(output.slice(lastIndex));
  }

  return <pre className="syntax-output">{parts}</pre>;
}

export function ResultPane({ logs, returnValue, hasReturn, onResizeStart }: ResultPaneProps) {
  return (
    <section className="result-pane" aria-label="Execution results">
      <div className="result-section stdout-section">
        <div className="panel-header">
          <Terminal size={18} aria-hidden="true" />
          <span>Stdout</span>
        </div>
        <div className="log-list">
          {logs.length === 0 ? (
            <div className="empty-state">Run your code to see output here</div>
          ) : (
            logs.map((entry) => (
              <div className="log-entry" key={entry.id}>
                <span className={`badge badge-${entry.level}`}>[{entry.level}]</span>
                <pre>{entry.values.map(displayValue).join(' ')}</pre>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="result-divider" onPointerDown={onResizeStart} role="separator" aria-orientation="horizontal" />
      <div className="result-section return-section">
        <div className="panel-header">
          <CornerDownRight size={18} aria-hidden="true" />
          <span>Return</span>
        </div>
        {hasReturn ? <HighlightedReturn value={returnValue} /> : <div className="empty-state">No return value yet</div>}
      </div>
    </section>
  );
}
