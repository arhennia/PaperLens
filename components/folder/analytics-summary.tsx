import { formatPercent } from "@/lib/format";

interface TopicWeight {
  topic_name: string;
  question_count: number;
  marks_percentage: number;
}

interface AnalyticsPayload {
  total_papers?: number;
  total_questions?: number;
  unique_questions?: number;
  repeat_rate_percentage?: number;
  priority_distribution?: Record<string, number>;
  topic_weights?: TopicWeight[];
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
  const topicWeights = data.topic_weights ?? [];

  return (
    <div className="mt-6 space-y-4">
      {/* 5-Metric Intelligence Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Papers
            </span>
            <span className="material-symbols-outlined text-[18px] text-primary">
              description
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">
            {data.total_papers ?? 0}
          </p>
          <p className="mt-0.5 text-[11px] text-faint">Uploaded past papers</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Total Questions
            </span>
            <span className="material-symbols-outlined text-[18px] text-secondary">
              format_list_numbered
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">
            {data.total_questions ?? 0}
          </p>
          <p className="mt-0.5 text-[11px] text-faint">Extracted from PDFs</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Unique Concepts
            </span>
            <span className="material-symbols-outlined text-[18px] text-tertiary">
              fingerprint
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">
            {data.unique_questions ?? 0}
          </p>
          <p className="mt-0.5 text-[11px] text-faint">Deduplicated clusters</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Repeat Rate
            </span>
            <span className="material-symbols-outlined text-[18px] text-warning">
              repeat
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-warning tabular-nums">
            {formatPercent(data.repeat_rate_percentage ?? 0)}
          </p>
          <p className="mt-0.5 text-[11px] text-faint">Repeated 2+ times</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Critical Topics
            </span>
            <span className="material-symbols-outlined text-[18px] text-critical">
              priority_high
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-critical tabular-nums">
            {criticalCount}
          </p>
          <p className="mt-0.5 text-[11px] text-faint">Highest exam yield</p>
        </div>
      </div>

      {/* Topic Weightage Breakdown (if available) */}
      {topicWeights.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">
                pie_chart
              </span>
              <h3 className="text-sm font-bold text-ink">
                Topic Marks Weightage Distribution
              </h3>
            </div>
            <span className="text-[11px] text-muted">Based on marks allocated across past papers</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {topicWeights.map((tw) => (
              <div
                key={tw.topic_name}
                className="rounded-xl border border-border bg-surface-container-low p-3"
              >
                <div className="flex items-start justify-between">
                  <span className="font-semibold text-xs text-ink truncate max-w-[160px]">
                    {tw.topic_name}
                  </span>
                  <span className="font-bold text-xs text-primary tabular-nums">
                    {tw.marks_percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, tw.marks_percentage)}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-faint">
                  {tw.question_count} question{tw.question_count === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
