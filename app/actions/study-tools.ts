"use server";

/**
 * Server actions for study tools: checklists, answer hints, and mock papers.
 *
 * LLM calls go through `lib/llm.ts`, which enforces cache → rate limit → budget
 * → token cap → single retry, in that order (D-023). This action layer adds
 * authentication and folder ownership verification.
 */

import { authorizeFolderRoute } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  generateCached,
  generatePreview,
  fingerprintInput,
  type LlmResult,
} from "@/lib/llm";
import type { Json } from "@/types/database.generated";

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

export interface ChecklistState {
  [groupId: string]: boolean;
}

/**
 * Saves checklist state for a folder.
 *
 * Stored as a `generated_artifacts` row of kind `checklist`, keyed by folder.
 * Upserts so toggling is idempotent.
 */
export async function saveChecklistState(
  folderId: string,
  state: ChecklistState,
) {
  const auth = await authorizeFolderRoute(folderId);
  if (auth.response) throw new Error("Folder not found.");

  const supabase = await createClient();

  // Check for an existing checklist artifact.
  const { data: existing } = await supabase
    .from("generated_artifacts")
    .select("id")
    .eq("folder_id", folderId)
    .eq("kind", "checklist")
    .maybeSingle();

  if (existing) {
    await supabase
      .from("generated_artifacts")
      .update({ payload: state as unknown as Json })
      .eq("id", existing.id);
  } else {
    await supabase.from("generated_artifacts").insert({
      folder_id: folderId,
      user_id: auth.user.id,
      kind: "checklist",
      fingerprint: "checklist-state",
      payload: state as unknown as Json,
    });
  }
}

/** Loads the saved checklist state for a folder. */
export async function loadChecklistState(
  folderId: string,
): Promise<ChecklistState> {
  const auth = await authorizeFolderRoute(folderId);
  if (auth.response) return {};

  const supabase = await createClient();
  const { data } = await supabase
    .from("generated_artifacts")
    .select("payload")
    .eq("folder_id", folderId)
    .eq("kind", "checklist")
    .maybeSingle();

  return (data?.payload as ChecklistState | undefined) ?? {};
}

// ---------------------------------------------------------------------------
// Answer hints
// ---------------------------------------------------------------------------

/** Requests an AI-generated answer hint for a question group. */
export async function getAnswerHint(
  folderId: string,
  groupId: string,
  questionText: string,
): Promise<LlmResult<{ text: string }>> {
  const auth = await authorizeFolderRoute(folderId);
  if (auth.response) throw new Error("Folder not found.");

  const inputFingerprint = fingerprintInput({
    type: "answer_hint",
    groupId,
    text: questionText,
  });

  return generateCached<{ text: string }>({
    userId: auth.user.id,
    folderId,
    feature: "answer_hint",
    inputFingerprint,
    system:
      "You are a concise exam tutor. Give a clear, structured answer to the following exam question. Use LaTeX math notation ($...$) where appropriate. Keep your answer focused and exam-ready.",
    prompt: questionText,
  });
}

// ---------------------------------------------------------------------------
// Mock paper
// ---------------------------------------------------------------------------

export interface MockPaperQuestion {
  text: string;
  marks: number;
  topic: string;
  source: string;
}

export interface MockPaper {
  title: string;
  questions: MockPaperQuestion[];
  totalMarks: number;
}

/** Generates an AI-predicted mock paper based on question frequency and marks. */
export async function generateMockPaper(
  folderId: string,
  questionSummary: string,
): Promise<LlmResult<MockPaper>> {
  const auth = await authorizeFolderRoute(folderId);
  if (auth.response) throw new Error("Folder not found.");

  const inputFingerprint = fingerprintInput({
    type: "mock_paper",
    folderId,
    summary: questionSummary,
  });

  return generateCached<MockPaper>({
    userId: auth.user.id,
    folderId,
    feature: "mock_paper",
    inputFingerprint,
    system:
      "You are an exam paper designer. Based on the question frequency data provided, generate a realistic mock exam paper. Return valid JSON matching the requested schema.",
    prompt: `Generate a mock exam paper based on these frequently asked questions and their patterns:\n\n${questionSummary}`,
    jsonSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        totalMarks: { type: "number" },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              marks: { type: "number" },
              topic: { type: "string" },
              source: { type: "string" },
            },
            required: ["text", "marks", "topic", "source"],
          },
        },
      },
      required: ["title", "totalMarks", "questions"],
    },
  });
}

/** Development-only AI calls for `/folders/preview`; these do not touch the DB. */
export async function getPreviewAnswerHint(
  questionText: string,
): Promise<LlmResult<{ text: string }>> {
  return generatePreview<{ text: string }>({
    system:
      "You are a concise exam tutor. Give a clear, structured answer to the exam question. Use LaTeX math notation where appropriate and keep it exam-ready.",
    prompt: questionText,
  });
}

export async function generatePreviewMockPaper(
  questionSummary: string,
): Promise<LlmResult<MockPaper>> {
  return generatePreview<MockPaper>({
    system:
      "You are an exam paper designer. Return valid JSON for a realistic predicted paper based on the supplied patterns.",
    prompt: `Generate a mock paper from these patterns:\n\n${questionSummary}`,
    jsonSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        totalMarks: { type: "number" },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              marks: { type: "number" },
              topic: { type: "string" },
              source: { type: "string" },
            },
            required: ["text", "marks", "topic", "source"],
          },
        },
      },
      required: ["title", "totalMarks", "questions"],
    },
  });
}
