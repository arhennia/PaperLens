import type { FoldersRow, TopicsRow } from "@/types/database.generated";
import type { FolderCardData } from "@/components/dashboard/folder-grid";

export const MOCK_USER = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "alex.chen@university.edu",
  user_metadata: {
    name: "Alex Chen",
    avatar_url: null,
  },
  app_metadata: {},
  aud: "authenticated",
  created_at: "2026-08-01T00:00:00Z",
};

export const MOCK_PROFILE = {
  id: "00000000-0000-0000-0000-000000000000",
  display_name: "Alex Chen",
  avatar_url: null,
  institution: "School of Computer Engineering",
  role: "Undergraduate (B.Tech / B.S.)",
  created_at: "2026-08-01T00:00:00Z",
};

export const MOCK_FOLDERS: FoldersRow[] = [
  {
    id: "cs-201-dsa",
    user_id: "00000000-0000-0000-0000-000000000000",
    name: "Data Structures & Algorithms",
    subject: "Computer Science",
    exam_name: "End-Semester Examination 2024",
    exam_type: "End-Sem",
    total_marks: 100,
    question_pattern: "Part A (10x2=20), Part B (5x16=80)",
    reference_year: 2024,
    syllabus_storage_path: null,
    created_at: "2026-08-15T09:30:00Z",
    updated_at: "2026-08-21T10:00:00Z",
  },
  {
    id: "cs-301-os",
    user_id: "00000000-0000-0000-0000-000000000000",
    name: "Operating Systems & Concurrency",
    subject: "Computer Science",
    exam_name: "Mid-Semester Assessment",
    exam_type: "Mid-Sem",
    total_marks: 50,
    question_pattern: "Part A (5x2=10), Part B (4x10=40)",
    reference_year: 2024,
    syllabus_storage_path: null,
    created_at: "2026-08-10T14:15:00Z",
    updated_at: "2026-08-19T11:20:00Z",
  },
  {
    id: "ee-102-de",
    user_id: "00000000-0000-0000-0000-000000000000",
    name: "Digital Electronics & Logic Design",
    subject: "Electronics Engineering",
    exam_name: "Autumn End-Sem 2023",
    exam_type: "End-Sem",
    total_marks: 100,
    question_pattern: "Part A (10x2=20), Part B (5x16=80)",
    reference_year: 2023,
    syllabus_storage_path: null,
    created_at: "2026-08-05T08:00:00Z",
    updated_at: "2026-08-18T16:45:00Z",
  },
  {
    id: "cs-204-dbms",
    user_id: "00000000-0000-0000-0000-000000000000",
    name: "Database Management Systems",
    subject: "Computer Science",
    exam_name: "Practical Laboratory Viva",
    exam_type: "Laboratory",
    total_marks: 50,
    question_pattern: "Schema Design & SQL Queries (50)",
    reference_year: 2024,
    syllabus_storage_path: null,
    created_at: "2026-08-01T12:00:00Z",
    updated_at: "2026-08-14T09:10:00Z",
  },
];


export const MOCK_FOLDER_CARDS: FolderCardData[] = [
  {
    id: "cs-201-dsa",
    name: "Data Structures & Algorithms",
    subject: "Computer Science",
    examName: "End-Semester Examination 2024",
    examType: "End-Sem",
    createdAt: "2026-08-15T09:30:00Z",
    paperCount: 6,
    topicCount: 5,
  },
  {
    id: "cs-301-os",
    name: "Operating Systems & Concurrency",
    subject: "Computer Science",
    examName: "Mid-Semester Assessment",
    examType: "Mid-Sem",
    createdAt: "2026-08-10T14:15:00Z",
    paperCount: 4,
    topicCount: 4,
  },
  {
    id: "ee-102-de",
    name: "Digital Electronics & Logic Design",
    subject: "Electronics Engineering",
    examName: "Autumn End-Sem 2023",
    examType: "End-Sem",
    createdAt: "2026-08-05T08:00:00Z",
    paperCount: 5,
    topicCount: 6,
  },
  {
    id: "cs-204-dbms",
    name: "Database Management Systems",
    subject: "Computer Science",
    examName: "Practical Laboratory Viva",
    examType: "Laboratory",
    createdAt: "2026-08-01T12:00:00Z",
    paperCount: 3,
    topicCount: 4,
  },
];

export function getMockFolderWorkspace(id: string = "cs-201-dsa") {
  const folder =
    MOCK_FOLDERS.find((f) => f.id === id) || MOCK_FOLDERS[0];

  const topics: TopicsRow[] = [
    {
      id: "top-1",
      folder_id: folder.id,
      user_id: folder.user_id,
      name: "Binary Search Trees & AVL Trees",
      ordinal: 1,
      keywords: ["BST", "AVL", "rotations", "balance factor"],
      source: "syllabus",
      created_at: "2026-08-15T09:30:00Z",
    },
    {
      id: "top-2",
      folder_id: folder.id,
      user_id: folder.user_id,
      name: "Graph Traversal & Shortest Path",
      ordinal: 2,
      keywords: ["BFS", "DFS", "Dijkstra", "Bellman-Ford"],
      source: "syllabus",
      created_at: "2026-08-15T09:30:00Z",
    },
    {
      id: "top-3",
      folder_id: folder.id,
      user_id: folder.user_id,
      name: "Dynamic Programming & Recurrences",
      ordinal: 3,
      keywords: ["Knapsack", "LCS", "DP", "recurrence"],
      source: "syllabus",
      created_at: "2026-08-15T09:30:00Z",
    },
    {
      id: "top-4",
      folder_id: folder.id,
      user_id: folder.user_id,
      name: "Hashing & Collision Resolution",
      ordinal: 4,
      keywords: ["hash table", "chaining", "linear probing"],
      source: "syllabus",
      created_at: "2026-08-15T09:30:00Z",
    },
    {
      id: "top-5",
      folder_id: folder.id,
      user_id: folder.user_id,
      name: "Sorting & Asymptotic Complexity",
      ordinal: 5,
      keywords: ["quicksort", "mergesort", "asymptotic", "Master theorem"],
      source: "syllabus",
      created_at: "2026-08-15T09:30:00Z",
    },
  ];


  const topicGroups = [
    {
      topic: topics[0],
      groups: [
        {
          id: "grp-101",
          topic_id: "top-1",
          folder_id: folder.id,
          canonical_text:
            "Derive the balance factor condition for an AVL tree: $\\text{BalanceFactor}(v) = \\text{height}(v.\\text{left}) - \\text{height}(v.\\text{right}) \\in \\{-1, 0, +1\\}$. Explain the step-by-step LL and LR rotation algorithms with diagrams when inserting into an unbalanced subtree.",
          occurrence_count: 4,
          priority_level: "critical" as const,
          priority_score: 95.0,
          avg_marks: 10,
          marks: 10,
          question_label: "Q.3 (a)",
          question_type: "Derivation",
          difficulty: "Hard",
          page_numbers: [2, 4],
          has_low_confidence: false,
          answer_hint:
            "1. Define AVL invariant: $|h_L - h_R| \\le 1$ at every node.\n2. Single rotation (LL/RR): modifies 3 pointers in $O(1)$ time.\n3. Double rotation (LR/RL): first rotate child left, then root right.",
        },
        {
          id: "grp-102",
          topic_id: "top-1",
          folder_id: folder.id,
          canonical_text:
            "Given the sequence of keys $[14, 25, 11, 7, 22, 19, 31]$, construct a step-by-step Binary Search Tree (BST) and determine the total number of comparisons required to search for key $k = 19$.",
          occurrence_count: 3,
          priority_level: "very_high" as const,
          priority_score: 82.0,
          avg_marks: 8,
          marks: 8,
          question_label: "Q.2 (b)",
          question_type: "Numerical",
          difficulty: "Medium",
          page_numbers: [1],
          has_low_confidence: false,
          answer_hint:
            "Insert keys maintaining left < root < right. Search path: 14 -> 25 -> 22 -> 19 (4 key comparisons).",
        },
      ],
    },
    {
      topic: topics[1],
      groups: [
        {
          id: "grp-201",
          topic_id: "top-2",
          folder_id: folder.id,
          canonical_text:
            "Write the pseudocode for Dijkstra's Single Source Shortest Path Algorithm on a weighted directed graph $G = (V, E, w)$ with non-negative edge weights. Prove that Dijkstra's algorithm fails if negative weight edges exist.",
          occurrence_count: 3,
          priority_level: "critical" as const,
          priority_score: 91.0,
          avg_marks: 12,
          marks: 12,
          question_label: "Q.4 (a)",
          question_type: "Derivation",
          difficulty: "Hard",
          page_numbers: [3],
          has_low_confidence: false,
          answer_hint:
            "Greedy choice assumes once a node is finalized from priority queue, its distance cannot decrease. Negative edges violate optimal substructure.",
        },
        {
          id: "grp-202",
          topic_id: "top-2",
          folder_id: folder.id,
          canonical_text:
            "Compare Breadth-First Search (BFS) and Depth-First Search (DFS) in terms of space complexity, queue/stack data structures used, and edge classification (Tree, Back, Forward, Cross edges).",
          occurrence_count: 2,
          priority_level: "high" as const,
          priority_score: 70.0,
          avg_marks: 6,
          marks: 6,
          question_label: "Q.1 (c)",
          question_type: "Short Note",
          difficulty: "Easy",
          page_numbers: [1],
          has_low_confidence: false,
          answer_hint:
            "BFS uses FIFO Queue, space $O(V)$. DFS uses Call Stack, space $O(V)$ in worst case, $O(h)$ in balanced trees.",
        },
      ],
    },
    {
      topic: topics[2],
      groups: [
        {
          id: "grp-301",
          topic_id: "top-3",
          folder_id: folder.id,
          canonical_text:
            "Formulate the Dynamic Programming 0/1 Knapsack recurrence relation $K(i, w) = \\max(K(i-1, w), v_i + K(i-1, w - w_i))$. Solve for capacity $W = 8$ with 4 items: weights $[2, 3, 4, 5]$ and values $[3, 4, 5, 8]$.",
          occurrence_count: 4,
          priority_level: "critical" as const,
          priority_score: 96.0,
          avg_marks: 14,
          marks: 14,
          question_label: "Q.5 (b)",
          question_type: "Numerical",
          difficulty: "Hard",
          page_numbers: [4],
          has_low_confidence: false,
          answer_hint:
            "Build 2D table DP[4][8]. Maximum value obtained is $12$ selecting items 1, 2, and 4.",
        },
      ],
    },
  ];

  const studyGroups = topicGroups.flatMap((tg) =>
    tg.groups.map((g) => ({
      id: g.id,
      canonical_text: g.canonical_text,
      occurrence_count: g.occurrence_count,
      priority_level: g.priority_level,
      marks: g.marks,
      topic_name: tg.topic.name,
    }))
  );

  const analytics = {
    computed_at: "2026-08-21T10:00:00Z",
    payload: {
      total_papers: 6,
      total_questions: 48,
      unique_topics: 5,
      repeated_questions_count: 14,
      critical_topics_count: 3,
      topic_weightages: [
        {
          topic_name: "Binary Search Trees & AVL Trees",
          marks_percentage: 28.5,
          total_marks: 34,
          question_count: 12,
        },
        {
          topic_name: "Graph Traversal & Shortest Path",
          marks_percentage: 24.0,
          total_marks: 29,
          question_count: 9,
        },
        {
          topic_name: "Dynamic Programming & Recurrences",
          marks_percentage: 19.5,
          total_marks: 23,
          question_count: 8,
        },
        {
          topic_name: "Hashing & Collision Resolution",
          marks_percentage: 15.0,
          total_marks: 18,
          question_count: 6,
        },
        {
          topic_name: "Sorting & Asymptotic Complexity",
          marks_percentage: 13.0,
          total_marks: 16,
          question_count: 5,
        },
      ],
    },
  };

  return {
    folder,
    paperCount: 6,
    analytics,
    topics,
    topicGroups,
    studyGroups,
  };
}
