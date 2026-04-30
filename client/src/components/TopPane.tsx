import { Box, Folder, Globe2, Server, Trash2 } from 'lucide-react';
import type { Mode } from '../lib/types';

type TopPaneProps = {
  packagePath: string;
  mode: Mode;
  onPackagePathChange: (value: string) => void;
  onModeChange: (mode: Mode) => void;
  onClearSaved: () => void;
};

export function TopPane({ packagePath, mode, onPackagePathChange, onModeChange, onClearSaved }: TopPaneProps) {
  return (
    <header className="top-pane">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true">
          <Box size={24} strokeWidth={2.4} />
        </div>
        <div className="brand">Runpak</div>
      </div>
      <div className="header-divider" />
      <label className="path-field">
        <Folder size={18} aria-hidden="true" />
        <span>Path</span>
        <input
          value={packagePath}
          onChange={(event) => onPackagePathChange(event.target.value)}
          placeholder="/Users/username/path/to/my-package"
          spellCheck={false}
        />
      </label>
      <div className="header-actions">
        <div className="mode-switch" role="tablist" aria-label="Execution mode">
          <button
            className={mode === 'browser' ? 'active' : ''}
            onClick={() => onModeChange('browser')}
            role="tab"
            aria-selected={mode === 'browser'}
            type="button"
          >
            <Globe2 size={18} aria-hidden="true" />
            Browser
          </button>
          <button
            className={mode === 'node' ? 'active' : ''}
            onClick={() => onModeChange('node')}
            role="tab"
            aria-selected={mode === 'node'}
            type="button"
          >
            <Server size={18} aria-hidden="true" />
            Node.js
          </button>
        </div>
        <button className="clear-memory-button" onClick={onClearSaved} title="Clear saved path and code" type="button">
          <Trash2 size={18} aria-hidden="true" />
          <span className="sr-only">Clear saved path and code</span>
        </button>
      </div>
    </header>
  );
}
