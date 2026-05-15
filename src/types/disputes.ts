/**
 * Shared types for the disputes surface.
 *
 * Moved from src/app/dashboard/disputes/page.tsx (2026-05-05)
 * so the 3,200-line monolith can be split without circular imports.
 */

export interface Dispute {
  id: string;
  provider_name: string;
  provider_type: string | null;
  account_number: string | null;
  issue_type: string;
  issue_summary: string;
  desired_outcome: string | null;
  disputed_amount: number | null;
  status: string;
  money_recovered: number;
  created_at: string;
  updated_at: string;
  letter_count: number;
  message_count: number;
  last_activity: string;
  latest_snippet?: string | null;
  unread_reply_count?: number;
  last_reply_received_at?: string | null;
  archived_at?: string | null;
  user_has_gmail?: boolean;
  user_has_outlook?: boolean;
  correspondence?: Correspondence[];
  contract_extractions?: ContractExtraction[];
}

export interface ContractExtraction {
  id: string;
  file_url: string | null;
  file_name: string | null;
  provider_name: string | null;
  contract_type: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  monthly_cost: number | null;
  annual_cost: number | null;
  minimum_term: string | null;
  notice_period: string | null;
  cancellation_fee: string | null;
  early_exit_fee: string | null;
  price_increase_clause: string | null;
  auto_renewal: string | null;
  cooling_off_period: string | null;
  unfair_clauses: string[];
  raw_summary: string | null;
  created_at: string;
}

export interface RightsPill {
  label: string;
  url: string;
  strength: string;
}

export interface Correspondence {
  id: string;
  entry_type: string;
  title: string | null;
  content: string;
  summary: string | null;
  attachments: any[];
  task_id: string | null;
  entry_date: string;
  created_at: string;
  legal_references?: string[];
  rights_pills?: RightsPill[];
  estimated_success?: number;
  next_steps?: string[];
  escalation_path?: string;
  detected_from_email?: boolean;
  sender_address?: string | null;
  sender_name?: string | null;
  email_thread_id?: string | null;
  supplier_message_id?: string | null;
  supplier_web_link?: string | null;
  ai_category?: string | null;
  ai_respond_needed?: boolean | null;
  ai_urgency?: string | null;
  ai_rationale?: string | null;
}

export interface DisputeSummary {
  total_open: number;
  total_resolved: number;
  total_disputed_amount: number;
  total_recovered: number;
}

export interface ThreadReplyContext {
  webLink: string;
  senderAddress?: string | null;
  provider: 'google' | 'outlook' | 'imap' | null;
}

export interface LetterModalProps {
  content: string;
  title: string;
  legalRefs: string[];
  rightsPills?: RightsPill[];
  onClose: () => void;
  disputeId?: string;
  providerName?: string;
  onSentMarked?: () => void;
  threadReply?: ThreadReplyContext;
  alreadySent?: boolean;
}
