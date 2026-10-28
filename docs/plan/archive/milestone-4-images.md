> **Historical planning document.** Written in Swedish during implementation in 2026
> and kept for provenance. It is not maintained. See [the roadmap](../../roadmap.md)
> for the current status and [the project files guide](../../project-file.md) for the
> schema that was eventually shipped.

# Etapp 4 – Bilder

**Status:** fastställd 2026-10-23. Besluten nedan är låsta för Etapp 4. Etapp 4 höjer projektformatet till schema v5.

## Mål

Göra det möjligt att lägga in bilder i ett projekt och få dem med i canvas, projektfil och ritnings-PDF utan att äventyra lokal-först, dolda objekt eller befintliga mätdata.

Etapp 4 omfattar:

- Klistra in en bild från urklipp eller välj en bildfil.
- Bildobjekt med position, storlek, rotation och opacitet.
- Handtag på canvas och egenskaper i inspektören.
- Två bildlägen: **bakgrund** och **annotation**.
- PDF-export med inbäddad bild, rotation, opacitet och samma beskärning som övriga markeringar.

Etapp 4 omfattar inte:

- SVG, WebP eller andra format.
- Externa assets i en `assets/`-mapp.
- Full z-order mellan alla objekt.
- Redigering av bildinnehåll (beskärning, filter, färgkorrigering).
- Länkning till bildens originalfil. Bilden är en del av projektet när den har lagts in.

## Beslut

### Lagring

Bilder bäddas in i `.gridscalr` som base64-kodade data-URL:er. Projektet förblir en självbärande fil.

- Hård gräns: **20 MB per bild** efter inläsning och **max 4000 px** på längsta sidan.
- Större bilder skalas ned proportionellt och kodas om innan de accepteras. En bild som fortfarande är större än 20 MB efter kodning avvisas.
- PNG och JPEG stöds. PNG behåller genomskinlighet. JPEG kodas om med kvalitet 0,85 när den behöver skalas ned eller är större än 20 MB.
- Bildens inbäddade bytes räknas som bildens storlek. Om bilden fortfarande är större än 20 MB efter nedskalning avvisas den med ett tydligt fel.

Bilddata lagras en gång per bild i `Project.assets`. Bildobjekt refererar till en asset via id, så samma bild kan användas på flera platser utan att datan dupliceras.

Undo-historiken får inte duplicera bilddatan. Storens snapshots tar bort `data`-fältet och återställer det från en intern asset-bank vid undo/redo. Projektfilen på disk innehåller alltid hela bilddatan.

### Stapling

- **Bakgrundsbild:** ritas ovanpå PDF-innehållet men under alla markeringar och mätningar.
- **Annotationsbild:** ritas i sin lagerordning som andra ritobjekt.
- Standard för nya bilder är **bakgrund**.
- Bilder får bara ligga på `draw`-lager. `measure`-lager är reserverade för mätdata.
- Dolda lager och dolda bilder renderas, träffas och exporteras inte. Låsta bilder syns och exporteras men kan inte flyttas, ändras eller tas bort.

### Storlek och placering

- En ny bild placeras på aktuell sida.
- Om bilden i naturlig storlek är större än sidan i någon dimension, skalas den proportionellt så att den ryms på sidan. Bredden begränsar därmed breda bilder. Bilden centreras.
- Om bilden får plats behåller den sin naturliga storlek och centreras.
- Naturlig storlek räknas med **96 DPI**: `PDF-punkter = pixlar × 72 / 96` (0,75).
- Rotation är klockvis i grader. Opacitet är 0–100 % och multipliceras med lagrets opacitet.
- Hörnhandtag bevarar bildens proportioner. Sidohandtag ändrar bara en dimension.

### Inklistring

- `Ctrl+V`/`Cmd+V` klistrar in en bild när urklippet innehåller en bild.
- När urklippet inte innehåller en bild klistras markeringar in som tidigare.
- Inklistring i ett textfält eller en inmatningsruta påverkar inte canvas.
- En inklistrad bild hamnar på aktuellt `draw`-lager, eller på ett synligt och olåst `draw`-lager om det aktiva lagret inte kan ta emot bilden.

## Datamodell (schema v5)

```ts
export type ImageMode = "background" | "annotation";

export interface ImageAsset {
  id: string;
  name: string;
  mime: "image/png" | "image/jpeg";
  /** Natural pixel size after any downscaling. */
  width: number;
  height: number;
  /** Encoded byte size of the embedded image. */
  byteSize: number;
  /** data:image/...;base64,... */
  data: string;
}

export interface ImageRef {
  assetId: string;
  mode: ImageMode;
}
```

`MarkupItem` får:

```ts
kind: ItemKind; // "image" ingår
image?: ImageRef;
```

Bildobjekt använder två motstående hörn i `points`, precis som rektanglar. Det gör att befintlig geometri för bounds, rotation, resize, hit-test och PDF-koordinater kan återanvändas.

`Project` får:

```ts
assets: Record<string, ImageAsset>;
```

Schema v5:

- v4-projekt utan `assets` normaliseras till `{}`.
- Bildobjekt utan giltig asset eller två giltiga hörn tas bort vid inläsning. Ett okänt bildläge normaliseras till `background`.
- Assets utan referens behålls i filen under sessionen så att undo/redo fungerar. Ingen automatisk städning i Etapp 4.

## Rendering på canvas

- PDF-sidans bascanvas är oförändrad.
- Innehållscanvasen ritar först alla synliga bakgrundsbilder i lagerordning, därefter alla lagerobjekt i vanlig ordning. Annotationsbilder ritas i sitt lager.
- En bild cachas per asset-id och laddas om vid projektbyte.
- Bildens opacitet multipliceras med lagrets.
- Rotation sker kring bildens mitt.
- Urval, flytt, resize och rotation använder befintliga handtag. Hörn bevarar proportioner.
- Hit-test träffar hela bildytan, även om bilden är genomskinlig.

## PDF-export

`exportProjectPdf()` utökas:

1. Rita PDF-sidans originalinnehåll som idag.
2. Rita bakgrundsbilder från valda, synliga lager.
3. Rita annotationsbilder och övriga markeringar i lagerordning.
4. Rita kalibreringslinje och etiketter som idag.
5. Använd befintlig beskärning på allt.

Bilder bäddas in med `pdf-lib` (`embedPng`/`embedJpg`) och cachas per asset under exporten. `drawImage` får position, storlek, rotation och opacitet från bildobjektet. En bild som saknar data eller inte kan avkodas hoppas över utan att exporten avbryts.

Etiketter och kvantiteter påverkas inte: bilder är inte mätningar.

## UI

- **Insert image** i context bar, alltid tillgänglig när ett projekt är öppet.
- Filväljaren accepterar `.png` och `.jpg`/`.jpeg`.
- Inklistring via `Ctrl+V` enligt beslutet ovan.
- Inspektören visar för en vald bild:
  - läge (Background/Annotation)
  - opacitet
  - rotation
  - byte storlek och pixelstorlek
  - flytta till annat draw-lager
  - synlig/låst, duplicera och ta bort som övriga objekt
- Markups-listan visar bilden med namn/label och typen Image.

## Filer som påverkas

```text
src/model/types.ts          ImageAsset, ImageRef, ImageMode, schema v5
src/model/layers.ts         createProject.assets
src/model/images.ts         storlek, placering och bildhjälpare (ny)
src/model/hitTest.ts        bildhit
src/model/geometry.ts       återanvänds; eventuella bildhjälpare
src/model/clipboard.ts      bildkopior delar asset
src/state/store.ts          asset-bank, snapshots utan data, undo/redo
src/io/projectFile.ts       v5-normalisering och migrering
src/io/platform.ts          pickImage
src/io/imageIngest.ts       fil/urklipp → komprimerad asset (ny)
src/app/App.ts              insert/paste-flöde, actions
src/canvas/CanvasView.ts    rendering, cache, hit-test, resize/rotate
src/ui/panels.ts            context bar, inspektör, markups
src/ui/shell.ts             vid behov
src/styles.css              bild-UI
src/pdf/pdfExport.ts        inbäddning och ordning
```

## Genomförandeordning

1. Schema v5: typer, `assets`, normalisering, migreringstester från v4 och tidigare.
2. Store: asset-bank, snapshots utan bilddata, undo/redo, add/update-image.
3. Bildinläsning: PNG/JPEG, 20 MB, 4000 px, 96 DPI, filväljare.
4. Canvas: bakgrundspass, annotationsbilder, cache, hit-test, resize/rotate.
5. Inklistring och context bar-knapp.
6. Inspektör och markups-lista.
7. PDF-export med inbäddning, opacitet, rotation och beskärning.
8. Tester: migrering, placering, hit-test, exportordning, clipboard.
9. README, roadmap, AGENTS och denna plan.

## Testkrav

- v4-projekt utan assets laddas som v5 med tom asset-map.
- Ett bildobjekt med giltig asset bevaras genom serialize/parse.
- Bild utan asset tas bort. Ett okänt bildläge normaliseras till `background`.
- Naturlig storlek använder 96 DPI.
- Stor bild skalas proportionellt så att den ryms på sidan; liten bild behåller naturlig storlek.
- Bakgrundsbild ritas före markeringar; annotationsbild ritas i lagerordning.
- Dold bild/lager syns inte och exporteras inte. Låst bild exporteras men kan inte redigeras.
- Ctrl+V med bild skapar ett bildobjekt; utan bild klistras markeringar in.
- Undo/redo bevarar bilddata utan att snapshots duplicerar den.
- PDF-export innehåller bilden med rätt rotation, opacitet och beskärning.
