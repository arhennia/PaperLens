import { requireFolder } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FolderHeader } from "@/components/folder/folder-header";
import { UploadZone } from "@/components/folder/upload-zone";
import { ProcessingStatus } from "@/components/folder/processing-status";
import { AnalyticsSummary } from "@/components/folder/analytics-summary";
import { ShareModal } from "@/components/folder/share-modal";
import { TopicAccordions } from "@/components/folder/topic-accordions";
import { StudyTools } from "@/components/folder/study-tools";
import { FolderTabs } from "@/components/folder/folder-tabs";
import type { QuestionGroupsRow, TopicsRow } from "@/types/database.generated";

type WorkspaceGroup = QuestionGroupsRow & {
  question_label: string | null;
  page_numbers: number[];
  has_low_confidence: boolean;
  question_type: string | null;
  difficulty: string | null;
  marks: number | null;
};

export default async function FolderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const folder = await requireFolder(id);
  const supabase = await createClient();
  const [
    { count: paperCount },
    { data: analytics },
    { data: topics },
    { data: rawGroups },
  ] = await Promise.all([
    supabase
      .from("papers")
      .select("id", { count: "exact", head: true })
      .eq("folder_id", id),
    supabase
      .from("folder_analytics")
      .select("payload, computed_at")
      .eq("folder_id", id)
      .maybeSingle(),
    supabase
      .from("topics")
      .select("*")
      .eq("folder_id", id)
      .order("ordinal"),
    supabase
      .from("question_groups")
      .select(
        `*, questions(question_label, page_number, confidence, question_type, difficulty, marks)`,
      )
      .eq("folder_id", id)
      .order("priority_score", { ascending: false }),
  ]);

  const groups = ((rawGroups ?? []) as unknown as Array<
    QuestionGroupsRow & {
      questions: Array<{
        question_label: string | null;
        page_number: number | null;
        confidence: number | null;
        question_type: string | null;
        difficulty: string | null;
        marks: number | null;
      }>;
    }
  >).map<WorkspaceGroup>((group) => {
    const questions = group.questions ?? [];
    return {
      ...group,
      question_label: questions[0]?.question_label ?? null,
      page_numbers: questions
        .map((question) => question.page_number)
        .filter((page): page is number => page !== null),
      has_low_confidence: questions.some(
        (question) => question.confidence !== null && question.confidence < 80,
      ),
      question_type: questions[0]?.question_type ?? null,
      difficulty: questions[0]?.difficulty ?? null,
      marks: questions[0]?.marks ?? group.avg_marks,
    };
  });

  const topicGroups = (topics ?? []).map((topic) => ({
    topic: topic as TopicsRow,
    groups: groups.filter((group) => group.topic_id === topic.id),
  }));
  const uncategorized = groups.filter((group) => group.topic_id === null);
  if (uncategorized.length > 0) {
    topicGroups.push({ topic: null, groups: uncategorized } as any);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <FolderHeader
        folder={folder}
        paperCount={paperCount ?? 0}
        lastAnalyzed={analytics?.computed_at ?? null}
      >
        <ShareModal folderId={id} />
      </FolderHeader>

      <FolderTabs
        folderId={id}
        topicGroups={topicGroups}
        groups={groups}
        topics={topics ?? []}
        analyticsPayload={
          analytics?.payload && typeof analytics.payload === "object" && !Array.isArray(analytics.payload)
            ? (analytics.payload as Record<string, unknown>)
            : null
        }
      />
    </div>
  );
}
