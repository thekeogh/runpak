import type { Mode } from '../lib/types';

type ModeSelectorProps = {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
};

export function ModeSelector({ mode, onModeChange }: ModeSelectorProps) {
  return (
    <div className="segmented-control" role="tablist" aria-label="Execution mode">
      <button
        className={mode === 'browser' ? 'active' : ''}
        onClick={() => onModeChange('browser')}
        type="button"
      >
        Browser
      </button>
      <button className={mode === 'node' ? 'active' : ''} onClick={() => onModeChange('node')} type="button">
        Node.js
      </button>
    </div>
  );
}
