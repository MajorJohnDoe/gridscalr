# Etapp 2 – Mängddata och beställningsunderlag

## Mål

Göra GridScalr användbart för tekniska förvaltare som ska ta fram ett beställningsunderlag från PDF-ritningar.

Etappen ska ge:

- kategori och rum per mätning
- antalsverktyg för dörrar, fönster, radiatorer, armaturer och liknande
- avdragsarea med add/subtract
- summering per kategori och rum
- svinn och avrundning
- mängdförteckning som CSV och utskriftsvänlig PDF
- schema v3 med bakåtkompatibel migrering

Etappen delas i **2A – modell och summering** och **2B – beställningsunderlag**.

## Avgränsning

Ingår inte i Etapp 2:

- fullständigt rumsregister med ritningskoppling
- användardefinierade kategorier och kategorihantering
- avancerade hålpolygoner eller boolean-geometri
- PDF-geometrisnapp
- manuell skala och skalningslåsning
- bildobjekt
- full z-order
- molnsynk eller samarbete
- XLSX om CSV visar sig räcka

Antalsverktyget ska vara generiskt. Det ska inte byggas separata objektstyper för varje inventarietyp.

## 1. Datamodell

### Nya begrepp

```ts
export type MeasurementCategory =
  | "floor"
  | "wall"
  | "ceiling"
  | "facade"
  | "roof"
  | "ground"
  | "other";

export type CountType =
  | "door"
  | "window"
  | "radiator"
  | "fixture"
  | "other";

export type AreaMode = "add" | "subtract";
```

Svenska UI-labels:

| Kod | Label |
|---|---|
| `floor` | Golv |
| `wall` | Vägg |
| `ceiling` | Tak |
| `facade` | Fasad |
| `roof` | Yttertak |
| `ground` | Mark |
| `other` | Övrigt |

### MarkupItem

Nya fält:

```ts
export interface MarkupItem {
  // befintliga fält

  /** Endast mätningar. */
  category?: MeasurementCategory;
  /** Endast mätningar. Fritext, exempelvis "Rum 101". */
  room?: string;
  /** Endast area. Standard är add. */
  areaMode?: AreaMode;
  /** Endast count. */
  countType?: CountType;
}
```

Regler:

- `category` gäller `length`, `area` och `count`.
- Ritobjekt ska inte ha kategori eller rum.
- `room` trimmas och tom sträng sparas som `undefined`.
- Rumsgruppering ska vara skiftlägesokänslig men behålla första visade skrivning.
- `areaMode` gäller endast `area`.
- Äldre mätningar utan kategori normaliseras till `other`.
- Äldre areaobjekt utan `areaMode` normaliseras till `add`.

### Ny item-kind: count

`MeasurementKind` utökas:

```ts
export type MeasurementKind = "length" | "area" | "count";
```

`count`:

- har exakt en punkt som anger placering
- har `countType`
- räknas som `measure` i `layerKindForItem`
- renderas som en inbyggd vektorsymbol, inte som en bild
- får etikett och rum precis som andra mätningar
- har metriken `1 count` per objekt

Ingen ny lagertyp införs. Mätningar och ritobjekt ska fortsatt vara separerade.

### Units

`AreaUnit` utökas med `yd2`.

Count visas som `st` i UI. Ingen ny användarvald count-enhet behövs i Etapp 2.

### ProjectSettings

Lägg till ett kvantitetsavsnitt:

```ts
export interface QuantitySettings {
  defaultCategory: MeasurementCategory;
  wastePercent: number;
  roundingStep: number;
  categoryOverrides?: Partial<
    Record<MeasurementCategory, {
      wastePercent?: number;
      roundingStep?: number;
    }>
  >;
}

export interface ProjectSettings {
  // befintliga fält
  quantity: QuantitySettings;
}
```

Fälten införs i schema v3 även om själva svinn-/avrundnings-UI:t levereras först i 2B.

### Härledda värden

Följande ska **inte** sparas i projektfilen:

- nettomängd
- svinnmängd
- beställningsmängd
- summering per kategori eller rum

De beräknas alltid från aktuell objektdata. Det förhindrar att rapporten visar gamla värden efter en ändring.

## 2. Schema v3 och migrering

- Bumpa `SCHEMA_VERSION` till 3.
- Normalisera v1, v2 och v3.
- v1/v2-mätningar får `category: "other"`.
- v1/v2-areaobjekt får `areaMode: "add"`.
- Nya settings får säkra defaults om de saknas.
- Okända kategorier eller count-typer faller tillbaka till `other`.
- Rita inte om `createdAt`, `updatedAt` eller ID:n vid migrering.

Migreringstester ska minst täcka:

- v1-projekt utan `visible`/`locked`
- v2-projekt med `visible`/`locked`
- v2-mätning utan kategori
- v2-area utan `areaMode`
- v3-projekt med count-objekt

## 3. Kategori och rum

### Skapande

När ett mätverktyg är aktivt visas kategori och rum i kontextraden:

```text
[Kategori: Golv ▾] [Rum: ____________]
```

- Kategori defaultar till projektets `defaultCategory`, annars `other`.
- Senast använda kategori kan hållas kvar under sessionen.
- Rum är fritext med autocomplete från redan använda rum.
- Tomt rum är tillåtet.
- När ett objekt skapas sparas aktuell kategori och aktuellt rum.

### Redigering

I Properties för en mätning:

- kategori-väljare
- rum-fält
- för area: add/subtract
- för count: count-typ

Vid flerval av endast mätningar:

- massändra kategori
- massändra rum
- massändra areaMode om alla är area
- massändra countType om alla är count

Blandade mätningar och ritobjekt ska inte erbjuda kategori/rum för hela selectionen. En massändring av kategori/rum ska vara ett undo-steg.

## 4. Antalsverktyg

Lägg till ett `count`-verktyg i verktygsraden.

Flöde:

1. Välj Count.
2. Välj count-typ i kontextraden.
3. Klicka på ritningen.
4. Ett count-objekt skapas på den valda punkten.

Rendering:

- inbyggd symbol per count-typ
- tydlig färg från lagret eller objektet
- etikett och count-typ i Markups-listan
- hidden/locked följer samma regler som övriga objekt

Hit-test:

- count träffas inom en fast radie i PDF-punkter, skalad med zoom
- dolda count-objekt träffas inte
- låsta count-objekt kan markeras men inte flyttas eller raderas

Export:

- count ritas som vektor i PDF-exporten
- count ingår i PNG-exporten
- count ingår i mängdförteckningen
- hidden/locked följer befintliga exportregler

## 5. Avdragsarea

Area får en `areaMode`:

- `add` – läggs till bruttoarean
- `subtract` – dras av

UI:

- toggle i Properties
- toggle i kontextraden när Area-verktyget är aktivt
- tydlig visuell skillnad i Markups-listan, exempelvis “Avdrag”
- canvas kan visa areaobjektet med samma färg men med en diskret markering eller etikett

Beräkning per grupp:

```text
grossAdd = sum(area där areaMode = add)
grossSubtract = sum(area där areaMode = subtract)
net = grossAdd - grossSubtract
```

För beställningsunderlag rekommenderas:

```text
net = max(0, grossAdd - grossSubtract)
```

Om `grossSubtract > grossAdd` ska rapporten visa en varning och både brutto, avdrag och netto, så att användaren kan rätta underlaget.

Detta är ett beslut som ska fastställas innan implementation.

## 6. Summering

Lägg till en ny flik i vänsterpanelen: **Mängder**.

### Standardgruppering

Rapportrader:

- kategori
- rum
- mängdtyp: längd, area eller antal

Det ger en hanterbar rapport. Lager och sida ska i första hand vara filter, inte egna raddimensioner.

Filter:

- sida: aktuell sida / alla sidor
- lager
- kategori
- rum
- endast synliga objekt

### Synlighet

Summeringen ska som standard använda samma synlighetsregler som export:

- dolda objekt räknas inte
- dolda lager räknas inte
- låsta objekt räknas

Om dolda objekt exkluderas ska panelen visa en diskret information om att dolda mängder inte ingår.

### Visning

Per rad:

- kategori
- rum
- mängdtyp
- enhet
- brutto
- avdrag
- netto
- antal objekt

Summering:

- per kategori
- per rum
- totalsumma per mängdtyp

Sortering:

1. fast kategoriordning
2. rum alfabetiskt
3. mängdtyp längd, area, antal

## 7. Svinn och avrundning – Etapp 2B

Projektstandard:

- `wastePercent`
- `roundingStep`

Kategoriöverstyrning:

- samma två fält per kategori

Formel:

```text
wasteQuantity = net * (wastePercent / 100)
rawOrderQuantity = net + wasteQuantity
orderQuantity = ceil(rawOrderQuantity / roundingStep) * roundingStep
```

Rekommendation:

- avrunda alltid uppåt för beställningsmängd
- `roundingStep` ska vara större än noll
- count avrundas till hela styck
- visa netto, svinn och beställningsmängd separat
- rapporten ska aldrig visa en beställningsmängd som är lägre än nettomängden

## 8. Mängdförteckning

### CSV

CSV ska vara första exportformat.

Kolumner:

```text
category
room
quantity_type
unit
gross
deduction
net
waste_percent
waste_quantity
rounding_step
order_quantity
item_count
notes
```

En rad per kategori + rum + mängdtyp.

Krav:

- UTF-8 med BOM om Excel-kompatibilitet behövs
- semikolon eller komma enligt vald standard
- belopp och mängder med stabil decimalformatering
- dolda objekt och dolda lager utesluts
- projektmetadata och PDF-referens finns med i filen eller i en separat metadata-sektion

### PDF

Utskriftsvänlig rapport med:

- projektnamn
- PDF-filnamn
- datum
- eventuell källa till skala
- tabell per kategori/rum
- netto, svinn och beställningsmängd
- notering om dolda objekt uteslutits

PDF-rapporten är en separat funktion från PDF-exporten av ritningen. Den senare ligger i Etapp 3.

### XLSX

XLSX införs endast om CSV inte räcker. Det kräver ny dependency och mer arbete med formatering, formler och underhåll. CSV kan öppnas direkt i Excel och är därför första val.

## 9. Filer som påverkas

- `src/model/types.ts`
- `src/model/measure.ts`
- `src/model/layers.ts`
- `src/model/hitTest.ts`
- `src/model/geometry.ts`
- `src/model/units.ts`
- `src/state/store.ts`
- `src/canvas/CanvasView.ts`
- `src/app/App.ts`
- `src/ui/panels.ts`
- `src/ui/shell.ts`
- `src/ui/icons.ts`
- `src/styles.css`
- `src/io/projectFile.ts`
- `src/io/csvExport.ts` eller motsvarande
- `src/pdf/pdfExport.ts`
- `src/model/quantity.ts` (ny)
- `src/model/report.ts` (ny)
- tester för mängdberäkning, migrering och export
- `README.md`

## 10. Genomförandeordning

### 2A

1. Datamodell, schema v3 och migrering
2. Kategori och rum på mätningar
3. Count-typ, verktyg, rendering och hit-test
4. Avdragsarea
5. Summeringsmodell och Mängder-panel
6. Massredigering av kategori, rum, areaMode och countType
7. `yd²`
8. Tester och dokumentation

### 2B

1. Svinn och avrundning i settings
2. Beräkning av beställningsmängd
3. CSV-export
4. Utskriftsvänlig PDF-rapport
5. Exportfilter och metadata
6. Tester, README och slutvalidering

## 11. Acceptanskriterier

- En mätning kan tilldelas kategori och rum.
- Kategori och rum kan massredigeras på flera mätningar i ett undo-steg.
- Count-objekt kan skapas, markeras, flyttas och raderas enligt samma synlighets- och låsregler som andra objekt.
- Count-objekt ritas och exporteras korrekt.
- Area kan markeras som add eller subtract.
- Nettomängd beräknas korrekt per kategori och rum.
- Avdrag och brutto visas separat.
- Mängder-panelen exkluderar dolda objekt och dolda lager.
- Låsta objekt ingår i summeringen men kan inte redigeras.
- `yd²` fungerar i beräkningar och export.
- v1- och v2-projekt kan öppnas och migreras till v3.
- Svinn och avrundning ger en beställningsmängd som aldrig understiger nettomängden.
- CSV innehåller netto, svinn och beställningsmängd.
- PDF-rapporten går att skriva ut och innehåller projektmetadata.
- Alla befintliga tester fortsätter att gå igenom.
- `npx tsc --noEmit`, `npm test -- --run`, `npm run build`, `cargo fmt --check`, `cargo check` och Tauri-build går igenom.

## 12. Risker

- **Scope:** Etapp 2 är stor. Delningen i 2A/2B är viktig.
- **Avdragsregler:** otydliga regler ger fel beställningsunderlag. Fastställ klampning och varning tidigt.
- **Rapportgruppering:** för många dimensioner gör rapporten svårläst. Använd kategori + rum som rader och lager/sida som filter.
- **Enheter:** count, längd och area måste hållas tydligt åtskilda i summering och export.
- **Migrering:** äldre mätningar saknar kategori och areaMode. Testa v1 och v2.
- **Excel:** XLSX kan bli en onödig stor dependency. CSV först.
- **Synlighet:** summering och export måste använda exakt samma regler som canvas.

## 13. Öppna beslut

1. Ska kategorilistan vara fast eller användarredigerbar?
2. Ska kategori vara obligatorisk från första början?
3. Ska avdragsarea klampas till noll per grupp?
4. Ska svinn vara procent eller fast mängd per kategori?
5. Ska avrundning alltid ske uppåt?
6. Ska `room` vara helt fritt eller väljas från en lista med skapade rum?
7. Ska Mängder-panelen ligga i vänster dock eller i en egen rapportvy?
8. Ska PDF-rapporten byggas med HTML-utskrift eller direkt i pdf-lib?
9. Ska CSV använda komma eller semikolon som avgränsare?
