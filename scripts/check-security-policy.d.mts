export const REQUIRED_NONE_DIRECTIVES: string[];

export function parseCsp(value: unknown): Map<string, string[]>;

export function checkSecurityPolicy(input: {
  policy: unknown;
  tauriConfig: unknown;
  capabilityFiles: Array<{ file: string; json: unknown }>;
  indexHtml: string;
  sourceFiles: Array<{ file: string; text: string }>;
  rustFiles: Array<{ file: string; text: string }>;
}): string[];
