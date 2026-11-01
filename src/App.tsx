import { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { AGENTS, BRAIN_MEMORY_KEY } from './constants/config';
import type {
  AgentSimState,
  CheckItem,
  DocLine,
  Finding,
  HashedFile,
  PendingJobItem,
  RebuilderDeliveryItem,
  ScaffoldFile,
  SecondBrainMemory,
  SpecItem,
  SupervisorAuditEntry,
  SupervisorSimState,
  VirtualFile,
} from './types/studio';
import {
  SKIP_REGEX,
  auditStage,
  bufferToText,
  buildDocLines,
  buildSpecFromFindings,
  checkSpecLeaks,
  commitRunToMemory,
  createSampleVirtualFiles,
  detectTargetKind,
  extractFindingsFromText,
  parseReaEvidenceJson,
  runCleanRoomWorker,
  sha256Short,
} from './utils/analyzer';
import { Header } from './components/Header';
import { LaunchModal } from './components/LaunchModal';
import { TargetSummary } from './components/TargetSummary';
import { ProjectPackage } from './components/ProjectPackage';
import { ReaConsole } from './components/ReaConsole';
import { NeuralAtlas } from './components/NeuralAtlas';
import { OperationsFloor } from './components/OperationsFloor';
import { DepartmentsGrid } from './components/DepartmentsGrid';
import { EventStream } from './components/EventStream';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function createInitialAgentSims(): AgentSimState[] {
  return AGENTS.map(() => ({
    pend: [],
    job: null,
    ph: 'idle',
    t: 0,
    x: 0,
    y: 0,
    n: 0,
    act: false,
    from: 't',
    src: [0, 0],
    dur: 0.3,
    wp: 0,
    dir: 0,
    pa: [],
    pl: [0],
    hist: [],
    lastN: 0,
  }));
}

function createInitialSupervisorSim(): SupervisorSimState {
  return {
    seen: [false, false, false, false, false, false],
    q: [],
    ph: 'idle',
    t: 0,
    wp: 0,
    x: 0,
    y: 0,
    pass: 0,
    k: 0,
    dur: 0.3,
    dir: 0,
    pa: [],
    pl: [0],
  };
}

function loadInitialMemory(): SecondBrainMemory {
  try {
    const raw = localStorage.getItem(BRAIN_MEMORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.t) && parsed.e) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return { t: [], e: {} };
}

export default function App() {
  const [showLaunchModal, setShowLaunchModal] = useState(true);
  const [runIdText, setRunIdText] = useState('no run yet');
  const [tid, setTid] = useState('');
  const [targetName, setTargetName] = useState('');
  const [totalFiles, setTotalFiles] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsedText, setElapsedText] = useState('00:00');
  const [activeAgentName, setActiveAgentName] = useState('');
  const [activeAgentIndex, setActiveAgentIndex] = useState(-1);

  const [files, setFiles] = useState<HashedFile[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [spec, setSpec] = useState<SpecItem[]>([]);
  const [docLines, setDocLines] = useState<DocLine[]>([]);
  const [scaffold, setScaffold] = useState<ScaffoldFile[]>([]);
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [audits, setAudits] = useState<SupervisorAuditEntry[]>([]);

  const [agentStatuses, setAgentStatuses] = useState<string[]>(
    AGENTS.map(() => 'waiting'),
  );
  const [supervisorStatus, setSupervisorStatus] = useState('watching');
  const [agentCounts, setAgentCounts] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [agentLogs, setAgentLogs] = useState<
    [
      HashedFile[],
      Finding[],
      SpecItem[],
      DocLine[],
      RebuilderDeliveryItem[],
      CheckItem[],
    ]
  >([[], [], [], [], [], []]);
  const [rebuilderNote, setRebuilderNote] = useState('');
  const [verifierNote, setVerifierNote] = useState('');

  const [events, setEvents] = useState<string[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [memory, setMemory] = useState<SecondBrainMemory>(loadInitialMemory);

  const agentsSimRef = useRef<AgentSimState[]>(createInitialAgentSims());
  const supervisorSimRef = useRef<SupervisorSimState>(
    createInitialSupervisorSim(),
  );
  const grabCountRef = useRef(0);
  const seqRef = useRef(0);
  const t0Ref = useRef(0);
  const runTokenRef = useRef(0);

  // Refs for supervisor live auditing
  const runDataRef = useRef({
    tid: '',
    name: '',
    total: 0,
    files: [] as HashedFile[],
    findings: [] as Finding[],
    spec: [] as SpecItem[],
    docLines: [] as DocLine[],
    scaffold: [] as ScaffoldFile[],
    rebuilderNote: '',
    checks: [] as CheckItem[],
  });
  runDataRef.current = {
    tid,
    name: targetName,
    total: totalFiles,
    files,
    findings,
    spec,
    docLines,
    scaffold,
    rebuilderNote,
    checks,
  };

  const saveMemory = useCallback((nextMem: SecondBrainMemory) => {
    setMemory(nextMem);
    try {
      localStorage.setItem(BRAIN_MEMORY_KEY, JSON.stringify(nextMem));
    } catch {
      // ignore
    }
  }, []);

  const emitEvent = useCallback(
    (type: string, payload: Record<string, unknown> = {}) => {
      seqRef.current += 1;
      const s = seqRef.current;
      const ms = Math.max(0, Math.round(performance.now() - t0Ref.current));
      const line = `#${s} +${ms}ms ${type} ${JSON.stringify(payload)}`;
      setEventCount(s);
      setEvents((prev) => [...prev.slice(-149), line]);
    },
    [],
  );

  // Elapsed timer interval while running
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const s = Math.max(0, Math.floor((performance.now() - t0Ref.current) / 1000));
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      setElapsedText(`${mm}:${ss}`);
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  const handleDeliverJob = useCallback(
    (agentIndex: number, job: PendingJobItem[]) => {
      const sim = agentsSimRef.current[agentIndex];
      sim.n += job.length;
      setAgentCounts((prev) => {
        const next = [...prev];
        next[agentIndex] = sim.n;
        return next;
      });
      setAgentLogs((prev) => {
        const next = [...prev] as typeof prev;
        const items = job.map((j) => j.item);
        next[agentIndex] = [...next[agentIndex], ...items].slice(-70) as never;
        return next;
      });
      emitEvent('agent.deliver', {
        agent: AGENTS[agentIndex].name,
        items: job.length,
      });
    },
    [emitEvent],
  );

  const handleTriggerSupervisorAudit = useCallback(
    (k: number) => {
      const d = runDataRef.current;
      const [ok, detail] = auditStage(k, {
        files: d.files,
        total: d.total,
        findings: d.findings,
        spec: d.spec,
        docLinesCount: d.docLines.length,
        scaffold: d.scaffold,
        rebuilderNote: d.rebuilderNote,
        checks: d.checks,
      });

      const sup = supervisorSimRef.current;
      if (ok) sup.pass += 1;
      const text = `${AGENTS[k].name.toLowerCase()}: ${detail}`;
      setAudits((prev) => [...prev, { ok, text, stage: AGENTS[k].name }]);
      emitEvent('supervisor.audit', {
        stage: AGENTS[k].name,
        ok,
        detail: text,
      });

      if (k === 5) {
        const allOk = sup.pass === 6;
        const finalTxt = allOk
          ? 'run approved: 6 of 6 audits passed'
          : `needs review: ${sup.pass} of 6 audits passed`;
        setAudits((prev) => [
          ...prev,
          { ok: allOk, text: finalTxt, stage: 'run' },
        ]);
        emitEvent('supervisor.signoff', { approved: allOk });
        setSupervisorStatus('watching');
      } else {
        setSupervisorStatus('watching');
      }
    },
    [emitEvent],
  );

  const resetStudio = useCallback(() => {
    runTokenRef.current += 1;
    seqRef.current = 0;
    grabCountRef.current = 0;
    const freshAgents = createInitialAgentSims();
    freshAgents.forEach((a, i) => {
      Object.assign(agentsSimRef.current[i], a);
    });
    Object.assign(supervisorSimRef.current, createInitialSupervisorSim());

    setRunning(false);
    setRunIdText('no run yet');
    setTid('');
    setTargetName('');
    setTotalFiles(0);
    setElapsedText('00:00');
    setActiveAgentName('');
    setActiveAgentIndex(-1);
    setFiles([]);
    setFindings([]);
    setSpec([]);
    setDocLines([]);
    setScaffold([]);
    setChecks([]);
    setAudits([]);
    setAgentStatuses(AGENTS.map(() => 'waiting'));
    setSupervisorStatus('watching');
    setAgentCounts([0, 0, 0, 0, 0, 0]);
    setAgentLogs([[], [], [], [], [], []]);
    setRebuilderNote('');
    setVerifierNote('');
    setEvents([]);
    setEventCount(0);
  }, []);

  const executePipeline = useCallback(
    async (vfList: VirtualFile[], name: string) => {
      resetStudio();
      const token = runTokenRef.current;
      const newTid = 't' + Date.now().toString(36);

      t0Ref.current = performance.now();
      setShowLaunchModal(false);
      setTid(newTid);
      setTargetName(name);
      setTotalFiles(vfList.length);
      setRunning(true);
      setRunIdText('run · ' + name);

      emitEvent('run.started', {
        target: name,
        files: vfList.length,
        authorized: true,
      });

      const setSt = (i: number, m: string) => {
        setAgentStatuses((prev) => {
          const next = [...prev];
          next[i] = m;
          return next;
        });
      };

      const startStage = (i: number, label: string) => {
        emitEvent('stage.started', { agent: AGENTS[i].name, label });
        setSt(i, label);
        agentsSimRef.current[i].act = true;
        setActiveAgentName(AGENTS[i].name);
        setActiveAgentIndex(i);
      };

      const endStage = (i: number) => {
        agentsSimRef.current[i].act = false;
        setSt(i, 'done');
        emitEvent('stage.finished', { agent: AGENTS[i].name });
      };

      const reportProgress = (
        i: number,
        label: string,
        n: number,
        m: number,
      ) => {
        if (n % 20 === 0 && m > 0) {
          const pct = Math.round((n / m) * 100);
          setSt(i, `${label} ${pct}%`);
          emitEvent('stage.progress', { agent: AGENTS[i].name, pct });
        }
      };

      const give = async (i: number, item: unknown, from: 't' | number) => {
        const a = agentsSimRef.current[i];
        while (a.pend.length > 45 && runTokenRef.current === token) {
          await sleep(20);
        }
        if (runTokenRef.current !== token) return;
        a.pend.push({ item, from });
      };

      const drain = async (i: number) => {
        const a = agentsSimRef.current[i];
        while (
          (a.pend.length > 0 || a.ph !== 'idle') &&
          runTokenRef.current === token
        ) {
          await sleep(30);
        }
      };

      const vfMap: Record<string, VirtualFile> = {};
      const localFiles: HashedFile[] = [];

      // Stage 0: Intake
      startStage(0, 'Hashing files');
      let n = 0;
      for (const f of vfList) {
        if (runTokenRef.current !== token) return;
        vfMap[f.path] = f;
        let b: ArrayBuffer;
        try {
          b = await f.read(262144);
        } catch {
          b = new ArrayBuffer(0);
        }
        const r: HashedFile = {
          path: f.path,
          size: f.size,
          hash: await sha256Short(b),
        };
        localFiles.push(r);
        setFiles([...localFiles]);
        await give(0, r, 't');
        reportProgress(0, 'Hashing', ++n, vfList.length);
      }
      await drain(0);
      if (runTokenRef.current !== token) return;
      endStage(0);

      // Stage 1: Analyst
      startStage(1, 'Scanning');
      const seen = new Set<string>();
      const cap: Record<string, number> = {};
      const localFindings: Finding[] = [];

      n = 0;
      for (const r of localFiles) {
        if (runTokenRef.current !== token) return;
        const f = vfMap[r.path];
        n++;
        if (!SKIP_REGEX.test(r.path)) {
          try {
            const txt = bufferToText(await f.read(1048576));
            const extracted = extractFindingsFromText(
              txt,
              f.path,
              localFindings.length,
              seen,
              cap,
            );
            for (const F of extracted) {
              if (runTokenRef.current !== token) return;
              localFindings.push(F);
              setFindings([...localFindings]);
              setSpec(buildSpecFromFindings(localFindings, localFiles.length));
              emitEvent('finding', {
                id: F.id,
                kind: F.kind,
                value: F.value.slice(0, 40),
                file: F.file,
              });
              await give(1, F, 't');
            }
          } catch {
            // ignore read error
          }
        }
        reportProgress(1, 'Scanning', n, localFiles.length);
        if (n % 8 === 0) await sleep(0);
      }
      await drain(1);
      if (runTokenRef.current !== token) return;
      endStage(1);

      // Stage 2: Spec Writer
      startStage(2, 'Writing SPEC.md');
      const localSpec = buildSpecFromFindings(localFindings, localFiles.length);
      setSpec(localSpec);
      n = 0;
      for (const l of localSpec) {
        if (runTokenRef.current !== token) return;
        await give(2, l, 1);
        reportProgress(2, 'Writing', ++n, localSpec.length);
      }
      await drain(2);
      if (runTokenRef.current !== token) return;
      const leaks = checkSpecLeaks(localFiles, localSpec);
      emitEvent('spec.leakcheck', { matches: leaks });
      endStage(2);

      // Stage 3: Doc Agents
      startStage(3, 'Drafting documents');
      const localDocs = buildDocLines(name, localSpec);
      setDocLines(localDocs);
      for (const d of localDocs) {
        if (runTokenRef.current !== token) return;
        await give(3, d, 2);
      }
      await drain(3);
      if (runTokenRef.current !== token) return;
      endStage(3);

      // Stage 4: Rebuilder (Clean room)
      startStage(4, 'Wall self-test');
      const out = await runCleanRoomWorker(localSpec);
      if (runTokenRef.current !== token) return;
      emitEvent('wall.selftest', { mode: out.mode, probes: out.probes });
      const note4 =
        out.mode +
        (out.probes.length
          ? ': ' +
            out.probes
              .map((p) => `${p[0]} ${p[1] ? 'blocked' : 'NOT blocked'}`)
              .join(', ')
          : '');
      setRebuilderNote(note4);

      setSt(4, 'Receiving SPEC.md');
      for (const l of localSpec) {
        if (runTokenRef.current !== token) return;
        await give(4, { kind: 'spec', line: l.text }, 2);
      }
      await drain(4);
      if (runTokenRef.current !== token) return;

      setSt(4, 'Writing scaffold');
      const localScaffold: ScaffoldFile[] = [];
      for (const f of out.files) {
        if (runTokenRef.current !== token) return;
        localScaffold.push(f);
        setScaffold([...localScaffold]);
        await give(
          4,
          { kind: 'src', path: f.path, bytes: f.content.length },
          4,
        );
      }
      await drain(4);
      if (runTokenRef.current !== token) return;
      endStage(4);

      // Stage 5: Verifier
      startStage(5, 'Re-checking every claim');
      const localChecks: CheckItem[] = [];
      const addCheck = async (
        group: CheckItem['group'],
        nm: string,
        ok: boolean,
        from: 't' | number,
      ) => {
        const item: CheckItem = { group, name: nm, ok };
        localChecks.push(item);
        setChecks([...localChecks]);
        await give(5, item, from);

        const g: Record<string, [number, number]> = {};
        localChecks.forEach((c) => {
          g[c.group] = g[c.group] || [0, 0];
          g[c.group][1]++;
          if (c.ok) g[c.group][0]++;
        });
        const p = localChecks.filter((c) => c.ok).length;
        const note5 =
          `match ${Math.round((p / localChecks.length) * 100)}% (${p}/${localChecks.length}) · ` +
          Object.entries(g)
            .map(([k, v]) => `${k} ${v[0]}/${v[1]}`)
            .join(' · ') +
          '. Computed by code. 100% only covers inputs checked.';
        setVerifierNote(note5);
      };

      for (const l of localSpec.filter((x) => x.refs.length).slice(0, 60)) {
        if (runTokenRef.current !== token) return;
        const F = localFindings.find((f) => f.id === l.refs[0]);
        let ok = false;
        if (F && vfMap[F.file]) {
          try {
            ok = bufferToText(await vfMap[F.file].read(1048576)).includes(
              F.value.slice(0, 60),
            );
          } catch {
            ok = false;
          }
        }
        await addCheck('evidence', l.text.slice(0, 70), ok, 't');
      }

      const allScaffoldText = localScaffold.map((f) => f.content).join('\n');
      for (const l of localSpec
        .filter((x) => ['endpoint', 'storage', 'lib'].includes(x.kind))
        .slice(0, 60)) {
        if (runTokenRef.current !== token) return;
        await addCheck(
          'rebuild',
          `${l.kind} ${l.value.slice(0, 50)} present in src/`,
          allScaffoldText.includes(l.value),
          4,
        );
      }

      await addCheck(
        'leak',
        `spec has no file paths or hashes (${leaks} matches)`,
        leaks === 0,
        2,
      );
      await drain(5);
      if (runTokenRef.current !== token) return;
      endStage(5);

      const passedCount = localChecks.filter((c) => c.ok).length;
      emitEvent('run.finished', {
        checks: localChecks.length,
        passed: passedCount,
        findings: localFindings.length,
      });

      setRunning(false);
      setRunIdText('complete · ' + name);
      setActiveAgentName('done');
      setActiveAgentIndex(-1);

      const kindInfo = detectTargetKind(localFiles);
      setMemory((prevMem) => {
        const updated = commitRunToMemory(prevMem, {
          tid: newTid,
          name,
          total: vfList.length,
          kindLabel: kindInfo.l,
          findings: localFindings,
        });
        try {
          localStorage.setItem(BRAIN_MEMORY_KEY, JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });
    },
    [emitEvent, resetStudio],
  );

  const handleSelectFiles = useCallback(
    async (fileList: File[] | null) => {
      if (!fileList) {
        const sampleVf = createSampleVirtualFiles();
        executePipeline(sampleVf, 'this page (sample)');
        return;
      }

      const vf: VirtualFile[] = [];
      const name =
        fileList.length === 1
          ? fileList[0].name
          : `${fileList.length} files`;

      for (const f of fileList) {
        if (/\.(zip|apk|jar|aar|ipa|xpi|crx)$/i.test(f.name)) {
          try {
            const z = await JSZip.loadAsync(f);
            z.forEach((p, e) => {
              if (!e.dir && vf.length < 3000) {
                const uncompressedSize =
                  (e as unknown as { _data?: { uncompressedSize?: number } })
                    ._data?.uncompressedSize || 0;
                vf.push({
                  path: `${f.name}!/${p}`,
                  size: uncompressedSize,
                  read: async (m: number) =>
                    (await e.async('uint8array')).slice(0, m).buffer,
                });
              }
            });
            continue;
          } catch {
            // fallback to normal file read
          }
        }
        if (vf.length < 3000) {
          vf.push({
            path: f.webkitRelativePath || f.name,
            size: f.size,
            read: (m: number) => f.slice(0, m).arrayBuffer(),
          });
        }
      }

      executePipeline(vf, name);
    },
    [executePipeline],
  );

  // Support ?autostart=1 for automated testing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      handleSelectFiles(null);
    }
  }, [handleSelectFiles]);

  const handleMergeEvidence = useCallback(
    (jsonText: string): string => {
      const result = parseReaEvidenceJson(
        jsonText,
        totalFiles > 0,
        findings.length,
      );
      if (result.newFindings.length > 0) {
        const updatedFindings = [...findings, ...result.newFindings];
        const updatedSpec = [...spec, ...result.newSpecItems];
        setFindings(updatedFindings);
        setSpec(updatedSpec);

        const kindInfo = detectTargetKind(files);
        const currentTargetId = tid || 't' + Date.now().toString(36);
        const nextMem = commitRunToMemory(memory, {
          tid: currentTargetId,
          name: targetName || 'target',
          total: totalFiles,
          kindLabel: kindInfo.l,
          findings: updatedFindings,
        });
        saveMemory(nextMem);
      }
      return result.message;
    },
    [files, findings, memory, saveMemory, spec, targetName, tid, totalFiles],
  );

  const handleForgetTarget = useCallback(
    (targetId: string) => {
      const nextT = memory.t.filter((x) => x.id !== targetId);
      const nextE: SecondBrainMemory['e'] = {};
      Object.entries(memory.e).forEach(([k, ent]) => {
        const filteredT = ent.t.filter((y) => y !== targetId);
        if (filteredT.length > 0) {
          nextE[k] = { ...ent, t: filteredT };
        }
      });
      saveMemory({ t: nextT, e: nextE });
    },
    [memory, saveMemory],
  );

  const handleForgetAll = useCallback(() => {
    saveMemory({ t: [], e: {} });
  }, [saveMemory]);

  return (
    <>
      <LaunchModal
        visible={showLaunchModal}
        onSelectFiles={handleSelectFiles}
      />

      <Header
        runLabel={runIdText}
        elapsedText={elapsedText}
        filesCount={totalFiles}
        findingsCount={findings.length}
        eventsCount={eventCount}
        showNewTarget={!showLaunchModal}
        onNewTarget={() => {
          resetStudio();
          setShowLaunchModal(true);
        }}
      />

      <main className="studio-main">
        <TargetSummary
          name={targetName}
          total={totalFiles}
          running={running}
          files={files}
          findings={findings}
        />

        <ProjectPackage
          name={targetName}
          total={totalFiles}
          running={running}
          files={files}
          findings={findings}
          spec={spec}
          checks={checks}
          audits={audits}
        />

        <ReaConsole
          name={targetName}
          total={totalFiles}
          files={files}
          findings={findings}
          onMergeEvidence={handleMergeEvidence}
        />

        <NeuralAtlas
          memory={memory}
          currentTid={tid}
          currentFindings={findings}
          onForgetTarget={handleForgetTarget}
          onForgetAll={handleForgetAll}
        />

        <OperationsFloor
          targetName={targetName}
          totalFiles={totalFiles}
          grabCountRef={grabCountRef}
          activeAgentName={activeAgentName}
          elapsedText={elapsedText}
          agentStatuses={agentStatuses}
          findings={findings}
          events={events}
          agentsSimRef={agentsSimRef}
          supervisorSimRef={supervisorSimRef}
          onDeliverJob={handleDeliverJob}
          onTriggerSupervisorAudit={handleTriggerSupervisorAudit}
        />

        <DepartmentsGrid
          total={totalFiles}
          running={running}
          files={files}
          findings={findings}
          spec={spec}
          scaffold={scaffold}
          checks={checks}
          audits={audits}
          agentStatuses={agentStatuses}
          supervisorStatus={supervisorStatus}
          agentCounts={agentCounts}
          activeAgentIndex={activeAgentIndex}
          supervisorPhase={supervisorSimRef.current.ph}
          supervisorTargetAgent={supervisorSimRef.current.k}
          agentLogs={agentLogs}
          rebuilderNote={rebuilderNote}
          verifierNote={verifierNote}
        />

        <EventStream events={events} />
      </main>
    </>
  );
}
