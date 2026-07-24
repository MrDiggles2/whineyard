export type FeedbackStatus = 'pending' | 'submitted' | 'scored' | 'failed';

export interface FeedbackRow {
  id: string;
  form_uuid: string;
  feedback: string;
  tags: string[];
  category: string | null;
  actionability: number | null;
  status: FeedbackStatus;
  batch_id: string | null;
  custom_id: string | null;
  created_at: Date | string;
  scored_at: Date | string | null;
}

export interface FeedbackDto {
  id: string;
  formUuid: string;
  feedback: string;
  tags: string[];
  category: string | null;
  actionability: number | null;
  status: FeedbackStatus;
  batchId: string | null;
  customId: string | null;
  createdAt: Date | string;
  scoredAt: Date | string | null;
}
