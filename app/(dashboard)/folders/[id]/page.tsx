import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authenticateRoute } from "@/lib/auth";

import { FolderHeader } from "@/components/folder/folder-header";
import { UploadZone } from "@/components/folder/upload-zone";
import { ProcessingStatus } from "@/components/folder/processing-status";
import { AnalyticsSummary } from "@/components/folder/analytics-summary";
import { TopicAccordions } from "@/components/folder/topic-accordions";
import { StudyTools } from "@/components/folder/study-tools";
import { ShareModal } from "@/components/folder/share-modal";

export default async function FolderPage({
  params,
}: {
  params: { id: string };
}) {
  const auth = await authenticateRoute();
  if (auth.response) return auth.response;

  const supabase = await createClient();

  // 1. Fetch Folder
  const { data: folder, error: folderError } = await supabase
    .from("folders")
    .select("*")
    .eq("id", params.id)
    .single();

  if (folderError || !folder) {
    notFound();
  }

  // 2. Fetch papers count
  const { count: paperCount } = await supabase
    .from("papers")
    .select("*", { count: "exact", head: true })
    .eq("folder_id", params.id);

  // 3. Fetch analytics
  const { data: analytics } = await supabase
    .from("folder_analytics")
    .select("payload, computed_at")
    .eq("folder_id", params.id)
    .single();

  // 4. Fetch topics and question groups
  const { data: topics } = await supabase
    .from("topics")
    .select("*")
    .eq("folder_id", params.id)
    .order("ordinal");

  const { data: groups } = await supabase
    .from("question_groups")
    .select(
      `
      *,
      questions(question_label, page_number, confidence, question_type, difficulty, marks)
    `,
    )
    .eq("folder_id", params.id)
    .order("priority_score", { ascending: false });

  // Map to TopicGroup format
  const formattedGroups = (groups ?? []).map((g: any) => {
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
    const marks = g.avg_marks ?? g.questions?.[0]?.marks ?? null;

    return {
      ...g,
      question_label: qLabel,
      page_numbers: pages,
      has_low_confidence: hasLowConf,
      question_type: type,
      difficulty: diff,
      marks: marks,
    };
  });

  const topicGroups = [
    ...(topics ?? []).map((t) => ({
      topic: t,
      groups: formattedGroups.filter((g) => g.topic_id === t.id),
    })),
    {
      topic: null, // Uncategorized
      groups: formattedGroups.filter((g) => !g.topic_id),
    },
  ].filter((tg) => tg.groups.length > 0);

  // 5. Study groups for StudyTools
  const studyGroups = formattedGroups.map((g) => ({
    id: g.id,
    canonical_text: g.canonical_text,
    occurrence_count: g.occurrence_count,
    priority_level: g.priority_level,
    marks: g.marks,
    topic_name:
      topics?.find((t) => t.id === g.topic_id)?.name ?? "Uncategorized",
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <FolderHeader
        folder={folder}
        paperCount={paperCount ?? 0}
        lastAnalyzed={analytics?.computed_at ?? null}
      >
        <ShareModal folderId={folder.id} />
      </FolderHeader>

      <UploadZone folderId={folder.id} />

      <ProcessingStatus folderId={folder.id} />

      {analytics && <AnalyticsSummary payload={analytics.payload} />}

      {formattedGroups.length > 0 && (
        <>
          <TopicAccordions topicGroups={topicGroups} />
          <StudyTools folderId={folder.id} groups={studyGroups} />
        </>
      )}
    </div>
  );
}
