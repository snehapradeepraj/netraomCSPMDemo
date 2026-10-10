import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, Boxes, Cloud, Route, ShieldAlert, ShieldCheck, Siren, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNote } from "@/components/ErrorNote";
import { MetricCard } from "@/components/MetricCard";
import { Panel } from "@/components/Panel";
import { Skeleton } from "@/components/Skeleton";
import { SeverityBadge } from "@/components/SeverityBadge";
import { DashboardCharts, InventoryTrendChart } from "@/components/soc/DashboardCharts";
import { PdfPreviewDialog } from "@/components/soc/PdfPreviewDialog";
import { RiskPanel } from "@/components/soc/RiskPanel";
import { getAssetFacets, loadDemo, type DemoFixture, type Finding } from "@/lib/api";
import { plainError } from "@/lib/errors";
import {
  readInventoryHistory,
  recordInventorySnapshot,
  saveInventoryHistory,
  type InventorySnapshot,
} from "@/lib/inventoryHistory";
import { useSecurityAnalytics } from "@/lib/useSecurityAnalytics";

const SEVERITIES = [
  { id: "critical", label: "Critical", bar: "bg-[var(--critical)]" },
  { id: "high", label: "High", bar: "bg-[var(--high)]" },
  { id: "medium", label: "Medium", bar: "bg-[var(--warning)]" },
  { id: "low", label: "Low", bar: "bg-[var(--muted)]" },
] as const;

function sourceLabel(source: string) {
  if (source === "cspm") return "Misconfiguration";
  if (source === "toxic-combo") return "Toxic combination";
  return source;
}

function findingsHref(finding: Finding) {
  const tab = finding.source === "cspm" || finding.source === "toxic-combo" ? finding.source : "toxic-combo";
  const params = new URLSearchParams({ tab, fp: finding.fingerprint });
  return `/findings?${params.toString()}`;
}

function kpi(value: number | null | undefined, pending: boolean) {
  if (pending) return undefined;
  if (value == null) return "—";
  return value;
}

export function DashboardPage() {
  const qc = useQueryClient();
  const analytics = useSecurityAnalytics();
  const [pdfOpen, setPdfOpen] = useState(false);
  const [inventoryHistory, setInventoryHistory] = useState(readInventoryHistory);
  const assetFacets = useQuery({ queryKey: ["asset-facets"], queryFn: getAssetFacets });
  const { assets, facets, cspm: misQuery, combo: comboQuery, findings, pending, unavailable, errorMessage, model } = analytics;

  useEffect(() => {
    if (!assetFacets.data || inventoryHistory.error) return;
    const current: InventorySnapshot = {
      date: new Date().toISOString().slice(0, 10),
      total: assetFacets.data.total,
      aws: assetFacets.data.by_cloud.aws ?? 0,
      gcp: assetFacets.data.by_cloud.gcp ?? 0,
      exposed: assetFacets.data.internet_exposed,
    };
    const snapshots = recordInventorySnapshot(inventoryHistory.snapshots, current);
    const error = saveInventoryHistory(snapshots);
    setInventoryHistory({ snapshots, error });
  }, [assetFacets.data, assetFacets.dataUpdatedAt, inventoryHistory.error]);

  const load = useMutation({
    mutationFn: (fixture: DemoFixture) => loadDemo(fixture),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["asset-facets"] });
      qc.invalidateQueries({ queryKey: ["findings"] });
      qc.invalidateQueries({ queryKey: ["finding-facets"] });
      qc.invalidateQueries({ queryKey: ["learn-stats"] });
    },
  });

  const apiDown = unavailable;
  const known = new Set<string>(SEVERITIES.map((s) => s.id));
  const extraSeverities = Object.entries(facets.data?.by_severity ?? {})
    .filter(([id, count]) => !known.has(id) && count > 0)
    .map(([id, count]) => ({ id, label: id, bar: "bg-[var(--info)]", count }));
  const recent = findings.data?.items.slice(0, 6) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
          Enterprise CSPM scenarios: public API Gateway without auth, internet-facing ALB/NLB, public RDS, SSH paths to
          writable storage, and ~500-asset estate with repeated toxic combinations.
        </p>
        <Button variant="secondary" disabled={!model} onClick={() => setPdfOpen(true)}>
          Export PDF
        </Button>
      </div>

      {apiDown ? <ErrorNote>The demo API isn&apos;t responding. Start the stack, then refresh this page.</ErrorNote> : null}
      {errorMessage && !apiDown ? <ErrorNote>{errorMessage}</ErrorNote> : null}

      <Panel
        eyebrow="Scenarios"
        title="Load workspace"
        action={
          load.isPending ? (
            <span className="text-xs font-medium text-[var(--live)]">Loading graph and running detections…</span>
          ) : null
        }
      >
        <div className="flex flex-wrap gap-2">
          <Button disabled={load.isPending} onClick={() => load.mutate("enterprise")}>
            Load enterprise (~500 assets)
          </Button>
          <Button variant="secondary" disabled={load.isPending} onClick={() => load.mutate("aws")}>
            Small AWS lab
          </Button>
          <Button variant="secondary" disabled={load.isPending} onClick={() => load.mutate("both")}>
            AWS + GCP lab
          </Button>
        </div>
        {load.isError ? (
          <p className="mt-3 text-sm text-[var(--danger-fg)]">{plainError(load.error, "Couldn't load that scenario. Try again.")}</p>
        ) : null}
        {load.data ? (
          <p className="mt-3 text-sm text-[var(--ok-fg)]">
            Loaded {load.data.assets} assets — {load.data.misconfig_findings} misconfigs, {load.data.combo_findings}{" "}
            toxic combos ({load.data.nodes} graph nodes, {load.data.edges} edges).
          </p>
        ) : null}
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Assets"
          icon={Boxes}
          loading={assets.isPending}
          value={assets.isError ? "—" : assets.data?.total}
          hint={assets.isError && !apiDown ? "Unavailable" : undefined}
        />
        <MetricCard
          label="AWS assets"
          icon={Cloud}
          loading={assetFacets.isPending}
          value={assetFacets.isError ? "—" : assetFacets.data?.by_cloud.aws ?? 0}
          hint={assetFacets.isError ? "Unavailable" : "Current inventory"}
        />
        <MetricCard
          label="GCP assets"
          icon={Cloud}
          loading={assetFacets.isPending}
          value={assetFacets.isError ? "—" : assetFacets.data?.by_cloud.gcp ?? 0}
          hint={assetFacets.isError ? "Unavailable" : "Current inventory"}
        />
        <MetricCard
          label="Internet exposed"
          icon={Activity}
          loading={assetFacets.isPending}
          value={assetFacets.isError ? "—" : assetFacets.data?.internet_exposed ?? 0}
          hint={assetFacets.isError ? "Unavailable" : "Current inventory"}
        />
        <MetricCard
          label="Misconfigurations"
          icon={ShieldAlert}
          loading={misQuery.isPending}
          value={misQuery.isError ? "—" : misQuery.data?.total}
          hint={misQuery.isError && !apiDown ? "Unavailable" : undefined}
        />
        <MetricCard
          label="Toxic combinations"
          icon={Route}
          loading={comboQuery.isPending}
          value={comboQuery.isError ? "—" : comboQuery.data?.total}
          hint={comboQuery.isError && !apiDown ? "Unavailable" : undefined}
        />
        <MetricCard
          label="Total findings"
          icon={Siren}
          loading={pending}
          value={kpi(model?.kpis.totalFindings, pending)}
          hint="Facet count of loaded findings"
        />
        <MetricCard
          label="Critical + high"
          icon={ShieldAlert}
          loading={pending}
          value={kpi(model?.kpis.criticalHigh, pending)}
          hint="From severity facets"
        />
        <MetricCard
          label="Attack paths"
          icon={Workflow}
          loading={pending}
          value={kpi(model?.kpis.attackPaths, pending)}
          hint="Toxic-combination count"
        />
        <MetricCard
          label="Vulnerabilities"
          icon={ShieldAlert}
          loading={pending}
          value={kpi(model?.kpis.vulnerabilities, pending)}
          hint="CSPM finding count"
        />
        <MetricCard
          label="Mitigated"
          icon={ShieldCheck}
          loading={pending}
          value={model?.kpis.mitigated ?? (pending ? undefined : 0)}
          hint="Analyst workflow in this browser"
        />
        <MetricCard
          label="Resolved"
          icon={ShieldCheck}
          loading={pending}
          value={model?.kpis.resolved ?? (pending ? undefined : 0)}
          hint="Not server-verified"
        />
      </div>

      <Panel title="Analytics" eyebrow="Same model as the PDF">
        {pending ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        ) : null}
        {model ? (
          <>
            <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">{model.history.note}</p>
            {model.sampleNote ? <p className="mb-3 text-xs text-[var(--warn-fg)]">{model.sampleNote}</p> : null}
            <DashboardCharts model={model} />
          </>
        ) : null}
      </Panel>

      <Panel title="Cloud inventory over time" eyebrow="Observed in this browser">
        <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
          Daily snapshots are recorded when this dashboard is visited and kept in this browser (up to 30 days).
          History starts now; it is not a reconstruction of earlier inventory.
        </p>
        {assetFacets.isError ? (
          <ErrorNote>{plainError(assetFacets.error, "Couldn't load current cloud inventory.")}</ErrorNote>
        ) : null}
        {inventoryHistory.error ? <ErrorNote>{inventoryHistory.error}</ErrorNote> : null}
        {assetFacets.isPending ? <Skeleton className="h-64 w-full" /> : null}
        {!assetFacets.isPending && !assetFacets.isError && inventoryHistory.snapshots.length === 0 ? (
          <EmptyState title="Inventory history starts today" body="Visit this dashboard on later days to build the local trend." />
        ) : null}
        {!assetFacets.isPending && !assetFacets.isError && inventoryHistory.snapshots.length > 0 ? (
          <InventoryTrendChart snapshots={inventoryHistory.snapshots} />
        ) : null}
      </Panel>

      <Panel
        title="Global threat activity"
        eyebrow="Simulated"
        action={
          <Link to="/threats" className="text-xs font-medium text-[var(--link)] hover:underline">
            Open threat map
          </Link>
        }
      >
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Explore the simulated threat map and its illustrative geographic activity on a dedicated page.
        </p>
        <Link
          to="/threats"
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--wash)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--hover)]"
        >
          <Activity className="h-4 w-4" aria-hidden />
          View threat map
        </Link>
      </Panel>

      <Panel title="Risks and notifications" eyebrow="Analyst workflow · this browser">
        {pending ? <Skeleton className="h-40 w-full" /> : null}
        {model ? (
          <RiskPanel
            risks={model.risks}
            empty={
              model.dataState === "unavailable"
                ? "API is down. Simulated fallback rows appear when the analytics model includes them."
                : "Load a scenario to seed risks from findings. Status buttons do not write to the API."
            }
          />
        ) : null}
        {model && model.dataState === "empty" ? (
          <p className="mt-3 text-xs text-[var(--muted)]">
            No findings are loaded, so this list stays empty. The Threat map page uses the labeled simulated fallback.
          </p>
        ) : null}
      </Panel>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Panel title="Severity mix" eyebrow="Findings">
          {apiDown ? <p className="text-sm text-[var(--muted)]">Severity counts appear when the demo API is up.</p> : null}
          {facets.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : null}
          {facets.isError && !apiDown ? (
            <ErrorNote>{plainError(facets.error, "Couldn't load the severity mix.")}</ErrorNote>
          ) : null}
          {facets.isSuccess && facets.data.total === 0 ? (
            <EmptyState
              title="No findings yet"
              body="Load a scenario to run misconfiguration and toxic-combination detections."
            />
          ) : null}
          {facets.isSuccess && facets.data.total > 0 ? (
            <SeverityMix total={facets.data.total} bySeverity={facets.data.by_severity} extras={extraSeverities} />
          ) : null}
        </Panel>

        <Panel
          title="Recent findings"
          eyebrow="Critical first"
          action={
            <Link to="/findings" className="text-xs font-medium text-[var(--link)] hover:underline">
              Open findings
            </Link>
          }
        >
          {apiDown ? <p className="text-sm text-[var(--muted)]">Recent findings appear when the demo API is up.</p> : null}
          {findings.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : null}
          {findings.isError && !apiDown ? (
            <ErrorNote>{plainError(findings.error, "Couldn't load recent findings.")}</ErrorNote>
          ) : null}
          {findings.isSuccess && recent.length === 0 ? (
            <EmptyState title="No findings yet" body="Detections appear here after a scenario load." />
          ) : null}
          {findings.isSuccess && recent.length > 0 ? (
            <ul className="divide-y divide-[var(--border)]">
              {recent.map((finding) => (
                <li key={finding.fingerprint}>
                  <Link to={findingsHref(finding)} className="flex items-start gap-3 py-2.5 transition-colors hover:text-[var(--foreground)]">
                    <SeverityBadge severity={finding.severity} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{finding.title}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">
                        {sourceLabel(finding.source)} · {finding.rule_id}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {findings.isSuccess && findings.data.total > recent.length ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Showing {recent.length} of {findings.data.total}
            </p>
          ) : null}
        </Panel>
      </div>

      <PdfPreviewDialog open={pdfOpen} model={model} onClose={() => setPdfOpen(false)} />
    </div>
  );
}

function SeverityMix({
  total,
  bySeverity,
  extras,
}: {
  total: number;
  bySeverity: Record<string, number>;
  extras: { id: string; label: string; bar: string; count: number }[];
}) {
  const segments = [...SEVERITIES.map((s) => ({ ...s, count: bySeverity[s.id] ?? 0 })), ...extras].filter((s) => s.count > 0);

  return (
    <div className="space-y-4">
      <div className="flex h-2 overflow-hidden rounded-full bg-[var(--wash-strong)]">
        {segments.map((segment) => (
          <div
            key={segment.id}
            className={segment.bar}
            style={{ width: `${(segment.count / total) * 100}%` }}
            title={`${segment.label}: ${segment.count}`}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {SEVERITIES.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-2 text-[var(--muted)]">
              <span className={`h-2 w-2 rounded-full ${s.bar}`} />
              {s.label}
            </span>
            <span className="tabular-nums">{bySeverity[s.id] ?? 0}</span>
          </li>
        ))}
        {extras.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-2 text-[var(--muted)] capitalize">
              <span className={`h-2 w-2 rounded-full ${s.bar}`} />
              {s.label}
            </span>
            <span className="tabular-nums">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
