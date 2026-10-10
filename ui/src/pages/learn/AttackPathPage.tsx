import { Fragment, useState } from "react";
import { ArrowDown, ArrowRight, Check, GitBranch, Route, ShieldAlert } from "lucide-react";

import { LearnNav } from "@/pages/learn/LearnNav";

type Stage = {
  id: string;
  title: string;
  kind: "stage" | "decision";
  summary: string;
  explanation: string;
  inputs: string;
  outputs: string;
  whyItMatters: string;
  runtime: string;
  implementation: string;
};

const STAGES: Stage[] = [
  {
    id: "collect",
    title: "Collect inventory",
    kind: "stage",
    summary: "Start with cloud resources and their properties.",
    explanation:
      "The pipeline needs resource records for accounts, networks, workloads, identities, and storage before it can reason about trust.",
    inputs: "A cloud collector's output, or a selected demo fixture.",
    outputs: "Raw resource documents.",
    whyItMatters: "The quality and coverage of the inventory bounds what later stages can detect.",
    runtime:
      "Dashboard fixture buttons load bundled synthetic data. They do not call AWS or GCP APIs. The cloud collector modules are a separate workflow.",
    implementation: "Dashboard fixture controls and backend ingestion pipeline",
  },
  {
    id: "preprocess",
    title: "Normalize records",
    kind: "stage",
    summary: "Convert provider-specific records to the shared graph contract.",
    explanation:
      "Provider-shaped documents are transformed into the normalized bundle used by the rest of the application. Invalid records should not silently become partial graph objects.",
    inputs: "Raw resource documents.",
    outputs: "Normalized assets and relationships.",
    whyItMatters: "A shared shape lets detection and graph traversal work across cloud providers.",
    runtime:
      "The Raw → normalized Learn page demonstrates this transformation for the fixture files. The load API consumes the normalized bundle.",
    implementation: "Learn → Raw to normalized and the ingestion pipeline",
  },
  {
    id: "invalid",
    title: "Invalid record",
    kind: "decision",
    summary: "A record without a usable identity cannot become a graph node.",
    explanation:
      "If a record is missing its identity or does not satisfy the normalized bundle shape, that record is rejected rather than being assigned an invented node.",
    inputs: "A raw or partially normalized document.",
    outputs: "No asset row or graph edge for that record.",
    whyItMatters: "This is a data-quality stop, not a security finding and not an attack path.",
    runtime:
      "The shipped demo fixtures are valid. This branch describes what happens to malformed input; it is not a second detection rule.",
    implementation: "Normalization and ingestion validation",
  },
  {
    id: "extract",
    title: "Create graph entities",
    kind: "stage",
    summary: "Give each resource a stable graph node identity.",
    explanation:
      "Assets such as compute, storage, databases, networks, and identities become graph nodes. Their metadata can include display names, cloud, region, resource type, and exposure.",
    inputs: "Normalized assets.",
    outputs: "Graph nodes keyed by stable node IDs.",
    whyItMatters: "Stable IDs let database asset records and graph relationships refer to the same resource.",
    runtime: "Loading writes PostgreSQL asset rows and graph nodes linked by graph_node_id.",
    implementation: "Asset ingestion and graph-writer backends",
  },
  {
    id: "relate",
    title: "Map relationships",
    kind: "stage",
    summary: "Represent trust and access as typed, directed edges.",
    explanation:
      "Relationships describe how resources connect—for example ingress, security-group membership, role attachment, read, write, or administration. Their stored direction is canonical; traversal direction is a separate policy.",
    inputs: "Normalized relationships and their endpoint node IDs.",
    outputs: "Typed graph edges with stable edge IDs.",
    whyItMatters: "A resource can be exposed without being a path to a target; the connecting relationships explain how movement is possible.",
    runtime:
      "Attack-path traversal applies ATTACK_TRAVERSAL_POLICY to selected edge kinds without rewriting their stored direction.",
    implementation: "backend/app/attack_path_engine.py and the graph writer",
  },
  {
    id: "missing",
    title: "Relationship is missing",
    kind: "decision",
    summary: "Disconnected resources do not make a valid attacker route.",
    explanation:
      "If the relevant nodes are not connected by relationships allowed by the traversal policy, the engine cannot claim an attacker route between them.",
    inputs: "Finding-related nodes and the available graph edges.",
    outputs: "No attack path; the finding itself can still be kept and scored.",
    whyItMatters: "The UI must distinguish a confirmed route from nearby graph context.",
    runtime:
      "The finding path response can contain neighborhood context while attack_path_nodes and attack_path_edge_ids remain empty when no valid route is found.",
    implementation: "backend/app/attack_path_engine.py and the finding path API",
  },
  {
    id: "graph",
    title: "Build the trust graph",
    kind: "stage",
    summary: "Load entities and relationships into the graph store.",
    explanation:
      "The nodes and edges are assembled into the tenant's trust graph, which supports graph-lab exploration, neighborhood queries, and attack-path analysis.",
    inputs: "Extracted entities and mapped relationships.",
    outputs: "A queryable graph for the selected tenant.",
    whyItMatters: "The graph makes relationships explicit; isolated asset rows alone cannot establish reachability.",
    runtime:
      "The demo uses Neo4j for graph storage. Tests can use the NetworkX backend. Graph construction happens as part of fixture ingestion.",
    implementation: "Graph-writer backends and graph API",
  },
  {
    id: "analyze",
    title: "Search candidate routes",
    kind: "stage",
    summary: "Find bounded, simple routes from attacker entry points.",
    explanation:
      "The engine starts from internet or public entry points, follows allowed attacker-traversal directions, and searches toward finding-related target nodes. A route cannot repeat a node, and the search is bounded.",
    inputs: "Entry nodes, target nodes, graph edges, and edge traversal costs.",
    outputs: "Candidate routes with ordered node IDs, edge IDs, and traversal costs.",
    whyItMatters: "Traversal cost helps order route candidates; it is not the final security-risk score.",
    runtime:
      "Finding scoring calls assess_finding_path → find_rank_paths_dijkstra with a maximum of 8 hops and up to 10 candidates. It ranks the selected finding paths by risk score, then traversal cost. BFS exists and is tested but is not the finding scorer's search; DFS is not implemented, and this is not A*.",
    implementation: "backend/app/attack_path_engine.py",
  },
  {
    id: "found",
    title: "Route found",
    kind: "decision",
    summary: "At least one candidate reaches a finding-related target.",
    explanation:
      "A route is meaningful only when the traversal reaches a target under the search rules. Its node IDs and exact ordered edge IDs are retained, including when an edge is traversed opposite to its canonical stored direction.",
    inputs: "One or more valid candidate routes.",
    outputs: "The selected route's ordered nodes and exact edges.",
    whyItMatters: "Exact edge identity prevents parallel relationships from being mistaken for one another.",
    runtime:
      "The selected route is stored separately from graph-neighborhood context so the UI can highlight only the actual route.",
    implementation: "Finding path generation and backend/app/attack_path_engine.py",
  },
  {
    id: "nopath",
    title: "No route found",
    kind: "decision",
    summary: "The target is unreachable within the allowed search bounds.",
    explanation:
      "An empty search result means the graph does not establish a route under the current traversal policy and limits. It does not mean the finding is discarded.",
    inputs: "A bounded graph search with no route to a target.",
    outputs: "An empty attack path; graph context can still be shown.",
    whyItMatters: "The product should be explicit about what the graph proves and what it does not.",
    runtime:
      "The finding can still receive a factor score. The path view should report that no valid attacker route was identified instead of highlighting context edges as a route.",
    implementation: "Finding path generation and the finding path API",
  },
  {
    id: "score",
    title: "Calculate risk score",
    kind: "stage",
    summary: "Score the finding independently from route search cost.",
    explanation:
      "The existing scorer adds four factors—exposure, privilege, exploitability, and impact—each from 0 to 25, for a total capped at 100. The score describes finding risk; Dijkstra traversal cost describes route search preference.",
    inputs: "A selected route when available, otherwise finding-related nodes and their metadata.",
    outputs: "risk_score and score_breakdown.",
    whyItMatters: "Keeping risk scoring separate avoids treating a cheap-to-traverse route as automatically more severe.",
    runtime:
      "evaluate_path_risk_breakdown produces the four-factor score for findings both with and without a valid route. Severity thresholds are critical ≥90, high ≥70, medium ≥40, otherwise low.",
    implementation: "backend/app/attack_path_engine.py",
  },
  {
    id: "alert",
    title: "Create the finding",
    kind: "stage",
    summary: "Persist the detection and expose its score and optional route.",
    explanation:
      "Misconfiguration and toxic-combination detections produce findings. A finding can include its fingerprint, severity, risk score, and exact route data when a valid path exists.",
    inputs: "A detection result, score breakdown, and optional selected route.",
    outputs: "A finding available through the API and UI.",
    whyItMatters: "The finding is the user-facing record that joins the detection, risk explanation, and route evidence.",
    runtime:
      "The existing detection rules generate findings. Analyst status and mitigation guidance in the dashboard are local workflow aids; they do not remediate cloud resources.",
    implementation: "backend detection modules and the findings API",
  },
  {
    id: "visualize",
    title: "Inspect the route",
    kind: "stage",
    summary: "Show route evidence separately from nearby graph context.",
    explanation:
      "The Findings detail canvas displays graph nodes and edges, then emphasizes the exact stored route when one exists. Nearby relationships provide context but should not be presented as traversed attack steps.",
    inputs: "Finding path response, graph nodes and edges, and exact path IDs.",
    outputs: "An interactive graph for investigating the finding.",
    whyItMatters: "The visualization should let an analyst follow the route from entry point to target without confusing the order or edge identity.",
    runtime:
      "Findings uses the shared React Flow GraphCanvas. This Learn page explains the workflow; its example route below is illustrative and is not a live finding.",
    implementation: "ui/src/components/GraphCanvas.tsx and ui/src/pages/FindingsPage.tsx",
  },
];

const FLOW_GROUPS = [
  {
    eyebrow: "01 · Build the graph",
    title: "From inventory to relationships",
    description: "Resources become stable nodes, and their trust relationships become typed edges.",
    stageIds: ["collect", "preprocess", "extract", "relate", "graph"],
  },
  {
    eyebrow: "02 · Search and decide",
    title: "Check whether attacker movement is supported",
    description: "Search produces either an ordered route or an explicit no-route outcome.",
    stageIds: ["analyze", "found", "nopath"],
  },
  {
    eyebrow: "03 · Score and investigate",
    title: "Turn evidence into an explainable finding",
    description: "A finding can be scored with or without a route; the UI highlights only exact route evidence.",
    stageIds: ["score", "alert", "visualize"],
  },
];

const ROUTE_STEPS = [
  {
    name: "Internet",
    id: "net:0.0.0.0/0",
    detail: "Attacker entry point",
    color: "border-orange-400/50 bg-orange-500/10",
  },
  {
    name: "Public security group",
    id: "sg:public",
    detail: "Allows ingress from the internet",
    color: "border-amber-400/50 bg-amber-500/10",
  },
  {
    name: "Application VM",
    id: "vm:app",
    detail: "Attached to the security group",
    color: "border-sky-400/50 bg-sky-500/10",
  },
  {
    name: "Admin role",
    id: "role:admin",
    detail: "Attached to the VM",
    color: "border-violet-400/50 bg-violet-500/10",
  },
  {
    name: "Production database",
    id: "db:prod",
    detail: "Target reachable via can_admin",
    color: "border-rose-400/50 bg-rose-500/10",
  },
];

const EDGE_LABELS = ["allows_ingress", "has_sg", "attached_to", "can_admin"];

function getStage(id: string) {
  return STAGES.find((stage) => stage.id === id)!;
}

export function AttackPathPage() {
  const [selected, setSelected] = useState("analyze");
  const stage = getStage(selected);

  return (
    <div className="space-y-6">
      <LearnNav />

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)] sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[var(--glow-accent)] p-2.5 text-[var(--link)]">
            <Route size={21} aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[var(--link)] uppercase">
              Attack path, step by step
            </p>
            <h2 className="mt-1 text-xl font-semibold">From cloud inventory to route evidence</h2>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-[var(--muted)]">
              An attack path is an ordered chain of permitted relationships from an attacker entry point to a target.
              The pipeline below shows how this product builds that evidence, scores findings, and presents the result.
              Select any step to see what it means and what the application actually does.
            </p>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="example-route-heading"
        className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)] sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">Illustrative route</p>
            <h2 id="example-route-heading" className="mt-1 text-lg font-semibold">
              How an attacker could reach a sensitive target
            </h2>
          </div>
          <span className="rounded-full border border-[var(--border)] bg-[var(--inset)] px-3 py-1 text-xs text-[var(--muted)]">
            Example only · not live finding data
          </span>
        </div>

        <ol className="mt-5 flex flex-col gap-2 xl:flex-row xl:items-stretch xl:gap-1">
          {ROUTE_STEPS.map((step, index) => (
            <Fragment key={step.id}>
              <li key={step.id} className="min-w-0 flex-1">
                <div className={`h-full rounded-xl border p-3 ${step.color}`}>
                  <div className="flex items-start gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--card)] text-xs font-bold text-[var(--foreground)] ring-1 ring-[var(--ring-soft)]">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold">{step.name}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{step.detail}</p>
                      <code className="mt-2 block truncate text-[11px] text-[var(--code-fg)]" title={step.id}>
                        {step.id}
                      </code>
                    </div>
                  </div>
                </div>
              </li>
              {index < ROUTE_STEPS.length - 1 && (
                <li
                  key={`${step.id}-to-${ROUTE_STEPS[index + 1].id}`}
                  aria-label={`Then ${EDGE_LABELS[index]}`}
                  className="flex shrink-0 items-center justify-center gap-2 py-1 text-[10px] font-medium text-[var(--muted)] xl:w-[76px] xl:flex-col xl:py-0"
                >
                  <ArrowDown size={16} className="text-[var(--link)] xl:hidden" aria-hidden="true" />
                  <ArrowRight size={18} className="hidden text-[var(--link)] xl:block" aria-hidden="true" />
                  <span className="text-center">{EDGE_LABELS[index]}</span>
                </li>
              )}
            </Fragment>
          ))}
        </ol>

        <div className="mt-4 flex items-start gap-2 rounded-lg bg-[var(--inset)] p-3 text-xs leading-relaxed text-[var(--muted)]">
          <GitBranch className="mt-0.5 shrink-0 text-[var(--link)]" size={15} aria-hidden="true" />
          <p>
            These arrows show <strong className="text-[var(--foreground)]">attacker movement</strong>, not the
            canonical edge direction. The graph stores <code>allows_ingress</code> as security group → Internet,
            <code> has_sg</code> as VM → security group, and <code> attached_to</code> as role → VM; traversal can
            follow those relationships in reverse to explain movement toward the target.
          </p>
        </div>
      </section>

      <section aria-labelledby="pipeline-heading" className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[var(--glow-cyan)] p-2.5 text-[var(--live)]">
            <ShieldAlert size={21} aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">Product workflow</p>
            <h2 id="pipeline-heading" className="mt-1 text-xl font-semibold">How the application produces a finding</h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              Follow the numbered steps. The two exception cards explain where data quality or missing connectivity
              changes the result.
            </p>
          </div>
        </div>

        {FLOW_GROUPS.map((group) => (
          <section
            key={group.eyebrow}
            aria-label={group.title}
            className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)] sm:p-5"
          >
            <div className="mb-4">
              <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--link)] uppercase">{group.eyebrow}</p>
              <h3 className="mt-1 font-semibold">{group.title}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{group.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.stageIds.map((id, index) => {
                const item = getStage(id);
                const active = item.id === selected;
                return (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={active}
                    onClick={() => setSelected(item.id)}
                    className={`group relative flex min-h-32 flex-col items-start rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                      active
                        ? "border-[var(--accent)] bg-[var(--glow-accent)] shadow-[0_0_0_1px_var(--accent)]"
                        : item.kind === "decision"
                          ? "border-[color-mix(in_srgb,var(--warning)_45%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_8%,var(--card))] hover:border-[var(--warning)]"
                          : "border-[var(--border)] bg-[var(--inset)] hover:border-[var(--border-strong)] hover:bg-[var(--card-raised)]"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
                      {item.kind === "decision" ? (
                        <GitBranch size={13} aria-hidden="true" />
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--card-raised)] text-[var(--foreground)]">
                          {group.eyebrow.startsWith("01") ? String(index + 1).padStart(2, "0") : item.id === "analyze" ? "06" : item.id === "score" ? "09" : item.id === "alert" ? "10" : "11"}
                        </span>
                      )}
                      {item.kind === "decision" ? "Branch / outcome" : "Process step"}
                      {active && <Check size={13} className="ml-auto text-[var(--link)]" aria-label="Selected" />}
                    </span>
                    <span className="mt-3 font-semibold text-[var(--foreground)]">{item.title}</span>
                    <span className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{item.summary}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
          <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--warning)] uppercase">
            Important branches
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {["invalid", "missing"].map((id) => {
              const item = getStage(id);
              return (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={item.id === selected}
                  onClick={() => setSelected(item.id)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    item.id === selected
                      ? "border-[var(--accent)] bg-[var(--glow-accent)]"
                      : "border-[var(--border)] bg-[var(--inset)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <GitBranch size={15} className="text-[var(--warning)]" aria-hidden="true" />
                    {item.title}
                  </span>
                  <span className="mt-2 block text-sm leading-relaxed text-[var(--muted)]">{item.summary}</span>
                </button>
              );
            })}
          </div>
        </section>
      </section>

      <section
        aria-labelledby="step-details-heading"
        className="rounded-2xl border border-[var(--border-strong)] bg-[var(--card)] p-5 shadow-[var(--shadow)] sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[var(--link)] uppercase">
              {stage.kind === "decision" ? "Branch detail" : "Selected step"}
            </p>
            <h2 id="step-details-heading" className="mt-1 text-xl font-semibold">{stage.title}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-[var(--muted)]">{stage.explanation}</p>
          </div>
          <span className="rounded-full border border-[var(--border)] bg-[var(--inset)] px-3 py-1 text-xs text-[var(--muted)]">
            {stage.kind === "decision" ? "Decision point" : "Pipeline stage"}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Detail label="What goes in" value={stage.inputs} />
          <Detail label="What comes out" value={stage.outputs} />
          <Detail label="Why it matters" value={stage.whyItMatters} />
          <Detail label="What this demo actually does" value={stage.runtime} />
        </div>
        <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
          Implementation reference: <code className="text-[var(--code-fg)]">{stage.implementation}</code>
        </p>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--inset)] p-4">
      <h3 className="text-xs font-semibold tracking-[0.1em] text-[var(--muted)] uppercase">{label}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--foreground)]">{value}</p>
    </div>
  );
}
