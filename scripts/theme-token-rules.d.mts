export const THEMES: string[];

export const REQUIRED: string[];

export function parseTokens(css: string): Map<string, string>;

export function checkThemeTokens(theme: string, css: string): string[];
