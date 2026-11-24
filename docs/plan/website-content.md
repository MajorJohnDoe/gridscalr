# Webbplatsen: innehåll, guider och organisk trafik

Status: fas 0 och 1 klara (tema, `site:capture`, startsida, tre uppgiftssidor). Guideindex
och fjorton guider publicerade, inklusive de två definitionerna och de två jämförelserna.
Guidekatalogen är därmed komplett. Dörr- och fönsterguiden är medvetet inte planerad.
Funktionssidan är ombyggd med skärmbilder per språk. Roll-, metod- och installationssidor
samt `/nyheter/` återstår.
Godkänd visuell riktning (skiss 4): ljus yta, Slate-paletten från appen, stora skärmbilder i
full bredd, riktig appikon, svenska först.

Målbilden är inte "en blogg". Målet är att en drifttekniker eller teknisk förvaltare som
googlar sin arbetsuppgift — inte vårt produktnamn — ska hitta en sida som svarar bättre än
någon annan, förstå att det finns ett program, och ladda ner det.

## Beslut (2026-11-24)

- **Ingen egen domän.** Sajten ligger kvar på GitHub Pages under
  `https://majorjohndoe.github.io/gridscalr/`. Canonical, `hreflang` och sitemap behåller
  den basen. Det gör att vi inte byter URL-struktur: engelska ligger kvar på roten och
  svenska under `/sv/`. Svenska är fortfarande det språk vi skriver och prioriterar först.
- **Ingen räknare.** Ingen statistik, inga cookies, inga händelser. Uppföljning sker i
  Search Console och Bing Webmaster Tools, som mäter visningar och klick utan kod på sajten.
- **Windows-installern är inte signerad.** `/installation/` ska säga det rakt ut och hänvisa
  till kontrollsumman i stället för att antyda en signatur som inte finns.
- **Avsändare.** John Pålsson, länk till LinkedIn-profilen. Ingen annan kontaktuppgift.
- **Solo-underhåll.** Två guider per release är den realistiska takten. Inget publiceras
  utan att siffrorna går att reproducera i demoprojektet.
- **Skärmbilder per språk.** `npm run site:capture` är infört och skriver
  `docs/screenshots/site/{sv,en}/` som WebP. Den svenska uppsättningen byter även
  demoprojektets etiketter i minnet så att språket stämmer.

## 1. Utgångsläge

Sajten är tekniskt sund: canonical, `hreflang` EN/SV, `SoftwareApplication`- och
`FAQPage`-data, sitemap, robots, `site:build`/`site:check` och skärmbildsmanifest. Det som
saknas är yta och innehåll.

| Nu | Konsekvens |
| --- | --- |
| 4 sidor totalt (startsida + funktionssida, två språk) | Ingen sida kan ranka på en arbetsuppgift |
| Dokumentationen är länkar till GitHub Markdown | Guiderna ligger utanför webben och kan inte hittas |
| Engelska på roten, svenska under `/sv/` | Den svenska målgruppen möts av fel språk |
| `majorjohndoe.github.io/gridscalr/` | Svag domän, ingen ägarkänsla, sämre förtroende |
| `docs:capture` fotograferar bara engelskt gränssnitt | Svenska sidor visar engelsk programyta |
| Sitemap är hårdkodad på fyra URL:er utan `lastmod` | Nya sidor glöms bort och får ingen färskhetssignal |
| Demoprojektet har engelska sid-, kategori- och mätnamn | Blandat språk i skärmbilderna |

Det som redan är bra och ska behållas: inga cookies, ingen telemetri i appen, inga påhittade
kundcitat, versionsnumret hämtas från `site/release.json` och sajten namnger aldrig en
opublicerad version.

## 2. Mål och mätetal

Primärt mål: **organiska nedladdningar**. Sekundärt: att bli den svenska referensen för
area, driftkort och mängdning i PDF- och TIF-ritningar.

| Mätetal | Mål inom 6 månader | Mätning |
| --- | --- | --- |
| Indexerade sidor | 12 svenska + 12 engelska, alla med unik intent | Search Console |
| Visningar på 10 prioriterade frågor | 1 000/månad sammanlagt | Search Console, query-filter |
| Snittposition på de 10 frågorna | ≤ 15, minst 3 i topp 10 | Search Console |
| Nedladdningsklick från organisk trafik | 40/månad | Klickhändelse (beslut om statistik, se §8) |
| Guider som leder till nedladdning | ≥ 15 % av guidebesök klickar vidare till nedladdning | Intern länk + händelse |
| Demoprojekt öppnat från sajten | 25/månad | Händelse |
| Teknisk hälsa | Lighthouse ≥ 95 prestanda, 100 a11y/SEO/best practice | CI + manuell mätning |

Mätetalen är riktmärken, inte löften. Nischen har låga sökvolymer per fråga; bredd och
träffsäkerhet slår volymjakt.

Icke-mål: nyhetsblogg, prislista, kundcase innan det finns godkända referenser, annonser,
trackingpixlar, cookie-banner.

## 3. Målgrupp och sökbeteende

**Drifttekniker** söker på det hen står i: "mäta area i pdf", "driftkort ventilation",
"rita driftkort", "area ritning". De vet ofta inte att ett verktyg finns. De är praktiska,
letar efter en arbetsgång med bilder och vill kunna göra jobbet i dag.

**Teknisk förvaltare** söker på underlaget: "mängdning", "mängdberäkning", "rumsarea
ritning", "bruttoarea nettoarea", "area takeoff". De jämför verktyg, ifrågasätter
spårbarhet och behöver kunna visa varför en mängd ser ut som den gör.

**IT och upphandling** söker senare: "installera utan admin", "offline", "var lagras
filerna", "är det säkert". De påverkar om nedladdningen får köras.

Tre sökstadier som sajten måste möta:

1. **Problemmedveten** — "hur mäter man area på en ritning". Guiden svarar, produkten är
   nästa steg.
2. **Lösningsmedveten** — "mängdning excel", "alternativ till Bluebeam". Jämförelsen är
   ärlig och visar när GridScalr inte passar.
3. **Produktmedveten** — "GridScalr". Startsida, nedladdning, systemkrav, release notes.

## 4. Informationsarkitektur

Svenska sidor ligger under `/sv/`; tabellen visar den svenska sluggen utan prefixet.

En intention per URL. En uppgiftssida får aldrig konkurrera med sin egen guide: guiden
lär ut arbetsgången, uppgiftssidan säljer att programmet gör den.

| URL (sv) | URL (en) | Syfte | Status |
| --- | --- | --- | --- |
| `/` | `/en/` | Roller, tre uppgifter, bevis, nedladdning | Byggs om |
| `/mata-area/` | `/en/area-takeoff/` | Mäta area: kalibrering, avdrag, rum, netto | Ny |
| `/driftkort/` | `/en/operation-cards/` | Driftkort: mall, symboler, fält, export | Ny |
| `/mangdning/` | `/en/quantity-takeoff/` | Mängdning: netto, spill, beställning, export | Ny |
| `/for/drifttekniker/` | `/en/for/operations-technicians/` | Rollens leverabler | Ny |
| `/for/teknisk-forvaltare/` | `/en/for/property-managers/` | Rollens leverabler | Ny |
| `/metod/` | `/en/method/` | Kalibrering, spårbarhet, **begränsningar** | Ny |
| `/installation/` | `/en/install/` | Systemkrav, SmartScreen, offline, backup | Ny |
| `/guider/` | `/en/guides/` | Guideindex, filtrerat på uppgift | Ny |
| `/guider/<slug>/` | `/en/guides/<slug>/` | En arbetsuppgift per guide | Ny, 12–14 st |
| `/guider/vad-ar-mangdning/` | `/en/guides/what-is-takeoff/` | Definition, topp-funnel | Ny |
| `/guider/vad-ar-ett-driftkort/` | `/en/guides/what-is-an-operation-card/` | Definition, topp-funnel | Ny |
| `/jamfor/bluebeam/` | `/compare/bluebeam/` | Ärlig jämförelse | Publicerad |
| `/jamfor/excel/` | `/en/compare/excel/` | När kalkylark räcker | Publicerad |
| `/nyheter/` | `/en/changelog/` | Release notes som HTML | Ny, genereras |
| `/funktioner/` | `/en/features/` | Full funktionskatalog | Behålls, uppdateras |

Navigation: **Areor · Driftkort · Mängder · Guider · För roller · Ladda ner**, med
dokumentation och nyheter i sidfoten. Språkväxlaren ligger kvar uppe till höger.

Länkregler:

- Startsidan länkar till de tre uppgiftssidorna och de tre senaste guiderna.
- Varje uppgiftssida länkar till minst tre guider och en roll­sida.
- Varje guide länkar uppåt till sin uppgiftssida, i sidled till två guider och till
  nedladdning. Ankartexten är uppgiften, inte "läs mer".
- Ingen sida är en återvändsgränd: allt slutar i en CTA eller en relaterad guide.

## 5. Nyckelordskarta

Volym och konkurrens anges kvalitativt och **ska verifieras** i Keyword Planner och
Search Console inom 30 dagar efter lansering. Svenska sökord först; engelska är
sekundära och används främst för jämförelser och internationella verktygssök.

| Prio | Sida | Primärt sökord | Sekundära | Intent |
| --- | --- | --- | --- | --- |
| 1 | `/mata-area/` | mäta area på ritning | mäta area i pdf, area ritning, beräkna area pdf | Göra |
| 1 | `/mangdning/` | mängdning ritning | mängdberäkning, mängdavtagning, takeoff bygg | Göra |
| 1 | `/driftkort/` | driftkort | driftkort mall, driftkort ventilation, rita driftkort | Göra |
| 1 | `/guider/kalibrera-ritning/` | kalibrera ritning | skala 1:100 ritning, mäta skala pdf | Lära |
| 1 | `/guider/mata-area-pdf/` | mäta area i pdf | area pdf ritning, polygon area pdf | Lära |
| 1 | `/guider/driftkort-mall/` | driftkort mall | driftkort fält, driftkort exempel | Lära |
| 2 | `/guider/bruttoarea-nettoarea/` | bruttoarea nettoarea | BTA BOA skillnad, area avdrag | Förstå |
| 2 | `/guider/mangdning-spill/` | spill och avrundning mängdning | beställningsmängd, påslag material | Lära |
| 2 | `/guider/driftkort-ventilation/` | driftkort ventilation | ventilationsaggregat schema, symboler | Göra |
| 2 | `/guider/tif-ritning/` | mäta i skannad ritning | tif ritning, skanna ritning pdf | Göra |
| 2 | `/guider/jamfora-ritningar/` | jämföra ritningar | revisionsjämförelse, ändringar ritning | Göra |
| 2 | `/guider/markera-avvikelse/` | markera avvikelse på ritning | platsbesök ritning, åtgärd ritning | Göra |
| 3 | `/guider/vad-ar-mangdning/` | vad är mängdning | mängdning betydelse, mängdning bygg | Förstå |
| 3 | `/guider/vad-ar-ett-driftkort/` | vad är ett driftkort | driftkort betydelse, drift och underhåll | Förstå |
| 3 | `/jamfor/bluebeam/` | alternativ till Bluebeam | Bluebeam area measure, PDF takeoff | Jämföra |
| 3 | `/jamfor/excel/` | mängdning i Excel | Excel area beräkning, kalkylark mängdning | Jämföra |
| 3 | `/for/drifttekniker/` | drifttekniker ritning | drifttekniker arbetsuppgifter | Roll |
| 3 | `/for/teknisk-forvaltare/` | teknisk förvaltare area | areaunderlag förvaltning | Roll |
| — | `/` | GridScalr | pdf takeoff, mängdprogram | Varumärke |
| — | `/installation/` | installera GridScalr | offline installation, SmartScreen | IT |

Prioriteringsregel: en fråga som en användare faktiskt ställer före köp går före en
sökfras vi själva hittat på. "Mäta area i pdf" slår "local-first takeoff".

## 6. Guidekatalog

Guiderna är sajtens motor. Tio arbetsguider i två omgångar, plus två definitioner och två
jämförelser — fjorton sidor totalt. Katalogen är komplett. Dörrar och fönster är medvetet
inte planerad: en antalstabell för dörrar och fönster skulle kräva attribut som appen inte
lagrar (se `docs/limitations.md`), och guiden ska inte beskriva ett stöd som inte finns.
Varje guide kan läsas fristående och innehåller ett reproducerbart exempel från
demoprojektet.

### Omgång 1 — kärnan (publiceras med uppgiftssidorna)

| Slug | H1 | Primärt sökord | Innehåll (kort) |
| --- | --- | --- | --- |
| `mata-area-pdf` | Hur du mäter area i en PDF-ritning | mäta area i pdf | Förberedelse, kalibrering, rektangel/polygon, etikett, kontroll. Skärmbild per steg. |
| `kalibrera-ritning` | Kalibrera en ritning: 1:50, 1:100 och 1:400 | kalibrera ritning | Känt mått vs utskriven skala, kontrollmått, lås per sida, vanliga fel. |
| `bruttoarea-nettoarea` | Bruttoarea, nettoarea och avdrag | bruttoarea nettoarea | Skillnaderna, när avdrag krävs, hur nettot blir beställningsunderlag. Räkneexempel. |
| `mangdning-spill` | Mängdning med spill och avrundning | spill mängdning | Spill per objekt, avrundning, beställningsmängd, vad som inte ska räknas. |
| `driftkort-mall` | Driftkort: fälten som ska med | driftkort mall | Fastighet, system, datum, utförd av, sign, revision. Checklista + A3-exempel. |
| `driftkort-ventilation` | Rita ett driftkort för ventilation | driftkort ventilation | Aggregat, kanaler, givare, schema­symboler, lager per sida, export. |

### Omgång 2 — djup och bredd

| Slug | H1 | Primärt sökord | Innehåll (kort) |
| --- | --- | --- | --- |
| `tif-ritning` | Mäta i en skannad TIF-ritning | mäta skannad ritning | Import, kalibrering, cache, vad som händer om originalet flyttas. |
| `jamfora-ritningar` | Jämför två ritningsrevisioner | jämföra ritningar | Sida vid sida, överlagring, skillnadslista, innan beställning. |
| `markera-avvikelse` | Markera en avvikelse på rätt sida | markera avvikelse ritning | Lager för markeringar, moln, hänvisning, stämpel, export till entreprenör. |
| `rumsarea` | Mät rumsarea och koppla den till rummet | rumsarea | Rum och våning, uppmätt vs manuell area, varning vid saknad area. |

### Definitioner och jämförelser

| Slug | H1 | Not |
| --- | --- | --- |
| `vad-ar-mangdning` | Vad är mängdning? | 600–800 ord, exempel, länkar till `/mangdning/`. |
| `vad-ar-ett-driftkort` | Vad är ett driftkort? | 600–800 ord, bild på LB01, länkar till `/driftkort/`. |
| `/jamfor/bluebeam/` | GridScalr och Bluebeam | Kriterietabell, när Bluebeam är rätt val. Inga nedvärderande påståenden. |
| `/jamfor/excel/` | GridScalr och Excel | Samma princip: visa när kalkylarket vinner. |

Jämförelsesidorna publiceras först när det finns fem publicerade guider som länkar in.
De får aldrig innehålla ogrundade påståenden om konkurrenters funktioner.

## 7. Sidmallar

### Uppgiftssida (`/mata-area/`)

1. H1 med uppgiften, en rad under som säger vad läsaren får.
2. Stor skärmbild i teknisk ram med bildtext (samma form som skiss 4).
3. Kort stycke: vad som krävs och vad resultatet blir.
4. Tre till fyra faktarutor (indata, regel, resultat).
5. Arbetsgång i tre steg, med en bild per steg.
6. Räkneexempel med riktiga tal ur demoprojektet.
7. Rollsektion: vad driftteknikern respektive förvaltaren lämnar ifrån sig.
8. Spårbarhet och begränsningar, med länk till `/metod/`.
9. Tre guider som fördjupar.
10. Nedladdning + demoprojekt.

### Guide (`/guider/<slug>/`)

1. H1 = frågan eller uppgiften, samma formulering som sökordet.
2. **Svar på 40–60 ord** direkt under H1, innan innehållsförteckningen, så att svaret kan
   plockas ut till ett utdrag.
3. Innehållsförteckning med ankare (sticky på desktop).
4. Steg-för-steg med numrerade steg och en skärmbild per avgörande steg.
5. Räkneexempel eller checklista.
6. Vanliga fel, 3–5 punkter.
7. Frågor och svar, 4–6, som **syns** på sidan (FAQ-data får inte innehålla mer än det
   synliga).
8. Relaterade guider, 3.
9. CTA: ladda ner eller öppna demoprojektet.
10. `Uppdaterad <datum> · granskad mot GridScalr <version>`.

Längd: 800–1 400 ord. En guide som behöver mer delas.

### Metadata

- `<title>` ≤ 60 tecken, med sökordet först och varumärket sist.
- `<meta name="description">` 140–155 tecken, konkret nytta, ingen klickbait.
- En `<h1>`. Rubriker i ordning. Ankare på varje `h2`.
- Canonical mot rätt språkvariant. `hreflang` komplett par, `x-default` till engelska.
- `Article` + `BreadcrumbList` (+ `HowTo` endast när guiden är en äkta steg-för-steg),
  `FAQPage` endast när frågorna syns.
- OG-bild per sidtyp: uppgiftssidor får en skärmbild med rubriköverlägg, guider får en
  enkel titelbild i Slate-paletten.

## 8. Teknisk SEO och plattform

**Bas-URL.** Ingen egen domän: sajten stannar på
`https://majorjohndoe.github.io/gridscalr/` med engelska på roten och svenska under `/sv/`.
`baseUrl`, canonical, `hreflang`, OG och JSON-LD ligger kvar oförändrade i build- och
checkskripten. Om en domän blir aktuell senare är det ett eget projekt med 301, ny sitemap
och uppdaterade canonical.

**Bygget.** Sidantalet går från 4 till ~28. Då måste header, footer, nav och språkväxling
bli data i stället för kopior:

- `site/pages.json`: slug, språkpar, titel, beskrivning, typ, `lastmod`, bilder.
- `build-site.mjs` renderar nav, footer, sitemap och `hreflang` från manifestet.
- `check-site.mjs` läser samma manifest i stället för den hårdkodade `pages`-listan, och
  kraven på antal bilder per sidtyp blir typberoende i stället för globala.
- Sitemap får `lastmod` per sida; `changefreq`/`priority` utelämnas (Google ignorerar dem).

**Bilder.** Varje skärmbild levereras som AVIF + WebP i tre bredder med `srcset` och
`width`/`height`. Endast hero är eager och `fetchpriority="high"`; allt annat lazy.
Budget: LCP < 2,0 s på 4G, CLS < 0,05, sidvikt < 900 kB för en guide.

**Mätning.** Integritetsvänlig, cookiefri statistik (Plausible, Umami eller GoatCounter)
är ett eget beslut enligt `AGENTS.md`. Händelser: nedladdningsklick per plattform,
demoprojekt öppnat, guide → nedladdning, utskjutna guider. Search Console och Bing
Webmaster verifieras vid lansering; sitemap lämnas in och följs upp månadsvis.

**Publiceringsgrindar.** `site:build`, `site:check`, Lighthouse, `check:docs` och
länkkontroll ska gå grönt innan en sida publiceras. En ny sida utan intern länk in får
inte mergas.

## 9. Skärmbilder, språk och media

Det här är den största kvalitetsrisken. Dagens `docs:capture` fotograferar bara engelskt
gränssnitt, vilket gav en svensk sida med engelsk programyta och svenska lagernamn.

- `docs:capture` får en locale-parameter och skriver `docs/screenshots/sv/` och
  `docs/screenshots/en/` med samma steg och samma locators. Sajten väljer bild efter språk.
- Demoprojektet lokaliseras eller får två varianter: sidnamn, kategorier, lager,
  driftkortets luftnamn och mängdschemats namn. Beslut behövs (§14).
- Nya sajtbilder tas i 1920×1080 med ritningen centrerad och fylld, som i skiss 4.
- Alt-text beskriver vad som syns och upprepar begreppet från brödtexten, inte "skärmbild".
- Varje guide har minst två bilder; en guide utan bild publiceras inte.

**Video.** Korta tysta inspelningar (45–90 s) per uppgift: kalibrera och mäta area, rita
ett driftkort, ta fram beställning. Undertexter och transkript på sidan (transkriptet
hjälper både tillgänglighet och sök). Laddas även upp till YouTube med svensk titel och
beskrivning som länkar tillbaka. Video är starkt för den här målgruppen eftersom den visar
arbetsmoment som text är dålig på.

## 10. Produktion och kvalitet

- Källa: `docs/user-guide.md`, `docs/workflows.md`, `docs/limitations.md` och det faktiska
  beteendet i demoprojektet. En guide som beskriver något appen inte gör publiceras inte.
- Varje guide verifieras mot aktuell version och demoprojektets tal. Siffrorna ska gå att
  reproducera; annars byts exemplet.
- Svenska skrivs först och engelska skrivs om, inte maskinöversätts. EN-sidan ska läsa som
  engelska, inte som en översättning.
- Publiceringstakt: två guider per release, plus uppdatering av de tre mest besökta.
  Kvartalsvis genomgång: uppdatera siffror och skärmbilder, slå ihop tunna sidor och
  omdirigera sidor utan visningar efter sex månader.
- Granskning före publicering:
  - [ ] Svaret står inom 60 ord.
  - [ ] Alla kommando- och panelnamn matchar appen på sidans språk.
  - [ ] Siffrorna kommer från demoprojektet och stämmer.
  - [ ] Inga påståenden utanför `docs/limitations.md`.
  - [ ] Minst tre interna länkar in och tre ut.
  - [ ] Metadata, canonical, `hreflang`, schema och OG kontrollerade.
  - [ ] Skärmbilder i rätt språk, med alt-text.
  - [ ] `site:check` och Lighthouse gröna.

## 11. Distribution — att hittas även utanför Google

Organisk trafik är långsam i en nisch med låga volymer. Sajten behöver också nås där
användarna redan är.

- **I appen:** Help → Användarguide länkar till webbguiderna; About länkar till sajten;
  release notes pekar på `/nyheter/`.
- **GitHub:** README högst upp med skärmbild och tre länkar (area, driftkort, mängdning);
  release-beskrivningar länkar till motsvarande guide.
- **LinkedIn:** en post per guide, med en bild ur guiden och en mening om problemet, inte
  om produkten. Riktas mot svenska drift- och förvaltningsnätverk.
- **Utbildning:** YH-utbildningar för drifttekniker och fastighetsförvaltning är den
  effektivaste kanalen för trovärdighet. Erbjud gratis användning i undervisning och en
  guide som följer kursmomenten.
- **Branschpress och forum:** Fastighetstidningen, VVS-forum, Installatören och relevanta
  LinkedIn-grupper vid större releases. Svara på frågor med kunskap, länka bara när det
  är relevant.
- **Jämförelsesajter:** alternativa-till-listor och produktkataloger för PDF-verktyg.
- **Video:** YouTube-sökningar på "mäta area pdf" och "driftkort" är en egen ingång.

## 12. Faser

| Fas | Omfattning | Klar när | Grov insats |
| --- | --- | --- | --- |
| 0 | `site:capture` per språk, light Slate-tema, ny startsida, nav | Svenska och engelska bilder finns, startsidan shipar | 3–5 d |
| 1 | Startsida, tre uppgiftssidor, två rollsidor, `/metod/`, `/installation/` | Sidorna shipar med riktiga bilder, tal och interna länkar | 5–7 d |
| 2 | Guideomgång 1 (6 st), `/guider/`-index | Sex guider publicerade och länkade från uppgiftssidorna | 5–7 d |
| 3 | Teknisk SEO: sitemap, schema, bildpipeline, 404, Search Console, statistikbeslut | `site:check` grönt, alla sidor indexerade, Lighthouse-mål nådda | 2–3 d |
| 4 | Guideomgång 2 (6 st), två definitioner, två jämförelser, `/nyheter/` | 16 innehållssidor, alla med intern länk in | 6–8 d |
| 5 | Video per uppgift, distribution, mätuppföljning | Tre videor, fyra kanaler igång, första månadsrapporten | löpande |

Fas 0 är ett stoppvillkor: utan bilder per språk bygger vi sidor som måste fotograferas om.
Domän- och språkfrågan är avgjord och kräver inget mer arbete.

## 13. Risker

| Risk | Åtgärd |
| --- | --- |
| Tunt eller AI-genererat innehåll | Varje guide verifieras mot appen och demoprojektet; hellre 8 bra än 24 tunna |
| Dubbletter mellan guide och uppgiftssida | Guiden äger arbetsgången, uppgiftssidan äger produkten; olika H1 och olika exempel |
| Språkdrift i skärmbilder | Locale i captureflödet + grind i `site:check` |
| Domänbytet ger tillfällig dipp | Gör det tidigt, 301, behåll sitemap, följ Search Console dagligen i två veckor |
| Överlöften i jämförelser | Bara dokumenterade funktioner; granska varje påstående mot appen |
| Guider som aldrig underhålls | Kvartalsvis genomgång, `lastmod`, omdirigering vid noll visningar |
| Statistik som motsäger "ingen telemetri" | Cookiefri sajtstatistik, tydligt skild från appen, separat beslut |

## 14. Kvarstående beslut

1. **Demoprojektet:** ska `fixtures/demo-project.gridscalr` lokaliseras på riktigt (påverkar
   docs-capture, tester och den inbyggda demon), eller fortsätter `site:capture` att byta
   etiketter i minnet? I dag gör den det senare.
2. **Guidernas ägare:** John skriver och granskar tills vidare. En guide som ingen har
   verifierat mot appen publiceras inte.

Domän, statistik, signering, avsändare och språkplacering är avgjorda i besluten ovan.

## Appendix A — Godkänd form

- Ljus yta `#f4f6f8`, vit panel, tryckfärg `#1b2026`.
- Slate-paletten: skiffer `#2f343b` (sidfot, CTA-band), `#3d4a5a` (primärknapp),
  `#46596f` (länkar), stål `#9db0c9` / `#c0d0e4` (accent), tabellband `#e7eaef`.
- Rubriker i systemets sans, `text-wrap: balance`, tabulära siffror i tabeller.
- Skärmbilder i teknisk ram: tunn ram, mono-rad överst med projekt och sida, bildtext
  under. Klickbara till full storlek.
- Hårlinjer i stället för kort och skuggor. Ett CTA-band i skiffer, en mörk sidfot.
- Appikonen `src-tauri/icons/app-icon.svg` i sidhuvud, sidfot och som favicon.

## Appendix B — URL-konventioner

- Svenska på roten, engelska under `/en/`, samma slug-struktur.
- Guider: `/guider/<verb-objekt>/`, korta och läsbara, inga årtal.
- Jämförelser: `/jamfor/<namn>/`, alltid med "när det andra är bättre".
- Inga datum i URL:er. `lastmod` sköter färskhet.
- Varje URL har exakt en canonical och ett komplett `hreflang`-par.
