# Etapp 3 – Mätverktyg, skala och export

**Status:** godkänd 2026-10-22. **3A – mätverktyg, skala och snap** och **3B – exportdialogen** är genomförda. Besluten om att ”valt område” är en användardragen rektangulär beskärningsruta och att samma relativa område används vid export av flera sidor är låsta.

Dokumentet kompletterar `roadmap-etapper.md` och `etapp-2-mangddata.md`. Om koden och planen hamnar i konflikt ska konflikten lösas uttryckligen, inte tyst.

## 1. Mål

Etapp 3 ska göra det snabbare att mäta vanliga ytor och göra det möjligt att skicka ett rent, beskuret ritningsutsnitt med rätt skala, lager och teckenförklaring.

Etappen ska ge:

- rektangel- och ellipsarea som snabbarea
- manuell skala med preset 1:50, 1:100, 1:200, 1:400 och egen ratio
- låsning av skala per sida
- snap till ändpunkt, mittpunkt, skärning mellan markup-segment och ortogonal låsning
- inställbart tröskelvärde i pixlar
- exportdialog för ritning med aktuell sida, alla sidor eller sidintervall
- valt område som en rektangulär beskärningsruta
- val av synliga lager, etiketter, kalibreringslinje och teckenförklaring

Etappen delas i **3A – mätverktyg, skala och snap** och **3B – exportdialogen**.

## 2. Fastställda beslut

| Fråga | Beslut | Följd |
|---|---|---|
| Valt område | En rektangulär beskärningsruta som användaren ritar | Området är en crop, inte ett urval av objekt |
| Två exportlägen | Hela sidan/dokumentet eller Valt område (utsnitt) | Användaren väljer tydligt mellan full export och rent utsnitt |
| Beskärning vid flera sidor | Samma relativa område på varje vald sida | Rutan sparas normaliserad 0–1 och räknas om per sida; fungerar vid olika sidstorlekar och rotation |
| Beskärningens omfattning | Allt exporterat innehåll klipps till rutan | PDF-innehåll, markeringar, etiketter och kalibreringslinje utanför rutan följer inte med |
| Snabbarea | `kind: "area"` med `areaShape` | Samma kategori, areaMode, etikett och mängdlogik som polygonarea |
| Manuell skala | 1:N mot PDF-sidans fysiska papper | Ingen korrigering för skalad utskrift; 1 mm på papperet = N mm i verkligheten |
| Skallåsning | Per sida och undo-bar | Blockerar kalibrering, manuell skala, redigering och rensning av skalan |
| Snap | Ändpunkt, mittpunkt och segmentskärning | Dolda objekt deltar inte; låsta men synliga objekt deltar |
| Ortogonal låsning | Shift behåller 45°-stegen, inklusive 0/90/180/270 | Ingen ny modifierare införs i Etapp 3 |
| PDF-geometrisnapp | Separat spike | Implementeras inte i Etapp 3 |
| Dolda objekt | Får aldrig exporteras | Gäller även om ett dolt lager eller objekt finns i närheten av en crop |
| Teckenförklaring | Egen A4-sida sist i exporten, valfri | Den läggs aldrig över ritningen och påverkar inte cropen |
| Exportval | Spara inte i projektfilen | Crop, sidval och lager val är tillfälliga för exporttillfället |

## 3. Avgränsning

Ingår inte i Etapp 3:

- PDF-geometrisnapp mot ritningens vektorer
- rotation av rektangel- och ellipsarea i 3A
- beskärning av PNG-export eller mängdförteckning
- XLSX
- molnsynk, konton eller telemetri
- bildobjekt
- full z-order
- användardefinierade count-typer
- automatisk skalidentifiering från ritningens text

PDF-geometrisnapp kräver extrahering och indexering av PDF-operatorer. Det arbetet ska göras som en separat spike efter att markup-snappen är klar och får inte blockera 3A.

## 4. Datamodell

### 4.1 Snabbarea

Ny typ:

```ts
export type AreaShape = "polygon" | "rectangle" | "ellipse";
```

`MarkupItem` får:

```ts
/** Endast area. Standard är polygon. */
areaShape?: AreaShape;
```

Regler:

- `polygon` är befintligt beteende och kräver minst tre punkter.
- `rectangle` har exakt två punkter som är motstående hörn i en axelrät rektangel.
- `ellipse` har exakt två punkter som definierar ellipsens omslutande rektangel.
- `areaShape` får bara finnas på `kind: "area"`. Normaliseraren tar bort fältet från alla andra kind.
- Saknat `areaShape` betyder `polygon`, så alla befintliga filer behåller sitt beteende.
- Rektangelarea = `w * h`.
- Ellipsarea = `π * w * h / 4`.
- Rektangelns omkrets = `2 * (w + h)`.
- Ellipsens omkrets beräknas med Ramanujans approximation:
  `π * (3(a + b) - sqrt((3a + b) * (a + 3b)))`, där `a = w / 2` och `b = h / 2`.
- `areaMode` `add`/`subtract`, kategori, rum, etikett och skalningssnapshot fungerar exakt som för polygonarea.
- Rektangel- och ellipsarea har inget rotationshandtag i 3A. De kan flyttas, ändra hörn och tas bort som övriga areaobjekt.
- Rektangel- och ellipsarea ritas som vektorer i PDF-exporten, inte som rasterbilder.

### 4.2 Manuell skala

Dagens `Calibration` har alltid en referenslinje. Manuell skala har ingen sådan linje och ska därför inte tvingas låtsas ha en.

Ny modell:

```ts
export interface ReferenceCalibration {
  id: string;
  source?: "reference";
  p1: Point;
  p2: Point;
  knownLength: number;
  unit: LengthUnit;
  pointsPerMeter: number;
  createdAt: string;
}

export interface ManualCalibration {
  id: string;
  source: "manual";
  /** Skalans N i 1:N. */
  ratio: number;
  pointsPerMeter: number;
  createdAt: string;
}

export type Calibration = ReferenceCalibration | ManualCalibration;
```

Regler:

- Äldre kalibreringar utan `source` normaliseras till `source: "reference"`.
- Manuell skala räknas om enligt:
  `pointsPerMeter = 2834.645669 / ratio`.
  Formeln utgår från att PDF-sidan är i fysisk storlek och att 1:N avser millimeter på papper.
- Presets: 1:50, 1:100, 1:200 och 1:400. Därutöver egen ratio, heltal eller decimaltal större än noll.
- Manuell skala ersätter eventuell befintlig referenskalibrering på sidan.
- Manuell skala ritar ingen kalibreringslinje och ingen referensetikett.
- `pageScale()` returnerar `{ pointsPerMeter, sourceUnit: "m" }` för manuell skala.
- `formatScale()` och mängdrapportens skaltext ska visa `1:100` för manuell skala och behålla nuvarande punkt-till-millimeter-text för referenskalibrering.
- Dialog för manuell skala ska ha samma val som referenskalibreringen:
  - endast aktuell sida, eller alla sidor
  - uppdatera befintliga mätningars skalningssnapshot, eller behåll dem

### 4.3 Skallåsning

`PageState` får:

```ts
export interface PageState {
  calibration?: Calibration;
  /** Endast giltigt när sidan har en kalibrering. */
  scaleLocked?: boolean;
}
```

Regler:

- Låsning kräver att sidan har en kalibrering.
- Låsning är projektdata och ska gå att ångra i ett steg.
- När sidan är låst får användaren inte:
  - sätta ny referenskalibrering
  - sätta manuell skala
  - redigera befintlig referenskalibrering
  - rensa kalibreringen
- Låsningen påverkar inte mätningars befintliga skalningssnapshots, export, zoom eller sidnavigering.
- Låsningen är per sida. ”Apply to all pages” kopierar kalibreringen men inte låsningen.
- Normaliseraren tar bort `scaleLocked` om sidan saknar kalibrering.
- UI ska visa låsstatus i Properties och ge tydlig återkoppling om användaren försöker ändra en låst skala.

### 4.4 Snapinställningar

`ProjectSettings` får:

```ts
export interface ProjectSettings {
  // befintliga fält
  /** Snapavstånd i skärmpixlar. Standard 8. */
  snapTolerancePx: number;
}
```

Regler:

- Standardvärde: `8`.
- Tillåtet intervall: `2–24`.
- Värdet påverkar bara markup-snap, inte PDF-geometrisnapp.
- Inställningen ligger i projektet eftersom den påverkar arbetsflödet och ska följa med filen.
- Befintlig `snapToGeometry` är huvudbrytaren. Är den av är alla snapmål avstängda.

### 4.5 Exportval

Exportvalen är tillfälliga och sparas inte i projektfilen:

```ts
export interface NormalizedCrop {
  /** 0–1 relativt referenssidans synliga yta. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawingExportOptions {
  /** 1-baserade, unika och sorterade sidnummer. */
  pages: number[];
  /** Saknas när hela sidan/dokumentet exporteras. */
  crop?: NormalizedCrop;
  /** Endast synliga lager kan väljas. */
  layerIds: string[];
  includeLabels: boolean;
  includeCalibration: boolean;
  includeLegend: boolean;
}
```

Standardvärden när dialogen öppnas:

- aktuell sida
- hela sidan
- alla synliga lager valda
- etiketter och kalibreringslinje på
- teckenförklaring av

## 5. Funktionsdesign

### 5.1 Snabbarea

Områdesverktyget `A` får en tydlig formväljare i kontextraden:

```text
Area:  [ Polygon ] [ Rectangle ] [ Ellipse ]
```

- **Polygon** behåller dagens klick-för-klick-beteende.
- **Rectangle** och **Ellipse** ritas genom att användaren drar från ett hörn till motstående hörn.
- Shift under dragning låser rektangeln till kvadrat och ellipsen till cirkel.
- När användaren släpper skapas ett färdigt areaobjekt i ett enda undo-steg.
- Verktyget stannar aktivt så att flera areaobjekt kan ritas i följd.
- Etiketten placeras i formens centrum och följer befintlig etikettlayout.
- Rektangel och ellips får samma färg, opacitet, stroke och areaMode som polygonarea.
- Vid `subtract` visas avdraget med samma visuella regler som polygonarea.

Rendering och träff:

- Canvas ritar rektangel som sluten fyrkant och ellips som sluten ellips.
- Hit-test för rektangel använder insida eller kant.
- Hit-test för ellips använder ellipsformeln för insida och ett tolerant avstånd till ellipsens kant.
- Markering, flytt, hörnändring och borttagning använder befintliga selection handles. Rotationshandtaget döljs för rektangel- och ellipsarea.
- PDF-export, PNG-komposition, mängdberäkning och etiketter använder samma geometrihjälpare som canvas.

### 5.2 Manuell skala

Properties-panelen får i skalavsnittet:

- knappen **Manual scale…**
- en låsknapp med lock/unlock när sidan är kalibrerad
- tydlig text om skalan är referensbaserad eller manuell

Manual scale-dialogen:

- presetknappar för 1:50, 1:100, 1:200 och 1:400
- fält för egen ratio, till exempel `75` eller `125.5`
- val **Apply to all pages**
- val **Update existing measurements**
- validering: ratio måste vara ett positivt ändligt tal
- förhandsvisning av motsvarande `pointsPerMeter` och vad 1 m motsvarar i PDF-punkter

När låset slås på:

- kalibreringsverktyget får inte påbörja en ny kalibrering
- manual scale-knappen och referensredigeringen inaktiveras
- rensning av skala inaktiveras
- ett försök visar en tydlig toast eller dialog: skalan är låst och måste låsas upp först

När låset slås av är alla skaloperationer tillgängliga igen. Låset påverkar inte befintliga mätvärden.

### 5.3 Snap

Snap implementeras som en ren modul, `src/model/snap.ts`, och integreras i canvasens punktplacering.

Mål:

- ändpunkter och hörn
- mittpunkter på raka segment
- skärningar mellan raka markup-segment
- ortogonal låsning med Shift

Regler:

- Endast aktuell sida deltar.
- Endast synliga lager och synliga objekt deltar.
- Låsta men synliga objekt deltar, eftersom de är en del av ritningen.
- Kalibreringslinjens två ändpunkter deltar när kalibreringen visas.
- Dolda objekt får aldrig bli snapmål.
- Raka segment hämtas från `length`, `area` (polygon och rektangel), `line`, `arrow` och `rect`.
- `pen`, `highlight`, `ellipse`, `count` och `text` bidrar inte med segment till mittpunkt eller skärning i 3A.
- Skärningar mellan angränsande segment som delar en ändpunkt räknas inte som nya kandidater.
- Kollinjära överlappningar ignoreras.
- Kandidater inom tröskeln jämförs i skärmavstånd. Närmast vinner. Vid exakt lika avstånd prioriteras ändpunkt före mittpunkt före skärning.
- Tröskeln är `settings.snapTolerancePx / zoom` i PDF-punkter.
- Snapmarkören visar vilken typ av mål som träffades: `Endpoint`, `Midpoint` eller `Intersection`.
- Om inget snapmål finns inom tröskeln används rå punkt.
- Shift behåller dagens 45°-låsning för segmentverktyg. 0/90/180/270 är en delmängd och räknas som ortogonal låsning.
- Snap gäller vid punktplacering för `calibrate`, `length`, `area` (polygon, rektangel och ellips), `line` och `arrow`.
- Snap gäller inte för frihand (`pen`/`highlight`), pan, markering eller flytt i 3A.

Prestanda:

- Kandidater byggs per aktuellt projektobjekt, sida och lagerfilter och cachas i canvasen.
- Cachen invalideras när projektets snapshot byts, sidan byts eller lager-/objektsynlighet ändras.
- Skärningar beräknas endast för synliga segment på aktuell sida.
- Om en sida har exceptionellt många segment ska implementationen först begränsa till segment inom viewport. PDF-geometrisnapp får inte användas som lösning på prestandaproblemet.

PDF-geometrisnapp är en separat spike. Spiken ska undersöka:

- extrahering av vektorgeometri via PDF.js operator list
- transformering till sidkoordinater och hantering av rotation
- indexering och viewport-culling
- prestanda och minne för stora ritningar
- om snap mot PDF-linjer kan ske utan att ändra mätmodellen

Ingen sådan kod ska blandas in i 3A.

### 5.4 Exportdialog

Exportmenyns **PDF**-val öppnar en ny dialog i stället för att exportera direkt. Dialogen har två tydliga områdeslägen:

```text
Area
( ) Whole page(s)
( ) Selected area (crop)
```

När **Selected area (crop)** väljs:

- användaren trycker **Draw area**
- dialogen döljs tillfälligt och canvasen går i ett engångsläge för beskärningsruta
- användaren ritar en rektangel över den detalj som ska skickas
- rutan kan justeras med handtag och flyttas innan den bekräftas
- **Enter** eller **Use area** bekräftar, **Esc** eller **Cancel** avbryter
- dialogen återgår med samma val som tidigare
- rutan kan rensas och ritas om

Beskärningsrutan:

- är alltid rektangulär och axelrät i den vy användaren ritar i
- sparas som normaliserade `x`, `y`, `width`, `height` relativt referenssidans synliga yta
- appliceras på varje vald sida som samma relativa område
- klipper allt exporterat innehåll, inklusive markeringar, etiketter och kalibreringslinje
- får inte avslöja innehåll som låg utanför en redan befintlig CropBox i käll-PDF:en
- visas i dialogen som andel av sidan och med referenssida, så användaren ser vad som gäller

Sidval:

- **Current page**
- **All pages**
- **Range**, med fält för till exempel `1-3, 5`
- intervallet tolkas som positiva heltal, intervall och kommatecken
- dubbletter tas bort och sidorna sorteras
- tomt fält, noll, negativa tal, omvänt intervall och sidor utanför dokumentet ger ett tydligt inline-fel
- exportknappen är inaktiverad så länge intervallet är ogiltigt

Lager:

- dialogen listar alla lager i projektets ordning
- endast synliga lager kan väljas
- dolda lager visas som inaktiva med texten `Hidden`, så det är tydligt varför de inte kan exporteras
- **Select all** och **Clear** påverkar endast valbara, synliga lager
- låsta lager och låsta objekt får exporteras
- dolda objekt i ett valt lager exporteras aldrig
- om inget lager är valt är exportknappen inaktiverad

Etiketter och kalibrering:

- **Labels** styr genererade mätetiketter, inte användarens textanteckningar
- textanteckningar är innehåll och följer med även när Labels är av
- **Calibration line** styr referenslinjen och dess etikett
- manuell skala har ingen linje att visa, men skalvärdet kan fortfarande visas i teckenförklaringen

Teckenförklaring:

- **Legend** lägger till en separat A4-sida sist i exporten
- sidan listar valda lager i lagerordning med färg, namn och typ
- om count-objekt finns listas förekommande count-typer och totalt antal
- endast objekt som faktiskt exporteras räknas
- dolda lager och dolda objekt får aldrig förekomma
- teckenförklaringen läggs aldrig över ritningen
- om Legend är på och användaren exporterar en sida blir PDF:en två sidor; dialogen ska säga det tydligt

Filnamn:

- behåller nuvarande mönster `<projektnamn>-markups.pdf`
- käll-PDF:en får aldrig skrivas över
- exporten använder samma säkra filsparande som övriga PDF-exporter

### 5.5 PDF-exportens regler

`exportProjectPdf()` utökas med `DrawingExportOptions` och ska:

1. filtrera bort alla sidor som inte valts
2. filtrera bort alla lager som inte valts
3. utesluta alla dolda lager och objekt
4. behålla låsta, synliga objekt
5. rita markeringar, etiketter och kalibreringslinje enligt valen
6. applicera cropen på varje vald sida
7. lägga till teckenförklaringen sist om den valts
8. returnera en giltig PDF som öppnas i extern läsare

Cropen räknas om per sida:

- referenssidans normaliserade ruta multipliceras med varje sidas synliga viewport
- hörnen transformeras till PDF-koordinater med sidans viewport
- den resulterande axelräta rutan sätts som både CropBox och MediaBox
- om sidan redan har en mindre CropBox används snittet, så dolt innehåll inte exponeras
- rotation i steg om 90° hanteras; ogiltig eller oväntad rotation ska inte ge en tyst felaktig crop
- om cropen blir tom eller mindre än en minimal yta ska exporten stoppas med ett tydligt fel

Etiketter och kalibreringslinje ritas före cropen och klipps därför av rutan. Teckenförklaringssidan croppas inte.

## 6. Schema och migrering

`SCHEMA_VERSION` höjs till **4**.

Höjningen är medveten: äldre versioner saknar `areaShape` och manuell kalibrering. Om en gammal version öppnar en fil med tvåpunktsarea kan den annars felaktigt behandla objektet som polygonarea, och manuell skala kan tappas. Schema v4 gör att äldre versioner avvisar filen i stället för att tyst förvränga den.

Migrering:

- v1, v2 och v3 kan läsas och normaliseras till v4.
- Saknat `areaShape` blir `polygon`.
- Okänt `areaShape` blir `polygon`.
- Rektangel/ellips med fler än två punkter trimmas till två.
- Rektangel/ellips med färre än två punkter behandlas som ogiltig area och tas bort enligt befintlig normalisering.
- Saknat `snapTolerancePx` blir `8`; värden klampas till `2–24`.
- Saknat `scaleLocked` blir `false`; `scaleLocked: true` utan kalibrering tas bort.
- Kalibrering utan `source` blir referenskalibrering.
- Manuell kalibrering kräver positivt `ratio` och positivt `pointsPerMeter`; annars tas kalibreringen bort.
- Referenskalibrering behåller dagens krav på `p1`, `p2`, `knownLength` och `unit`.
- Nya filer skriver `schemaVersion: 4` först när användaren sparar.

Etapp 4 blir därmed sannolikt schema v5. Roadmapen ska uppdateras när Etapp 3 är klar.

## 7. Genomförandeordning

### 3A – mätverktyg, skala och snap

1. **Modell och normalisering**
   - `AreaShape`, `areaShape`, `ManualCalibration`, `scaleLocked`, `snapTolerancePx`
   - schema v4, normalisering och migreringstester för v1–v4
2. **Geometri och mätvärden**
   - area/omkrets/bounds/hit-test för rektangel och ellips
   - etiketter och mängdberäkning
   - tester
3. **Canvas för snabbarea**
   - formväljare i kontextraden
   - drag för rektangel/ellips
   - rendering, markering, flytt och hörnändring
   - dolt rotationshandtag för snabbarea
4. **Manuell skala och skallås**
   - dialog med presets och egen ratio
   - apply-to-all och update-measurements
   - låsknapp och skydd i store/canvas
   - tester
5. **Snap**
   - `src/model/snap.ts` med kandidater och prioritet
   - cache i canvasen
   - snapmarkör och inställning för tröskel
   - tester för träff, tröskel, dolda/låsta objekt och skärningar
6. **Exportstöd för nya areaformer**
   - PDF-export, PNG-komposition och etiketter
   - tester för båda areaformerna
7. **3A-dokumentation och validering**
   - README, ikoner/hints och status
   - fullständiga kontroller

### 3B – exportdialogen

8. **Exportmodell**
   - `DrawingExportOptions`
   - sidintervallparser och normaliserad crop
   - tester
9. **PDF-pipeline**
   - sidfilter, lagerfilter, etiketter/kalibrering
   - crop till CropBox/MediaBox med rotation och befintlig CropBox
   - tester
10. **Teckenförklaringssida**
    - lager, count-typer och endast exporterat innehåll
    - tester
11. **Exportdialog och crop-läge**
    - två områdeslägen
    - sidval och intervallfel
    - lagerval, etiketter, kalibrering och legend
    - canvasens engångsläge för beskärningsruta
    - koppling i `App.ts`
12. **Slutlig validering**
    - manuella exportprov med en och flera sidor
    - README och roadmap
    - fullständiga kontroller och CI

Varje steg ska vara en fokuserad commit med relevanta tester. En åtgärd som påverkar flera objekt ska fortfarande vara ett enda undo-steg.

## 8. Tester

### Modell och projektfil

- `areaShape` saknas → polygon
- rektangel/ellips med två punkter bevaras
- rektangel/ellips med fler punkter trimmas
- ogiltig areaform faller tillbaka på polygon eller tas bort enligt reglerna
- `snapTolerancePx` default och klampning
- `scaleLocked` bevaras bara med kalibrering
- referenskalibrering utan `source` migreras korrekt
- manuell kalibrering med ratio och pointsPerMeter
- ogiltig manuell kalibrering tas bort
- v1, v2, v3 och v4 kan läsas
- ny fil skrivs som v4

### Area

- rektangelarea och omkrets
- ellipsarea och Ramanujan-omkrets
- bounds och centrum
- hit-test insida, kant och utanför
- `add`/`subtract` för båda formerna
- etikett med area och omkrets
- PDF-export med rektangel och ellips
- ingen rotation för snabbarea i 3A

### Skala

- 1:50, 1:100, 1:200, 1:400 och egen ratio ger rätt `pointsPerMeter`
- manuell skala på aktuell sida och alla sidor
- update-measurements respekterar befintliga snapshots
- manuell skala ritar ingen referenslinje
- låsning blockerar kalibrering, manuell skala, redigering och rensning
- upplåsning återställer möjligheten
- låsning och manuell skala är undo-bara
- låst skala exporteras och påverkar inte mätvärden

### Snap

- ändpunkt på synligt objekt
- mittpunkt på rakt segment
- skärning mellan två segment
- tröskel i pixlar respekteras vid olika zoom
- närmast kandidat vinner
- prioritet vid lika avstånd
- dolda lager och objekt ger inga kandidater
- låsta men synliga objekt ger kandidater
- kalibreringsändpunkter när kalibreringen visas
- inga snapmål utanför dokumentets aktuella sida
- Shift behåller 45°-låsning

### Export

- aktuell sida, alla sidor och intervall
- intervallparser: `1`, `1-3`, `1,3,5`, `1-3, 5`
- ogiltiga intervall: tomt, `0`, `3-1`, `99`, skräptecken
- dubbletter och osorterade intervall normaliseras
- crop normaliseras och klampas
- samma relativa crop på sidor med olika storlek
- crop på roterad sida
- crop respekterar befintlig CropBox
- crop klipper markeringar och etiketter
- endast valda lager exporteras
- dolda lager och objekt exporteras aldrig
- låsta objekt exporteras
- etiketter av/på
- kalibreringslinje av/på
- manuell skala visas korrekt i export/teckenförklaring
- teckenförklaring läggs sist och endast när den valts
- teckenförklaring räknar endast exporterat innehåll
- käll-PDF skrivs inte över
- befintliga PDF-exporttester fortsätter att gälla

## 9. Acceptanskriterier

Etapp 3 är klar när:

1. Användaren kan rita rektangel- och ellipsarea med drag och få korrekt area, omkrets och etikett.
2. Båda areaformerna kan användas som add och subtract och överlever spara/ladda.
3. Manuell skala kan sättas med presets eller egen ratio och ger samma mått som en korrekt referenskalibrering.
4. En sida kan låsas, låsningen hindrar alla skaländringar och överlever spara/ladda samt undo.
5. Snap fungerar mot ändpunkt, mittpunkt och segmentskärning inom valt pixeltröskelvärde.
6. Dolda objekt ger inga snapmål; låsta synliga objekt ger snapmål.
7. Exportdialogen kan exportera aktuell sida, alla sidor eller ett giltigt intervall.
8. Valt område ritas som en rektangulär beskärningsruta och klipper exporten.
9. Samma relativa område tillämpas på alla valda sidor.
10. Endast valda, synliga lager och synliga objekt exporteras.
11. Etiketter, kalibreringslinje och teckenförklaring följer sina val.
12. En exporterad beskuren PDF öppnas korrekt i extern läsare och innehåller inget utanför rutan.
13. Alla befintliga och nya tester passerar, TypeScript-, build- och Rust-kontrollerna är gröna och CI är grön.

## 10. Risker och motåtgärder

| Risk | Motåtgärd |
|---|---|
| Crop på roterade sidor blir fel | Testa 0/90/180/270 och mappa via PDF.js viewport, inte manuell algebra |
| Crop exponerar innehåll utanför befintlig CropBox | Snitta mot sidans befintliga CropBox |
| Segmentskärningar blir långsamma | Cache per projekt/sida och begränsa till synliga segment; vid behov viewport-culling |
| Dolda objekt läcker via snap eller export | En gemensam synlighetskontroll i snap, PDF, PNG och legend; regressionstester |
| Manuell skala förutsätter rätt pappersstorlek | Tydlig hjälptext i dialogen och i README |
| Tvåpunktsarea förvirrar äldre appversioner | Schema v4 som avvisar filen i äldre versioner |
| Dialogens crop-läge tappar val | Bevara exportvalen när dialogen döljs och återgår |
| Teckenförklaringen sväller | Endast valda lager och faktiskt exporterade count-typer; separat sida |
| Snap känns för aggressivt | Inställbart tröskelvärde och tydlig markör; Shift behåller dagens låsning |

## 11. Manuell testchecklista

- Öppna `fixtures/sample-plan.pdf`.
- Kalibrera sida 1 med referens och kontrollera mått.
- Lås skalan och försök kalibrera om, sätta manuell skala och rensa; alla ska blockeras.
- Lås upp och sätt 1:100; kontrollera att en känd längd stämmer.
- Rita rektangelarea och ellipsarea, både add och subtract.
- Slå på snap och kontrollera ändpunkt, mittpunkt och skärning vid olika zoom.
- Dölj ett lager och kontrollera att det inte ger snapmål eller exporteras.
- Exportera aktuell sida med hela sidan.
- Exportera ett intervall med valt område och kontrollera att samma relativa utsnitt används.
- Exportera med endast ett lager, Labels av och Calibration line av.
- Exportera med Legend och kontrollera att den hamnar sist och inte innehåller dolda objekt.
- Öppna den exporterade PDF:en i en extern läsare och kontrollera att inget utanför cropen syns.
- Kontrollera att käll-PDF:en är oförändrad.
