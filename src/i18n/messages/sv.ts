import type { MessageKey } from "./en";

/**
 * Swedish text for the strings that exist in the catalog. Keys without a
 * translation fall back to English, so this file can grow incrementally during
 * the 0.18.0 translation pass.
 */
export const sv: Partial<Record<MessageKey, string>> = {
  "common.close": "Stäng",

  "window.controls": "Fönsterknappar",
  "window.minimize": "Minimera",
  "window.maximize": "Maximera",
  "window.restore": "Återställ",
  "window.close": "Stäng fönstret",

  "preferences.title": "Inställningar",
  "preferences.subtitle": "Sparas på den här datorn och ingår inte i projektfilen",
  "preferences.categories": "Inställningskategorier",
  "preferences.general": "Allmänt",
  "preferences.workspace": "Arbetsyta",
  "preferences.layers": "Lager",
  "preferences.stamps": "Stämplar",

  "language.label": "Språk",
  "language.system": "System ({language})",
  "language.english": "English",
  "language.swedish": "Svenska",
  "language.note":
    "Svenska omfattar just nu gränssnittet som tillkom i 0.17. Resten av gränssnittet är engelska till 0.18-översättningen.",
  "language.changed": "Språkval sparat.",

  "preferences.workspace.note":
    "Panelbredder och ihopfällt läge sparas på den här datorn och ingår inte i projektfilen.",
  "preferences.workspace.summary":
    "Sidopanel {left} px{leftNote} · Egenskaper {right} px{rightNote}.",
  "preferences.workspace.collapsed": " (ihopfälld)",
  "preferences.workspace.expand": "Visa båda panelerna",
  "preferences.workspace.reset": "Återställ panelayout",
  "preferences.workspace.expanded": "Panelerna visas.",
  "preferences.workspace.resetDone": "Panelayouten återställd.",

  "preferences.layers.title": "Standardfärger för lager",
  "preferences.layers.note":
    "Gäller endast nya mät- och ritlager. Befintliga lager behåller sin färg.",
  "preferences.layers.measure": "Färg för mätlager",
  "preferences.layers.draw": "Färg för ritlager",
  "preferences.layers.signalRed": "Använd signlrött för båda",
  "preferences.layers.reset": "Återställ lagerfärger",
  "preferences.layers.signalRedDone": "Lagerfärgerna är signlröda.",
  "preferences.layers.resetDone": "Standardfärgerna är återställda.",

  "preferences.stamps.title": "Stämplar",
  "preferences.stamps.note":
    "Standarder för nya projekt. Det öppna projektet har sin egen lista i Projektinställningar.",
  "preferences.stamps.add": "Ny standardstämpel",
  "preferences.stamps.fromProject": "Använd projektets stämplar som standard",
  "preferences.stamps.fromProjectTitle":
    "Kopiera det här projektets stämplar till appens standardvärden.",
  "preferences.stamps.fromProjectDisabled": "Öppna ett projekt för att kopiera dess stämplar.",
  "preferences.stamps.reset": "Återställ appens standardvärden",
  "preferences.stamps.updated": "Appens stämpelstandard uppdaterad.",
  "preferences.stamps.resetDone": "Appens stämpelstandard återställd.",

  "diagnostics.title": "Rapportera ett problem",
  "diagnostics.subtitle": "Bifoga diagnostiken till ett nytt GitHub-ärende",
  "diagnostics.note":
    "GridScalr laddar inte upp något. Diagnostiken innehåller endast version, plattform och projektstatistik – inget ritningsinnehåll, inga etiketter och inga sökvägar.",
  "diagnostics.copy": "Kopiera diagnostik",
  "diagnostics.copyLink": "Kopiera ärendelänk",
  "diagnostics.issue": "Ärendespårning",
  "diagnostics.issueLabel": "Länk till ärendespårningen",
  "diagnostics.copied": "Diagnostiken kopierad.",
  "diagnostics.copyFailed": "Kunde inte kopiera diagnostiken.",
  "diagnostics.linkCopied": "Ärendelänken kopierad.",

  "launch.nothingTitle": "Inget att öppna",
  "launch.nothingMessage":
    "Operativsystemet bad GridScalr öppna en fil som appen inte hanterar. Använd ett .gridscalr-projekt, en PDF eller en TIF-ritning.",
  "launch.oneFile": "GridScalr öppnar en fil per fönster och ignorerade resten.",
};
