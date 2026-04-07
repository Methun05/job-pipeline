export type FundedStatus =
  | "new" | "connection_sent" | "connected" | "replied"
  | "interview" | "closed" | "skipped" | "cant_find";

export type AppStatus =
  | "new" | "applied" | "follow_up" | "interview" | "offer" | "rejected" | "skipped";

export type OutreachStatus =
  | "new" | "connection_sent" | "connected" | "replied" | "conversation" | "cant_find" | "skipped";

export type RemoteScope = "global" | "us_only" | "unclear";
export type ExperienceMatch = "strong" | "stretch";

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  linkedin_url: string | null;
  description: string | null;
  employee_count: number | null;
}

export interface Contact {
  id: string;
  company_id: string;
  apollo_person_id: string | null;
  name: string;
  title: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  twitter_confidence: "high" | "low" | null;
  seniority: string | null;
  email: string | null;
  email_revealed: boolean;
}

export interface FundedLead {
  id: string;
  company_id: string;
  contact_id: string | null;
  source: string;
  funding_amount: number | null;
  funding_currency: string;
  round_type: string | null;
  announced_date: string | null;
  linkedin_note: string | null;
  email_draft: string | null;
  follow_up_message: string | null;
  status: FundedStatus;
  last_action_at: string | null;
  follow_up_generated: boolean;
  notes: string | null;
  created_at: string;
  raw_data: { key?: string; funds?: string[]; symbol?: string; country?: string; company_type?: string } | null;
  // Joined
  companies?: Company;
  contacts?: Contact;
}

export interface JobPosting {
  id: string;
  company_id: string;
  contact_id: string | null;
  source: string;
  job_title: string;
  job_url: string;
  description_raw: string | null;
  description_summary: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  posted_at: string | null;
  location: string | null;
  remote_scope: RemoteScope;
  experience_match: ExperienceMatch;
  years_min: number | null;
  years_max: number | null;
  cover_letter: string | null;
  linkedin_note: string | null;
  email_draft: string | null;
  follow_up_message: string | null;
  application_status: AppStatus;
  application_last_action_at: string | null;
  outreach_status: OutreachStatus;
  outreach_last_action_at: string | null;
  follow_up_generated: boolean;
  notes: string | null;
  track: "A" | "B" | "C" | null;
  visa_sponsorship: boolean;
  created_at: string;
  // Joined
  companies?: Company;
  contacts?: Contact;
}

export interface PipelineRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "completed" | "failed";
  track_a_new: number;
  track_b_new: number;
  apollo_credits_remaining: number | null;
  errors: Array<{ source: string; message: string; timestamp: string }>;
  source_counts: Record<string, number> | null;  // {source: count} — -1 means fetch error
}
