import { useRef, useState } from 'react';

interface LaunchModalProps {
  visible: boolean;
  onSelectFiles: (files: File[] | null) => void;
}

export function LaunchModal({ visible, onSelectFiles }: LaunchModalProps) {
  const [authorized, setAuthorized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  if (!visible) return null;

  return (
    <div id="launch" role="dialog" aria-modal="true" aria-labelledby="launch-title">
      <div className="lc">
        <h1 id="launch-title">Choose a target</h1>
        <p>
          Everything runs in your browser. Files are read locally and never
          uploaded. The agents extract real file hashes, URLs, endpoints,
          libraries and storage keys, and every step is logged as an event.
        </p>
        <label className="auth">
          <input
            type="checkbox"
            id="ok"
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
          />
          <span>
            I own this target or have written permission to examine it. This is
            recorded in the run log.
          </span>
        </label>
        <div className="row">
          <button
            type="button"
            className="pick"
            id="bf"
            disabled={!authorized}
            onClick={() => fileInputRef.current?.click()}
          >
            Choose files or a zip, apk, jar
          </button>
          <button
            type="button"
            className="pick"
            id="bd"
            disabled={!authorized}
            onClick={() => folderInputRef.current?.click()}
          >
            Choose a folder
          </button>
          <button
            type="button"
            className="pick"
            id="bs"
            disabled={!authorized}
            onClick={() => onSelectFiles(null)}
          >
            Scan this page&apos;s own code (sample)
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          id="fi"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) {
              onSelectFiles(Array.from(e.target.files));
            }
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          id="fd"
          // @ts-expect-error webkitdirectory is standard in modern browsers
          webkitdirectory=""
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) {
              onSelectFiles(Array.from(e.target.files));
            }
          }}
        />
      </div>
    </div>
  );
}
