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

  if (process.env.NODE_ENV === "development" && token === "preview") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm font-medium text-accent">Public Preview</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">
          Frontend Share View
        </h1>
        <p className="mt-3 text-muted">
          This development-only share view is available without a Supabase
          share token.
        </p>
      </div>
    );
  }

  const tokenHash = hashShareToken(token);
  const supabase = createAdminClient();

  // 1. Resolve token
  const { data: link } = await supabase
    .from("share_links")
    .select("folder_id, revoked_at, expires_at")
    .eq("token_hash", tokenHash)
    .single();

  if (
    !link ||
    link.revoked_at ||
    (link.expires_at && new Date(link.expires_at) < new Date())
  ) {
    notFound();
  }

  const folderId = link.folder_id;

  // 2. Fetch everything scoped to folderId
  const { data: folder } = await supabase
    .from("folders")
    .select("name, subject, exam_name, reference_year")
    .eq("id", folderId)
    .single();

  if (!folder) notFound();

  const { data: papers } = await supabase
    .from("papers")
    .select("year")
    .eq("folder_id", folderId)
    .in("extraction_status", ["extracted"]);

  const { data: analytics } = await supabase
    .from("folder_analytics")
    .select("payload")
    .eq("folder_id", folderId)
    .single();

  const { data: topics } = await supabase
    .from("topics")
    .select("id, name")
    .eq("folder_id", folderId);

  const { data: groups } = await supabase
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

  // 3. Prepare for projection
  const topicMap = new Map(topics?.map((t) => [t.id, t.name]));

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
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {shared.folderName}
          </h1>
          {shared.subject && (
            <Badge className="bg-accent-soft text-accent border-accent/30">
              {shared.subject}
            </Badge>
          )}
        </div>
        {shared.examName && (
          <p className="mt-1 text-sm text-muted">{shared.examName}</p>
        )}
      </div>

      <div className="space-y-8">
        {/* Topic Weightage */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-ink">
            Topic Weightage
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {shared.analytics.topicWeights.map((tw) => (
              <div
                key={tw.topicName}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <h3 className="font-medium text-ink">{tw.topicName}</h3>
                <p className="mt-1 text-xs text-muted">
                  {tw.questionCount} questions
                </p>
                <div className="mt-3 text-xl font-bold text-accent">
                  {tw.marksPercentage.toFixed(1)}%
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${tw.marksPercentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Questions */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-ink">Questions</h2>
          <div className="space-y-4">
            {shared.questionGroups.map((q) => (
              <div
                key={q.id}
                className="rounded-lg border border-border bg-surface p-5"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {q.repeatCount > 1 && (
                    <Badge className="bg-warning-soft text-warning border-warning/30">
                      Repeated {q.repeatCount}x
                    </Badge>
                  )}
                  {q.topicName && (
                    <Badge className="bg-accent-soft text-accent border-accent/30">
                      {q.topicName}
                    </Badge>
                  )}
                  {q.marks != null && (
                    <span className="text-xs text-faint">{q.marks} marks</span>
                  )}
                </div>

                <div className="text-sm leading-relaxed text-ink">
                  <MathText>{q.canonicalText}</MathText>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-faint">
                  {q.firstYear && q.lastYear && (
                    <span>
                      {q.firstYear === q.lastYear
                        ? q.firstYear
                        : `${q.firstYear} - ${q.lastYear}`}
                    </span>
                  )}
                  {q.pageNumbers.length > 0 && (
                    <span>Pages: {q.pageNumbers.join(", ")}</span>
                  )}
                  {q.hasLowConfidenceExtraction && (
                    <span
                      className="text-warning"
                      title="Some text was extracted with low OCR confidence. Check the original PDF."
                    >
                      ⚠ Low-confidence OCR
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Study Tools */}
        <section>
          <StudyTools folderId={folderId} groups={studyGroups} />
        </section>
      </div>
    </div>
  );
}
