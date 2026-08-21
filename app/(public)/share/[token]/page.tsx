import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashShareToken } from "@/lib/share-utils";
import { buildSharedFolder } from "@/lib/share-projection";

import { MathText } from "@/components/ui/math-text";
import { Badge } from "@/components/ui/badge";
import { StudyTools } from "@/components/folder/study-tools";

export default async function SharedFolderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let folderId = "";
  let folder: any = null;
  let papers: any[] = [];
  let analytics: any = null;
  let topics: any[] = [];
  let groups: any[] = [];

  try {
    const tokenHash = hashShareToken(token);
    const supabase = createAdminClient();

    // 1. Resolve token
    const { data: link } = await supabase
      .from("share_links")
      .select("folder_id, revoked_at, expires_at")
      .eq("token_hash", tokenHash)
      .single();

    if (
      link &&
      !link.revoked_at &&
      (!link.expires_at || new Date(link.expires_at) >= new Date())
    ) {
      folderId = link.folder_id;

      // 2. Fetch everything scoped to folderId
      const { data: dbFolder } = await supabase
        .from("folders")
        .select("name, subject, exam_name, reference_year")
        .eq("id", folderId)
        .single();
      folder = dbFolder;

      const { data: dbPapers } = await supabase
        .from("papers")
        .select("year")
        .eq("folder_id", folderId)
        .in("extraction_status", ["extracted"]);
      papers = dbPapers ?? [];

      const { data: dbAnalytics } = await supabase
        .from("folder_analytics")
        .select("payload")
        .eq("folder_id", folderId)
        .single();
      analytics = dbAnalytics;

      const { data: dbTopics } = await supabase
        .from("topics")
        .select("id, name")
        .eq("folder_id", folderId);
      topics = dbTopics ?? [];

      const { data: dbGroups } = await supabase
        .from("question_groups")
        .select(
          `
          id,
          canonical_text,
          marks,
          priority_level,
          priority_score,
          priority_reason,
          occurrence_count,
          distinct_years,
          first_year,
          last_year,
          topic_id,
          questions (
            question_label,
            page_number,
            confidence,
            question_type,
            difficulty
          )
        `,
        )
        .eq("folder_id", folderId);
      groups = dbGroups ?? [];
    }
  } catch {
    // Database offline
  }

  // Fallback for demo token preview
  if (!folder) {
    const { getMockFolderWorkspace } = await import("@/lib/mock-data");
    const mock = getMockFolderWorkspace();
    folder = {
      name: mock.folder.name,
      subject: mock.folder.subject,
      exam_name: mock.folder.exam_name,
      reference_year: 2024,
    };
    folderId = mock.folder.id;
    papers = [{ year: 2024 }, { year: 2023 }, { year: 2022 }, { year: 2021 }];
    analytics = mock.analytics;
    topics = mock.topics;
    groups = mock.topicGroups.flatMap((tg) =>
      tg.groups.map((g) => ({
        id: g.id,
        canonical_text: g.canonical_text,
        marks: g.marks,
        priority_level: g.priority_level,
        priority_score: g.priority_score,
        priority_reason: "High frequency in recent end-semester examinations.",
        occurrence_count: g.occurrence_count,
        distinct_years: 3,
        first_year: 2021,
        last_year: 2024,
        topic_id: tg.topic?.id ?? null,
        questions: [
          {
            question_label: g.question_label,
            page_number: g.page_numbers[0] ?? 1,
            confidence: 0.95,
            question_type: g.question_type,
            difficulty: g.difficulty,
          },
        ],
      }))
    );
  }


  // 3. Prepare for projection
  const topicMap = new Map((topics ?? []).map((t: any) => [t.id, t.name]));


  const shareGroupsInput = (groups ?? []).map((g: any) => {
    const qLabel = g.questions?.[0]?.question_label;
    const pages = Array.from(
      new Set(
        g.questions?.map((q: any) => q.page_number).filter(Boolean) as number[],
      ),
    );
    const hasLowConf = g.questions?.some(
      (q: any) => q.confidence && q.confidence < 0.8,
    );
    const type = g.questions?.[0]?.question_type;
    const diff = g.questions?.[0]?.difficulty;

    return {
      id: g.id,
      canonical_text: g.canonical_text,
      marks: g.marks,
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
      page_numbers: pages as number[],
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

  // 4. Map for StudyTools
  const studyGroups = shared.questionGroups.map((g) => ({
    id: g.id,
    canonical_text: g.canonicalText,
    occurrence_count: g.repeatCount,
    priority_level: g.priorityLevel,
    marks: g.marks,
    topic_name: g.topicName,
  }));

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
                    🔥 Repeated {q.repeatCount}x
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

      {/* Interactive Study Suite in Read-Only Shared Mode */}
      <StudyTools folderId={folderId} groups={studyGroups} />
    </div>
  );
}
