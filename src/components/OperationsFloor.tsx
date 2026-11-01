import { useEffect, useRef } from 'react';
import { AGENTS, FINDING_COLORS } from '../constants/config';
import { BOTS } from '../constants/botSprites';
import type {
  AgentSimState,
  Finding,
  PendingJobItem,
  SupervisorSimState,
} from '../types/studio';
import { pseudoRandom } from '../utils/analyzer';

interface RoomGeometry {
  x: number;
  y: number;
  a: number;
  b: number;
  wh: number;
  row: number;
  d: [number, number];
}

interface RackGeometry {
  x: number;
  y: number;
  a: number;
  b: number;
  h: number;
  cols: number;
  rows: number;
}

interface FloorLayout {
  nar: boolean;
  rw: number;
  hall: number[];
  lane: number;
  T: [number, number];
  H: [number, number][];
  B: [number, number][];
  post: [number, number];
  s: number;
}

interface OperationsFloorProps {
  targetName: string;
  totalFiles: number;
  grabCountRef: React.MutableRefObject<number>;
  activeAgentName: string;
  elapsedText: string;
  agentStatuses: string[];
  findings: Finding[];
  events: string[];
  agentsSimRef: React.MutableRefObject<AgentSimState[]>;
  supervisorSimRef: React.MutableRefObject<SupervisorSimState>;
  onDeliverJob: (agentIndex: number, job: PendingJobItem[]) => void;
  onTriggerSupervisorAudit: (agentIndex: number) => void;
}

const pt = (
  R: { x: number; y: number; a: number; b: number },
  u: number,
  v: number,
  z = 0,
): [number, number] => [
  R.x + (u - v) * R.a,
  R.y - R.b + (u + v) * R.b - z,
];

const poly = (
  c: CanvasRenderingContext2D,
  ps: [number, number][],
  f?: string | null,
  s?: string | null,
) => {
  c.beginPath();
  ps.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  c.closePath();
  if (f) {
    c.fillStyle = f;
    c.fill();
  }
  if (s) {
    c.strokeStyle = s;
    c.lineWidth = 1;
    c.stroke();
  }
};

const box3d = (
  c: CanvasRenderingContext2D,
  R: { x: number; y: number; a: number; b: number },
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  z0: number,
  z1: number,
  ct: string,
  cl: string,
  cr: string,
  s?: string,
) => {
  poly(
    c,
    [pt(R, u0, v1, z0), pt(R, u1, v1, z0), pt(R, u1, v1, z1), pt(R, u0, v1, z1)],
    cl,
    s,
  );
  poly(
    c,
    [pt(R, u1, v0, z0), pt(R, u1, v1, z0), pt(R, u1, v1, z1), pt(R, u1, v0, z1)],
    cr,
    s,
  );
  poly(
    c,
    [pt(R, u0, v0, z1), pt(R, u1, v0, z1), pt(R, u1, v1, z1), pt(R, u0, v1, z1)],
    ct,
    s,
  );
};

const lerp2d = (
  a: [number, number],
  b: [number, number],
  u: number,
): [number, number] => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

const labelJob = (j: PendingJobItem): string => {
  const it = j.item as Record<string, unknown>;
  const s =
    it?.path || it?.value || it?.text || it?.line || it?.name || 'data';
  return String(s).slice(0, 20);
};

const drawChip = (
  c: CanvasRenderingContext2D,
  t: string,
  x: number,
  y: number,
  col: string,
) => {
  c.font = '9px JetBrains Mono,monospace';
  const w = c.measureText(t).width + 10;
  c.fillStyle = '#0d0b1b';
  c.strokeStyle = col;
  c.lineWidth = 1;
  c.fillRect(x - w / 2, y - 9, w, 14);
  c.strokeRect(x - w / 2, y - 9, w, 14);
  c.fillStyle = '#e8e6ff';
  c.textAlign = 'center';
  c.fillText(t, x, y + 1);
};

export function OperationsFloor({
  targetName,
  totalFiles,
  grabCountRef,
  activeAgentName,
  elapsedText,
  agentStatuses,
  findings,
  events,
  agentsSimRef,
  supervisorSimRef,
  onDeliverJob,
  onTriggerSupervisorAudit,
}: OperationsFloorProps) {
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const botImagesRef = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    botImagesRef.current = BOTS.map((u) => {
      const m = new Image();
      m.src = u;
      return m;
    });
  }, []);

  const latestPropsRef = useRef({
    targetName,
    totalFiles,
    agentStatuses,
    findings,
    events,
    onDeliverJob,
    onTriggerSupervisorAudit,
  });
  latestPropsRef.current = {
    targetName,
    totalFiles,
    agentStatuses,
    findings,
    events,
    onDeliverJob,
    onTriggerSupervisorAudit,
  };

  useEffect(() => {
    const cvs = sceneCanvasRef.current;
    const mapCvs = mapCanvasRef.current;
    if (!cvs || !mapCvs) return;

    let cw = 0;
    let ch = 0;
    let ZR: RoomGeometry[] = [];
    let ZK: RackGeometry = {
      x: 0,
      y: 0,
      a: 20,
      b: 10,
      h: 120,
      cols: 2,
      rows: 18,
    };
    let P: FloorLayout = {
      nar: false,
      rw: 180,
      hall: [160, 320],
      lane: 80,
      T: [80, 140],
      H: AGENTS.map(() => [0, 0]),
      B: AGENTS.map(() => [0, 0]),
      post: [80, 160],
      s: 1,
    };
    let mapW = 300;
    let mapH = 240;

    const RM = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

    const fit = () => {
      const d = window.devicePixelRatio || 1;
      const parentW = cvs.parentElement?.clientWidth || 800;
      cw = Math.max(280, parentW - 32);
      const nar = cw < 700;
      const rw = nar ? cw * 0.44 : Math.min(230, cw * 0.25);
      const b = rw / 4;
      const wh = rw * 0.34;
      const sl: [number, number][] = nar
        ? [
            [0.27, 0],
            [0.73, 0],
            [0.73, 1],
            [0.27, 1],
            [0.27, 2],
            [0.73, 2],
          ]
        : [
            [0.31, 0],
            [0.565, 0],
            [0.82, 0],
            [0.82, 1],
            [0.565, 1],
            [0.31, 1],
          ];
      const rows = nar ? 3 : 2;
      let y = nar ? 124 : 36;
      const oy: number[] = [];
      const hall: number[] = [];
      for (let r = 0; r < rows; r++) {
        oy[r] = y + wh + b;
        hall[r] = oy[r] + b + 12;
        y = hall[r] + 8;
      }
      ch = Math.round(y + 10);
      cvs.style.width = cw + 'px';
      cvs.style.height = ch + 'px';
      cvs.width = Math.round(cw * d);
      cvs.height = Math.round(ch * d);
      const ctx = cvs.getContext('2d');
      ctx?.setTransform(d, 0, 0, d, 0, 0);

      ZR = sl.map(([sx, r]) => {
        const R: RoomGeometry = {
          x: cw * sx,
          y: oy[r],
          a: rw / 2,
          b,
          wh,
          row: r,
          d: [cw * sx, oy[r] + b + 8],
        };
        return R;
      });

      ZK = nar
        ? { x: cw / 2, y: 88, a: 58, b: 14, h: 26, cols: 14, rows: 3 }
        : {
            x: cw * 0.07,
            y: ch * 0.55,
            a: 20,
            b: 10,
            h: Math.min(ch * 0.42, 190),
            cols: 2,
            rows: 18,
          };

      const T: [number, number] = nar
        ? [cw / 2, ZK.y + ZK.b + 12]
        : [ZK.x + ZK.a + 18, ZK.y];

      P = {
        nar,
        rw,
        hall,
        lane: T[0],
        T,
        H: ZR.map((R) => pt(R, 0.5, 0.5, 11)),
        B: ZR.map((R) => pt(R, 0.71, 0.22, 18)),
        post: nar ? [cw / 2, hall[1]] : [T[0], hall[0]],
        s: 1,
      };

      const mpParentW = mapCvs.parentElement?.clientWidth || 400;
      mapW = Math.max(200, mpParentW - 32);
      mapH = 240;
      mapCvs.style.width = mapW + 'px';
      mapCvs.style.height = mapH + 'px';
      mapCvs.width = Math.round(mapW * d);
      mapCvs.height = Math.round(mapH * d);
      const mCtx = mapCvs.getContext('2d');
      mCtx?.setTransform(d, 0, 0, d, 0, 0);
    };

    fit();
    window.addEventListener('resize', fit);

    const setPath = (
      o: { pa: [number, number][]; pl: number[]; dur: number },
      pts: [number, number][],
      sp: number,
    ) => {
      const L = [0];
      for (let k = 1; k < pts.length; k++) {
        L.push(
          L[k - 1] +
            Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]),
        );
      }
      o.pa = pts;
      o.pl = L;
      o.dur = RM ? 0.02 : Math.min(0.28, Math.max(0.06, L[L.length - 1] / sp));
    };

    const getPosAlongPath = (
      o: { pa: [number, number][]; pl: number[]; dir: number },
      u: number,
    ): [number, number] => {
      if (!o.pa.length) return [0, 0];
      const s = u * o.pl[o.pl.length - 1];
      let k = 1;
      while (k < o.pl.length - 1 && o.pl[k] < s) k++;
      const a = o.pa[k - 1];
      const b = o.pa[k];
      const sg = o.pl[k] - o.pl[k - 1];
      const f = sg > 0 ? Math.min(1, Math.max(0, (s - o.pl[k - 1]) / sg)) : 1;
      o.dir = Math.sign(b[0] - a[0]) || o.dir || 0;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    };

    const zn = (k: 't' | number) =>
      k === 't'
        ? { p: P.T, row: -1, d: null as [number, number] | null }
        : {
            p: P.H[k],
            row: ZR[k].row,
            d: ZR[k].d as [number, number] | null,
          };

    const zroute = (
      a: { p: [number, number]; row: number; d: [number, number] | null },
      b: { p: [number, number]; row: number; d: [number, number] | null },
    ): [number, number][] => {
      const L = P.lane;
      const H = P.hall;
      const pts: [number, number][] = [a.p];
      let cur = -1;
      if (a.d) {
        pts.push(a.d, [a.d[0], H[a.row]]);
        cur = a.row;
      }
      const ent: [number, number] | null = b.d ? [b.d[0], H[b.row]] : null;
      if (a.row >= 0 && a.row === b.row) {
        if (ent) pts.push(ent);
      } else {
        if (cur >= 0) pts.push([L, H[cur]]);
        if (b.row >= 0) {
          pts.push([L, H[b.row]]);
          if (ent) pts.push(ent);
        }
      }
      if (b.d) pts.push(b.d);
      pts.push(b.p);
      return pts;
    };

    const stepAgent = (i: number, dt: number) => {
      const a = agentsSimRef.current[i];
      if (!a) return;
      const sp = a.job && a.job.length > 8 ? 1400 : 1100;
      if (a.ph === 'idle') {
        if (!a.pend.length) {
          a.x = P.H[i][0];
          a.y = P.H[i][1];
          return;
        }
        a.job = a.pend.splice(0, 50);
        a.from = a.job[0].from;
        let dst: { p: [number, number]; row: number; d: [number, number] | null };
        if (a.from === 't') {
          dst = { p: [P.T[0] + (i - 2.5) * 4, P.T[1]], row: -1, d: null };
        } else {
          dst = zn(a.from);
          dst.p = [dst.p[0] + (i - 2.5) * 4, dst.p[1]];
        }
        setPath(
          a,
          a.from === i ? [P.H[i], P.H[i]] : zroute(zn(i), dst),
          sp,
        );
        a.ph = 'go';
        a.t = 0;
        a.wp = a.wp || 0;
      }
      a.t += dt;
      if (a.ph === 'go') {
        const p = getPosAlongPath(a, Math.min(1, a.t / a.dur));
        a.x = p[0];
        a.y = p[1];
        a.wp += dt * 16;
        if (a.t >= a.dur) {
          a.ph = 'grab';
          a.t = 0;
          if (i === 0 && a.job) {
            grabCountRef.current += a.job.length;
          }
        }
      } else if (a.ph === 'grab') {
        if (a.t >= (RM ? 0.01 : 0.06)) {
          a.ph = 'back';
          a.t = 0;
        }
      } else if (a.ph === 'back') {
        const p = getPosAlongPath(a, 1 - Math.min(1, a.t / a.dur));
        a.dir = -a.dir;
        a.x = p[0];
        a.y = p[1];
        a.wp += dt * 16;
        if (a.t >= a.dur) {
          a.ph = 'throw';
          a.t = 0;
        }
      } else {
        a.x = P.H[i][0];
        a.y = P.H[i][1];
        if (a.t >= (RM ? 0.02 : 0.1)) {
          if (a.job) {
            latestPropsRef.current.onDeliverJob(i, a.job);
          }
          a.job = null;
          a.ph = 'idle';
        }
      }
    };

    const stepSupervisor = (dt: number) => {
      const s = supervisorSimRef.current;
      const statuses = latestPropsRef.current.agentStatuses;
      for (let k = 0; k < 6; k++) {
        if (!s.seen[k] && statuses[k] === 'done') {
          s.seen[k] = true;
          s.q.push(k);
        }
      }
      if (s.ph === 'idle') {
        if (!s.q.length) {
          s.x = P.post[0];
          s.y = P.post[1];
          return;
        }
        s.k = s.q.shift()!;
        const n = zn(s.k);
        n.p = [n.p[0] + 26, n.p[1] - 2];
        setPath(s, zroute({ p: P.post, row: -1, d: null }, n), 1400);
        s.ph = 'go';
        s.t = 0;
      }
      s.t += dt;
      if (s.ph === 'go') {
        const p = getPosAlongPath(s, Math.min(1, s.t / s.dur));
        s.x = p[0];
        s.y = p[1];
        s.wp += dt * 16;
        if (s.t >= s.dur) {
          s.ph = 'check';
          s.t = 0;
        }
      } else if (s.ph === 'check') {
        if (s.t >= (RM ? 0.03 : 0.18)) {
          latestPropsRef.current.onTriggerSupervisorAudit(s.k);
          s.ph = 'back';
          s.t = 0;
        }
      } else if (s.ph === 'back') {
        const p = getPosAlongPath(s, 1 - Math.min(1, s.t / s.dur));
        s.dir = -s.dir;
        s.x = p[0];
        s.y = p[1];
        s.wp += dt * 16;
        if (s.t >= s.dur) {
          s.ph = 'idle';
        }
      }
    };

    const drawRoom = (c: CanvasRenderingContext2D, i: number) => {
      const R = ZR[i];
      if (!R) return;
      const col = AGENTS[i].color;
      const g = agentsSimRef.current[i];
      const w = R.wh;
      const cl = i === 4;
      let p: [number, number];

      poly(
        c,
        [pt(R, 0, 0, 0), pt(R, 1, 0, 0), pt(R, 1, 1, 0), pt(R, 0, 1, 0)],
        '#15110c',
        '#3a342c',
      );
      c.strokeStyle = '#ffffff0a';
      c.lineWidth = 1;
      for (let k = 1; k < 6; k++) {
        const t = k / 6;
        const a = pt(R, t, 0, 0);
        const b = pt(R, t, 1, 0);
        const e = pt(R, 0, t, 0);
        const f = pt(R, 1, t, 0);
        c.beginPath();
        c.moveTo(a[0], a[1]);
        c.lineTo(b[0], b[1]);
        c.moveTo(e[0], e[1]);
        c.lineTo(f[0], f[1]);
        c.stroke();
      }
      poly(
        c,
        [
          pt(R, 0.2, 0.46, 0),
          pt(R, 0.8, 0.46, 0),
          pt(R, 0.8, 0.92, 0),
          pt(R, 0.2, 0.92, 0),
        ],
        col + '22',
      );
      poly(
        c,
        [pt(R, 0, 0, 0), pt(R, 1, 0, 0), pt(R, 1, 0, w), pt(R, 0, 0, w)],
        cl ? '#2a1511' : '#1b160f',
        '#3a342c',
      );
      poly(
        c,
        [pt(R, 0, 0, 0), pt(R, 0, 1, 0), pt(R, 0, 1, w), pt(R, 0, 0, w)],
        cl ? '#241210' : '#120e0a',
        '#3a342c',
      );

      c.strokeStyle = col;
      c.lineWidth = 2;
      c.beginPath();
      p = pt(R, 0, 1, w);
      c.moveTo(p[0], p[1]);
      p = pt(R, 0, 0, w);
      c.lineTo(p[0], p[1]);
      p = pt(R, 1, 0, w);
      c.lineTo(p[0], p[1]);
      c.stroke();

      p = pt(R, 0.5, 0, w * 0.58);
      c.save();
      c.translate(p[0], p[1]);
      c.transform(1, 0.5, 0, 1, 0, 0);
      c.fillStyle = '#0a0908';
      c.fillRect(-36, -8, 72, 15);
      c.strokeStyle = col;
      c.lineWidth = 1;
      c.strokeRect(-36, -8, 72, 15);
      c.fillStyle = col;
      c.font = '9px JetBrains Mono,monospace';
      c.textAlign = 'center';
      c.fillText(AGENTS[i].name.toUpperCase(), 0, 3);
      c.restore();

      if (cl) {
        p = pt(R, 0, 0.5, w * 0.58);
        c.save();
        c.translate(p[0], p[1]);
        c.transform(1, -0.5, 0, 1, 0, 0);
        c.fillStyle = '#ff4d2e';
        c.font = '8px JetBrains Mono,monospace';
        c.textAlign = 'center';
        c.fillText('CLEAN ROOM', 0, 3);
        c.restore();
      }

      [
        [0.24, 0.16],
        [0.74, 0.16],
        [0.24, 0.3],
        [0.74, 0.3],
      ].forEach(([x, y]) =>
        box3d(
          c,
          R,
          x,
          y,
          x + 0.03,
          y + 0.03,
          0,
          12,
          '#2a241d',
          '#17130f',
          '#1f1a14',
        ),
      );
      box3d(
        c,
        R,
        0.2,
        0.12,
        0.8,
        0.34,
        12,
        16,
        '#34291f',
        '#1c1610',
        '#261e16',
        col + '66',
      );
      box3d(
        c,
        R,
        0.47,
        0.2,
        0.53,
        0.25,
        16,
        21,
        '#2a241d',
        '#17130f',
        '#1f1a14',
      );
      box3d(
        c,
        R,
        0.3,
        0.2,
        0.7,
        0.22,
        21,
        43,
        '#241e17',
        '#0e0b08',
        '#14110d',
        '#4a4236',
      );

      (g.hist || []).forEach((v, k) => {
        const u0 = 0.32 + k * 0.03;
        const bh = Math.min(18, 2 + v * 1.1);
        poly(
          c,
          [
            pt(R, u0, 0.22, 23),
            pt(R, u0 + 0.022, 0.22, 23),
            pt(R, u0 + 0.022, 0.22, 23 + bh),
            pt(R, u0, 0.22, 23 + bh),
          ],
          col,
        );
      });

      if (g.act) {
        c.save();
        c.shadowColor = col;
        c.shadowBlur = 14;
        poly(
          c,
          [
            pt(R, 0.3, 0.22, 21),
            pt(R, 0.7, 0.22, 21),
            pt(R, 0.7, 0.22, 43),
            pt(R, 0.3, 0.22, 43),
          ],
          null,
          col,
        );
        c.restore();
      }

      box3d(
        c,
        R,
        0.4,
        0.27,
        0.6,
        0.32,
        16,
        17,
        '#4a4236',
        '#2a241d',
        '#332c23',
      );
      box3d(
        c,
        R,
        0.68,
        0.17,
        0.78,
        0.28,
        16,
        19,
        col + '66',
        col + '33',
        col + '55',
      );
      for (let k = 0; k < Math.min(g.n, 6); k++) {
        box3d(
          c,
          R,
          0.69,
          0.18,
          0.77,
          0.27,
          19 + k * 1.3,
          20.1 + k * 1.3,
          col,
          col + '88',
          col + 'aa',
        );
      }
      box3d(
        c,
        R,
        0.4,
        0.4,
        0.6,
        0.43,
        12,
        34,
        '#2a241d',
        '#17130f',
        '#1f1a14',
        col + '88',
      );
      box3d(
        c,
        R,
        0.49,
        0.5,
        0.51,
        0.52,
        0,
        9,
        '#2a241d',
        '#17130f',
        '#1f1a14',
      );
      box3d(
        c,
        R,
        0.4,
        0.42,
        0.6,
        0.62,
        9,
        12,
        '#34291f',
        '#1c1610',
        '#261e16',
        col + '88',
      );
      box3d(
        c,
        R,
        0.08,
        0.7,
        0.16,
        0.78,
        0,
        7,
        '#3a2a1c',
        '#241a10',
        '#2e2216',
      );
      (
        [
          [0.12, 0.74, 14, 6, '#2f5a34'],
          [0.1, 0.72, 19, 5, '#3b7040'],
          [0.14, 0.76, 19, 5, '#2a4f30'],
        ] as const
      ).forEach(([u, v, z, r, f]) => {
        const q = pt(R, u, v, z);
        c.fillStyle = f;
        c.beginPath();
        c.arc(q[0], q[1], r, 0, 7);
        c.fill();
      });
    };

    const drawRack = (c: CanvasRenderingContext2D) => {
      const R = ZK;
      const fl = agentsSimRef.current.some(
        (a) => a.ph === 'grab' && a.from === 't',
      );
      box3d(
        c,
        R,
        0,
        0,
        1,
        1,
        0,
        R.h,
        '#2a241d',
        '#17130f',
        '#1f1a14',
        fl ? '#ffb020' : '#4a4236',
      );
      const N = R.cols * R.rows;
      const tot = latestPropsRef.current.totalFiles;
      const lit = tot ? Math.round((grabCountRef.current / tot) * N) : 0;
      const cu = 0.84 / R.cols;
      const cz = (R.h - 8) / R.rows;
      for (let k = 0; k < N; k++) {
        const u = 0.08 + (k % R.cols) * cu;
        const z = 4 + Math.floor(k / R.cols) * cz;
        poly(
          c,
          [
            pt(R, u, 1, z),
            pt(R, u + cu * 0.8, 1, z),
            pt(R, u + cu * 0.8, 1, z + cz * 0.7),
            pt(R, u, 1, z + cz * 0.7),
          ],
          k < lit ? '#ffb020' : '#ffffff18',
        );
      }
      c.textAlign = 'center';
      c.font = '10px JetBrains Mono,monospace';
      let p = pt(R, 0.5, 0.5, R.h + 10);
      c.fillStyle = '#ffb020';
      c.fillText('TARGET', p[0], p[1]);
      p = pt(R, 0.5, 1, -14);
      c.fillStyle = '#9a9184';
      const nm = latestPropsRef.current.targetName || '';
      c.fillText(`${nm.slice(0, P.nar ? 28 : 14)} ${tot}`, p[0], p[1]);
    };

    const zbot = (
      c: CanvasRenderingContext2D,
      im: HTMLImageElement | undefined,
      x: number,
      y: number,
      W: number,
      col: string,
      wp: number,
      mv: boolean,
      act: boolean,
      lean: number,
      sq: number,
      rot: number,
    ) => {
      const ok = im && im.complete && im.naturalWidth > 0;
      const hop = mv ? Math.abs(Math.sin(wp)) * 3.5 : 0;
      const ph = Math.sin(wp);
      c.save();
      c.fillStyle = '#000';
      c.globalAlpha = 0.35;
      c.beginPath();
      c.ellipse(x, y + 1, Math.max(3, W * 0.36 - hop), 3.2, 0, 0, 7);
      c.fill();
      c.globalAlpha = 1;
      c.translate(x, y - hop);
      c.rotate(rot + lean * 0.14);

      const fl = mv ? Math.max(0, ph) * 5 : 0;
      const fr2 = mv ? Math.max(0, -ph) * 5 : 0;
      const fx = W * 0.2;
      c.fillStyle = col;
      c.strokeStyle = '#0a0908';
      c.lineWidth = 1.5;
      c.beginPath();
      c.ellipse(-fx, -1 - fl, W * 0.13, 3, 0, 0, 7);
      c.fill();
      c.stroke();
      c.beginPath();
      c.ellipse(fx, -1 - fr2, W * 0.13, 3, 0, 0, 7);
      c.fill();
      c.stroke();

      c.translate(0, -3);
      c.scale(1 + (1 - sq) * 0.6, sq);
      if (act) {
        c.shadowColor = col;
        c.shadowBlur = 14;
      }
      if (ok && im) {
        const h = (W * im.naturalHeight) / im.naturalWidth;
        c.drawImage(im, -W / 2, -h, W, h);
      } else {
        c.fillStyle = col;
        c.beginPath();
        c.arc(0, -12, 11, 0, 7);
        c.fill();
      }
      c.restore();
    };

    const drawAg = (c: CanvasRenderingContext2D, i: number, tm: number) => {
      const g = agentsSimRef.current[i];
      const col = AGENTS[i].color;
      const mv = g.ph === 'go' || g.ph === 'back';
      const W = P.nar ? 28 : 32;
      let sq =
        1 +
        (mv ? Math.sin((g.wp || 0) * 2) * 0.04 : Math.sin(tm * 2.4 + i) * 0.02);
      let rot = 0;
      if (g.ph === 'grab') sq = 0.84 + Math.min(1, g.t / 0.35) * 0.16;
      if (g.ph === 'throw') rot = g.t < 0.15 ? -0.22 : 0.16;

      zbot(
        c,
        botImagesRef.current[i],
        g.x,
        g.y,
        W,
        col,
        g.wp || 0,
        mv,
        g.act,
        mv ? g.dir || 0 : 0,
        sq,
        rot,
      );
      if (g.act) {
        c.strokeStyle = col;
        c.globalAlpha = 0.3;
        c.lineWidth = 1;
        c.beginPath();
        c.arc(g.x, g.y - 14, 18 + ((tm * 18) % 12), 0, 7);
        c.stroke();
        c.globalAlpha = 1;
      }
      c.fillStyle = col;
      c.font = '9px JetBrains Mono,monospace';
      c.textAlign = 'center';
      c.fillText(AGENTS[i].name.toUpperCase(), g.x, g.y - (P.nar ? 36 : 40));

      const L = g.job
        ? labelJob(g.job[0]) + (g.job.length > 1 ? ' +' + (g.job.length - 1) : '')
        : '';
      if (
        g.job &&
        (g.ph === 'back' ||
          (g.ph === 'throw' && g.t < 0.15) ||
          (g.ph === 'grab' && g.t > 0.15))
      ) {
        drawChip(c, L, g.x + (P.nar ? 20 : 24), g.y - 12, col);
      }
      if (g.job && g.ph === 'throw' && g.t >= 0.15) {
        const u = Math.min(1, (g.t - 0.15) / 0.35);
        const p = lerp2d([g.x, g.y - 12], P.B[i], u);
        drawChip(c, L, p[0], p[1] - Math.sin(u * Math.PI) * 34, col);
      }
    };

    const drawSup = (c: CanvasRenderingContext2D, tm: number) => {
      const s = supervisorSimRef.current;
      const mv = s.ph === 'go' || s.ph === 'back';
      zbot(
        c,
        botImagesRef.current[6],
        s.x,
        s.y,
        P.nar ? 32 : 36,
        '#f3efe8',
        s.wp,
        mv,
        s.ph === 'check',
        mv ? s.dir || 0 : 0,
        1 + (mv ? Math.sin(s.wp * 2) * 0.04 : Math.sin(tm * 2.2) * 0.02),
        0,
      );
      c.fillStyle = '#f3efe8';
      c.font = '9px JetBrains Mono,monospace';
      c.textAlign = 'center';
      c.fillText('SUPERVISOR', s.x, s.y - (P.nar ? 40 : 44));
      if (s.ph === 'check') {
        const n = Math.min(3, Math.floor((s.t / 1.4) * 3.6));
        const x = s.x + 22;
        const y = s.y - 52;
        c.fillStyle = '#8ec5ff22';
        c.strokeStyle = '#8ec5ff';
        c.lineWidth = 1;
        c.fillRect(x, y, 50, 34);
        c.strokeRect(x, y, 50, 34);
        for (let k = 0; k < 3; k++) {
          c.fillStyle = '#8ec5ff88';
          c.fillRect(x + 16, y + 7 + k * 9, 28, 3);
          if (k < n) {
            c.strokeStyle = '#a3e635';
            c.lineWidth = 1.6;
            c.beginPath();
            c.moveTo(x + 5, y + 8 + k * 9);
            c.lineTo(x + 8, y + 11 + k * 9);
            c.lineTo(x + 13, y + 5 + k * 9);
            c.stroke();
          }
        }
      }
    };

    const drawDiscoveryMap = () => {
      const c = mapCvs.getContext('2d');
      if (!c) return;
      c.clearRect(0, 0, mapW, mapH);
      for (let k = 0; k < 70; k++) {
        c.fillStyle = '#f3efe8';
        c.globalAlpha = 0.1 + 0.1 * pseudoRandom(k);
        c.fillRect(
          pseudoRandom(k * 2.1) * mapW,
          pseudoRandom(k * 5.3) * mapH,
          1.5,
          1.5,
        );
      }
      c.globalAlpha = 1;
      const all = latestPropsRef.current.findings;
      const base = Math.max(0, all.length - 260);
      const lastByFile: Record<string, { x: number; y: number }> = {};
      c.font = '9px JetBrains Mono,monospace';
      c.textAlign = 'left';

      const pts = all.slice(base).map((f, k) => {
        const j = base + k;
        const a = pseudoRandom(j * 3.1) * 6.283;
        const r = 0.12 + 0.86 * pseudoRandom(j * 7.7);
        return {
          f,
          x: mapW / 2 + Math.cos(a) * r * mapW * 0.46,
          y: mapH / 2 + Math.sin(a) * r * mapH * 0.44,
        };
      });

      pts.forEach((p) => {
        const q = lastByFile[p.f.file];
        if (q) {
          c.strokeStyle = '#f3efe8';
          c.globalAlpha = 0.18;
          c.beginPath();
          c.moveTo(q.x, q.y);
          c.lineTo(p.x, p.y);
          c.stroke();
          c.globalAlpha = 1;
        }
        lastByFile[p.f.file] = p;
      });

      pts.forEach((p, k) => {
        const nw = k >= pts.length - 6;
        const col = FINDING_COLORS[p.f.kind] || '#fff';
        c.fillStyle = col;
        c.shadowColor = col;
        c.shadowBlur = nw ? 12 : 0;
        c.beginPath();
        c.arc(p.x, p.y, nw ? 4 : 2.4, 0, 7);
        c.fill();
        c.shadowBlur = 0;
        if (nw) {
          c.fillStyle = '#f3efe8';
          c.fillText(p.f.value.slice(0, 22), p.x + 7, p.y + 3);
        }
      });
    };

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;
    let last = performance.now();
    let tm = 0;
    let fr = 0;
    let tk = 'standing by';

    const loop = () => {
      if (isDisposed) return;
      const now = performance.now();
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      tm += dt;
      fr++;

      for (let i = 0; i < 6; i++) {
        stepAgent(i, dt);
      }
      stepSupervisor(dt);

      const c = cvs.getContext('2d');
      if (c) {
        c.clearRect(0, 0, cw, ch);
        c.strokeStyle = '#ffffff07';
        c.lineWidth = 1;
        for (let x = 0; x < cw; x += 28) {
          c.beginPath();
          c.moveTo(x, 22);
          c.lineTo(x, ch);
          c.stroke();
        }
        for (let y = 22; y < ch; y += 28) {
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(cw, y);
          c.stroke();
        }

        c.setLineDash([8, 8]);
        c.strokeStyle = '#ffb02030';
        P.hall.forEach((h) => {
          c.beginPath();
          c.moveTo(P.lane, h);
          c.lineTo(cw - 6, h);
          c.stroke();
        });
        c.beginPath();
        c.moveTo(P.lane, P.T[1]);
        c.lineTo(P.lane, P.hall[P.hall.length - 1]);
        c.stroke();
        c.setLineDash([]);

        if (fr % 20 === 0) {
          const evs = latestPropsRef.current.events;
          tk =
            evs
              .slice(-6)
              .map((l) => l.slice(0, 90))
              .join('   ·   ') || 'standing by';
        }

        c.fillStyle = '#ffb02012';
        c.fillRect(0, 0, cw, 22);
        c.font = '10px JetBrains Mono,monospace';
        c.textAlign = 'left';
        c.fillStyle = '#ffb020';
        const tw = c.measureText(tk).width + 60;
        c.save();
        c.beginPath();
        c.rect(0, 0, cw, 22);
        c.clip();
        c.fillText(tk, cw - ((tm * 60) % (cw + tw)), 14);
        c.restore();

        drawRack(c);
        AGENTS.forEach((_, i) => {
          const g = agentsSimRef.current[i];
          if (g.n < (g.lastN || 0)) g.lastN = 0;
          if (g.n > (g.lastN || 0)) {
            g.hist = g.hist || [];
            g.hist.push(g.n - (g.lastN || 0));
            if (g.hist.length > 12) g.hist.shift();
          }
          g.lastN = g.n;
          drawRoom(c, i);
        });

        const L: [number, number][] = AGENTS.map((_, i) => [
          agentsSimRef.current[i].y || 0,
          i,
        ]);
        L.push([supervisorSimRef.current.y, -1]);
        L.sort((a, b) => a[0] - b[0]).forEach((e) =>
          e[1] < 0 ? drawSup(c, tm) : drawAg(c, e[1], tm),
        );

        const R4 = ZR[4];
        if (R4) {
          c.setLineDash([5, 4]);
          poly(
            c,
            [
              pt(R4, 0, 1, 0),
              pt(R4, 0.78, 1, 0),
              pt(R4, 0.78, 1, 18),
              pt(R4, 0, 1, 18),
            ],
            '#ff4d2e14',
            '#ff4d2e',
          );
          poly(
            c,
            [
              pt(R4, 1, 0, 0),
              pt(R4, 1, 0.78, 0),
              pt(R4, 1, 0.78, 18),
              pt(R4, 1, 0, 18),
            ],
            '#ff4d2e14',
            '#ff4d2e',
          );
          c.setLineDash([]);
        }
      }

      if (fr % 2 === 0) {
        drawDiscoveryMap();
      }

      timerId = setTimeout(loop, 32);
    };

    timerId = setTimeout(loop, 32);
    return () => {
      isDisposed = true;
      if (timerId) clearTimeout(timerId);
      window.removeEventListener('resize', fit);
    };
  }, [agentsSimRef, grabCountRef, supervisorSimRef]);

  const activeIdx = AGENTS.findIndex((a) => a.name === activeAgentName);
  const cmdText =
    activeIdx < 0
      ? '> waiting for target'
      : `> ${AGENTS[activeIdx].name.toLowerCase().replace(/\s/g, '-')} ${(agentStatuses[activeIdx] || 'waiting').toLowerCase()}`;

  return (
    <>
      <section className="box">
        <h2>
          <span>Operations floor</span>
          <span id="who" className="mono">
            {activeAgentName}
          </span>
        </h2>
        <canvas
          id="scene"
          ref={sceneCanvasRef}
          aria-label="Six agents fetching real data from the target and delivering it to their departments"
        />
      </section>

      <div className="box" id="cmd">
        <span id="cmdt">{cmdText}</span>
        <span id="cmdc">00:{elapsedText}</span>
      </div>

      <div className="two">
        <div className="box">
          <h2>
            <span>Discovery map</span>
            <span id="mc">{findings.length} nodes</span>
          </h2>
          <canvas id="map" ref={mapCanvasRef} />
        </div>

        <div className="box">
          <h2>
            <span>Link status</span>
            <span>read-only</span>
          </h2>
          {AGENTS.map((a, i) => {
            const s = agentStatuses[i] || 'waiting';
            const m = s.match(/(\d+)%/);
            const pct =
              s === 'done' ? 100 : m ? Number(m[1]) : s === 'waiting' ? 0 : 50;
            const statusLabel =
              s === 'done' ? 'done' : s === 'waiting' ? 'wait' : `${pct}%`;
            return (
              <div className="br" key={a.id}>
                <span>{a.name.toLowerCase()}</span>
                <u>
                  <i
                    id={`b${i}`}
                    style={{ width: `${pct}%`, background: a.color }}
                  />
                </u>
                <em id={`bt${i}`}>{statusLabel}</em>
              </div>
            );
          })}
          <div className="br">
            <span>original</span>
            <u>
              <i style={{ width: '100%', background: '#f3efe8' }} />
            </u>
            <em>0 B changed</em>
          </div>
        </div>
      </div>
    </>
  );
}
