export interface AgentDefinition {
  role: string;
  name: string;
  schedule: string;
  model: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6';
  maxBudgetUsd: number;
  maxTurns: number;
  toolGroups: ToolGroup[];
  supabaseWriteTables?: string[];
  canEmailUsers?: boolean;
}

export type ToolGroup =
  | 'supabase'
  | 'email'
  | 'stripe'
  | 'support'
  | 'content'
  | 'research'
  | 'memory'
  | 'tasks'
  | 'reports'
  | 'google_ads'
  | 'posthog';

export interface AgentRunContext {
  memories: MemoryRecord[];
  pendingTasks: TaskRecord[];
  recentFeedback: FeedbackEvent[];
  activeGoals: GoalRecord[];
  pendingPredictions: PredictionRecord[];
  predictionAccuracy: number | null;
}

export interface MemoryRecord {
  id: string;
  agent_role: string;
  memory_type: string;
  title: string;
  content: string;
  importance: number;
  access_count: number;
  created_at: string;
}

export interface TaskRecord {
  id: string;
  created_by: string;
  assigned_to: string;
  title: string;
  description: string;
  priority: string;
  category: string;
  status: string;
  notes: Array<{ agent_role: string; note: string; timestamp: string }>;
  created_at: string;
  due_by: string | null;
}

export interface FeedbackEvent {
  id: string;
  agent_role: string;
  event_type: string;
  source: string | null;
  feedback_content: string | null;
  impact_score: number | null;
  created_at: string;
}

export interface GoalRecord {
  id: string;
  agent_role: string;
  title: string;
  success_criteria: string;
  metric_name: string | null;
  target_value: number | null;
  current_value: number | null;
  baseline_value: number | null;
  status: string;
  progress_notes: Array<{ date: string; note: string; value?: number }>;
  deadline: string;
  created_at: string;
}

export interface PredictionRecord {
  id: string;
  agent_role: string;
  prediction: string;
  confidence: number;
  reasoning: string | null;
  evaluation_date: string;
  created_at: string;
}
