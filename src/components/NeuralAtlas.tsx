import { useEffect, useRef, useState } from 'react';
import {
  BRAIN_LOBE_COLORS,
  BRAIN_LOBE_KEYS,
  BRAIN_LOBE_LABELS,
} from '../constants/config';
import type {
  BrainEntityRecord,
  BrainLobeKey,
  BrainTargetRecord,
  Finding,
  SecondBrainMemory,
} from '../types/studio';
import { clamp, normalizeLobeKey, pseudoRandom, shorten } from '../utils/analyzer';

interface NeuralAtlasProps {
  memory: SecondBrainMemory;
  currentTid: string;
  currentFindings: Finding[];
  onForgetTarget: (tid: string) => void;
  onForgetAll: () => void;
}

interface AtlasNode {
  id: string;
  type: 't' | 'e';
  k?: BrainLobeKey;
  label: string;
  t?: BrainTargetRecord;
  e?: BrainEntityRecord;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  r: number;
  a: number;
}

interface EdgePulse {
  e: number;
  u: number;
}

export function NeuralAtlas({
  memory,
  currentTid,
  currentFindings,
  onForgetTarget,
  onForgetAll,
}: NeuralAtlasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hiddenLobes, setHiddenLobes] = useState<Set<BrainLobeKey>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const simRef = useRef<{
    nodes: AtlasNode[];
    edges: [AtlasNode, AtlasNode][];
    ix: Record<string, AtlasNode>;
    pulses: EdgePulse[];
    hovId: string | null;
    rpStart: number | null;
    bw: number;
    bh: number;
  }>({
    nodes: [],
    edges: [],
    ix: {},
    pulses: [],
    hovId: null,
    rpStart: null,
    bw: 600,
    bh: 440,
  });

  // Compute recalled findings count for current run
  const recalledKeys = new Set<string>();
  currentFindings.forEach((f) => {
    const k = normalizeLobeKey(f.kind);
    if (!k) return;
    let v = f.value;
    if (f.kind === 'url') {
      try {
        v = new URL(f.value).host;
      } catch {
        // ignore
      }
    }
    const key = k + '|' + String(v).slice(0, 80);
    if (memory.e[key] && !memory.e[key].t.includes(currentTid)) {
      recalledKeys.add(key);
    }
  });

  const lobePos = (i: number, bw: number, bh: number): [number, number] => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return [bw / 2 + Math.cos(a) * bw * 0.36, bh / 2 + Math.sin(a) * bh * 0.34];
  };

  // Rebuild graph nodes when memory changes
  useEffect(() => {
    const sim = simRef.current;
    const old = sim.ix;
    const N: AtlasNode[] = [];
    const Ed: [AtlasNode, AtlasNode][] = [];
    const ix: Record<string, AtlasNode> = {};

    memory.t.forEach((t) => {
      const o = old[t.id];
      const n: AtlasNode = {
        id: t.id,
        type: 't',
        label: t.name,
        t,
        x: o ? o.x : sim.bw / 2 + (Math.random() - 0.5) * 60,
        y: o ? o.y : sim.bh / 2 + (Math.random() - 0.5) * 60,
        vx: 0,
        vy: 0,
        fx: 0,
        fy: 0,
        r: 11,
        a: o ? 1 : 0,
      };
      ix[t.id] = n;
      N.push(n);
    });

    Object.entries(memory.e)
      .sort((a, b) => b[1].t.length - a[1].t.length)
      .slice(0, 380)
      .forEach(([k, e]) => {
        const o = old[k];
        const L = lobePos(BRAIN_LOBE_KEYS.indexOf(e.k), sim.bw, sim.bh);
        const n: AtlasNode = {
          id: k,
          type: 'e',
          k: e.k,
          label: e.v,
          e,
          x: o ? o.x : L[0] + (Math.random() - 0.5) * 80,
          y: o ? o.y : L[1] + (Math.random() - 0.5) * 80,
          vx: 0,
          vy: 0,
          fx: 0,
          fy: 0,
          r: 2.6 + Math.sqrt(e.t.length) * 1.6,
          a: o ? 1 : 0,
        };
        ix[k] = n;
        N.push(n);
        e.t.forEach((tid) => {
          if (ix[tid]) Ed.push([ix[tid], n]);
        });
      });

    sim.nodes = N;
    sim.edges = Ed;
    sim.ix = ix;

    if (memory.t.length > 0) {
      const latestTid = memory.t[memory.t.length - 1].id;
      Ed.forEach(([a], i) => {
        if (a.id === latestTid) {
          sim.pulses.push({ e: i, u: -Math.random() * 0.9 });
        }
      });
    }
  }, [memory]);

  const stateRef = useRef({
    searchQuery,
    hiddenLobes,
    selectedNodeId,
    recalledKeys,
  });
  stateRef.current = {
    searchQuery,
    hiddenLobes,
    selectedNodeId,
    recalledKeys,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;
    let isVisible = true;
    let last = performance.now();

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        isVisible = entry.isIntersecting;
      });
    });
    observer.observe(canvas);

    const loop = () => {
      if (isDisposed) return;
      const now = performance.now();
      const dt = Math.min(0.15, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const sim = simRef.current;
      const {
        searchQuery: qRaw,
        hiddenLobes: off,
        selectedNodeId: selId,
        recalledKeys: cur,
      } = stateRef.current;
      const q = qRaw.trim().toLowerCase();

      const w = canvas.clientWidth;
      if (w > 0 && isVisible) {
        const d = window.devicePixelRatio || 1;
        const bh = w < 600 ? 400 : 440;
        if (sim.bw !== w || canvas.width !== Math.round(w * d)) {
          sim.bw = w;
          sim.bh = bh;
          canvas.width = Math.round(w * d);
          canvas.height = Math.round(bh * d);
          canvas.style.height = bh + 'px';
        }

        // Physics step
        const N = sim.nodes;
        const Ed = sim.edges;
        N.forEach((n) => {
          n.fx = 0;
          n.fy = 0;
        });
        for (let i = 0; i < N.length; i++) {
          const a = N[i];
          for (let j = i + 1; j < N.length; j++) {
            const b = N[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > 6400 || d2 < 0.01) continue;
            const k = (a.type === 't' || b.type === 't' ? 900 : 110) / (d2 + 30);
            const dist = Math.sqrt(d2);
            a.fx -= (dx / dist) * k;
            a.fy -= (dy / dist) * k;
            b.fx += (dx / dist) * k;
            b.fy += (dy / dist) * k;
          }
          if (a.type === 'e' && a.k) {
            const L = lobePos(BRAIN_LOBE_KEYS.indexOf(a.k), sim.bw, sim.bh);
            a.fx += (L[0] - a.x) * 0.006;
            a.fy += (L[1] - a.y) * 0.006;
          } else {
            a.fx += (sim.bw / 2 - a.x) * 0.01;
            a.fy += (sim.bh / 2 - a.y) * 0.01;
          }
        }
        Ed.forEach(([tn, en]) => {
          const dx = tn.x - en.x;
          const dy = tn.y - en.y;
          en.fx += dx * 0.0035;
          en.fy += dy * 0.0035;
          tn.fx -= dx * 0.0008;
          tn.fy -= dy * 0.0008;
        });
        N.forEach((n) => {
          n.vx = (n.vx + n.fx) * 0.84;
          n.vy = (n.vy + n.fy) * 0.84;
          n.x = clamp(n.x + n.vx, 16, sim.bw - 16);
          n.y = clamp(n.y + n.vy, 16, sim.bh - 16);
          n.a = Math.min(1, n.a + 0.05);
        });

        // Draw
        const c = canvas.getContext('2d');
        if (c) {
          c.setTransform(d, 0, 0, d, 0, 0);
          const bgGrad = c.createRadialGradient(
            sim.bw / 2,
            sim.bh / 2,
            20,
            sim.bw / 2,
            sim.bh / 2,
            sim.bw * 0.7,
          );
          bgGrad.addColorStop(0, '#17101f');
          bgGrad.addColorStop(1, '#050407');
          c.fillStyle = bgGrad;
          c.fillRect(0, 0, sim.bw, sim.bh);

          for (let k = 0; k < 70; k++) {
            c.fillStyle = '#f3efe8';
            c.globalAlpha = 0.08 + 0.2 * Math.abs(Math.sin(t * 0.5 + k));
            c.fillRect(
              pseudoRandom(k * 2.7) * sim.bw,
              pseudoRandom(k * 5.1) * sim.bh,
              1.3,
              1.3,
            );
          }
          c.globalAlpha = 1;

          BRAIN_LOBE_KEYS.forEach((k, i) => {
            const L = lobePos(i, sim.bw, sim.bh);
            const r = Math.min(sim.bw, sim.bh) * 0.26;
            const gr = c.createRadialGradient(L[0], L[1], 4, L[0], L[1], r);
            gr.addColorStop(0, BRAIN_LOBE_COLORS[k] + (off.has(k) ? '08' : '26'));
            gr.addColorStop(1, BRAIN_LOBE_COLORS[k] + '00');
            c.fillStyle = gr;
            c.fillRect(L[0] - r, L[1] - r, r * 2, r * 2);
            c.font = '9px JetBrains Mono,monospace';
            c.fillStyle = BRAIN_LOBE_COLORS[k] + 'aa';
            c.textAlign = 'center';
            c.fillText(BRAIN_LOBE_LABELS[k].toUpperCase(), L[0], L[1] + r * 0.78);
          });

          if (sim.rpStart !== null) {
            const u = (performance.now() - sim.rpStart) / 3500;
            if (u >= 1) sim.rpStart = null;
          }
          const ru =
            sim.rpStart !== null
              ? (performance.now() - sim.rpStart) / 3500
              : 1;

          const selN = selId ? sim.ix[selId] || null : null;
          const act = selN
            ? new Set([
                selN.id,
                ...Ed.filter((e) => e[0] === selN || e[1] === selN).flatMap(
                  (e) => [e[0].id, e[1].id],
                ),
              ])
            : null;

          const shown = (n: AtlasNode) =>
            !(n.type === 'e' && n.k && off.has(n.k));
          const match = (n: AtlasNode) =>
            !q || n.label.toLowerCase().includes(q);

          Ed.forEach(([a, b]) => {
            if (!shown(b) || !b.k) return;
            const dim =
              (act && !(act.has(a.id) && act.has(b.id))) ||
              (!match(b) && Boolean(q));
            c.strokeStyle = BRAIN_LOBE_COLORS[b.k];
            c.globalAlpha =
              (dim ? 0.03 : selN && (a === selN || b === selN) ? 0.55 : 0.14) *
              Math.min(a.a, b.a);
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(a.x, a.y);
            c.quadraticCurveTo(
              (a.x + b.x) / 2 + (b.y - a.y) * 0.12,
              (a.y + b.y) / 2 - (b.x - a.x) * 0.12,
              b.x,
              b.y,
            );
            c.stroke();
          });
          c.globalAlpha = 1;

          if (Ed.length && Math.random() < dt * 6) {
            sim.pulses.push({ e: (Math.random() * Ed.length) | 0, u: 0 });
          }
          sim.pulses = sim.pulses.filter((p) => p.u < 1);
          sim.pulses.forEach((p) => {
            p.u += dt * 0.55;
            if (p.u < 0) return;
            const E2 = Ed[p.e];
            if (!E2) return;
            const [a, b] = E2;
            if (!shown(b) || !b.k) return;
            const u = p.u;
            const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.12;
            const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.12;
            const x =
              (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * mx + u * u * b.x;
            const y =
              (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * my + u * u * b.y;
            c.fillStyle = BRAIN_LOBE_COLORS[b.k];
            c.shadowColor = BRAIN_LOBE_COLORS[b.k];
            c.shadowBlur = 10;
            c.beginPath();
            c.arc(x, y, 2.2, 0, 7);
            c.fill();
            c.shadowBlur = 0;
          });

          N.forEach((n, i) => {
            if (!shown(n)) return;
            const vis2 =
              sim.rpStart !== null
                ? Math.min(1, Math.max(0, ru * N.length * 1.2 - i))
                : 1;
            const al =
              n.a *
              vis2 *
              ((act && !act.has(n.id)) || (q && !match(n)) ? 0.16 : 1);
            if (al <= 0) return;
            c.globalAlpha = al;

            if (n.type === 't') {
              c.strokeStyle = '#ffe9b0';
              c.lineWidth = 1;
              c.globalAlpha = al * 0.5;
              c.beginPath();
              c.arc(n.x, n.y, n.r + 7 + Math.sin(t * 2) * 1.5, 0, 7);
              c.stroke();
              c.setLineDash([2, 5]);
              c.beginPath();
              c.arc(n.x, n.y, n.r + 15, t * 0.4, t * 0.4 + 6.28);
              c.stroke();
              c.setLineDash([]);
              c.globalAlpha = al;
              c.fillStyle = '#ffe9b0';
              c.shadowColor = '#ffb020';
              c.shadowBlur = 22;
              c.beginPath();
              c.arc(n.x, n.y, n.r, 0, 7);
              c.fill();
              c.shadowBlur = 0;
              c.font = '10px JetBrains Mono,monospace';
              c.fillStyle = '#ffe9b0';
              c.textAlign = 'center';
              c.fillText(shorten(n.label, 18), n.x, n.y + n.r + 26);
            } else if (n.e && n.k) {
              const sh3 = n.e.t.length > 1;
              c.fillStyle = BRAIN_LOBE_COLORS[n.k];
              c.shadowColor = BRAIN_LOBE_COLORS[n.k];
              c.shadowBlur = sh3 ? 14 : 4;
              c.beginPath();
              c.arc(n.x, n.y, n.r * n.a, 0, 7);
              c.fill();
              c.shadowBlur = 0;
              if (sh3) {
                c.strokeStyle = '#fff';
                c.globalAlpha = al * 0.8;
                c.lineWidth = 1.2;
                c.beginPath();
                c.arc(n.x, n.y, n.r + 3, 0, 7);
                c.stroke();
              }
              if (n.e.r) {
                c.fillStyle = '#fff';
                c.globalAlpha = al;
                c.fillRect(n.x - 1, n.y - n.r - 6, 2, 4);
              }
              if (cur.has(n.id)) {
                c.strokeStyle = '#fff';
                c.globalAlpha = al * (0.4 + 0.4 * Math.sin(t * 6));
                c.beginPath();
                c.arc(n.x, n.y, n.r + 7 + Math.sin(t * 6) * 2, 0, 7);
                c.stroke();
              }
            }
            c.globalAlpha = 1;
            if (
              n.id === selId ||
              n.id === sim.hovId ||
              (q && match(n) && n.type === 'e')
            ) {
              c.font = '10px JetBrains Mono,monospace';
              c.fillStyle = '#fff';
              c.textAlign = 'center';
              c.fillText(shorten(n.label, 28), n.x, n.y - n.r - 8);
            }
          });
          c.globalAlpha = 1;
        }
      }

      timerId = setTimeout(loop, 40);
    };

    timerId = setTimeout(loop, 40);
    return () => {
      isDisposed = true;
      observer.disconnect();
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  const pickNode = (clientX: number, clientY: number): AtlasNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: AtlasNode | null = null;
    let bestDist = 1e9;
    simRef.current.nodes.forEach((n) => {
      if (n.type === 'e' && n.k && hiddenLobes.has(n.k)) return;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < n.r + 12 && d < bestDist) {
        bestDist = d;
        best = n;
      }
    });
    return best;
  };

  const sharedBridgesCount = Object.values(memory.e).filter(
    (e) => e.t.length > 1,
  ).length;
  const totalMemoriesCount = Object.keys(memory.e).length;

  const selectedTarget = memory.t.find((t) => t.id === selectedNodeId);
  const selectedEntity = selectedNodeId ? memory.e[selectedNodeId] : undefined;

  return (
    <section className="box brain" id="brain">
      <div className="th">
        <div>
          <h2>Second brain · Neural Atlas</h2>
          <div className="mut">
            Every finished scan is remembered. Shared hosts, endpoints and
            libraries link your targets together.
          </div>
        </div>
        <span
          className="status-label"
          id="bst"
          style={{ color: memory.t.length ? '#a3e635' : '#ffb020' }}
        >
          {memory.t.length
            ? `${memory.t.length} targets · ${totalMemoriesCount} memories`
            : 'empty'}
        </span>
      </div>

      <div className="tiles" id="btl">
        <div className="tile">
          <b>{memory.t.length}</b>
          <span>targets remembered</span>
        </div>
        <div className="tile">
          <b>{totalMemoriesCount}</b>
          <span>memories</span>
        </div>
        <div className="tile">
          <b>{sharedBridgesCount}</b>
          <span>bridges between targets</span>
        </div>
        <div className="tile">
          <b id="brc">{recalledKeys.size}</b>
          <span>recalled this run</span>
        </div>
      </div>

      <div className="bctl">
        <input
          id="bq"
          placeholder="Search memory: host, endpoint, library…"
          aria-label="Search memory"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="chips" id="bk">
          {BRAIN_LOBE_KEYS.map((k) => {
            const isOff = hiddenLobes.has(k);
            return (
              <button
                type="button"
                key={k}
                className={`chp kf ${isOff ? 'off' : ''}`}
                onClick={() => {
                  setHiddenLobes((prev) => {
                    const next = new Set(prev);
                    if (next.has(k)) next.delete(k);
                    else next.add(k);
                    return next;
                  });
                }}
              >
                <s style={{ background: BRAIN_LOBE_COLORS[k] }} />
                {BRAIN_LOBE_LABELS[k]}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          id="bre"
          onClick={() => {
            simRef.current.rpStart = performance.now();
          }}
        >
          Replay
        </button>
        {!confirmingClear ? (
          <button
            type="button"
            id="bclr"
            onClick={() => setConfirmingClear(true)}
          >
            Forget all
          </button>
        ) : (
          <button
            type="button"
            id="bclr"
            style={{ borderColor: '#ff4d2e', color: '#ff4d2e' }}
            onClick={() => {
              onForgetAll();
              setSelectedNodeId(null);
              setConfirmingClear(false);
            }}
          >
            Confirm forget all
          </button>
        )}
      </div>

      <div className="bwrap">
        <canvas
          id="bc"
          ref={canvasRef}
          onPointerDown={(e) => {
            const picked = pickNode(e.clientX, e.clientY);
            setSelectedNodeId(picked ? picked.id : null);
          }}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse') {
              const picked = pickNode(e.clientX, e.clientY);
              simRef.current.hovId = picked ? picked.id : null;
            }
          }}
        />
        <div id="bov" className="mut">
          {memory.t.length === 0
            ? 'Run a scan. When it finishes, its findings become nodes here, and later scans light up whatever they share.'
            : ''}
        </div>
      </div>

      <div id="bi" className="binfo">
        {!selectedTarget && !selectedEntity && (
          <span>Tap a node to see where it was seen.</span>
        )}
        {selectedTarget && (() => {
          const es = Object.values(memory.e).filter((e) =>
            e.t.includes(selectedTarget.id),
          );
          const by: Record<string, number> = {};
          es.forEach((e) => {
            by[e.k] = (by[e.k] || 0) + 1;
          });
          const sharedCount = es.filter((e) => e.t.length > 1).length;
          return (
            <div>
              <b>{selectedTarget.name}</b> · {selectedTarget.kind} ·{' '}
              {selectedTarget.files} files ·{' '}
              {new Date(selectedTarget.ts).toLocaleString()}
              <br />
              {Object.entries(by).map(([k, v], idx) => (
                <span key={k}>
                  {idx > 0 && ' · '}
                  <span style={{ color: BRAIN_LOBE_COLORS[k as BrainLobeKey] }}>
                    {BRAIN_LOBE_LABELS[k as BrainLobeKey]} {v}
                  </span>
                </span>
              ))}
              <br />
              {sharedCount} memories are shared with other targets.
              <br />
              <button
                type="button"
                style={{ marginTop: 8 }}
                onClick={() => {
                  onForgetTarget(selectedTarget.id);
                  setSelectedNodeId(null);
                }}
              >
                Forget this target
              </button>
            </div>
          );
        })()}
        {selectedEntity && (() => {
          const ts = selectedEntity.t
            .map((id) => memory.t.find((x) => x.id === id)?.name)
            .filter(Boolean);
          return (
            <div>
              <b style={{ color: BRAIN_LOBE_COLORS[selectedEntity.k] }}>
                {BRAIN_LOBE_LABELS[selectedEntity.k]}
              </b>{' '}
              {selectedEntity.v}
              {selectedEntity.r ? ' · from REA evidence' : ''}
              <br />
              Seen in {ts.length} target{ts.length === 1 ? '' : 's'}:{' '}
              {ts.join(', ')}
              <br />
              First seen in file: {selectedEntity.f}
              {ts.length > 1 && (
                <>
                  <br />
                  This is a bridge: the same item appears in more than one
                  target.
                </>
              )}
            </div>
          );
        })()}
      </div>
    </section>
  );
}
