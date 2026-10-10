import { Activity, Globe2, ShieldAlert } from "lucide-react";

import { ErrorNote } from "@/components/ErrorNote";
import { MetricCard } from "@/components/MetricCard";
import { Panel } from "@/components/Panel";
import { Skeleton } from "@/components/Skeleton";
import { ThreatMap } from "@/components/soc/ThreatMap";
import { useSecurityAnalytics } from "@/lib/useSecurityAnalytics";

export function ThreatMapPage() {
  const { model, pending, unavailable, errorMessage } = useSecurityAnalytics();
  const events = model?.mapEvents ?? [];
  const criticalAndHigh = events.filter((event) => event.severity === "critical" || event.severity === "high").length;
  const regions = new Set(events.flatMap((event) => [event.sourceSite.region, event.destSite.region])).size;

  return (
    <div className="space-y-5">
      <div className="max-w-3xl space-y-2">
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Explore geographically mapped threat scenarios alongside your CSPM findings.
        </p>
        <p className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-3 py-2 text-sm leading-relaxed text-[var(--muted)]">
          This map is a simulation, not a live feed of attacks on the wider internet. When findings are loaded, events
          are derived from those findings and assigned illustrative locations; otherwise, a labeled fallback dataset is
          shown.
        </p>
      </div>

      {unavailable && errorMessage ? <ErrorNote>{errorMessage}</ErrorNote> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Mapped scenarios" icon={Activity} loading={pending} value={events.length} />
        <MetricCard label="Critical + high" icon={ShieldAlert} loading={pending} value={criticalAndHigh} />
        <MetricCard label="Illustrative regions" icon={Globe2} loading={pending} value={regions} />
      </div>

      <Panel title="Global threat map" eyebrow="Simulated activity">
        {pending ? <Skeleton className="h-72 w-full" /> : null}
        {model ? <ThreatMap events={events} fallback={model.mapUsesFallback} /> : null}
      </Panel>
    </div>
  );
}
