# GridScalr – Roadmap och etappindelning

## Status

- **Etapp 1 – Lager, urval och objektkontroll:** genomförd.
- **Etapp 2 – Mängddata och beställningsunderlag:** genomförd. Etapp 2A gav kategorier, schema v3, rum, antalsverktyg, avdragsarea, Quantities-panel och massredigering. Etapp 2B lade till svinn, avrundning, beställningsmängder samt mängdförteckning som CSV och utskriftsvänlig PDF.
- **Etapp 3 – Mätverktyg, skala och export:** genomförd. 3A gav snabbarea, manuell skala, skallås och snap. 3B gav exportdialogen med sidval, beskärningsruta, lagerval, etiketter, kalibreringslinje och teckenförklaring.
- **Etapp 4 – Bilder:** genomförd. Etapp 4 gav inbäddade PNG/JPEG-bilder, bakgrunds- och annotationsläge, bildhandtag, opacitet, rotation samt bildinbäddning i ritnings-PDF:en. Projektformatet höjdes till schema v5.
- **Etapp 5 – TIF-ritningar och flera dokument:** genomförd. TIF-import som dokument via förlustfri CCITT G3/G4-passthrough, flera källdokument per projekt, append-only sidnumrering och schema v6.
- **0.6.1 – Symbolspråk:** genomförd. Samtliga 52 inbyggda symboler är omritade som egna klassiska skyltbrickor med fylld vektorgrafik, kategorifärgade plattor, 24 pt standardstorlek och vitringad statusbadge. Ingen schemaändring; schemat är fortfarande v13.

Etapp 2-planen finns i `etapp-2-mangddata.md`. Den är fastställd och innehåller de beslut som krävdes innan implementation, bland annat användardefinierade kategorier och klampat avdragsnetto. Samtliga steg 1–10 i genomförandeordningen är införda: kategorimodellen, schema v3, rum på mätningar, antalsverktyget, avdragsarea, Quantities-panelen, massredigeringen, svinn och avrundning samt CSV- och PDF-rapporterna. Etapp 1 finns sammanfattad längre ner i detta dokument; någon separat Etapp 1-plan finns inte i repot.

Etapp 3-planen finns i `etapp-3-matverktyg-skala-export.md` och är godkänd. 3A och 3B är genomförda. Beslutet att ”valt område” är en rektangulär beskärningsruta och att samma relativa område används vid flersidig export är låst.

Etapp 4-planen finns i `etapp-4-bilder.md` och är fastställd. Samtliga beslut om inbäddning, storleksgränser, bildlägen, lagring och export är införda.

Etapp 5-planen finns i `etapp-5-tiff.md` och är fastställd 2026-10-24. Den låser TIF som dokument, förlustfri CCITT G4-passthrough, flera dokument per projekt, append-only sidordning, bäddad TIF-PDF och schema v6. Spike S1 verifierade konverteringen före implementationen: 0,000 % pixelavvikelse mot libtiff, 6–18 ms per blad och 51–53 MB peak-minne.

## Produktprinciper

Dessa regler gäller alla etapper och ska inte omtolkas utan ett medvetet beslut:

- Appen är local-first. PDF:en refereras via sökväg och SHA-256, aldrig genom att originalfilen skrivs över.
- Dolda objekt får inte renderas, träffas av hit-test eller exporteras.
- Låsta objekt får visas och exporteras men inte redigeras, flyttas eller raderas.
- Lager har fortfarande högre prioritet än objektets egna `visible`/`locked`-flaggor.
- Mätningar och ritobjekt hålls åtskilda. Lager är antingen `measure` eller `draw`.
- En massåtgärd ska vara ett enda undo-steg.
- Projektformatet ska migreras bakåtkompatibelt. Gamla filer ska kunna öppnas efter varje schemaändring.
- Summeringar och beställningsmängder ska beräknas från objektdata, inte sparas som separata sanningar.
- Export ska använda samma synlighets- och låsregler som canvas.

## Etappöversikt

| Etapp | Mål | Status | Beroenden | Risk |
|---|---|---|---|---|
| 1 | Lager, urval och objektkontroll | Klar | – | Medel |
| 2A | Kategorier, antal, avdrag och summering | Klar | Etapp 1 | Medel |
| 2B | Svinn, avrundning och mängdförteckning | Klar | Etapp 2A | Medel |
| 3 | Snabbarea, manuell skala, snap och exportdialog | Klar | Etapp 2 | Hög |
| 4 | Bilder | Klar | Etapp 2–3 | Hög |
| 5 | TIF-ritningar och flera dokument | Klar | Etapp 2–4 | Hög |

## Etapp 1 – genomförd

Etapp 1 gav:

- tydligt mållager i kontextraden
- varning och automatiskt byte vid dolt eller låst aktivt lager
- individuell synlighet och låsning per markering
- multiselektion på canvas och i Markups-listan
- massflytt och massredigering
- copy/paste mellan sidor
- högerklicksmenyer
- schema v2 med `visible` och `locked`

Följande idéer från den ursprungliga diskussionen är **inte** genomförda och ska inte räknas som klara:

- obligatoriskt “Notes”-lager för textverktyget
- inklistring vid markören – nuvarande regel är 12 pt offset på samma sida och bibehållna koordinater mellan sidor

## Etapp 2 – Mängddata och beställningsunderlag

Etapp 2 delas i två leveranser för att minska risken och få nytta tidigt.

### Etapp 2A – Mängdmodell och summering

- Användardefinierade kategorier per projekt, med standarduppsättningen Floor, Wall, Ceiling, Facade, Roof, Ground och Other.
- Exakt en kategori per mätning, obligatorisk.
- Rum som fritext med autocomplete.
- Generiskt antalsverktyg för dörr, fönster, radiator, armatur och övrigt.
- Avdragsarea med `add`/`subtract`, netto klampat till noll med varning.
- Nettomängd och summering per kategori och rum i en Quantities-flik.
- Lager och sida används som filter, inte som obligatoriska rapportdimensioner.
- Fler areaenheter, exempelvis `yd²`.
- Schema v3 med migrering från v1/v2.

### Etapp 2B – Beställningsunderlag (genomförd)

- Svinn per projekt och kategori.
- Avrundningssteg per projekt och kategori, alltid uppåt.
- Beställningsmängd = avrundad nettomängd inklusive svinn.
- Mängdförteckning som CSV och utskriftsvänlig PDF byggd med `pdf-lib`.
- Excel/XLSX är en separat fråga och införs först om CSV inte räcker.
- Tydlig separation mellan mängdförteckning och PDF-export av själva ritningen.

Detaljer finns i `etapp-2-mangddata.md`.

## Etapp 3 – Mätverktyg, skala och export

Planen finns i `etapp-3-matverktyg-skala-export.md` och är godkänd.

**3A – genomförd:**

- Rektangel- och ellipsarea som snabbarea.
- Manuell skala med preset 1:50, 1:100, 1:200, 1:400 och egen ratio.
- Låsning av kalibrerad skala per sida.
- Snap till ändpunkt, mittpunkt, skärning mellan markup-segment och ortogonal låsning.
- Tröskelvärde i pixlar.

**3B – genomförd:**

- Exportdialog för ritning:
  - aktuell sida, alla sidor eller sidintervall
  - valt område
  - teckenförklaring
  - etiketter och kalibreringslinje
  - val av synliga lager

PDF-geometrisnapp är fortfarande en separat utredning/spike. Det kräver extrahering och indexering av vektorgeometri och ingår inte i Etapp 3.

Beslut om valt område: användaren ritar en rektangulär beskärningsruta kring den detalj som ska exporteras. Rutan klipper allt innehåll utanför sig och sparas som ett relativt område. Vid export av flera sidor används samma relativa område på varje vald sida, så att olika sidstorlekar och rotation hanteras.

Etapp 3 höjer projektformatet till schema v4 eftersom snabbarea och manuell skala inte kan tolkas säkert av äldre versioner. Etapp 4 höjer det till schema v5 för inbäddade bildassets och bildobjekt.

Viktigt: Etapp 3 får inte införa möjligheten att exportera dolda objekt om inte Etapp 1-regeln ändras genom ett uttryckligt beslut.

## Etapp 4 – Bilder

Genomförd. Planen finns i `etapp-4-bilder.md`.

- Klistra in bild från urklipp (`Ctrl/Cmd+V`) eller välj PNG/JPEG via **Image**.
- Bildobjekt med position, storlek, rotation och opacitet på `draw`-lager.
- Handtag på canvas; hörn bevarar proportionerna, sidohandtag ändrar en dimension.
- Två lägen: **bakgrund** ovanpå PDF:en men under alla markeringar, och **annotation** i vanlig lagerordning.
- Inbäddade, komprimerade bilder i `.gridscalr` med hård gräns 20 MB och 4000 px. Naturlig storlek räknas vid 96 DPI.
- PDF-export med inbäddad bild, rotation, opacitet och samma beskärning som övriga objekt.
- Undo/redo bevarar bilddata utan att duplicera den i varje snapshot.

Externa assets och fullständig z-order mellan alla objekt sköts upp. Inför externa assets först om projektfilens storlek blir ett praktiskt problem.

## Tvärgående arbete

### Schema och migrering

- Etapp 2: schema v3.
- Etapp 3: schema v4 för snabbarea, manuell skala och skallåsning.
- Etapp 4: schema v5 för inbäddade bildassets och bildobjekt.
- Etapp 5: schema v6 för flera dokument och bäddade TIF-PDF:er.
- Varje migrering ska ha tester för minst aktuell och närmast föregående version.

### Test och kvalitet

Varje etapp ska minst verifiera:

- `npx tsc --noEmit`
- `npm test -- --run`
- `npm run build`
- `cargo fmt --check`
- `cargo check`
- Tauri-build

Därutöver behövs regressionsprov för undo, synlighet, låsning, export och projektmigrering.

### Prestanda

- Summering ska kunna köras om från objektdata utan märkbar fördröjning.
- Stora projekt med många mätobjekt ska inte göra Markups-listan eller exporter oanvändbara.
- PDF-geometrisnapp och bilder är de största prestandariskerna.

## GitHub och CI

Genomfört 2026-10-21:

1. Privat repository: `https://github.com/MajorJohnDoe/gridscalr`.
2. Första commit av nuvarande kod och push till `main`.
3. Frontend-CI i `.github/workflows/ci.yml`:
   - `npm ci`
   - versionskontroll av `package.json`, `tauri.conf.json`, `Cargo.toml` och `Cargo.lock`
   - `npm test -- --run`
   - `npm run build`
4. Tauri-CI i samma workflow:
   - Ubuntu för `cargo fmt --check` och `cargo check`
5. Windows-bygge i `.github/workflows/windows-build.yml`:
   - manuell körning eller `v*`-tagg
   - `.exe`, NSIS-installer och MSI som artefakten `gridscalr-windows`
   - macOS `.dmg` är inte uppsatt ännu
6. Arbetsflöde och versionshantering finns dokumenterade i `AGENTS.md`.

Kvar att överväga: branch protection eller krav på grön CI innan merge när repot blir mer aktivt, samt en automatisk GitHub Release när versionsprocessen är fastställd.

## Öppna beslut

Beslut som rör Etapp 2, Etapp 3, Etapp 4 och Etapp 5 är fastställda och dokumenterade i respektive plan. Kvar att avgöra:

- Ska GitHub-repot vara privat eller publikt, och vem äger det?
- Ska externa bildassets införas om projektfilerna blir för stora?
- Ska TIF-filer med andra komprimeringar än CCITT G4 stödjas via en avkodande fallback?
- Ska PDF-geometrisnapp utredas som en separat spike?

## Rekommenderad nästa ordning

1. Kör spike S1 för CCITT G4-passthrough och därefter Etapp 5.
2. Utred PDF-geometrisnapp som en separat spike (S2) om behovet kvarstår.
3. XLSX-export och anpassade antalstyper som nästa funktionsetapp när Etapp 5 är klar.
4. Utvärdera externa bildassets först om inbäddade projektfiler blir praktiskt för stora.
