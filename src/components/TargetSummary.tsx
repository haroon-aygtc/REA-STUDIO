import { EXTENSION_COLORS } from '../constants/config';
import type { Finding, HashedFile } from '../types/studio';
import {
  detectTargetSummaryKind,
  formatBytes,
  getExtension,
  getHost,
  uniq,
} from '../utils/analyzer';

interface TargetSummaryProps {
  name: string;
  total: number;
  running: boolean;
  files: HashedFile[];
  findings: Finding[];
}

export function TargetSummary({
  name,
  total,
  running,
  files,
  findings,
}: TargetSummaryProps) {
  if (!total) {
    return (
      <section className="box tgt" id="tgt">
        <h2>Target</h2>
        <p className="mut" style={{ margin: '4px 0 0' }}>
          Choose a target to see what it contains: file types, size and what the
          agents find.
        </p>
      </section>
    );
  }

  const by = (k: Finding['kind']) => findings.filter((f) => f.kind === k);
  const ep = by('endpoint');
  const url = by('url');
  const rt = by('route');
  const ui = by('ui');
  const lib = [...by('dep'), ...by('import')];
  const st = by('storage');
  const hosts = uniq(url.map((f) => getHost(f.value)).filter(Boolean));

  const totBytes = files.reduce((acc, f) => acc + f.size, 0) || 1;
  const extCounts: Record<string, number> = {};
  files.forEach((f) => {
    const e = getExtension(f.path);
    extCounts[e] = (extCounts[e] || 0) + f.size;
  });

  const sortedExt = Object.entries(extCounts).sort((a, b) => b[1] - a[1]);
  const top = sortedExt.slice(0, 6);
  const rest = sortedExt.slice(6).reduce((a, e) => a + e[1], 0);
  if (rest) top.push(['other', rest]);

  const kindLabel = detectTargetSummaryKind(files);

  const tiles: [string | number, string][] = [
    [`${files.length}/${total}`, 'files read'],
    [formatBytes(totBytes), 'total size'],
    [ep.length, 'endpoints'],
    [hosts.length, 'hosts'],
    [lib.length, 'libraries'],
    [st.length, 'storage keys'],
    [rt.length + ui.length, 'screens and texts'],
  ];

  return (
    <section className="box tgt" id="tgt">
      <div className="th">
        <div>
          <h2>Target</h2>
          <div style={{ font: '700 20px var(--h)' }}>{name}</div>
          <div className="mut" style={{ font: '12px var(--m)' }}>
            {kindLabel} · guessed from file names
          </div>
        </div>
        <span
          className="status-label"
          style={{ color: running ? '#ffb020' : '#a3e635' }}
        >
          {running ? 'scanning' : 'scan complete'}
        </span>
      </div>

      <div className="tiles">
        {tiles.map(([val, label]) => (
          <div className="tile" key={label}>
            <b>{val}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="xbar">
        {top.map(([ext, bytes]) => (
          <i
            key={ext}
            title={`.${ext}`}
            style={{
              width: `${(bytes / totBytes) * 100}%`,
              background: EXTENSION_COLORS[ext] || EXTENSION_COLORS.other,
            }}
          />
        ))}
      </div>

      <div className="legend">
        {top.map(([ext, bytes]) => (
          <span key={ext}>
            <s
              style={{
                background: EXTENSION_COLORS[ext] || EXTENSION_COLORS.other,
              }}
            />
            .{ext} {formatBytes(bytes)}
          </span>
        ))}
      </div>
    </section>
  );
}
