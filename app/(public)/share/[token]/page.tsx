import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashShareToken } from "@/lib/share-utils";
import { buildSharedFolder } from "@/lib/share-projection";

import { MathText } from "@/components/ui/math-text";
import { Badge } from "@/components/ui/badge";

export default async function SharedFolderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const tokenHash = hashShareToken(token);
  const supabase = createAdminClient();

  // Resolve the token before reading any public projection inputs.
  const { data: link } = await supabase
    .from("share_links")
    .select("folder_id, revoked_at, expires_at")
    .eq("token_hash", tokenHash)
    .single();

  if (!link || link.revoked_at || (link.expires_at && new Date(link.expires_at) < new Date())) {
    notFound();
  }

  const folderId = link.folder_id;
  const [
    { data: folder },
    { data: papers },
    { data: analytics },
    { data: topics },
    { data: rawGroups },
    { data: rawQuestions },
  ] = await Promise.all([
    supabase
      .from("folders")
      .select("name, subject, exam_name, reference_year")
      .eq("id", folderId)
      .single(),
    supabase
      .from("papers")
      .select("year")
      .eq("folder_id", folderId)
      .in("extraction_status", ["extracted"]),
    supabase
      .from("folder_analytics")
      .select("payload")
      .eq("folder_id", folderId)
      .single(),
    supabase
      .from("topics")
      .select("id, name")
      .eq("folder_id", folderId),
    supabase
      .from("question_groups")
      .select(
        `
        id,
        canonical_text,
        avg_marks,
        priority_level,
        priority_score,
        priority_reason,
        occurrence_count,
        distinct_years,
        first_year,
        last_year,
        topic_id
      `,
      )
      .eq("folder_id", folderId),
    supabase
      .from("questions")
      .select("group_id, question_label, page_number, confidence, question_type, difficulty, marks")
      .eq("folder_id", folderId),
  ]);

  if (!folder) notFound();

  const topicMap = new Map((topics ?? []).map((t) => [t.id, t.name]));

  // Group questions by group_id in memory
  type QuestionItem = NonNullable<typeof rawQuestions>[number];
  const questionsByGroup = new Map<string, QuestionItem[]>();
  for (const q of rawQuestions ?? []) {
    if (!q.group_id) continue;
    const list = questionsByGroup.get(q.group_id) ?? [];
    list.push(q);
    questionsByGroup.set(q.group_id, list);
  }

  const shareGroupsInput = (rawGroups ?? []).map((g) => {
    const qList = questionsByGroup.get(g.id) ?? [];
    const qLabel = qList[0]?.question_label ?? null;
    const pages = Array.from(
      new Set(
        qList
          .map((q) => q.page_number)
          .filter((p): p is number => p !== null && p !== undefined),
      ),
    );
    const hasLowConf = qList.some(
      (q) => q.confidence !== null && q.confidence !== undefined && q.confidence < 80,
    );
    const type = qList[0]?.question_type ?? null;
    const diff = qList[0]?.difficulty ?? null;

    return {
      id: g.id,
      canonical_text: g.canonical_text,
      marks: g.avg_marks,
      question_type: type,
      difficulty: diff,
      priority_level: g.priority_level,
      priority_score: g.priority_score,
      priority_reason: g.priority_reason,
      occurrence_count: g.occurrence_count,
      distinct_years: g.distinct_years,
      first_year: g.first_year,
      last_year: g.last_year,
      question_label: qLabel,
      topic_name: g.topic_id ? topicMap.get(g.topic_id) ?? null : null,
      page_numbers: pages,
      has_low_confidence_extraction: hasLowConf,
      similar_variation_count: 0,
    };
  });

  const shared = buildSharedFolder({
    folder,
    papers: papers ?? [],
    analyticsPayload: analytics?.payload,
    groups: shareGroupsInput,
  });

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {shared.folderName}
          </h1>
          {shared.subject && (
            <Badge className="bg-primary-soft text-primary border-primary/30 font-semibold px-2.5 py-0.5">
              {shared.subject}
            </Badge>
          )}
          {shared.examName && (
            <span className="rounded-md bg-surface-container px-2 py-0.5 text-xs font-medium text-muted">
              {shared.examName}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
          <span className="font-semibold text-ink">
            {shared.analytics.totalPapers} Past Papers Analyzed
          </span>
          <span>•</span>
          <span>{shared.analytics.totalQuestions} Questions Extracted</span>
          <span>•</span>
          <span className="text-warning font-bold">
            {shared.analytics.repeatRatePercentage.toFixed(0)}% Repeat Rate
          </span>
        </div>
      </div>

      {/* Topic Weightage Section */}
      {shared.analytics.topicWeights.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary text-xl">
              pie_chart
            </span>
            <h2 className="text-base font-bold text-ink">
              Topic Marks Weightage
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shared.analytics.topicWeights.map((tw) => (
              <div
                key={tw.topicName}
                className="rounded-xl border border-border bg-surface-container-low p-4"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-xs text-ink truncate max-w-[160px]">
                    {tw.topicName}
                  </h3>
                  <span className="font-bold text-xs text-primary tabular-nums">
                    {tw.marksPercentage.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${tw.marksPercentage}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-faint">
                  {tw.questionCount} question{tw.questionCount === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Extracted Questions List */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <span className="material-symbols-outlined text-primary text-xl">
            format_list_numbered
          </span>
          <h2 className="text-base font-bold text-ink">
            Extracted Questions & Concept Occurrences
          </h2>
        </div>

        <div className="space-y-3">
          {shared.questionGroups.map((q) => (
            <div
              key={q.id}
              className="rounded-xl border border-border bg-surface-container-low/40 p-4 transition-colors hover:border-primary/30"
            >
              <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                {q.questionLabel && (
                  <span className="rounded bg-surface-container px-1.5 py-0.5 text-xs font-mono font-bold text-ink">
                    {q.questionLabel}
                  </span>
                )}

                {q.repeatCount > 1 && (
                  <Badge className="bg-warning-soft text-warning border-warning/30 font-bold">
                    Repeated {q.repeatCount}x
                  </Badge>
                )}

                {q.topicName && (
                  <Badge className="bg-primary-soft text-primary border-primary/30">
                    {q.topicName}
                  </Badge>
                )}

                {q.marks != null && (
                  <span className="rounded-md bg-surface px-2 py-0.5 text-xs font-semibold text-ink border border-border">
                    {q.marks} Marks
                  </span>
                )}
              </div>

              <div className="text-xs md:text-sm leading-relaxed text-ink font-normal">
                <MathText>{q.canonicalText}</MathText>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-faint border-t border-border/60 pt-2">
                {q.firstYear && q.lastYear && (
                  <span className="flex items-center gap-1 text-muted font-medium">
                    <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                    {q.firstYear === q.lastYear
                      ? q.firstYear
                      : `${q.firstYear} - ${q.lastYear}`}
                  </span>
                )}

                {q.pageNumbers.length > 0 && (
                  <span>• Pages: {q.pageNumbers.join(", ")}</span>
                )}

                {q.hasLowConfidenceExtraction && (
                  <span
                    className="flex items-center gap-1 text-warning font-medium"
                    title="Some text was extracted with low OCR confidence."
                  >
                    <span className="material-symbols-outlined text-[14px]">warning</span>
                    Low-confidence OCR
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}