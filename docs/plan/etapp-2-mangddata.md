# Etapp 2 – Mängddata och beställningsunderlag

**Status:** planen är fastställd 2026-10-21. Ingen Etapp 2-kod är skriven ännu. Nästa steg är Etapp 2A steg 1.

Dokumentet ersätter den tidigare förslagsversionen. Alla beslut som krävdes innan implementation är nu låsta och listade i avsnitt 2. Om koden och planen hamnar i konflikt ska konflikten lösas uttryckligen, inte tyst.

## 1. Mål

Göra GridScalr användbart för tekniska förvaltare som ska ta fram ett beställningsunderlag från PDF-ritningar.

Etappen ska ge:

- användardefinierade kategorier per projekt
- rum som fritext med autocomplete
- antalsverktyg för dörrar, fönster, radiatorer, armaturer och liknande
- avdragsarea med add/subtract
- summering per kategori och rum
- svinn och avrundning
- mängdförteckning som CSV och utskriftsvänlig PDF
- schema v3 med bakåtkompatibel migrering

Etappen delas i **2A – modell och summering** och **2B – beställningsunderlag**.

## 2. Fastställda beslut

| Fråga | Beslut | Följd |
|---|---|---|
| Kategorilista | Användardefinierad per projekt | Kategori blir projektdata med stabila id:n, inte en enum |
| Kategori obligatorisk | Ja, exakt en kategori per mätning | Ingen null-hantering i rapport, filter eller CSV |
| Avdragsnetto | `max(0, add - subtract)` med varning | Rapport och CSV visar brutto, avdrag och netto så felet kan rättas |
| Rum | Fritext med autocomplete | Inget rumsregister, gruppering skiftlägesokänslig |
| PDF-rapport | Byggs direkt i `pdf-lib` | Full kontroll på tabeller, sidbrytning och testbarhet |
| CSV-format | Komma som avgränsare, UTF-8 med BOM | Öppnas korrekt i Excel; numeriska värden med punkt som decimaltecken |
| Standardkategorier | Engelska namn: Floor, Wall, Ceiling, Facade, Roof, Ground, Other | Matchar appens engelska UI; namnen är redigerbara användardata |
| Mängdpanel | Fjärde fliken i vänster dock | Ingen separat rapportvy i Etapp 2 |
| Svinn | Procent per projekt och per kategori | Ingen fast mängd i Etapp 2 |
| Avrundning | Alltid uppåt, steg `> 0`, `0` = ingen avrundning | Beställningsmängd kan aldrig understiga netto |
| Count-typer | Fast lista i Etapp 2 | Användardefinierade typer skjuts framåt |
| Count-enhet | `pcs` | Matchar appens engelska UI; ingen enhetsväljare |
| XLSX | Utanför Etapp 2 | CSV först, utvärderas efter 2B |

Standardkategorierna skapas i denna ordning och är även rapportens standardordning:

```text
Floor, Wall, Ceiling, Facade, Roof, Ground, Other
```

Användaren kan byta namn, lägga till, ta bort och sortera om dem. Ordningen i `project.categories` är den ordning som används i rapporten.

## 3. Avgränsning

Ingår inte i Etapp 2:

- användardefinierade count-typer
- fullständigt rumsregister med ritningskoppling
- anteckningsfält per objekt
- avancerade hålpolygoner eller boolean-geometri
- PDF-geometrisnapp
- manuell skala och skalningslåsning
- bildobjekt
- full z-order
- molnsynk eller samarbete
- XLSX

Antalsverktyget ska vara generiskt. Det ska inte byggas separata objektstyper för varje inventarietyp.

## 4. Datamodell

### 4.1 Category

```ts
export interface Category {
  /** Stabilt id, till exempel "cat_3f9a". Återanvänds aldrig. */
  id: string;
  /** Redigerbart visningsnamn. Unikt per projekt, skiftlägesokänsligt. */
  name: string;
  /** 2B: överstyr projektets svinn. */
  wastePercent?: number;
  /** 2B: överstyr projektets avrundningssteg. */
  roundingStep?: number;
}
```

Regler:

- `project.categories` är en ordnad lista. Index är rapportordning.
- Listan måste alltid innehålla minst en kategori.
- Namn trimmas, får inte vara tomt och är högst 40 tecken.
- Namn är unika skiftlägesokänsligt inom projektet.
- Kategorier är projektglobala och gäller alla sidor och alla mätlager.
- Kategorier påverkar inte färg, lagertillhörighet eller geometri.
- Svinn och avrundning ligger på kategorin i stället för i en separat `categoryOverrides`-map. Det gör att inställningar försvinner automatiskt när en kategori tas bort och att det inte kan uppstå orphan-nycklar.

### 4.2 MarkupItem

Nya fält:

```ts
export interface MarkupItem {
  // befintliga fält

  /** Endast mätningar. Måste peka på en kategori i projektet. */
  categoryId?: string;
  /** Endast mätningar. Trimmad fritext, tom sträng sparas som undefined. */
  room?: string;
  /** Endast area. Standard är add. */
  areaMode?: AreaMode;
  /** Endast count. */
  countType?: CountType;
}
```

Regler:

- `categoryId` gäller `length`, `area` och `count`.
- Ritobjekt (`pen`, `line`, `arrow`, `rect`, `ellipse`, `highlight`, `text`) ska aldrig ha `categoryId`, `room`, `areaMode` eller `countType`. Normaliseraren tar bort dem.
- `room` trimmas. Tom sträng sparas som `undefined`.
- Rumsgruppering är skiftlägesokänslig. Visningsnamnet är den skrivning som först påträffas i dokumentordning.
- `areaMode` gäller endast `area`.
- `countType` gäller endast `count`.
- Kopiering, duplicering och inklistring behåller `categoryId`, `room`, `areaMode` och `countType`.
- Om ett objekt flyttas mellan mätlager behålls kategorin, eftersom kategorier är projektglobala.
- Ett objekt vars `categoryId` inte finns i projektet faller tillbaka på projektets standardkategori vid inläsning.

Typer:

```ts
export type CountType = "door" | "window" | "radiator" | "fixture" | "other";
export type AreaMode = "add" | "subtract";
export type MeasurementKind = "length" | "area" | "count";
```

### 4.3 Ny item-kind: count

`count`:

- har exakt en punkt som anger placering
- har `countType`
- räknas som `measure` i `layerKindForItem` och `toolLayerKind`
- renderas som en inbyggd vektorsymbol, inte som en bild
- får etikett och rum precis som andra mätningar
- har metriken `1 pcs` per objekt
- har aldrig `areaMode`; normaliseraren tar bort fältet om det skulle finnas

Ingen ny lagertyp införs. Mätningar och ritobjekt är fortsatt separerade.

### 4.4 Units

`AreaUnit` utökas med `yd2`:

```ts
export type AreaUnit = "mm2" | "cm2" | "m2" | "in2" | "ft2" | "yd2";
```

- `yd2` får `squareMeters: 0.9144 * 0.9144`.
- Label: `yd²`.
- `yd2` ska fungera i areaetiketter, Properties, PDF-export av ritning, mängdpanel och CSV.

Count visas som `pcs` i UI och i rapporten. Ingen användarvald count-enhet behövs i Etapp 2.

### 4.5 ProjectSettings

```ts
export interface QuantitySettings {
  /** Måste peka på en kategori i project.categories. */
  defaultCategoryId: string;
  /** 0–100. Projektstandard, används när kategorin saknar egen överstyrning. */
  wastePercent: number;
  /** 0 = ingen avrundning. Annars steg i radens egen enhet. */
  roundingStep: number;
}

export interface ProjectSettings {
  // befintliga fält
  quantity: QuantitySettings;
}
```

Defaults: `wastePercent: 0`, `roundingStep: 0`. `defaultCategoryId` sätts till kategorin `Other` när ett projekt skapas.

Fälten införs i schema v3 även om själva svinn- och avrundnings-UI:t levereras först i 2B. Det gör att 2B inte behöver en ny schemaändring.

### 4.6 Härledda värden

Följande ska **inte** sparas i projektfilen:

- nettomängd
- svinnmängd
- beställningsmängd
- summering per kategori eller rum
- antal objekt per grupp

De beräknas alltid från aktuell objektdata. Det förhindrar att rapporten visar gamla värden efter en ändring.

## 5. Schema v3 och migrering

- `SCHEMA_VERSION` blir `3`.
- Normaliseraren hanterar v1, v2 och v3.
- Nya projekt får standardkategorierna och `defaultCategoryId` = `Other`.
- v1/v2-projekt får standardkategorierna automatiskt. Alla mätningar får `categoryId` = `Other`.
- v1/v2-areaobjekt får `areaMode: "add"`.
- v1/v2-mätningar får `room: undefined`.
- Saknade `settings.quantity` får defaults. Ogiltig `defaultCategoryId` ersätts av första kategorin.
- Okänt `categoryId` ersätts av standardkategorin.
- Okänt `countType` faller tillbaka på `other`. Ogiltig `areaMode` faller tillbaka på `add`.
- Kategorier som läses in trimmas och namn som är tomma eller dubbletter får ett unikt namn i stället för att kastas.
- `createdAt`, `updatedAt` och id:n skrivs inte om vid migrering, förutom att saknade id:n genereras med `makeId`.
- Migrerade projekt skrivs med `schemaVersion: 3` först när användaren sparar.

Migreringstabell:

| Källa | Resultat |
|---|---|
| schema v1 | kategori `Other`, `visible: true`, `locked: false`, `areaMode: add` |
| schema v2 | `visible`/`locked` bevaras, kategori `Other`, `areaMode: add` |
| schema v3 utan kategorilista | standardkategorier skapas, mätningar får `Other` |
| schema v3 med okänt `categoryId` | standardkategorin |
| schema v3 med dubblettnamn | namn görs unikt, id:n bevaras |
| ritobjekt med mätfält | fälten tas bort |

Migreringstester ska minst täcka raderna ovan samt:

- v2-mätning utan kategori och utan `areaMode`
- v3-projekt med count-objekt
- v3-projekt där `defaultCategoryId` pekar på en borttagen kategori

## 6. Kategori- och rumshantering

### 6.1 Skapande av mätning

När ett mätverktyg är aktivt visas kategori och rum i kontextraden:

```text
[Category: Floor ▾] [Room: ____________]
```

- Kategorivalet listar `project.categories` i projektets ordning.
- Kategori defaultar till senast använda kategori i sessionen, annars projektets `defaultCategoryId`.
- Rum är fritext med autocomplete från alla rum som redan används i projektet, skiftlägesokänsligt.
- Kategori och rum är "sticky" under sessionen: de behålls till nästa mätning tills användaren ändrar dem, och nollställs när ett projekt öppnas.
- Rum kan tömmas med en clear-knapp. Tomt rum är tillåtet.
- När ett objekt skapas sparas aktuell kategori och aktuellt rum.

### 6.2 Redigering

I Properties för en mätning:

- kategoriväljare
- rumfält med autocomplete
- för area: add/subtract
- för count: count-typ

Låsta objekt visar värden men kan inte ändras. Dolda objekt kan redigeras när de är markerade, enligt befintlig regel.

### 6.3 Massredigering

Vid flerval av endast mätningar:

- massändra kategori
- massändra rum
- massändra `areaMode` om alla är area
- massändra `countType` om alla är count

Blandade mätningar och ritobjekt ska inte erbjuda kategori eller rum för hela selectionen. En massändring ska vara ett enda undo-steg, även när den rör flera lager.

### 6.4 Kategorihantering

Kategorier hanteras i projektinställningarna. Panelen innehåller:

- lista med namn, upp/ner för ordning, radera
- "Add category"
- val av standardkategori
- i 2B: svinn och avrundningssteg per kategori

Regler:

- Alla kategorioperationer går genom `Store` och blir ett undo-steg var.
- Namnändring behåller id:t, så alla objekt följer med.
- En kategori som används får bara raderas om användaren väljer en mottagarkategori. Alla objekt flyttas i samma undo-steg som raderingen.
- Den sista kategorin kan inte raderas.
- Standardkategorin kan inte raderas utan att en ny standard väljs först.
- Att ta bort en kategori tar även bort dess svinn- och avrundningsöverstyrning.

## 7. Antalsverktyg

Verktygsraden får ett `Count`-verktyg.

Flöde:

1. Välj Count.
2. Välj count-typ och kategori i kontextraden.
3. Klicka på ritningen.
4. Ett count-objekt skapas på den valda punkten.

Rendering:

- inbyggd vektorsymbol per count-typ
- färg från lagret eller objektet, samma regler som övriga mätningar
- etikett via befintlig etikettpipeline: primär text `1 pcs`, sekundär text är count-typens namn
- Markups-listan visar count-typ och rum
- hidden/locked följer samma regler som övriga objekt

Hit-test:

- count träffas inom en fast radie i PDF-punkter, skalad med zoom så träffytan blir konstant på skärmen
- dolda count-objekt träffas inte
- låsta count-objekt kan markeras men inte flyttas eller raderas
- count-objekt kan flyttas med samma flyttlogik som andra objekt

Export:

- count ritas som vektor i PDF-exporten av ritningen
- count ingår i PNG-exporten
- count ingår i mängdförteckningen
- hidden/locked följer befintliga exportregler

## 8. Avdragsarea

Area får en `areaMode`:

- `add` – läggs till bruttoarean
- `subtract` – dras av

UI:

- toggle i Properties
- toggle i kontextraden när Area-verktyget är aktivt
- tydlig markering i Markups-listan, exempelvis `Deduction`
- canvas visar areaobjektet med samma färg men med diskret markering i etiketten

Beräkning per grupp:

```text
grossAdd      = sum(area där areaMode = add)
grossDeduct   = sum(area där areaMode = subtract)
net           = max(0, grossAdd - grossDeduct)
clamped       = grossDeduct > grossAdd
```

- `net` klampas alltid till noll eller högre.
- När `clamped` är sant visar mängdpanelen, CSV:n och PDF-rapporten brutto, avdrag, netto och en varning.
- Avdraget påverkar bara arearader i samma kategori och rum. Det läcker inte mellan grupper.
- Avdrag påverkar inte längd- eller count-rader.

## 9. Summering

Ny flik i vänsterpanelen: **Quantities**.

### 9.1 Rapportrader

En rad per `kategori + rum + mängdtyp`:

- Category
- Room
- Type: length, area eller count
- Unit
- Gross
- Deduction
- Net
- Items (antal objekt)

Lager och sida är filter, inte raddimensioner.

### 9.2 Filter

- Page: current page / all pages
- Layer: en eller flera valda lager, eller alla
- Category: en vald kategori, eller alla
- Room: fritextfilter, skiftlägesokänsligt
- Include hidden: av som standard

### 9.3 Synlighet

Summeringen använder samma regler som export:

- dolda objekt räknas inte
- objekt i dolda lager räknas inte
- låsta objekt räknas
- när dolda objekt exkluderas visas en diskret notis i panelen

### 9.4 Summering och sortering

- delsumma per kategori
- delsumma per rum
- totalsumma per mängdtyp
- sortering: projektets kategoriordning, sedan rum alfabetiskt (tomt rum sist), sedan längd, area, count
- visning använder projektets längd- och areaenheter
- count visas alltid i `pcs`

Beräkningen ska vara en ren funktion över projektdata, utan sidoeffekter, så den kan testas och återanvändas av CSV och PDF.

### 9.5 Prestanda

- Summeringen görs i ett svep över synliga objekt och memoiseras per projektrevision.
- Panelen får inte räkna om allt vid varje musklick eller textinmatning i ett filter.

## 10. Svinn och avrundning – Etapp 2B

Effektiva värden per rad:

```text
wastePercent = kategori.wastePercent ?? settings.quantity.wastePercent
roundingStep = kategori.roundingStep ?? settings.quantity.roundingStep
```

Formel:

```text
net              = max(0, grossAdd - grossDeduct)
wasteQuantity    = net * (wastePercent / 100)
rawOrderQuantity = net + wasteQuantity
orderQuantity    = roundingStep > 0
                     ? ceil(rawOrderQuantity / roundingStep) * roundingStep
                     : rawOrderQuantity
```

Regler:

- Avrundning sker alltid uppåt.
- `roundingStep` får vara `0` (ingen avrundning) eller större än noll. Negativa värden avvisas.
- `wastePercent` ligger mellan 0 och 100.
- `ceil` använder en tolerans så att `3.0000000001` inte blir `4`.
- Count avrundas alltid till hela styck, oavsett `roundingStep`.
- Beställningsmängden får aldrig understiga nettomängden.
- Netto, svinn och beställningsmängd visas separat.
- Ändrade svinn- eller avrundningsvärden är undo-steg och kräver ingen omräkning av sparade data.

## 11. Mängdförteckning

### 11.1 CSV

Kolumner, i denna ordning:

```text
category,room,quantity_type,unit,gross,deduction,net,waste_percent,waste_quantity,rounding_step,order_quantity,item_count
```

Krav:

- UTF-8 med BOM
- komma som avgränsare
- CRLF som radbrytning
- numeriska värden med punkt som decimaltecken och utan tusentalsavgränsare
- längd och area med tre decimaler, count som heltal
- fält som innehåller komma, citattecken eller radbrytning omges av citattecken, och inre citattecken dubbleras
- dolda objekt och dolda lager utesluts
- en rad per kategori + rum + mängdtyp

Efter tabellen följer två tomma rader och en metadatasektion med nyckel/värde:

```text
project,Example
document,plan.pdf
document_sha256,…
generated_at,2026-10-21T12:00:00.000Z
hidden_excluded,true
```

Tabellen ligger först så att den kan läsas maskinellt genom att läsa till första tomma raden. Metadata ligger sist så att den inte stör importverktyg som letar efter rubrikraden först.

Filnamn: `<projektnamn>-quantities.csv`.

### 11.2 PDF

Utskriftsvänlig rapport byggd direkt med `pdf-lib`.

- A4 porträtt, 48 pt marginal
- sidhuvud: projektnamn, PDF-filnamn, datum, skalans källa
- tabell per kategori med rum, typ, enhet, brutto, avdrag, netto, svinn och beställningsmängd
- delsumma per kategori och totalsumma per mängdtyp
- varning när avdrag överstiger brutto
- notis när dolda objekt uteslutits
- sidnummer och upprepad tabellrubrik vid sidbrytning
- Helvetica som standardteckensnitt, vilket täcker å, ä och ö

Rapporten är en separat funktion från PDF-exporten av ritningen. Den senare ligger i Etapp 3.

Filnamn: `<projektnamn>-quantities.pdf`.

### 11.3 XLSX

XLSX införs endast om CSV inte räcker. Det kräver ny dependency och mer arbete med formatering, formler och underhåll. CSV kan öppnas direkt i Excel och är därför första val.

## 12. Filer som påverkas

Nya moduler:

- `src/model/categories.ts` – skapande, validering, namnregler, standarduppsättning
- `src/model/quantity.ts` – gruppering, brutto/avdrag/netto, svinn och avrundning
- `src/report/reportModel.ts` – rapportrader, filter och summering
- `src/report/csv.ts` – CSV-serialisering
- `src/pdf/reportPdf.ts` – utskriftsvänlig PDF
- `src/ui/quantityPanel.ts` – Quantities-fliken

Befintliga filer:

- `src/model/types.ts`
- `src/model/measure.ts`
- `src/model/layers.ts`
- `src/model/hitTest.ts`
- `src/model/geometry.ts`
- `src/model/units.ts`
- `src/model/label.ts` och `src/model/labelLayout.ts`
- `src/state/store.ts`
- `src/canvas/CanvasView.ts`
- `src/app/App.ts`
- `src/ui/panels.ts`
- `src/ui/shell.ts`
- `src/ui/dialogs.ts`
- `src/ui/icons.ts`
- `src/ui/toolDefs.ts`
- `src/styles.css`
- `src/io/projectFile.ts`
- `src/io/platform.ts` vid behov för exportdialog
- `src/pdf/pdfExport.ts`
- `tests/`
- `README.md`

## 13. Genomförandeordning

Varje steg ska vara en fokuserad commit som passerar alla kontroller. Ett steg får inte lämna halvfärdig UI som kan spara ogiltig data.

### Etapp 2A

1. **Kategorimodell och schema v3**
   - `Category`, `QuantitySettings`, nya item-fält
   - standardkategorier och validering
   - normalisering och migrering v1/v2/v3
   - kategorihantering i projektinställningarna
   - migreringstester
2. **Kategori och rum på mätningar**
   - kontextrad vid skapande
   - Properties-fält
   - Markups-listan visar kategori och rum
   - tillåtna värden och fallback
3. **Count-verktyg**
   - `MeasurementKind`, `CountType`
   - verktyg, symboler, etikett, hit-test
   - PNG- och PDF-export av symboler
4. **Avdragsarea**
   - `areaMode`, toggle i Properties och kontextrad
   - markering i Markups-listan och på canvas
5. **Quantities-panel och `yd²`**
   - ren beräkningsmodul med tester
   - panel med filter, gruppering och delsummor
   - `yd2` i enheter, Properties, export och rapport
6. **Massredigering och polish**
   - massändring av kategori, rum, `areaMode` och `countType`
   - ett undo-steg per massåtgärd
   - tomma tillstånd, tangentbord och tillgänglighet i nya vyer

### Etapp 2B

7. **Svinn och avrundning**
   - inställningar per projekt och kategori
   - beställningsmängd enligt formeln
   - varning vid klampning
8. **CSV-export**
   - rapportrader, escaping, BOM och metadata
9. **PDF-rapport**
   - tabeller, sidbrytning, delsummor och metadata
10. **Dokumentation och slutvalidering**
    - README, planstatus, fullständig kontrollkörning och Tauri-build

## 14. Testplan

Enhetstester:

- kategorivalidering: trim, tomt namn, dubbletter, maxlängd, ordning
- migrering enligt tabellen i avsnitt 5
- `categoryId`-fallback och borttagning av mätfält på ritobjekt
- count: skapande, etikett, hit-test, låst och dold
- area: add/subtract, klampning, varning
- gruppering: skiftlägesokänsliga rum, tomt rum, kategoriordning
- synlighet: dolda objekt och dolda lager utesluts, låsta ingår
- svinn och avrundning: steg 0, steg > 0, tolerans, count till hela styck
- `yd2` i konvertering och formatering
- CSV: escaping, BOM, decimaltecken, metadata
- PDF-rapport: radgenerering, delsummor och sidbrytning

Regressionstester som måste fortsätta gälla:

- undo/redo för massåtgärder
- låsning och synlighet i canvas, listor och export
- projektfil tur och retur för v1, v2 och v3
- PNG- och PDF-export av ritning

## 15. Acceptanskriterier

- Ett projekt har en användardefinierad kategorilista som kan ändras, sorteras om och raderas enligt reglerna i avsnitt 6.4.
- Varje mätning har exakt en kategori och kan ha ett rum.
- Kategori och rum kan massredigeras på flera mätningar i ett undo-steg.
- Count-objekt kan skapas, markeras, flyttas och raderas enligt samma synlighets- och låsregler som andra objekt.
- Count-objekt ritas och exporteras korrekt i PNG, PDF och mängdförteckning.
- Area kan markeras som add eller subtract, och netto klampas med varning.
- Nettomängd beräknas korrekt per kategori och rum.
- Brutto, avdrag och netto visas separat.
- Quantities-panelen exkluderar dolda objekt och dolda lager, och inkluderar låsta objekt.
- `yd²` fungerar i beräkningar, Properties, export och rapport.
- v1- och v2-projekt kan öppnas och migreras till v3 utan att id:n eller tidsstämplar skrivs om.
- Svinn och avrundning ger en beställningsmängd som aldrig understiger nettomängden.
- CSV innehåller netto, svinn och beställningsmängd samt metadata.
- PDF-rapporten går att skriva ut och innehåller projektmetadata.
- Alla befintliga tester fortsätter att gå igenom.
- `npx tsc --noEmit`, `npm test -- --run`, `npm run build`, `cargo fmt --check`, `cargo check` och Tauri-build går igenom.

## 16. Risker

- **Kategori som projektdata:** id-baserade referenser kräver att radering och migrering hanteras strikt, annars uppstår orphan-objekt. Migrering och radering måste testas först.
- **Scope:** Etapp 2 är stor. Delningen i 2A/2B är viktig och varje steg ska vara användbart i sig.
- **Avdragsregler:** otydliga regler ger fel beställningsunderlag. Klampning och varning är nu fastställda men måste synas i alla tre ytor: panel, CSV och PDF.
- **Rapportgruppering:** för många dimensioner gör rapporten svårläst. Kategori + rum som rader och lager/sida som filter är fastställt.
- **Enheter:** count, längd och area måste hållas tydligt åtskilda i summering, CSV och PDF.
- **Prestanda:** stora projekt med många objekt får inte göra panelen eller rapporten långsam. Memoisering per revision krävs.
- **Excel:** BOM och komma är fastställt, men Excel-inställningar på användarens maskin kan fortfarande påverka tolkningen. README ska beskriva förväntat resultat.
- **Synlighet:** summering och export måste använda exakt samma regler som canvas.

## 17. Kvarstående beslut

Inga beslut blockerar Etapp 2A. Följande är medvetet uppskjutna:

1. Användardefinierade count-typer – utvärderas efter Etapp 2.
2. Anteckningsfält per objekt och i CSV – utvärderas om behovet uppstår.
3. Kategorifärger för snabb visuell igenkänning – utanför Etapp 2.
4. Rumsregister med koppling till ritning – utanför Etapp 2.
5. XLSX – endast om CSV visar sig otillräckligt.
