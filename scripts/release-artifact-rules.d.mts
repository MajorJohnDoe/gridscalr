export interface ArtifactIssue {
  code: string;
  message: string;
}

export interface ChecksumEntry {
  hash: string;
  name: string;
}

export interface InvalidChecksumLine {
  line: number;
  text: string;
  reason: string;
}

export interface ParsedChecksums {
  entries: ChecksumEntry[];
  invalid: InvalidChecksumLine[];
}

export interface ChecksumListingInput {
  text?: string;
  files?: Record<string, string>;
  requiredNames?: string[];
}

export interface ChecksumListingResult {
  ok: boolean;
  issues: ArtifactIssue[];
  entries: ChecksumEntry[];
}

export interface LipoInfo {
  architectures: string[];
  fat: boolean;
}

export interface MacBundleInput {
  expectedVersion: string;
  bundleVersion?: string | null;
  bundleIdentifier?: string | null;
  appPresent?: boolean;
  executablePresent?: boolean;
  lipoInfo?: string | null;
}

export interface MacBundleResult {
  ok: boolean;
  issues: ArtifactIssue[];
  architectures: string[];
  fat: boolean;
}

export declare const MACOS_APP_NAME: string;
export declare const MACOS_BUNDLE_IDENTIFIER: string;
export declare const MACOS_BUNDLE_EXECUTABLE: string;
export declare const MACOS_EXECUTABLE_PATH: string;
export declare const MACOS_REQUIRED_ARCHITECTURES: readonly string[];

export declare function expectedMacArtifacts(version: string): string[];
export declare function parseLipoInfo(text: string | null | undefined): LipoInfo;
export declare function parseChecksumText(text: string | null | undefined): ParsedChecksums;
export declare function verifyChecksumListing(input?: ChecksumListingInput): ChecksumListingResult;
export declare function evaluateMacBundle(input?: MacBundleInput): MacBundleResult;
export declare function describeIssues(issues: ArtifactIssue[]): string;
