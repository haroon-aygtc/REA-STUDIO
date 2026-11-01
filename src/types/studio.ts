export type FindingKind =
  | 'file'
  | 'url'
  | 'endpoint'
  | 'import'
  | 'dep'
  | 'storage'
  | 'route'
  | 'ui';

export type EvidenceTag = 'observed' | 'inferred' | 'unknown';

export interface VirtualFile {
  path: string;
  size: number;
  read: (maxBytes: number) => Promise<ArrayBuffer>;
}

export interface HashedFile {
  path: string;
  size: number;
  hash: string;
}

export interface Finding {
  id: string;
  kind: FindingKind;
  value: string;
  file: string;
  line: number;
  tag: EvidenceTag;
  method?: string;
  el?: string;
  ver?: string;
  rea?: number;
}

export interface SpecItem {
  text: string;
  refs: string[];
  tag: EvidenceTag;
  kind: string;
  value: string;
  method?: string;
  ver?: string;
}

export interface DocLine {
  doc: 'PRD' | 'STACK' | 'FLOW';
  line: string;
}

export interface ScaffoldFile {
  path: string;
  content: string;
}

export interface RebuilderDeliveryItem {
  kind: 'spec' | 'src';
  line?: string;
  path?: string;
  bytes?: number;
}

export interface CheckItem {
  group: 'evidence' | 'rebuild' | 'leak';
  name: string;
  ok: boolean;
}

export interface SupervisorAuditEntry {
  ok: boolean;
  text: string;
  stage: string;
}

export interface AgentConfig {
  id: number;
  name: string;
  department: string;
  color: string;
  spriteUrl: string;
}

export type AgentPhase = 'idle' | 'go' | 'grab' | 'back' | 'throw';

export interface PendingJobItem<T = unknown> {
  item: T;
  from: 't' | number;
}

export interface AgentSimState {
  pend: PendingJobItem[];
  job: PendingJobItem[] | null;
  ph: AgentPhase;
  t: number;
  x: number;
  y: number;
  n: number;
  act: boolean;
  from: 't' | number;
  src: [number, number];
  dur: number;
  wp: number;
  dir: number;
  pa: [number, number][];
  pl: number[];
  hist: number[];
  lastN: number;
}

export interface SupervisorSimState {
  seen: boolean[];
  q: number[];
  ph: 'idle' | 'go' | 'check' | 'back';
  t: number;
  wp: number;
  x: number;
  y: number;
  pass: number;
  k: number;
  dur: number;
  dir: number;
  pa: [number, number][];
  pl: number[];
}

export interface StudioRunState {
  tid: string;
  name: string;
  files: HashedFile[];
  vf: Record<string, VirtualFile>;
  findings: Finding[];
  spec: SpecItem[];
  docLines: DocLine[];
  scaffold: ScaffoldFile[];
  checks: CheckItem[];
  audits: SupervisorAuditEntry[];
  total: number;
  grab: number;
  running: boolean;
  activeAgentName: string;
  agentStatuses: string[];
  supervisorStatus: string;
  agentCounts: number[];
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
  events: string[];
  eventCount: number;
  elapsedText: string;
}

export type PackageTabId =
  | 'prd'
  | 'flow'
  | 'data'
  | 'struct'
  | 'arch'
  | 'stack'
  | 'proto'
  | 'ver';

export type BrainLobeKey = 'host' | 'endpoint' | 'lib' | 'storage' | 'ui' | 'route';

export interface BrainTargetRecord {
  id: string;
  name: string;
  ts: number;
  files: number;
  kind: string;
}

export interface BrainEntityRecord {
  k: BrainLobeKey;
  v: string;
  t: string[];
  f: string;
  r: number;
}

export interface SecondBrainMemory {
  t: BrainTargetRecord[];
  e: Record<string, BrainEntityRecord>;
}

export interface TargetKindInfo {
  k: 'apk' | 'native' | 'dotnet' | 'js' | 'mixed';
  l: string;
}

export interface FileTreeNode {
  n: string;
  c: Record<string, FileTreeNode>;
  s: number;
  k: number;
}
