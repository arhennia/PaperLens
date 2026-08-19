import { Stat } from "@/components/ui/card";
import { formatPercent } from "@/lib/format";

/**
 * Analytics summary cards.
 *
 * Reads from the cached `folder_analytics.payload`. These numbers are
 * deterministic and never recomputed per viewer — core differentiator #1.
 */

interface AnalyticsPayload {
  total_papers?: number;
  total_questions?: number;
  unique_questions?: number;
  repeat_rate_percentage?: number;
  priority_distribution?: Record<string, number>;
}

export function AnalyticsSummary({
  payload,
}: {
  payload: unknown;
}) {
  const data = (typeof payload === "object" && payload !== null
    ? payload
    : {}) as AnalyticsPayload;

  const criticalCount = data.priority_distribution?.critical ?? 0;

  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Stat
        label="Papers"
        value={data.total_papers ?? 0}
        hint="Uploaded PDFs"
      />
      <Stat
        label="Total Questions"
        value={data.total_questions ?? 0}
        hint="Across all papers"
      />
      <Stat
        label="Unique Questions"
        value={data.unique_questions ?? 0}
        hint="Exact-hash deduplicated"
      />
      <Stat
        label="Repeat Rate"
        value={formatPercent(data.repeat_rate_percentage ?? 0)}
        hint="Of questions seen 2+ times"
      />
      <Stat
        label="Critical Topics"
        value={criticalCount}
        hint="Highest priority"
      />
    </div>
  );
}
