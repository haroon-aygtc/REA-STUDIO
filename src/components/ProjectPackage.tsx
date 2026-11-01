import { useState } from 'react';
import {
  EXTENSION_COLORS,
  PACKAGE_TABS,
  STACK_CATEGORIES,
} from '../constants/config';
import type {
  CheckItem,
  EvidenceTag,
  FileTreeNode,
  Finding,
  HashedFile,
  PackageTabId,
  SpecItem,
  SupervisorAuditEntry,
} from '../types/studio';
import {
  basename,
  buildFileTree,
  formatBytes,
  getExtension,
  getHost,
  shorten,
  uniq,
} from '../utils/analyzer';

interface ProjectPackageProps {
  name: string;
  total: number;
  running: boolean;
  files: HashedFile[];
  findings: Finding[];
  spec: SpecItem[];
  checks: CheckItem[];
  audits: SupervisorAuditEntry[];
}

interface DiagramNode {
  id: string;
  label: string;
  sub?: string;
  color: string;
  ghost?: boolean;
}

interface DiagramColumn {
  title: string;
  nodes: DiagramNode[];
}

function ColumnFlowDiagram({
  columns,
  edges,
}: {
  columns: DiagramColumn[];
  edges: [string, string][];
}) {
  const W = 190;
  const GP = 84;
  const H = 36;
  const V = 12;
  const pd = 16;

  const normalizedCols = columns.map((c, ci) => ({
    title: c.title,
    nodes: c.nodes.length
      ? c.nodes
      : [
          {
            id: '_' + ci,
            label: 'none found',
            ghost: true,
            color: '#6b6459',
          },
        ],
  }));

  const mx = Math.max(1, ...normalizedCols.map((c) => c.nodes.length || 1));
  const w = pd * 2 + normalizedCols.length * W + (normalizedCols.length - 1) * GP;
  const h = pd * 2 + 26 + mx * (H + V);

  const pos: Record<string, [number, number]> = {};
  const col: Record<string, string> = {};

  normalizedCols.forEach((c, ci) => {
    c.nodes.forEach((n, ni) => {
      pos[n.id] = [pd + ci * (W + GP), pd + 26 + ni * (H + V)];
      col[n.id] = n.color;
    });
  });

  return (
    <div className="dgm">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} role="img" aria-label="Flow diagram">
        {normalizedCols.map((c, ci) => (
          <text
            key={ci}
            className="dt"
            x={pd + ci * (W + GP)}
            y={pd + 8}
          >
            {c.title.toUpperCase()}
          </text>
        ))}

        {edges.map(([a, b], idx) => {
          const p = pos[a];
          const q = pos[b];
          if (!p || !q) return null;
          const x1 = p[0] + W;
          const y1 = p[1] + H / 2;
          const x2 = q[0];
          const y2 = q[1] + H / 2;
          const m = (x1 + x2) / 2;
          return (
            <path
              key={idx}
              d={`M${x1} ${y1}C${m} ${y1} ${m} ${y2} ${x2} ${y2}`}
              fill="none"
              stroke={col[a]}
              strokeOpacity=".55"
              strokeWidth="1.5"
            />
          );
        })}

        {normalizedCols.map((c) =>
          c.nodes.map((n) => {
            const [x, y] = pos[n.id];
            return (
              <g key={n.id}>
                <rect
                  x={x}
                  y={y}
                  width={W}
                  height={H}
                  rx="8"
                  fill="#14110e"
                  stroke={n.color}
                  strokeOpacity={n.ghost ? '.3' : '.9'}
                  strokeDasharray={n.ghost ? '4 3' : undefined}
                />
                <text className="nt" x={x + 10} y={y + (n.sub ? 15 : 22)}>
                  {shorten(n.label, 25)}
                </text>
                {n.sub && (
                  <text className="ns" x={x + 10} y={y + 28}>
                    {shorten(n.sub, 32)}
                  </text>
                )}
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}

function FileTreeBranch({
  node,
  depth,
  parentSize,
}: {
  node: FileTreeNode;
  depth: number;
  parentSize: number;
}) {
  const kids = Object.values(node.c).sort((a, b) => b.s - a.s);
  const pct = Math.max(3, Math.round((node.s / (parentSize || 1)) * 100));

  if (!kids.length) {
    return (
      <div className="tf">
        <span>{node.n}</span>
        <i style={{ width: `${pct}%` }} />
        <em>{formatBytes(node.s)}</em>
      </div>
    );
  }

  return (
    <details open={depth < 2}>
      <summary>
        {node.n}/ <em>{node.k} files · {formatBytes(node.s)}</em>
      </summary>
      <div className="tc">
        {kids.slice(0, 12).map((k) => (
          <FileTreeBranch
            key={k.n}
            node={k}
            depth={depth + 1}
            parentSize={node.s || 1}
          />
        ))}
        {kids.length > 12 && (
          <div className="mut">+{kids.length - 12} more</div>
        )}
      </div>
    </details>
  );
}

function EvidenceBadge({ f }: { f: Finding }) {
  return (
    <span className="ev" title={`${f.file}:${f.line}`}>
      {f.id}
    </span>
  );
}

function TagBadge({ tag }: { tag: EvidenceTag }) {
  return <span className={`tg ${tag}`}>{tag}</span>;
}

export function ProjectPackage({
  name,
  total,
  running,
  files,
  findings,
  spec,
  checks,
  audits,
}: ProjectPackageProps) {
  const [activeTab, setActiveTab] = useState<PackageTabId>('prd');
  const [protoScreenIdx, setProtoScreenIdx] = useState(0);
  const [protoToast, setProtoToast] = useState('');
  const [protoClickCount, setProtoClickCount] = useState(0);

  if (!total) {
    return (
      <section className="box rep" id="rep">
        <h2>Project package</h2>
        <p className="mut" style={{ margin: '4px 0 0' }}>
          PRD, flows, structure, architecture, stack and a prototype fill in
          here, live, while the agents work.
        </p>
      </section>
    );
  }

  const by = (k: Finding['kind']) => findings.filter((f) => f.kind === k);
  const g = {
    url: by('url'),
    ep: by('endpoint'),
    rt: by('route'),
    ui: by('ui'),
    lib: [...by('dep'), ...by('import')],
    st: by('storage'),
  };
  const hostsList = uniq(g.url.map((f) => getHost(f.value)).filter(Boolean)) as string[];

  const getScreens = () => {
    if (g.rt.length) {
      return g.rt.slice(0, 6).map((f) => ({
        label: f.value,
        file: f.file,
        f,
      }));
    }
    const counts: Record<string, number> = {};
    findings.forEach((f) => {
      if (!['url', 'import', 'dep'].includes(f.kind)) {
        counts[f.file] = (counts[f.file] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([file]) => ({ label: basename(file), file }));
  };

  const done = !running && checks.length > 0;

  const renderPrdTab = () => {
    const sp = (t: EvidenceTag) => spec.filter((l) => l.tag === t);
    const o = sp('observed').length;
    const i = sp('inferred').length;
    const u = sp('unknown').length;
    const n = o + i + u || 1;
    let off = 0;

    const donutSegments = (
      [
        [o, '#a3e635'],
        [i, '#fbbf24'],
        [u, '#ff4d2e'],
      ] as const
    ).map(([v, c], idx) => {
      const l = (v / n) * 251.3;
      const curOff = off;
      off += l;
      return (
        <circle
          key={idx}
          r="40"
          cx="50"
          cy="50"
          fill="none"
          stroke={c}
          strokeWidth="14"
          strokeDasharray={`${l} ${251.3 - l}`}
          strokeDashoffset={-curOff}
          transform="rotate(-90 50 50)"
        />
      );
    });

    const heads = g.ui.filter((f) => /title|h1|h2|h3/.test(f.el || ''));
    const btns = g.ui.filter((f) => f.el === 'button');
    const labs = g.ui.filter((f) => f.el === 'label');
    const featureRows: [string, Finding][] = [
      ...heads.map((f): [string, Finding] => ['Heading', f]),
      ...btns.map((f): [string, Finding] => ['Action', f]),
      ...labs.map((f): [string, Finding] => ['Field', f]),
    ].slice(0, 24);

    const openQuestions = [
      ...spec.filter((l) => l.tag === 'unknown').map((l) => l.text),
      ...g.ep
        .filter((f) => !f.method)
        .slice(0, 6)
        .map((f) => 'HTTP method for ' + f.value + ' is not visible'),
      'Server-side behavior never ships to the client and cannot be seen',
      'Authentication rules are unknown unless a finding states them',
    ];

    return (
      <>
        <div className="two2 sec">
          <div>
            <h3>1. Summary</h3>
            <p>
              <b>{name}</b> contains {total} files. The agents found{' '}
              {g.rt.length} routes, {g.ui.length} pieces of screen text,{' '}
              {g.ep.length} network endpoints, {hostsList.length} external
              hosts, {g.lib.length} libraries and {g.st.length} local storage
              keys.
            </p>
            <p>
              Every statement in this document comes from a finding. Hover an
              F-tag to see the file and line.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <svg viewBox="0 0 100 100" width="110" height="110">
              {donutSegments}
              <text
                x="50"
                y="55"
                textAnchor="middle"
                className="nt"
                style={{ fontSize: 14 }}
              >
                {spec.length}
              </text>
            </svg>
            <div className="legend" style={{ display: 'grid', margin: 0 }}>
              <span>
                <TagBadge tag="observed" />
                {o} seen in the files
              </span>
              <span>
                <TagBadge tag="inferred" />
                {i} implied
              </span>
              <span>
                <TagBadge tag="unknown" />
                {u} not found
              </span>
            </div>
          </div>
        </div>

        <div className="sec">
          <h3>2. Features users can see</h3>
          <p>Headings, buttons and form labels found in the target.</p>
          {featureRows.length ? (
            <div className="rows">
              {featureRows.map(([k, f]) => (
                <div className="ln" key={f.id}>
                  <TagBadge tag="observed" />
                  <b>{k}</b> “{f.value}” <EvidenceBadge f={f} />
                </div>
              ))}
            </div>
          ) : (
            <p className="mut">No screen text found.</p>
          )}
        </div>

        <div className="sec">
          <h3>3. Screens and routes</h3>
          {g.rt.length ? (
            <div className="rows">
              {g.rt.map((f) => (
                <div className="ln" key={f.id}>
                  <TagBadge tag="observed" />
                  {f.value}{' '}
                  <span className="mut">
                    {basename(f.file)}:{f.line}
                  </span>{' '}
                  <EvidenceBadge f={f} />
                </div>
              ))}
            </div>
          ) : (
            <p className="mut">
              No routes found. The flow views group by file instead.
            </p>
          )}
        </div>

        <div className="sec">
          <h3>4. Functional requirements</h3>
          <p>What the client must be able to do on the network.</p>
          {g.ep.length ? (
            <div className="rows">
              {g.ep.slice(0, 30).map((f, idx) => (
                <div className="ln" key={f.id}>
                  <TagBadge tag={f.method ? 'observed' : 'inferred'} />
                  <b>FR-{idx + 1}</b> call {f.method || 'GET'} {f.value}{' '}
                  <EvidenceBadge f={f} />
                </div>
              ))}
            </div>
          ) : (
            <p className="mut">No endpoints found.</p>
          )}
        </div>

        <div className="two2 sec">
          <div>
            <h3>5. Data and storage</h3>
            {g.st.length ? (
              <div className="rows">
                {g.st.map((f) => (
                  <div className="ln" key={f.id}>
                    <TagBadge tag="observed" />
                    key “{f.value}” <EvidenceBadge f={f} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mut">No local storage keys found.</p>
            )}
          </div>
          <div>
            <h3>6. Integrations</h3>
            {hostsList.length ? (
              <div className="chips">
                {hostsList.map((h) => (
                  <span className="chp" key={h}>
                    {h}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mut">No external hosts found.</p>
            )}
          </div>
        </div>

        <div className="sec">
          <h3>7. Open questions</h3>
          <div className="rows">
            {openQuestions.map((t, idx) => (
              <div className="ln" key={idx}>
                <TagBadge tag="unknown" />
                {t}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  const renderFlowTab = () => {
    const sc = getScreens();
    const fs = new Set(sc.map((s) => s.file));
    const ui = g.ui.filter((f) => fs.has(f.file)).slice(0, 10);
    const ep = g.ep.slice(0, 8);
    const ed: [string, string][] = [];

    sc.forEach((s, i) => {
      const us = ui
        .map((f, j) => (f.file === s.file ? j : -1))
        .filter((j) => j >= 0);
      us.forEach((j) => ed.push(['s' + i, 'u' + j]));
      if (!ui.some((f) => f.file === s.file && f.el === 'button')) {
        ep.forEach((f, k) => {
          if (f.file === s.file) ed.push(['s' + i, 'e' + k]);
        });
      }
    });

    ui.forEach((f, j) => {
      if (f.el === 'button') {
        ep.forEach((e, k) => {
          if (e.file === f.file) ed.push(['u' + j, 'e' + k]);
        });
      }
    });

    const columns: DiagramColumn[] = [
      {
        title: 'Screens',
        nodes: sc.map((s, i) => ({
          id: 's' + i,
          label: s.label,
          sub: basename(s.file),
          color: '#ffb020',
        })),
      },
      {
        title: 'What the user sees or taps',
        nodes: ui.map((f, i) => ({
          id: 'u' + i,
          label: (f.el === 'button' ? '[tap] ' : '') + f.value,
          sub: f.el,
          color: '#f3efe8',
        })),
      },
      {
        title: 'Network calls',
        nodes: ep.map((f, i) => ({
          id: 'e' + i,
          label: (f.method || 'GET') + ' ' + f.value,
          color: '#ff7a1a',
        })),
      },
    ];

    return (
      <>
        <div className="sec">
          <h3>User flow</h3>
          <p>
            Read left to right: a screen shows items, taps lead to network
            calls. Lines connect items that live in the same file, so they show
            likely links, not proven order.
          </p>
          <ColumnFlowDiagram columns={columns} edges={ed} />
        </div>
        <div className="sec">
          <h3>Step by step</h3>
          {sc.length ? (
            <div className="rows">
              {sc.map((s, i) => {
                const u = g.ui
                  .filter((f) => f.file === s.file)
                  .slice(0, 4)
                  .map((f) => f.value);
                const c = g.ep
                  .filter((f) => f.file === s.file)
                  .slice(0, 3)
                  .map((f) => (f.method || 'GET') + ' ' + f.value);
                return (
                  <div className="ln" key={i}>
                    <TagBadge tag="inferred" />
                    <b>
                      {i + 1}. {s.label}
                    </b>{' '}
                    shows {u.length ? u.join(', ') : 'no readable text'}; calls{' '}
                    {c.length ? c.join(', ') : 'nothing observed'}.
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mut">No screens found yet.</p>
          )}
        </div>
      </>
    );
  };

  const renderDataTab = () => {
    const fl = uniq(
      findings
        .filter((f) => ['endpoint', 'storage', 'ui'].includes(f.kind))
        .map((f) => f.file),
    ).slice(0, 5);
    const ep = g.ep.slice(0, 6);
    const st = g.st.slice(0, 4);
    const H = hostsList.slice(0, 5);
    const rel = g.ep.some((f) => !/^https?:/.test(f.value));
    const ed: [string, string][] = [];

    const mid: DiagramNode[] = [
      ...ep.map((f, i) => ({
        id: 'e' + i,
        label: (f.method || 'GET') + ' ' + f.value,
        sub: 'endpoint',
        color: '#ff7a1a',
      })),
      ...st.map((f, i) => ({
        id: 'k' + i,
        label: f.value,
        sub: 'local storage key',
        color: '#ffd84d',
      })),
    ];

    const right: DiagramNode[] = [
      ...H.map((h, i) => ({
        id: 'h' + i,
        label: h,
        sub: 'external host',
        color: '#ff4d2e',
      })),
    ];
    if (rel) {
      right.push({
        id: 'so',
        label: 'Same origin',
        sub: 'relative paths',
        color: '#ff4d2e',
      });
    }
    if (st.length) {
      right.push({
        id: 'ds',
        label: 'Device storage',
        sub: 'browser or app',
        color: '#ffd84d',
      });
    }

    fl.forEach((f, i) => {
      ep.forEach((e, k) => e.file === f && ed.push(['f' + i, 'e' + k]));
      st.forEach((e, k) => e.file === f && ed.push(['f' + i, 'k' + k]));
    });
    ep.forEach((e, k) => {
      const h = getHost(e.value);
      const j = h ? H.indexOf(h) : -1;
      ed.push(['e' + k, h && j >= 0 ? 'h' + j : 'so']);
    });
    st.forEach((_e, k) => ed.push(['k' + k, 'ds']));

    const readingItems = [
      `${ep.length} endpoints send or receive data over the network.`,
      `${st.length} keys keep data on the device between sessions.`,
      `${H.length} external hosts receive traffic${rel ? ', plus the app’s own server through relative paths' : ''}.`,
      'Request and response fields are not visible without running the target, so they are listed as unknown.',
    ];

    return (
      <>
        <div className="sec">
          <h3>Data flow</h3>
          <p>
            Where data starts in the client, which calls and keys carry it, and
            where it ends up.
          </p>
          <ColumnFlowDiagram
            columns={[
              {
                title: 'Client modules',
                nodes: fl.map((f, i) => ({
                  id: 'f' + i,
                  label: basename(f),
                  sub: f,
                  color: '#f3efe8',
                })),
              },
              { title: 'Calls and keys', nodes: mid },
              { title: 'Destinations', nodes: right },
            ]}
            edges={ed}
          />
        </div>
        <div className="sec">
          <h3>Reading it</h3>
          <div className="rows">
            {readingItems.map((t, idx) => (
              <div className="ln" key={idx}>
                {t}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  const renderStructTab = () => {
    const r = buildFileTree(name, files);
    const c: Record<string, number> = {};
    files.forEach((f) => {
      const e = getExtension(f.path);
      c[e] = (c[e] || 0) + f.size;
    });
    const ent = Object.entries(c)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const tot = files.reduce((a, f) => a + f.size, 0) || 1;

    return (
      <div className="two2">
        <div className="sec">
          <h3>File tree</h3>
          <p>Largest folders first. Click to open or close.</p>
          <FileTreeBranch node={r} depth={0} parentSize={r.s || 1} />
        </div>
        <div className="sec">
          <h3>What the files are made of</h3>
          {ent.map(([e, v]) => (
            <div className="tf" key={e}>
              <span>
                <s
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    marginRight: 6,
                    background: EXTENSION_COLORS[e] || EXTENSION_COLORS.other,
                  }}
                />
                .{e}
              </span>
              <i
                style={{
                  width: `${Math.max(3, (v / tot) * 100)}%`,
                  background: EXTENSION_COLORS[e] || EXTENSION_COLORS.other,
                }}
              />
              <em>{formatBytes(v)}</em>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderArchTab = () => {
    const layers: [string, string, string[], string][] = [
      [
        'Presentation',
        'Screens, routes and visible text',
        [...g.rt.map((f) => f.value), ...g.ui.map((f) => f.value)],
        '#ffb020',
      ],
      [
        'Application',
        'Libraries and modules in use',
        g.lib.map((f) => f.value),
        '#f3efe8',
      ],
      [
        'Local storage',
        'Keys kept on the device',
        g.st.map((f) => f.value),
        '#ffd84d',
      ],
      [
        'Network',
        'Endpoints the client calls',
        g.ep.map((f) => f.value),
        '#ff7a1a',
      ],
      ['External', 'Hosts the client contacts', hostsList, '#ff4d2e'],
    ];

    const w = 760;
    const h = 84;
    const totalH = layers.length * (h + 30) - 30;

    return (
      <>
        <div className="sec">
          <h3>Architecture</h3>
          <p>
            Layers of the client, top to bottom. Arrows show the direction of
            dependency. Server internals are not visible and are not drawn.
          </p>
          <div className="dgm">
            <svg viewBox={`0 0 ${w} ${totalH}`} width={w} role="img">
              {layers.map(([t, sub, it, c], i) => {
                const y = i * (h + 30);
                const ay = y + h;
                return (
                  <g key={t}>
                    <rect
                      x="0"
                      y={y}
                      width={w}
                      height={h}
                      rx="12"
                      fill="#14110e"
                      stroke={c}
                      strokeOpacity={it.length ? '.9' : '.25'}
                    />
                    <text
                      className="nt"
                      x="16"
                      y={y + 26}
                      style={{ fontSize: 14, fontWeight: 700 }}
                    >
                      {t}
                    </text>
                    <text className="ns" x="16" y={y + 44}>
                      {sub}
                    </text>
                    <text
                      x={w - 16}
                      y={y + 28}
                      textAnchor="end"
                      style={{
                        fill: c,
                        font: "700 20px 'JetBrains Mono',monospace",
                      }}
                    >
                      {it.length}
                    </text>
                    <text className="ns" x="16" y={y + 68}>
                      {shorten(uniq(it).slice(0, 4).join('  ·  '), 115) ||
                        'nothing found'}
                    </text>
                    {i < layers.length - 1 && (
                      <>
                        <path d={`M${w / 2} ${ay + 4}v18`} stroke="#9a9184" />
                        <path
                          d={`M${w / 2 - 5} ${ay + 16}l5 7 5-7`}
                          fill="none"
                          stroke="#9a9184"
                        />
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
        <div className="sec">
          <h3>What each layer means</h3>
          <div className="rows">
            {layers.map(([t, sub, it]) => (
              <div className="ln" key={t}>
                <TagBadge tag={it.length ? 'observed' : 'unknown'} />
                <b>{t}</b>: {sub.toLowerCase()}.{' '}
                {it.length
                  ? `${it.length} found.`
                  : 'Nothing found in the scanned files.'}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  const renderStackTab = () => {
    const gr: Record<string, Finding[]> = {};
    g.lib.forEach((f) => {
      const cat = (STACK_CATEGORIES.find((x) => x[1].test(f.value)) || [
        'Other',
      ])[0];
      (gr[cat] = gr[cat] || []).push(f);
    });

    const techniques = [
      'Each file is hashed (SHA-256, first 4 bytes) so findings can be matched to exact content.',
      'Text is scanned with fixed patterns for URLs, fetch calls, imports, storage keys, routes and screen text.',
      'Binary files are reduced to readable strings before scanning.',
      'The clean room receives only the spec and is checked against the evidence by code, not by model text.',
    ];

    return (
      <>
        <div className="sec">
          <h3>Technology stack</h3>
          {Object.keys(gr).length ? (
            Object.entries(gr).map(([c, a]) => (
              <div key={c}>
                <p style={{ marginTop: 12 }}>
                  <b>{c}</b> <TagBadge tag="inferred" />
                </p>
                <div className="chips">
                  {a.map((f) => (
                    <span className="chp" key={f.id}>
                      {f.value}
                      {f.ver ? ' ' + f.ver : ''} <EvidenceBadge f={f} />
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="mut">
              No libraries found. They appear when package.json or import
              statements are in the target.
            </p>
          )}
        </div>
        <div className="sec">
          <h3>Techniques used on this run</h3>
          <div className="rows">
            {techniques.map((t, idx) => (
              <div className="ln" key={idx}>
                {t}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  const renderProtoTab = () => {
    const sc = getScreens();
    if (!sc.length) {
      return <p className="mut">The prototype appears once screens are found.</p>;
    }
    const safeIdx = Math.min(protoScreenIdx, sc.length - 1);
    const s = sc[safeIdx];
    const els = g.ui.filter((f) => f.file === s.file).slice(0, 9);
    const calls = g.ep.filter((f) => f.file === s.file);

    const handleButtonTap = () => {
      const nextCount = protoClickCount + 1;
      setProtoClickCount(nextCount);
      const x = calls[(nextCount - 1) % (calls.length || 1)];
      setProtoToast(
        x
          ? `Would call ${x.method || 'GET'} ${x.value}`
          : 'No network call observed on this screen',
      );
    };

    return (
      <div className="two2">
        <div>
          <div className="phone">
            <div className="ph1">{shorten(s.label, 28)}</div>
            <div className="pb">
              {els.length ? (
                els.map((f) =>
                  f.el === 'button' ? (
                    <button
                      type="button"
                      key={f.id}
                      className="pbtn"
                      onClick={handleButtonTap}
                    >
                      {f.value}
                    </button>
                  ) : /title|h1|h2|h3/.test(f.el || '') ? (
                    <b key={f.id} style={{ fontSize: 16 }}>
                      {f.value}
                    </b>
                  ) : (
                    <div key={f.id} className="pf">
                      {f.value}
                    </div>
                  ),
                )
              ) : (
                <div className="pf">No screen text found for this screen.</div>
              )}
              {protoToast && <div className="toast">{protoToast}</div>}
            </div>
            <div className="pn">
              {sc.map((x, i) => (
                <button
                  type="button"
                  key={i}
                  className={i === safeIdx ? 'on' : ''}
                  onClick={() => {
                    setProtoScreenIdx(i);
                    setProtoToast('');
                  }}
                >
                  {shorten(x.label, 9)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="sec">
          <h3>Clickable prototype</h3>
          <p>
            Built only from findings: screen names, text and calls. Tap the
            bottom tabs to switch screens, tap a button to see what it would
            call. Styling is generic on purpose, nothing is copied from the
            original.
          </p>
          {els.length + calls.length > 0 ? (
            <div className="rows">
              {els.map((f) => (
                <div className="ln" key={f.id}>
                  <TagBadge tag="observed" />
                  {f.el}: {f.value} <EvidenceBadge f={f} />
                </div>
              ))}
              {calls.map((f) => (
                <div className="ln" key={f.id}>
                  <TagBadge tag={f.method ? 'observed' : 'inferred'} />
                  {f.method || 'GET'} {f.value} <EvidenceBadge f={f} />
                </div>
              ))}
            </div>
          ) : (
            <p className="mut">Nothing found for this screen.</p>
          )}
        </div>
      </div>
    );
  };

  const renderVerTab = () => {
    if (!checks.length) {
      return <p className="mut">Checks start when the Verifier agent runs.</p>;
    }
    const gr: Record<string, [number, number]> = {};
    checks.forEach((x) => {
      gr[x.group] = gr[x.group] || [0, 0];
      gr[x.group][1]++;
      if (x.ok) gr[x.group][0]++;
    });
    const p = checks.filter((x) => x.ok).length;
    const bad = checks.filter((x) => !x.ok);

    return (
      <div className="two2">
        <div className="sec">
          <div className="big">{Math.round((p / checks.length) * 100)}%</div>
          <p>
            {p} of {checks.length} checks passed. Computed by code. 100% only
            covers the inputs checked.
          </p>
          {Object.entries(gr).map(([k, v]) => (
            <div key={k}>
              <b>{k}</b>{' '}
              <span className="mut">
                {v[0]}/{v[1]}
              </span>
              <div className="gauge">
                <i style={{ width: `${(v[0] / v[1]) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="sec">
          <h3>Divergences</h3>
          {bad.length ? (
            <div className="rows">
              {bad.slice(0, 20).map((x, idx) => (
                <div className="ln" key={idx}>
                  <TagBadge tag="unknown" />[{x.group}] {x.name}
                </div>
              ))}
            </div>
          ) : (
            <p className="mut">No divergences in the checks run.</p>
          )}

          <h3 style={{ marginTop: 18 }}>Supervisor audit</h3>
          <div className="rows">
            {audits.length ? (
              audits.map((a, idx) => (
                <div className="ln" key={idx}>
                  <span className={`tg ${a.ok ? 'observed' : 'unknown'}`}>
                    {a.ok ? 'pass' : 'fail'}
                  </span>
                  {a.text}
                </div>
              ))
            ) : (
              <p className="mut">Audits run after each stage.</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="box rep" id="rep">
      <div className="th">
        <div>
          <h2>Project package</h2>
          <div className="mut">
            Built from real findings. Hover an F-tag to see its file and line.
          </div>
        </div>
        <span
          className="status-label"
          style={{ color: done ? '#a3e635' : '#ffb020' }}
        >
          {done ? 'complete' : 'live'}
        </span>
      </div>

      <div className="tabs" role="tablist">
        {PACKAGE_TABS.map(([id, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            key={id}
            className={`tab ${activeTab === id ? 'on' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'prd' && renderPrdTab()}
        {activeTab === 'flow' && renderFlowTab()}
        {activeTab === 'data' && renderDataTab()}
        {activeTab === 'struct' && renderStructTab()}
        {activeTab === 'arch' && renderArchTab()}
        {activeTab === 'stack' && renderStackTab()}
        {activeTab === 'proto' && renderProtoTab()}
        {activeTab === 'ver' && renderVerTab()}
      </div>
    </section>
  );
}
