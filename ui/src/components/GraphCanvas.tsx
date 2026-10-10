import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";

import type { GraphEdge, GraphNode } from "@/lib/api";
import { useTheme } from "@/theme/ThemeProvider";

function nodeLabel(n: GraphNode) {
  return n.name ?? n.node_id.split("/").pop() ?? n.node_id;
}

function kindStyle(kind: string | undefined, props: Record<string, unknown> | undefined, theme: "dark" | "light") {
  const pub = props?.is_public || props?.is_internet_exposed;
  if (theme === "light") {
    if (kind === "identity") return { border: "1px solid #6d28d9", background: "#f3e8ff", color: "#1e1b4b" };
    if (kind === "network") return { border: "1px solid #0f766e", background: "#ccfbf1", color: "#134e4a" };
    if (kind === "external") return { border: "1px solid #c2410c", background: "#ffedd5", color: "#7c2d12" };
    if (pub) return { border: "1px solid #be123c", background: "#ffe4e6", color: "#881337" };
    return { border: "1px solid #94a3b8", background: "#f8fafc", color: "#0f172a" };
  }
  if (kind === "identity") return { border: "1px solid #7c6bb5", background: "#241c3d", color: "#e8eef8" };
  if (kind === "network") return { border: "1px solid #2a8ea0", background: "#0e2c38", color: "#e8eef8" };
  if (kind === "external") return { border: "1px solid #c47a3a", background: "#3a2414", color: "#e8eef8" };
  if (pub) return { border: "1px solid #e5484d", background: "#3c1619", color: "#e8eef8" };
  return { border: "1px solid #2c4368", background: "#15243c", color: "#e8eef8" };
}

const legend = [
  { label: "Identity", swatch: "#7c6bb5" },
  { label: "Network", swatch: "#2a8ea0" },
  { label: "External", swatch: "#c47a3a" },
  { label: "Internet exposed", swatch: "#e5484d" },
  { label: "Other", swatch: "#2c4368" },
];

const REVERSE_ATTACK_KINDS = new Set(["in_vpc", "in_subnet", "attached_to", "has_sg", "exposes"]);
const FORWARD_ATTACK_KINDS = new Set([
  "owns",
  "contains",
  "uses",
  "can_assume",
  "can_read",
  "can_write",
  "can_admin",
  "grants",
  "trusts",
  "federates_to",
  "allows_ingress",
  "allows_egress",
  "resolves_to",
  "serves",
  "redirects_to",
  "runs_image",
  "deploys",
]);

function isInternetEntry(node: GraphNode | undefined) {
  if (!node) return false;
  const props = node.props ?? {};
  return Boolean(
    props.is_internet_exposed ||
      props.is_public ||
      node.kind === "external" ||
      node.node_id.startsWith("net:") ||
      node.node_id.startsWith("ext:") ||
      node.node_id.startsWith("0.0.0.0"),
  );
}

function traversalEndpoints(edge: GraphEdge, nodeById: Map<string, GraphNode>) {
  const src = nodeById.get(edge.src_id);
  const dst = nodeById.get(edge.dst_id);
  if (
    edge.kind === "allows_ingress" &&
    (isInternetEntry(dst) || edge.dst_id.startsWith("0.0.0.0"))
  ) {
    return { source: edge.dst_id, target: edge.src_id };
  }
  if (
    edge.kind === "allows_ingress" &&
    (isInternetEntry(src) || edge.src_id.startsWith("0.0.0.0"))
  ) {
    return { source: edge.src_id, target: edge.dst_id };
  }
  if (edge.kind && REVERSE_ATTACK_KINDS.has(edge.kind)) {
    return { source: edge.dst_id, target: edge.src_id };
  }
  if (edge.kind && FORWARD_ATTACK_KINDS.has(edge.kind)) {
    return { source: edge.src_id, target: edge.dst_id };
  }
  return { source: edge.src_id, target: edge.dst_id };
}

function hierarchicalPositions(nodes: GraphNode[], edges: GraphEdge[], centerId?: string) {
  const nodeById = new Map(nodes.map((node) => [node.node_id, node]));
  const adjacency = new Map<string, Set<string>>(nodes.map((node) => [node.node_id, new Set()]));
  const incoming = new Map<string, number>(nodes.map((node) => [node.node_id, 0]));

  for (const edge of edges) {
    const { source, target } = traversalEndpoints(edge, nodeById);
    if (!adjacency.has(source) || !adjacency.has(target)) continue;
    const neighbors = adjacency.get(source)!;
    if (neighbors.has(target)) continue;
    neighbors.add(target);
    incoming.set(target, (incoming.get(target) ?? 0) + 1);
  }

  const compareNodes = (a: GraphNode, b: GraphNode) =>
    nodeLabel(a).localeCompare(nodeLabel(b)) || a.node_id.localeCompare(b.node_id);
  let roots = nodes.filter(isInternetEntry).sort(compareNodes);
  if (roots.length === 0 && centerId && nodeById.has(centerId)) {
    roots = [nodeById.get(centerId)!];
  }
  if (roots.length === 0) {
    roots = nodes.filter((node) => incoming.get(node.node_id) === 0).sort(compareNodes);
  }
  if (roots.length === 0 && nodes.length > 0) {
    roots = [nodes.slice().sort(compareNodes)[0]];
  }

  const layers = new Map<string, number>();
  const queue = roots.map((node) => node.node_id);
  for (const root of queue) layers.set(root, 0);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const nextLayer = (layers.get(current) ?? 0) + 1;
    const neighbors = [...(adjacency.get(current) ?? [])].sort((a, b) => {
      const left = nodeById.get(a);
      const right = nodeById.get(b);
      return left && right ? compareNodes(left, right) : a.localeCompare(b);
    });
    for (const neighbor of neighbors) {
      if (layers.has(neighbor)) continue;
      layers.set(neighbor, nextLayer);
      queue.push(neighbor);
    }
  }

  const maxLayer = Math.max(0, ...layers.values());
  for (const node of nodes) {
    if (!layers.has(node.node_id)) layers.set(node.node_id, maxLayer + 1);
  }

  const groups = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const layer = layers.get(node.node_id) ?? 0;
    groups.set(layer, [...(groups.get(layer) ?? []), node]);
  }
  const positions = new Map<string, { x: number; y: number }>();
  for (const [layer, group] of groups) {
    group.sort(compareNodes);
    group.forEach((node, index) => {
      positions.set(node.node_id, {
        x: layer * 280,
        y: (index - (group.length - 1) / 2) * 132,
      });
    });
  }
  return { positions, nodeById };
}

export function GraphCanvas({
  nodes,
  edges,
  centerId,
  highlightNodeIds,
  highlightEdgeIds,
  onNodeClick,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerId?: string;
  highlightNodeIds?: Set<string>;
  highlightEdgeIds?: Set<string>;
  onNodeClick?: (nodeId: string) => void;
}) {
  const { theme } = useTheme();
  const signature = nodes.map((n) => n.node_id).join("\0");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [sig, setSig] = useState(signature);
  if (sig !== signature) {
    setSig(signature);
    setFocusId(null);
  }

  const focusLit = useMemo(() => {
    if (!focusId) return null;
    const ids = new Set<string>([focusId]);
    for (const edge of edges) {
      if (edge.src_id === focusId) ids.add(edge.dst_id);
      if (edge.dst_id === focusId) ids.add(edge.src_id);
    }
    return ids;
  }, [focusId, edges]);

  const lit = focusLit ?? (highlightNodeIds && highlightNodeIds.size > 0 ? highlightNodeIds : null);
  const { positions, nodeById } = useMemo(
    () => hierarchicalPositions(nodes, edges, centerId),
    [nodes, edges, centerId],
  );

  const flowNodes: Node[] = useMemo(
    () =>
      nodes.map((n) => {
        const dimmed = Boolean(lit && !lit.has(n.node_id));
        const ring = n.node_id === focusId || n.node_id === centerId || highlightNodeIds?.has(n.node_id);
        return {
          id: n.node_id,
          data: { label: nodeLabel(n) },
          position: positions.get(n.node_id) ?? { x: 0, y: 0 },
          style: {
            ...kindStyle(n.kind, n.props, theme),
            padding: 8,
            borderRadius: 8,
            fontSize: 12,
            width: 180,
            opacity: dimmed ? 0.28 : 1,
            boxShadow: ring ? "0 0 0 2px #2f6fed" : undefined,
            transition: "opacity 150ms ease, box-shadow 150ms ease",
          },
        };
      }),
    [nodes, centerId, highlightNodeIds, lit, focusId, theme, positions],
  );

  const flowEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => {
        const touchesFocus = Boolean(focusId && (e.src_id === focusId || e.dst_id === focusId));
        const onPath = highlightEdgeIds?.has(e.edge_id) ?? false;
        const emphasized = touchesFocus || onPath;
        const dimEdge = focusId
          ? !touchesFocus
          : Boolean(lit && !(lit.has(e.src_id) && lit.has(e.dst_id)));
        const port = e.props?.port ?? e.props?.port_from;
        const label = [e.kind, port ? `:${port}` : ""].filter(Boolean).join("");
        const color = emphasized ? "#f87171" : "#7f93ad";
        const traversal = traversalEndpoints(e, nodeById);
        return {
          id: e.edge_id,
          source: traversal.source,
          target: traversal.target,
          label,
          type: "smoothstep",
          animated: emphasized,
          labelStyle: { fill: theme === "dark" ? "#e8eef8" : "#334155", fontSize: 10 },
          labelBgStyle: { fill: theme === "dark" ? "#15243c" : "#f8fafc", fillOpacity: 0.9 },
          style: { stroke: color, strokeWidth: emphasized ? 2.5 : 1.5, opacity: dimEdge ? 0.16 : 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        };
      }),
    [edges, highlightEdgeIds, focusId, lit, nodeById, theme],
  );

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] text-[var(--muted)]">
          Layout: internet/external entry on the left → reachable resources on the right
        </span>
        {legend.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--inset)] px-2 py-1 text-[10px] text-[var(--code-fg)] ring-1 ring-[var(--ring-soft)]"
          >
            <span className="h-2 w-2 rounded-sm" style={{ background: item.swatch }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="relative h-[min(480px,62vh)] min-h-[320px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--canvas)]">
        <ReactFlowProvider>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            fitView
            colorMode={theme}
            onNodeClick={(_, node) => {
              setFocusId(node.id);
              onNodeClick?.(node.id);
            }}
          >
            <MiniMap pannable zoomable />
            <Controls />
            <Background gap={16} color={theme === "dark" ? "#1c2d48" : "#d5dfec"} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
