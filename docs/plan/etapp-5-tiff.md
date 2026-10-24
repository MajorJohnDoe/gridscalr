# Etapp 5 – TIF-ritningar och flera dokument

**Status:** fastställd 2026-10-24. Besluten nedan är låsta för Etapp 5. Etapp 5 höjer projektformatet till schema v6.

## Mål

Göra det möjligt att mäta på skannade TIF-ritningar, som kommunala detaljplaner och bygglovsritningar, utan att konvertera dem manuellt först. Samtidigt ska ett projekt kunna innehålla flera ritningsblad, oavsett om bladen kommer från PDF eller TIF.

Etapp 5 omfattar:

- Öppna `.tif`/`.tiff` som ett ritningsdokument med egen sidstorlek, sidnavigering och kalibrering.
- Förlustfri konvertering av CCITT G4-data till PDF utan att avkoda pixeldata i JavaScript.
- Flera källdokument i ett projekt, med sidor som läggs till i slutet.
- Bäddad PDF för TIF-dokument så att projektfilen förblir portabel.
- Schema v6 med migrering från v5 och tidigare.

Etapp 5 omfattar inte:

- PDF-geometrisnapp. Det är en separat spike (S2).
- TIF som bildobjekt på en befintlig sida. TIF är alltid ett dokument.
- Ändring av sidordning, infogning av sidor i mitten eller borttagning av dokument.
- Redigering av TIF-innehåll (rotation i efterhand, beskärning, färgkorrigering).
- Geo-referering via `.tfw` eller världsfiler.

## Beslut

### TIF är ett dokument, inte en bild

En TIF-ritning öppnas som ett dokument med egna sidor. Det krävs för att ritningen ska få pappersformat, egen skala, sidnavigering och korrekt kalibrering. En bildstämpel på en befintlig sida ger ingen av detta.

Bildinfrastrukturen från Etapp 4 används inte för TIF-indata. Den används däremot indirekt när en TIF-sida ska ritas, eftersom konverteringen producerar en vanlig PDF.

### A1 – förlustfri CCITT G4-passthrough

Konverteringen skriver TIFF:ens komprimerade G4-data direkt som PDF-bildströmmar. Ingen pixeldata passerar JavaScript-minnet.

- Per sida skapas en PDF-sida med storleken `pixlar / DPI × 72` punkter.
- Varje TIFF-strip blir en egen bild-XObject:

  ```text
  /Type /XObject /Subtype /Image
  /Width <columns> /Height <rows>
  /BitsPerComponent 1 /ColorSpace /DeviceGray
  /Filter /CCITTFaxDecode
  /DecodeParms << /K -1 /Columns <columns> /Rows <rows> /BlackIs1 <bool> >>
  ```

- `PhotometricInterpretation 0` (WhiteIsZero) ger `BlackIs1 false`. `1` (BlackIsZero) ger `BlackIs1 true`. Ingen `/Decode`-array används.
- Strips staplas som separata XObjects på rätt y-offset. Det hanterar filer med `RowsPerStrip` mindre än bildhöjden utan att något avkodas eller rekomprimeras.
- En fil med en enda strip blir ett enda objekt.
- Filens komprimerade data kopieras en gång, vilket för de aktuella ritningarna innebär några hundra kilobyte per blad.

Om en TIF inte kan skrivas förlustfritt (annan komprimering, annat bitdjup) ska importen ge ett tydligt fel i första versionen. En avkodande fallback via UTIF till PNG-baserad PDF är en senare utökning, inte en del av Etapp 5.

### Flera dokument i ett projekt

Ett projekt får innehålla flera källdokument. Ett dokument är antingen en refererad PDF eller en TIF som konverterats till en bäddad PDF.

- PDF-dokument refereras som idag: `path` + `sha256`. Originalfilen skrivs aldrig över.
- TIF-dokument bär sin härledda PDF i `embeddedPdf` (base64) och refererar originalfilen via `path` + `sha256` för spårbarhet.
- Ett TIF-projekt fungerar även om originalfilen flyttas eller tas bort, eftersom den härledda PDF:en är inbäddad.
- Ett PDF-projekt kräver fortfarande att alla refererade PDF:er finns. Det är samma krav som före Etapp 5, nu per dokument.

### Sidordning är append-only

Sidor får bara läggas till i slutet av projektet. De får aldrig infogas, flyttas eller tas bort.

Anledningen är att mätobjekt refererar sidindex. Infogning skulle tyst flytta varje befintlig mätning till fel sida. Regeln gäller även när ett dokument läggs till med flera sidor: alla dess sidor hamnar sist, i dokumentets egen ordning.

Sidindex är globalt och fortsätter över dokumentgränser. Ett projekt med en PDF på 3 sidor och en TIF på 2 sidor har sidorna 1–5, där 4–5 tillhör TIF:en.

### Sidstorlek från DPI

- `PDF-punkter = pixlar × 72 / DPI`, avrundat till två decimaler.
- X- och Y-upplösning används var för sig när båda finns. Saknas upplösning antas 300 DPI och importen varnar.
- Exempel: `12128 × 8072` vid 345 DPI ger `2531,06 × 1684,59` pt. `13392 × 9432` vid 400 DPI ger `2410,56 × 1697,76` pt.
- DPI ger pappersformat, inte ritningsskala. En A1-scan i 1:100 måste fortfarande kalibreras mot ett känt mått, precis som en PDF.

### Orientering och förhandsvisnings-IFD:er

- IFD:er med `NewSubfileType` bit 0 satt är reducerade förhandsvisningar och hoppas över. De blir aldrig egna sidor.
- `Orientation` hanteras: `1` används som den är, `3` roteras 180°, `6` roteras 90° medurs och `8` roteras 90° moturs. Rotationen görs genom att sätta PDF-sidans `/Rotate`, inte genom att rita om bilden.
- Övriga orienteringsvärden avvisas med ett tydligt fel i stället för att riskera en tyst felritning.

### Gränser och fel

- TIF-dokument omfattas inte av bildgränserna 20 MB och 4000 px. De gäller bildobjekt.
- Importgräns: högst **400 megapixlar** per sida och **200 MB** per fil.
- Felmeddelandet ska namnge filen och orsaken, till exempel okänd komprimering, saknad DPI eller ogiltig orientation.
- Format avgörs på filens magic bytes (`II*\0` eller `MM\0*`), inte på filändelsen, så att felnamngivna filer ger ett begripligt fel.

## Datamodell (schema v6)

```ts
export type DocumentKind = "pdf" | "tiff";

export interface DocumentRef {
  id: string;
  kind: DocumentKind;
  name: string;
  path: string | null;
  relativePath: string | null;
  /** Källans hash. För TIF är detta originalfilens hash, inte den härledda PDF:en. */
  sha256: string;
  pageCount: number;
  sizeBytes: number;
  /** Endast kind:"tiff". Base64-kodad härledd PDF. */
  embeddedPdf?: string;
  /** Endast kind:"tiff". */
  source?: {
    format: "tiff";
    dpi: number[];
    originalName: string;
  };
}

export interface Project {
  schemaVersion: typeof SCHEMA_VERSION;
  documents: DocumentRef[];      // minst ett
  pages: Record<string, PageState>; // globalt sidindex, "1".."N"
  // övriga fält oförändrade
}
```

`Project.document` tas bort. All kod som läser `project.document.pageCount` ersätts med en härledd summa, till exempel `totalPageCount(project)`.

## Migrering v5 → v6

- `document` flyttas till `documents[0]` och får `kind: "pdf"` samt ett `id`.
- Sidnycklarna `"1"`…`"N"` är oförändrade, så kalibrering och skallås bevaras.
- `document.pageCount` valideras mot antalet sidnycklar som redan finns.
- Projekt utan `document` avvisas som tidigare.
- Migreringstester krävs för v5 → v6 och för round-trip i v6, enligt regeln om aktuell och närmast föregående version.

## Importflöde

- `Open drawing` accepterar PDF, TIF och TIFF.
- Drag-and-drop fungerar som i dag, både via Tauri-event och DOM-fallback.
- Med ett projekt öppet lägger importen till sidor i stället för att ersätta. Dialogen visar källa och antal sidor och bekräftar att sidorna hamnar sist.
- Utan öppet projekt skapas ett nytt projekt med dokumentet som första dokument.
- Efter import blir den första nya sidan aktiv.
- Statusraden visar vilket dokument den aktuella sidan tillhör.

## Export och rapporter

- Ritnings-PDF:en kopierar källsidor per dokument med `pdf-lib.copyPages` innan markeringar plattas ut. Den härledda TIF-PDF:en kopieras som vanliga PDF-sidor.
- Beskärning, sidintervall, lagerval, etiketter och teckenförklaring fungerar oförändrat över dokumentgränser.
- Mängdrapporter räknar alla sidor i projektet, oavsett dokument.
- `applyToAll` för skala går över alla dokument. Ingen skala antas gälla mellan dokument.
- En refererad PDF som saknas vid export ger samma tydliga fel som i dag, nu med dokumentets namn.

## S1 – spike innan implementation

S1 är **genomförd 2026-10-24** på branchen `spike/tiff-ccitt-passthrough` och merged inte. Prototypen finns i `scripts/spike/tiff-g4.mjs` och fynden i `spike-s1-tiff.md`.

Acceptanskriterier och utfall:

| Kriterium | Krav | Utfall |
|---|---|---|
| Konverteringstid | < 2 s | 6–18 ms |
| Peak-minne | < 100 MB | 51–53 MB |
| Bildobjekt | matchar IFD | 1 respektive 37 XObjects |
| Pixelidentitet mot libtiff | < 0,1 % | 0,000 % |
| Sidstorlek mot DPI | exakt | `2531,06 × 1684,59` och `2410,56 × 1697,76` pt |

A1 håller. Tre fynd styr implementationen:

1. **PDF.js 6 avkodar CCITT via WASM.** Utan `wasmUrl` ritas en tom sida utan att något fel kastas. Etapp 5 måste kopiera `pdfjs-dist/wasm/` till `public/wasm/` och skicka `wasmUrl` från `loadPdfDocument`. Detta gäller även JBIG2-bilder i vanliga PDF:er.
2. **`BlackIs1`:** `Photometric 0` (WhiteIsZero) kräver `false`, annars blir ritningen inverterad.
3. **`EndOfBlock false`:** TIFF-strips saknar ofta EOFB, så `Rows` måste styra avkodningen.

Verifieringen ska göras med appens egen renderare. Poppler låg en rad fel på vissa strips i `Sitplan`, medan PDF.js var pixelidentisk.

Testfilerna ligger i `temp_test_plans/`, som är gitignorerad och aldrig committas. De tre filerna är 1-bitars bilevel med CCITT G4, 12128 × 8072 vid 345 DPI respektive 13392 × 9432 vid 400 DPI, en sida vardera.

## Genomförandeordning

1. Schema v6: typer, `documents`, normalisering, migrering och migreringstester.
2. Dokumentregister i storen: aktivt dokument per sida, total sidräkning, append-only-skydd.
3. TIF-läsare: IFD-parsning, magic bytes, DPI, orientation, `NewSubfileType`, gränser.
4. A1-konvertering: PDF-skapande med CCITT-passthrough, strips, `BlackIs1`.
5. Renderer: ladda flera dokument, slå upp sida per globalt index, cachelagring per dokument. Kopiera `pdfjs-dist/wasm/` till `public/wasm/` och skicka `wasmUrl` i `loadPdfDocument`, annars blir CCITT-sidor tomma.
6. Importflöde: filväljare, drop, tilläggsdialog, aktiv sida efter import.
7. Export och rapporter över dokumentgränser.
8. UI: statusradens dokumentnamn, sidnavigering, felmeddelanden.
9. Tester: migrering, IFD-tolkning, sidstorlek, sidindex, append-only, exportordning.
10. README, roadmap, AGENTS och denna plan.

## Testkrav

- Ett v5-projekt med en PDF laddas som v6 med ett dokument och oförändrade sidnycklar.
- Ett v6-projekt med en refererad PDF och ett bäddat TIF-dokument bevaras genom serialize/parse.
- TIF utan giltig G4-komprimering avvisas med tydligt fel.
- Förhandsvisnings-IFD:er blir inga sidor.
- Orientation 1, 3, 6 och 8 ger rätt `/Rotate`; övriga avvisas.
- Sidstorlek räknas ut från DPI och avrundas korrekt.
- Att lägga till ett dokument med tre sidor ger sidindex som fortsätter efter befintliga sidor.
- Mätningar på befintliga sidor behåller sina sidindex efter tillägg.
- Dolda lager och objekt på ett tillagt dokument följer samma synlighets- och låsregler som i dag.
- Export över två dokument bevarar sidordning och beskärning.
