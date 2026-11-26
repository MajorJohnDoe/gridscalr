export interface ModuleSource {
  path: string;
  text: string;
}

export function runtimeDependencies(text: string): string[];

export function findRuntimeCycles(entries: ModuleSource[], root?: string): string[][];
