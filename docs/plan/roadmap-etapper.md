# GridScalr – Roadmap och etappindelning

## Status

- **Etapp 1 – Lager, urval och objektkontroll:** genomförd.
- **Etapp 2 – Mängddata och beställningsunderlag:** pågår. Etapp 2A är genomförd (kategorier, schema v3, rum på mätningar, antalsverktyg, avdragsarea, Quantities-panel och massredigering). Nästa steg är Etapp 2B.
- **Etapp 3 – Mätverktyg, skala och export:** planerad, detaljplaneras efter Etapp 2.
- **Etapp 4 – Bilder:** planerad, medvetet sist.

Etapp 2-planen finns i `etapp-2-mangddata.md`. Den är fastställd och innehåller de beslut som krävdes innan implementation, bland annat användardefinierade kategorier och klampat avdragsnetto. Kategorimodellen, schema v3, rum på mätningar, antalsverktyget, avdragsarea, Quantities-panelen och massredigeringen är införda enligt steg 1–6 i genomförandeordningen. Etapp 1 finns sammanfattad längre ner i detta dokument; någon separat Etapp 1-plan finns inte i repot.

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
| 2A | Kategorier, antal, avdrag och summering | Pågår (steg 1–5 klara) | Etapp 1 | Medel |
| 2B | Svinn, avrundning och mängdförteckning | Plan klar | Etapp 2A | Medel |
| 3 | Snabbarea, manuell skala, snap och exportdialog | Senare | Etapp 2 | Hög |
| 4 | Bilder | Sist | Etapp 2–3 | Hög |

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

### Etapp 2B – Beställningsunderlag

- Svinn per projekt och kategori.
- Avrundningssteg per projekt och kategori, alltid uppåt.
- Beställningsmängd = avrundad nettomängd inklusive svinn.
- Mängdförteckning som CSV och utskriftsvänlig PDF byggd med `pdf-lib`.
- Excel/XLSX är en separat fråga och införs först om CSV inte räcker.
- Tydlig separation mellan mängdförteckning och PDF-export av själva ritningen.

Detaljer finns i `etapp-2-mangddata.md`.

## Etapp 3 – Mätverktyg, skala och export

Planeras i detalj efter Etapp 2.

- Rektangel- och ellipsarea som snabbarea.
- Manuell skala med preset 1:50, 1:100, 1:200, 1:400 och egen ratio.
- Låsning av kalibrerad skala per sida.
- Snap till ändpunkt, mittpunkt, skärning mellan markup-segment och ortogonal låsning.
- Tröskelvärde i pixlar.
- PDF-geometrisnapp som separat utredning/spike. Det kräver extrahering och indexering av vektorgeometri och ska inte blandas in i första snapleveransen.
- Exportdialog för ritning:
  - aktuell sida, alla sidor eller sidintervall
  - valt område
  - teckenförklaring
  - etiketter och kalibreringslinje
  - val av synliga lager

Viktigt: Etapp 3 får inte införa möjligheten att exportera dolda objekt om inte Etapp 1-regeln ändras genom ett uttryckligt beslut.

## Etapp 4 – Bilder

Planeras sist eftersom bilder påverkar datamodell, rendering, hit-test, projektformat, minne och PDF-export.

- Klistra in bild eller välj bildfil.
- Bildobjekt med position, storlek, rotation och opacitet.
- Handtag och inline-kontroller.
- Bild som underlag bakom mätningar.
- PDF-export med inbäddad bild, rotation och opacitet.
- Beslut om bilden ska bäddas in i `.gridscalr` eller ligga i en projektmapp med `assets/`.

Rekommendation att utreda i Etapp 4:

- Börja med komprimerade inbäddade bilder under en hård storleksgräns.
- Inför externa assets först om filstorleken blir ett praktiskt problem.
- Börja med två bildlägen, “bakgrund” och “annotation”, i stället för fullständig z-order mellan alla objekt.

## Tvärgående arbete

### Schema och migrering

- Etapp 2: schema v3.
- Etapp 4: sannolikt schema v4.
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

Beslut som rör Etapp 2 är fastställda och dokumenterade i `etapp-2-mangddata.md`. Följande återstår inför senare etapper:

- Vad betyder “valt område” i exportdialogen i Etapp 3?
- Ska bilder bäddas in eller ligga som externa assets i Etapp 4?
- Full z-order eller endast bakgrund/annotation för bilder?
- Ska GitHub-repot vara privat eller publikt, och vem äger det?

## Rekommenderad nästa ordning

1. Genomför Etapp 2A enligt stegordningen i `etapp-2-mangddata.md`.
2. Genomför Etapp 2B.
3. Planera Etapp 3 i detalj, med PDF-snap som separat spike.
4. Genomför Etapp 4 sist.
