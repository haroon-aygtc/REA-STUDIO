interface HeaderProps {
  runLabel: string;
  elapsedText: string;
  filesCount: number;
  findingsCount: number;
  eventsCount: number;
  showNewTarget: boolean;
  onNewTarget: () => void;
}

export function Header({
  runLabel,
  elapsedText,
  filesCount,
  findingsCount,
  eventsCount,
  showNewTarget,
  onNewTarget,
}: HeaderProps) {
  return (
    <header className="studio-header">
      <span className="brand">
        <svg width="30" height="30" viewBox="0 0 40 40" aria-hidden="true">
          <rect
            x="3"
            y="3"
            width="34"
            height="34"
            rx="9"
            fill="#f3efe8"
            stroke="#ff7a1a"
            strokeWidth="1.5"
          />
          <path
            d="M12 29L19 11H23L29 29H24.5L21.2 19L16.5 29Z"
            fill="#14110e"
          />
          <path
            d="M11 28C17 20 24 16 30 15C25 19 19 24 15 29Z"
            fill="#ff7a1a"
          />
          <g fill="#ffb020">
            <rect x="30" y="8" width="3" height="3" />
            <rect x="27" y="11" width="3" height="3" />
            <rect x="33" y="11" width="3" height="3" />
          </g>
        </svg>
        REA Studio
      </span>
      <span className="run" id="runid">
        {runLabel}
      </span>
      <span className="meter">
        <span>
          time <b id="clk">{elapsedText}</b>
        </span>
        <span>
          files <b id="mf">{filesCount}</b>
        </span>
        <span>
          findings <b id="mn">{findingsCount}</b>
        </span>
        <span>
          events <b id="ec">{eventsCount}</b>
        </span>
        <span>
          model calls <b>0</b>
        </span>
        <span>
          original <b>0 B changed</b>
        </span>
      </span>
      {showNewTarget && (
        <button id="again" type="button" onClick={onNewTarget}>
          New target
        </button>
      )}
    </header>
  );
}
