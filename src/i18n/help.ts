import { HELP_CONTENT, QUICK_START_SV, type HelpTopic } from "../help/content";
import { SUPPORTED_LOCALES, currentLocale, type HelpBundleId, type Locale } from "./index";

type HelpBundleTopic = Exclude<HelpTopic, "about">;

/**
 * Per-language help bundles. The Swedish guides arrive with the translation
 * pass; until then both bundles resolve to the English content so the help
 * dialog always has something complete to show.
 */
const HELP_BUNDLES: Record<HelpBundleId, Record<HelpBundleTopic, string>> = {
  en: HELP_CONTENT,
  sv: { ...HELP_CONTENT, quickstart: QUICK_START_SV },
};

const helpBundles = Object.fromEntries(
  Object.entries(SUPPORTED_LOCALES).map(([id, descriptor]) => [id, HELP_BUNDLES[descriptor.help]]),
) as Record<Locale, Record<HelpBundleTopic, string>>;

export function helpContentFor(topic: HelpBundleTopic): string {
  return helpBundles[currentLocale()][topic] ?? HELP_CONTENT[topic];
}
