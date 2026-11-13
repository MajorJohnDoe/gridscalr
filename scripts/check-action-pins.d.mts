export interface UsesReference {
  reference: string;
  label: string;
}

export interface PinIssue {
  file: string;
  line: number;
  reference: string;
  message: string;
}

export interface PinEntry {
  file: string;
  line: number;
  action: string;
  ref: string;
  label: string;
}

export interface WorkflowResult {
  issues: PinIssue[];
  entries: PinEntry[];
}

export interface RepositoryResult extends WorkflowResult {
  actions: Set<string>;
}

export const COMMIT_SHA: RegExp;

export function parseUsesLine(line: string): UsesReference | null;

export function splitReference(reference: string): { action: string; ref: string };

export function checkWorkflowText(text: string, file: string): WorkflowResult;

export function checkWorkflows(files: Map<string, string>): RepositoryResult;
