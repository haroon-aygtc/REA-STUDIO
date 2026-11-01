import { useEffect, useRef } from 'react';
import {
  AGENTS,
  FINDING_COLORS,
  SUPERVISOR_CONFIG,
  TAG_COLORS,
} from '../constants/config';
import { BOTS } from '../constants/botSprites';
import type {
  CheckItem,
  DocLine,
  Finding,
  HashedFile,
  RebuilderDeliveryItem,
  ScaffoldFile,
  SpecItem,
  SupervisorAuditEntry,
} from '../types/studio';
import {
  basename,
  clamp,
  formatBytes,
  pseudoRandom,
  shorten,
} from '../utils/analyzer';

interface DepartmentsGridProps {
  total: number;
  running: boolean;
  files: HashedFile[];
  findings: Finding[];
  spec: SpecItem[];
  scaffold: ScaffoldFile[];
  checks: CheckItem[];
  audits: SupervisorAuditEntry[];
  agentStatuses: string[];
  supervisorStatus: string;
  agentCounts: number[];
  activeAgentIndex: number;
  supervisorPhase: 'idle' | 'go' | 'check' | 'back';
  supervisorTargetAgent: number;
  agentLogs: [
    HashedFile[],
    Finding[],
    SpecItem[],
    DocLine[],
    RebuilderDeliveryItem[],
    CheckItem[],
  ];
  rebuilderNote: string;
  verifierNote: string;
}

export function DepartmentsGrid({
  total,
  running,
  files,
  findings,
  spec,
  scaffold,
  checks,
  audits,
  agentStatuses,
  supervisorStatus,
  agentCounts,
  activeAgentIndex,
  supervisorPhase,
  supervisorTargetAgent,
  agentLogs,
  rebuilderNote,
  verifierNote,
}: DepartmentsGridProps) {
  const canvasesRef = useRef<(HTMLCanvasElement | null)[]>([]);
  const logContainersRef = useRef<(HTMLDivElement | null)[]>([]);
  const botImagesRef = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    botImagesRef.current = BOTS.map((u) => {
      const m = new Image();
      m.src = u;
      return m;
    });
  }, []);

  // Auto-scroll log lists when updated
  useEffect(() => {
    logContainersRef.current.forEach((el) => {
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, [agentLogs, audits]);

  const propsRef = useRef({
    total,
    running,
    files,
    findings,
    spec,
    scaffold,
    checks,
    audits,
    agentStatuses,
    agentCounts,
    activeAgentIndex,
    supervisorPhase,
    supervisorTargetAgent,
    rebuilderNote,
    agentLogs,
  });
  propsRef.current = {
    total,
    running,
    files,
    findings,
    spec,
    scaffold,
    checks,
    audits,
    agentStatuses,
    agentCounts,
    activeAgentIndex,
    supervisorPhase,
    supervisorTargetAgent,
    rebuilderNote,
    agentLogs,
  };

  useEffect(() => {
    let rafId = 0;
    const tw = { n: -1, t: 0 };
    let gv = 0;

    const tx = (
      c: CanvasRenderingContext2D,
      s: string | number,
      x: number,
      y: number,
      col: string,
      sz = 10,
      al: CanvasTextAlign = 'left',
    ) => {
      c.font = sz + 'px JetBrains Mono,monospace';
      c.fillStyle = col;
      c.textAlign = al;
      c.fillText(String(s), x, y);
    };

    const drawSpr = (
      c: CanvasRenderingContext2D,
      i: number,
      x: number,
      y: number,
      Wd: number,
      act: boolean,
      t: number,
    ) => {
      const im = botImagesRef.current[i];
      if (!im || !im.complete || !im.naturalWidth) return;
      const h = (Wd * im.naturalHeight) / im.naturalWidth;
      const b = Math.sin(t * (act ? 9 : 2.2) + i) * (act ? 3 : 1.2);
      c.save();
      if (act) {
        c.shadowColor = i === 6 ? '#f3efe8' : AGENTS[i].color;
        c.shadowBlur = 18;
      }
      c.drawImage(im, x - Wd / 2, y - h + b, Wd, h);
      c.restore();
    };

    const drawCardCanvas = (
      id: number,
      c: CanvasRenderingContext2D,
      w: number,
      h: number,
      t: number,
      col: string,
    ) => {
      const p = propsRef.current;

      if (id === 0) {
        const tot = p.total || 1;
        const got = p.files.length;
        const gw = Math.min(w - 110, w * 0.46);
        const cols = Math.max(4, Math.floor(gw / 9));
        const rows = Math.max(2, Math.floor((h - 34) / 9));
        const N = cols * rows;
        const lit = p.total ? Math.min(N, Math.round((got / tot) * N)) : 0;

        for (let k = 0; k < N; k++) {
          const x = 12 + (k % cols) * 9;
          const y = 12 + Math.floor(k / cols) * 9;
          c.fillStyle = k < lit ? col : '#ffffff14';
          c.globalAlpha = k < lit ? 0.55 + 0.45 * Math.sin(t * 3 + k) : 1;
          c.fillRect(x, y, 7, 7);
        }
        c.globalAlpha = 1;
        if (lit < N && p.running) {
          const x = 12 + (lit % cols) * 9;
          const y = 12 + Math.floor(lit / cols) * 9;
          c.fillStyle = '#fff';
          c.fillRect(x - 1, y - 1, 9, 9);
        }
        tx(c, `${got} / ${p.total} hashed`, 12, h - 8, col);
        const fx = 12 + cols * 9 + 14;
        const L = p.files.slice(-7);
        L.forEach((f, i) => {
          c.globalAlpha = 0.3 + (0.7 * (i + 1)) / L.length;
          tx(c, f.hash, fx, 18 + i * 14, col);
          tx(
            c,
            shorten(basename(f.path), Math.max(4, Math.floor((w - fx - 120) / 6))),
            fx + 54,
            18 + i * 14,
            '#d8d2c6',
          );
          c.globalAlpha = 1;
        });
      } else if (id === 1) {
        const r = h / 2 - 10;
        const cx = r + 16;
        const cy = h / 2;
        const a = (t * 1.7) % (Math.PI * 2);
        c.strokeStyle = col;
        c.globalAlpha = 0.3;
        c.lineWidth = 1;
        [1, 0.66, 0.33].forEach((k) => {
          c.beginPath();
          c.arc(cx, cy, r * k, 0, 7);
          c.stroke();
        });
        c.beginPath();
        c.moveTo(cx - r, cy);
        c.lineTo(cx + r, cy);
        c.moveTo(cx, cy - r);
        c.lineTo(cx, cy + r);
        c.stroke();
        c.globalAlpha = 1;

        for (let k = 0; k < 14; k++) {
          c.fillStyle = col;
          c.globalAlpha = 0.1 * (1 - k / 14);
          c.beginPath();
          c.moveTo(cx, cy);
          c.arc(cx, cy, r, a - k * 0.05 - 0.05, a - k * 0.05);
          c.closePath();
          c.fill();
        }
        c.globalAlpha = 1;

        const F = p.findings.slice(-70);
        F.forEach((f, i) => {
          const j = p.findings.length - F.length + i;
          const ang = pseudoRandom(j * 3.1) * 6.283;
          const rad = (0.15 + 0.8 * pseudoRandom(j * 7.7)) * r;
          const d = (((a - ang) % 6.283) + 6.283) % 6.283;
          const al = Math.max(0.28, 1 - d / 6.283);
          c.fillStyle = FINDING_COLORS[f.kind] || '#fff';
          c.globalAlpha = al;
          c.shadowColor = c.fillStyle;
          c.shadowBlur = d < 0.5 ? 10 : 0;
          c.beginPath();
          c.arc(
            cx + Math.cos(ang) * rad,
            cy + Math.sin(ang) * rad,
            d < 0.5 ? 3.6 : 2.4,
            0,
            7,
          );
          c.fill();
          c.shadowBlur = 0;
        });
        c.globalAlpha = 1;

        const x0 = cx + r + 22;
        const cnt: Record<string, number> = {};
        p.findings.forEach((f) => {
          cnt[f.kind] = (cnt[f.kind] || 0) + 1;
        });
        Object.entries(cnt)
          .sort((a2, b2) => b2[1] - a2[1])
          .slice(0, 5)
          .forEach(([k, v], i) => {
            const kCol = FINDING_COLORS[k as Finding['kind']] || '#fff';
            tx(c, k, x0, 20 + i * 15, kCol);
            c.fillStyle = kCol;
            c.globalAlpha = 0.7;
            c.fillRect(x0 + 62, 12 + i * 15, Math.min(w - x0 - 130, v * 3), 6);
            c.globalAlpha = 1;
            tx(
              c,
              v,
              x0 + 66 + Math.min(w - x0 - 130, v * 3),
              19 + i * 15,
              '#d8d2c6',
            );
          });
        const l = p.findings[p.findings.length - 1];
        if (l) {
          tx(
            c,
            shorten(l.kind + ' ' + l.value, Math.max(8, Math.floor((w - x0 - 70) / 6))),
            x0,
            h - 8,
            '#d8d2c6',
          );
        }
      } else if (id === 2) {
        const n = p.agentCounts[2] || 0;
        if (n !== tw.n) {
          tw.n = n;
          tw.t = t;
        }
        const L = p.spec.slice(0, n).slice(-6);
        const px = 12;
        const pw = Math.min(w - 120, w * 0.78);
        c.fillStyle = '#14110e';
        c.strokeStyle = col;
        c.globalAlpha = 0.9;
        c.lineWidth = 1;
        c.fillRect(px, 10, pw, h - 20);
        c.strokeRect(px, 10, pw, h - 20);
        c.globalAlpha = 1;
        tx(c, 'SPEC.md', px + 8, 22, col, 9);

        L.forEach((l, i) => {
          const last = i === L.length - 1;
          const s = last
            ? l.text.slice(0, Math.floor((t - tw.t) * 45))
            : l.text;
          c.fillStyle = TAG_COLORS[l.tag];
          c.fillRect(px + 8, 30 + i * 14, 3, 9);
          tx(
            c,
            shorten(s, Math.floor((pw - 30) / 6.1)),
            px + 16,
            38 + i * 14,
            '#e8e2d6',
          );
          if (last && p.running && ((t * 2) | 0) % 2) {
            c.fillRect(
              px +
                16 +
                Math.min(s.length, Math.floor((pw - 30) / 6.1)) * 6.1,
              30 + i * 14,
              5,
              9,
            );
          }
        });
        const cn = { observed: 0, inferred: 0, unknown: 0 };
        p.spec.slice(0, n).forEach((l) => {
          cn[l.tag]++;
        });
        let y = 20;
        (Object.entries(cn) as [keyof typeof cn, number][]).forEach(([k, v]) => {
          tx(c, k[0].toUpperCase() + ' ' + v, px + pw + 10, y, TAG_COLORS[k]);
          y += 15;
        });
      } else if (id === 3) {
        const done = p.agentStatuses[3] === 'done';
        const prg = done ? 1 : Math.min(0.97, (p.agentCounts[3] || 0) / 45);
        const ep = p.findings.filter((f) => f.kind === 'endpoint');
        const lib = p.findings.filter(
          (f) => f.kind === 'dep' || f.kind === 'import',
        );
        const ax = w * 0.4;
        const ay = h / 2;
        const nd: [number, number, string, number][] = [
          ...ep
            .slice(0, 6)
            .map(
              (f, i, a): [number, number, string, number] => [
                w * 0.68,
                14 + (i * (h - 28)) / Math.max(1, a.length - 1),
                (f.method || 'GET') + ' ' + f.value,
                0,
              ],
            ),
          ...lib
            .slice(0, 3)
            .map(
              (f, i, a): [number, number, string, number] => [
                w * 0.12,
                22 + (i * (h - 44)) / Math.max(1, a.length - 1),
                f.value,
                1,
              ],
            ),
        ];

        nd.forEach((q, i) => {
          const f = clamp(prg * (nd.length + 1) - i, 0, 1);
          if (f <= 0) return;
          c.strokeStyle = col;
          c.globalAlpha = 0.6;
          c.beginPath();
          c.moveTo(ax, ay);
          c.lineTo(ax + (q[0] - ax) * f, ay + (q[1] - ay) * f);
          c.stroke();
          c.globalAlpha = 1;
          if (f >= 1) {
            c.fillStyle = '#14110e';
            c.strokeStyle = col;
            c.beginPath();
            c.arc(q[0], q[1], 5, 0, 7);
            c.fill();
            c.stroke();
            tx(
              c,
              shorten(q[2], q[3] ? 10 : 18),
              q[0] + (q[3] ? -9 : 9),
              q[1] + 3,
              '#d8d2c6',
              9,
              q[3] ? 'right' : 'left',
            );
          }
        });
        c.fillStyle = col;
        c.shadowColor = col;
        c.shadowBlur = 12;
        c.beginPath();
        c.arc(ax, ay, 9, 0, 7);
        c.fill();
        c.shadowBlur = 0;
        tx(c, 'APP', ax, ay + 3, '#0a0908', 8, 'center');

        const docsText = p.agentLogs[3].map((d) => d.doc).join(' ');
        (['PRD', 'STACK', 'FLOW'] as const).forEach((d, i) => {
          const on = docsText.includes(d);
          c.globalAlpha = on ? 1 : 0.3;
          c.strokeStyle = col;
          c.strokeRect(w - 120 + i * 38, h - 24, 34, 14);
          tx(c, d, w - 103 + i * 38, h - 14, col, 8, 'center');
          c.globalAlpha = 1;
        });
      } else if (id === 4) {
        const wx = w * 0.4;
        const n4Count = p.agentCounts[4] || 0;
        const built = Math.max(0, n4Count - p.spec.length);
        const n4 = p.rebuilderNote;

        c.fillStyle = '#14110e';
        c.strokeStyle = col;
        c.strokeRect(12, 18, wx - 40, h - 50);
        c.fillRect(12, 18, wx - 40, h - 50);
        tx(c, 'SPEC.md', 22, 32, col, 9);
        tx(c, 'read only', 22, 44, '#9a9184', 8);
        for (let k = 0; k < Math.min(6, n4Count); k++) {
          c.fillStyle = col;
          c.globalAlpha = 0.5;
          c.fillRect(22, 52 + k * 8, wx - 62 - (k % 3) * 10, 3);
        }
        c.globalAlpha = 1;

        c.setLineDash([5, 4]);
        c.strokeStyle = '#ff4d2e';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(wx, 6);
        c.lineTo(wx, h - 6);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = '#ff4d2e';
        c.fillRect(wx - 3, h * 0.3 - 6, 6, 12);
        c.fillRect(wx - 3, h * 0.7 - 6, 6, 12);
        tx(c, 'in', wx - 8, h * 0.3 + 3, '#ff4d2e', 8, 'right');
        tx(c, 'out', wx + 8, h * 0.7 + 3, '#ff4d2e', 8);

        if (p.activeAgentIndex === 4) {
          for (let k = 0; k < 4; k++) {
            const u = (t * 0.7 + k / 4) % 1;
            c.fillStyle = col;
            c.beginPath();
            c.arc(12 + (wx - 12) * u, h * 0.3, 2.5, 0, 7);
            c.fill();
          }
        }

        p.scaffold.slice(0, built).forEach((f, i) => {
          const x = wx + 18 + (i % 2) * Math.max(70, (w - wx - 110) / 2);
          const y = 14 + Math.floor(i / 2) * 34;
          const s = clamp((n4Count - p.spec.length - i) * 0.6, 0, 1);
          c.globalAlpha = s;
          c.fillStyle = '#14110e';
          c.strokeStyle = col;
          c.fillRect(
            x,
            y + (1 - s) * 12,
            Math.max(64, (w - wx - 120) / 2 - 6),
            26,
          );
          c.strokeRect(
            x,
            y + (1 - s) * 12,
            Math.max(64, (w - wx - 120) / 2 - 6),
            26,
          );
          tx(c, shorten(f.path, 13), x + 6, y + 16 + (1 - s) * 12, '#e8e2d6', 9);
          c.globalAlpha = 1;
        });

        [
          'read target files',
          'touch the page DOM',
          'read page storage',
          'network request',
        ].forEach((prb, i) => {
          const ok = n4.includes(prb + ' blocked');
          tx(
            c,
            (ok ? '✓ ' : '· ') + shorten(prb, 14),
            12 + (i % 2) * (wx / 2),
            h - 12 - (i > 1 ? 0 : 12),
            ok ? '#a3e635' : '#9a9184',
            8,
          );
        });
      } else if (id === 5) {
        const ck = p.checks;
        const ratio = ck.length
          ? ck.filter((x) => x.ok).length / ck.length
          : 0;
        gv += (ratio - gv) * 0.08;
        const cx = Math.min(w * 0.3, 120);
        const cy = h - 18;
        const r = Math.min(h - 34, cx - 10);

        c.lineWidth = 9;
        c.lineCap = 'round';
        c.strokeStyle = '#ffffff14';
        c.beginPath();
        c.arc(cx, cy, r, Math.PI, 0);
        c.stroke();
        c.strokeStyle =
          gv > 0.8 ? '#a3e635' : gv > 0.5 ? '#fbbf24' : '#ff4d2e';
        c.beginPath();
        c.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * gv);
        c.stroke();
        c.lineCap = 'butt';

        const a = Math.PI + Math.PI * gv;
        c.strokeStyle = '#f3efe8';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(
          cx + Math.cos(a) * (r - 12),
          cy + Math.sin(a) * (r - 12),
        );
        c.stroke();
        tx(
          c,
          ck.length ? Math.round(ratio * 100) + '%' : '—',
          cx,
          cy - r * 0.35,
          '#f3efe8',
          18,
          'center',
        );
        tx(
          c,
          `${ck.filter((x) => x.ok).length}/${ck.length} checks`,
          cx,
          cy + 12,
          '#9a9184',
          9,
          'center',
        );

        const x0 = cx * 2 + 20;
        const cols = Math.max(4, Math.floor((w - x0 - 60) / 10));
        const L = ck.slice(-cols * 7);
        L.forEach((x, i) => {
          c.fillStyle = x.ok ? '#a3e635' : '#ff4d2e';
          c.globalAlpha = x.ok ? 0.7 : 1;
          c.fillRect(
            x0 + (i % cols) * 10,
            12 + Math.floor(i / cols) * 10,
            8,
            8,
          );
        });
        c.globalAlpha = 1;
      } else if (id === 6) {
        const R = p.audits;
        AGENTS.forEach((a, i) => {
          const e = R[i];
          const x = 14 + (i % 2) * ((w - 80) / 2);
          const y = 24 + Math.floor(i / 2) * 26;
          const ok = e && e.ok;
          c.strokeStyle = e ? (ok ? '#a3e635' : '#ff4d2e') : '#ffffff33';
          c.lineWidth = 1.5;
          c.beginPath();
          c.arc(x + 6, y - 4, 7, 0, 7);
          c.stroke();
          if (e) {
            c.beginPath();
            if (ok) {
              c.moveTo(x + 2, y - 4);
              c.lineTo(x + 5, y);
              c.lineTo(x + 10, y - 8);
            } else {
              c.moveTo(x + 3, y - 7);
              c.lineTo(x + 9, y - 1);
              c.moveTo(x + 9, y - 7);
              c.lineTo(x + 3, y - 1);
            }
            c.stroke();
          }
          tx(c, a.name.toLowerCase(), x + 20, y, e ? '#e8e2d6' : '#9a9184', 10);
        });
        const f = R[6];
        const statusStr = f
          ? f.text.slice(0, 40)
          : p.supervisorPhase === 'check'
            ? `auditing ${(AGENTS[p.supervisorTargetAgent]?.name || '').toLowerCase()}…`
            : 'on watch';
        tx(
          c,
          statusStr,
          14,
          h - 12,
          f ? (f.ok ? '#a3e635' : '#ff4d2e') : '#f3efe8',
          10,
        );
      }
    };

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;
    const visMap = new Map<Element, boolean>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        visMap.set(e.target, e.isIntersecting);
      });
    });
    canvasesRef.current.forEach((cv) => {
      if (cv) observer.observe(cv);
    });

    const loop = () => {
      if (isDisposed) return;
      const t = performance.now() / 1000;
      const p = propsRef.current;

      for (let i = 0; i <= 6; i++) {
        const cv = canvasesRef.current[i];
        if (!cv || visMap.get(cv) === false) continue;
        const w = cv.clientWidth;
        const h = 132;
        const r = window.devicePixelRatio || 1;
        if (!w) continue;
        if (cv.width !== Math.round(w * r) || cv.height !== Math.round(h * r)) {
          cv.width = Math.round(w * r);
          cv.height = Math.round(h * r);
        }
        const c = cv.getContext('2d');
        if (!c) continue;
        c.setTransform(r, 0, 0, r, 0, 0);
        c.clearRect(0, 0, w, h);

        const col = i === 6 ? SUPERVISOR_CONFIG.color : AGENTS[i].color;
        const act =
          i === 6 ? p.supervisorPhase !== 'idle' : p.activeAgentIndex === i;

        drawCardCanvas(i, c, w, h, t, col);
        drawSpr(c, i, w - 30, h - 6, i === 6 ? 44 : 40, act, t);

        c.fillStyle = '#ffffff';
        c.globalAlpha = 0.025;
        for (let y = 0; y < h; y += 3) {
          c.fillRect(0, y, w, 1);
        }
        c.globalAlpha = 1;
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

  return (
    <div id="dg">
      {/* 00 Supervisor Card */}
      <section
        className={`dp ${supervisorPhase !== 'idle' ? 'live' : ''}`}
        style={{ '--k': SUPERVISOR_CONFIG.color } as React.CSSProperties}
      >
        <div className="ph">
          <span>
            <img alt="" src={SUPERVISOR_CONFIG.spriteUrl} referrerPolicy="no-referrer" />
            <b>00</b> supervisor / audit
          </span>
          <span className="ct" id="c6">
            {audits.length}
          </span>
        </div>
        <div className="st" id="s6">
          {supervisorStatus}
        </div>
        <canvas
          className="dv"
          ref={(el) => {
            canvasesRef.current[6] = el;
          }}
        />
        <div
          className="ls"
          id="l6"
          ref={(el) => {
            logContainersRef.current[6] = el;
          }}
        >
          {audits.map((a, idx) => (
            <div key={idx} className={a.ok ? 'ok' : 'bad'}>
              {a.ok ? 'pass' : 'fail'} {a.text}
            </div>
          ))}
        </div>
      </section>

      {/* 01 - 06 Department Cards */}
      {AGENTS.map((agent, i) => {
        const isLive = activeAgentIndex === i;
        return (
          <section
            key={agent.id}
            className={`dp ${isLive ? 'live' : ''}`}
            style={{ '--k': agent.color } as React.CSSProperties}
          >
            <div className="ph">
              <span>
                <img alt="" src={agent.spriteUrl} referrerPolicy="no-referrer" />
                <b>0{i + 1}</b> {agent.name.toLowerCase()} /{' '}
                {agent.department.toLowerCase()}
              </span>
              <span className="ct" id={`c${i}`}>
                {agentCounts[i] || 0}
              </span>
            </div>
            <div className="st" id={`s${i}`}>
              {agentStatuses[i] || 'waiting'}
            </div>
            <canvas
              className="dv"
              ref={(el) => {
                canvasesRef.current[i] = el;
              }}
            />
            <div
              className="ls"
              id={`l${i}`}
              ref={(el) => {
                logContainersRef.current[i] = el;
              }}
            >
              {i === 0 &&
                agentLogs[0].slice(-70).map((f, idx) => (
                  <div key={idx}>
                    <span
                      className="k"
                      style={{ background: FINDING_COLORS.file }}
                    />
                    {f.path}{' '}
                    <em>
                      {formatBytes(f.size)} · {f.hash}
                    </em>
                  </div>
                ))}
              {i === 1 &&
                agentLogs[1].slice(-70).map((f, idx) => (
                  <div key={idx}>
                    <span
                      className="k"
                      style={{ background: FINDING_COLORS[f.kind] }}
                    />
                    {f.kind} {f.value}{' '}
                    <em>
                      {f.file}:{f.line}
                    </em>
                  </div>
                ))}
              {i === 2 &&
                agentLogs[2].slice(-70).map((s, idx) => (
                  <div key={idx}>
                    <b className={`tag-${s.tag}`}>[{s.tag}]</b> {s.text}{' '}
                    <em>{s.refs.join(' ')}</em>
                  </div>
                ))}
              {i === 3 &&
                agentLogs[3].slice(-70).map((d, idx) => (
                  <div key={idx}>
                    <b>{d.doc}</b> {d.line}
                  </div>
                ))}
              {i === 4 &&
                agentLogs[4].slice(-70).map((x, idx) =>
                  x.kind === 'spec' ? (
                    <div key={idx}>
                      <b>SPEC.md</b> {x.line}
                    </div>
                  ) : (
                    <div key={idx}>
                      <b>{x.path}</b> <em>{x.bytes} bytes</em>
                    </div>
                  ),
                )}
              {i === 5 &&
                agentLogs[5].slice(-70).map((c, idx) => (
                  <div key={idx} className={c.ok ? 'ok' : 'bad'}>
                    {c.ok ? 'pass' : 'fail'} [{c.group}] {c.name}
                  </div>
                ))}
            </div>
            {i === 4 && (
              <div className="note" id="n4">
                {rebuilderNote}
              </div>
            )}
            {i === 5 && (
              <div className="note" id="n5">
                {verifierNote}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
