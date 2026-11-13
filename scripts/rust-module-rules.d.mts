export interface CommandException {
  max: number;
  reason: string;
}

export interface CommandConfig {
  defaultMax: number;
  files?: Record<string, CommandException>;
}

export interface CommandEntry {
  file: string;
  commands: number;
}

export interface CommandResult extends CommandEntry {
  max: number;
  reviewed: boolean;
}

export interface RustModuleEvaluation {
  ok: boolean;
  errors: string[];
  results: CommandResult[];
  violations: CommandResult[];
  stale: string[];
  orphans: string[];
  total: number;
}

export function countCommands(text: string): number;
export function declaredModules(texts: Iterable<string>): Set<string>;
export function validateCommandConfig(config: CommandConfig): string[];
export function evaluateRustModules(input: {
  config: CommandConfig;
  entries: CommandEntry[];
  declared: Set<string>;
}): RustModuleEvaluation;
export function formatRustProblems(evaluation: RustModuleEvaluation): string[];
