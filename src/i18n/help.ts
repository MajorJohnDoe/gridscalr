import { HELP_CONTENT, type HelpTopic } from "../help/content";
import { currentLocale, type Locale } from "./index";

type HelpBundleTopic = Exclude<HelpTopic, "about">;

/**
 * Per-language help bundles. The Swedish guides arrive with the 0.18.0
 * translation pass; until then both locales resolve to the English content so
 * the help dialog always has something complete to show.
 */
const helpBundles: Record<Locale, Record<HelpBundleTopic, string>> = {
  en: HELP_CONTENT,
  sv: HELP_CONTENT,
};

export function helpContentFor(topic: HelpBundleTopic): string {
  return helpBundles[currentLocale()][topic] ?? HELP_CONTENT[topic];
}
