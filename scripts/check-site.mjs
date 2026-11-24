import { readFile, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "site-dist");
const baseUrl = "https://majorjohndoe.github.io/gridscalr";
const origin = "https://majorjohndoe.github.io";

const errors = [];
let checkedLinks = 0;
let checkedImages = 0;

const pairUrls = {
  home: {
    en: `${baseUrl}/`,
    sv: `${baseUrl}/sv/`,
    "x-default": `${baseUrl}/`,
  },
  features: {
    en: `${baseUrl}/features/`,
    sv: `${baseUrl}/sv/funktioner/`,
    "x-default": `${baseUrl}/features/`,
  },
  area: {
    en: `${baseUrl}/area-takeoff/`,
    sv: `${baseUrl}/sv/mata-area/`,
    "x-default": `${baseUrl}/area-takeoff/`,
  },
  cards: {
    en: `${baseUrl}/operation-cards/`,
    sv: `${baseUrl}/sv/driftkort/`,
    "x-default": `${baseUrl}/operation-cards/`,
  },
  qty: {
    en: `${baseUrl}/quantity-takeoff/`,
    sv: `${baseUrl}/sv/mangdning/`,
    "x-default": `${baseUrl}/quantity-takeoff/`,
  },
  guides: {
    en: `${baseUrl}/guides/`,
    sv: `${baseUrl}/sv/guider/`,
    "x-default": `${baseUrl}/guides/`,
  },
  guideArea: {
    en: `${baseUrl}/guides/area-pdf/`,
    sv: `${baseUrl}/sv/guider/mata-area-pdf/`,
    "x-default": `${baseUrl}/guides/area-pdf/`,
  },
  guideCalibrate: {
    en: `${baseUrl}/guides/calibrate-drawing/`,
    sv: `${baseUrl}/sv/guider/kalibrera-ritning/`,
    "x-default": `${baseUrl}/guides/calibrate-drawing/`,
  },
  guideWaste: {
    en: `${baseUrl}/guides/waste-and-rounding/`,
    sv: `${baseUrl}/sv/guider/spill-och-avrundning/`,
    "x-default": `${baseUrl}/guides/waste-and-rounding/`,
  },
  guideTakeoff: {
    en: `${baseUrl}/guides/what-is-takeoff/`,
    sv: `${baseUrl}/sv/guider/vad-ar-mangdning/`,
    "x-default": `${baseUrl}/guides/what-is-takeoff/`,
  },
  guideOpcard: {
    en: `${baseUrl}/guides/what-is-an-operation-card/`,
    sv: `${baseUrl}/sv/guider/vad-ar-ett-driftkort/`,
    "x-default": `${baseUrl}/guides/what-is-an-operation-card/`,
  },
  guideTif: {
    en: `${baseUrl}/guides/tif-drawing/`,
    sv: `${baseUrl}/sv/guider/tif-ritning/`,
    "x-default": `${baseUrl}/guides/tif-drawing/`,
  },
  guideCompare: {
    en: `${baseUrl}/guides/compare-revisions/`,
    sv: `${baseUrl}/sv/guider/jamfora-ritningar/`,
    "x-default": `${baseUrl}/guides/compare-revisions/`,
  },
  guideDeviation: {
    en: `${baseUrl}/guides/mark-a-deviation/`,
    sv: `${baseUrl}/sv/guider/markera-avvikelse/`,
    "x-default": `${baseUrl}/guides/mark-a-deviation/`,
  },
  compareBluebeam: {
    en: `${baseUrl}/compare/bluebeam/`,
    sv: `${baseUrl}/sv/jamfor/bluebeam/`,
    "x-default": `${baseUrl}/compare/bluebeam/`,
  },
  guideGrossNet: {
    en: `${baseUrl}/guides/gross-and-net-area/`,
    sv: `${baseUrl}/sv/guider/bruttoarea-nettoarea/`,
    "x-default": `${baseUrl}/guides/gross-and-net-area/`,
  },
  guideCardFields: {
    en: `${baseUrl}/guides/operation-card-fields/`,
    sv: `${baseUrl}/sv/guider/driftkort-mall/`,
    "x-default": `${baseUrl}/guides/operation-card-fields/`,
  },
  guideVentilation: {
    en: `${baseUrl}/guides/operation-card-ventilation/`,
    sv: `${baseUrl}/sv/guider/driftkort-ventilation/`,
    "x-default": `${baseUrl}/guides/operation-card-ventilation/`,
  },
  guideRoomArea: {
    en: `${baseUrl}/guides/room-areas/`,
    sv: `${baseUrl}/sv/guider/rumsarea/`,
    "x-default": `${baseUrl}/guides/room-areas/`,
  },
  compareExcel: {
    en: `${baseUrl}/compare/excel/`,
    sv: `${baseUrl}/sv/jamfor/excel/`,
    "x-default": `${baseUrl}/compare/excel/`,
  },
};

const pages = [
  {
    file: "index.html",
    lang: "en",
    kind: "home",
    pair: "home",
    canonical: pairUrls.home.en,
    title: "GridScalr — area, operation cards and quantity takeoff",
    description:
      "Measure areas in PDF and TIF drawings, draw operation cards and take off order quantities — locally. Calibrate, subtract deductions and export to Excel or PDF.",
    titleTerms: ["area", "operation cards", "quantity takeoff"],
    h1Terms: ["measure areas", "operation cards", "quantities", "drawing"],
    metaTerms: ["areas", "pdf", "tif", "operation cards", "order quantities"],
    bodyTerms: [
      "operation card",
      "deduction",
      "waste",
      "calibration",
      "traceability",
      "order quantity",
    ],
  },
  {
    file: "sv/index.html",
    lang: "sv",
    kind: "home",
    pair: "home",
    canonical: pairUrls.home.sv,
    title: "GridScalr — mät area, driftkort och mängdning",
    description:
      "Mät area i PDF- och TIF-ritningar, rita driftkort och ta fram beställningsmängder lokalt. Kalibrera en gång, dra av schakt och exportera till Excel eller PDF.",
    titleTerms: ["area", "driftkort", "mängdning"],
    h1Terms: ["mät area", "driftkort", "mängden", "ritning"],
    metaTerms: ["area", "pdf", "tif", "driftkort", "beställningsmängder"],
    bodyTerms: ["driftkort", "avdrag", "spill", "kalibrering", "spårbarhet", "beställningsmängd"],
  },
  {
    file: "features/index.html",
    lang: "en",
    kind: "tour",
    pair: "features",
    canonical: pairUrls.features.en,
    title: "GridScalr features — PDF takeoff, counts and exports",
    description:
      "Explore GridScalr features: calibration, measurement, custom counts, count schedules, revision comparison, local OCR and CSV, Excel and PDF exports.",
    titleTerms: ["pdf", "takeoff", "counts", "exports"],
    h1Terms: ["pdf takeoff", "tif", "feature"],
    metaTerms: ["calibration", "count schedule", "revision comparison", "ocr", "pdf"],
    bodyTerms: ["pdf takeoff", "count schedule", "revision comparison", "ocr", "tif"],
  },
  {
    file: "sv/funktioner/index.html",
    lang: "sv",
    kind: "tour",
    pair: "features",
    canonical: pairUrls.features.sv,
    title: "Funktioner i GridScalr — mängdning av PDF och TIF",
    description:
      "Utforska GridScalr: kalibrering, längd- och areamätning, egna antalstyper, antalstabell, revisionsjämförelse, lokal OCR samt export till CSV, Excel och PDF.",
    titleTerms: ["funktioner", "mängdning", "pdf", "tif"],
    h1Terms: ["funktioner", "mängdning", "pdf", "tif"],
    metaTerms: ["kalibrering", "antalstabell", "revisionsjämförelse", "ocr", "pdf"],
    bodyTerms: ["mängdning", "antalstabell", "revisionsjämförelse", "ocr", "tif"],
  },
  {
    file: "area-takeoff/index.html",
    lang: "en",
    kind: "task",
    pair: "area",
    canonical: pairUrls.area.en,
    title: "Measure area on PDF drawings — calibration, deductions",
    description:
      "Measure room areas in PDF and TIF drawings: calibrate the scale, draw rectangles or polygons, subtract shafts and openings, and get net area per room.",
    titleTerms: ["area", "pdf", "drawings", "deductions"],
    h1Terms: ["measure area", "drawing", "deductions", "rooms"],
    metaTerms: ["room areas", "pdf", "tif", "calibrate", "net area"],
    bodyTerms: ["calibration", "deduction", "room", "waste", "schedule"],
  },
  {
    file: "sv/mata-area/index.html",
    lang: "sv",
    kind: "task",
    pair: "area",
    canonical: pairUrls.area.sv,
    title: "Mäta area på ritning — kalibrering, avdrag och netto",
    description:
      "Mät rumsarea i PDF- och TIF-ritningar: kalibrera skalan, rita rektangel eller polygon, dra av schakt och öppningar och få nettoarea per rum.",
    titleTerms: ["mäta area", "ritning", "kalibrering", "avdrag"],
    h1Terms: ["mät area", "ritning", "avdrag", "rum"],
    metaTerms: ["rumsarea", "pdf", "tif", "kalibrera", "nettoarea"],
    bodyTerms: ["kalibrering", "avdrag", "rum", "spill", "schema"],
  },
  {
    file: "operation-cards/index.html",
    lang: "en",
    kind: "task",
    pair: "cards",
    canonical: pairUrls.cards.en,
    title: "Operation cards for HVAC — draw them beside the plan",
    description:
      "Draw and update operation cards in the same project as the plan: A3 templates, sheet fields, schematic symbols and PDF export with layers and labels.",
    titleTerms: ["operation cards", "hvac", "plan"],
    h1Terms: ["operation card", "project", "plan"],
    metaTerms: ["operation cards", "a3", "sheet fields", "schematic symbols", "pdf"],
    bodyTerms: ["sheet", "symbols", "layers", "export", "revision"],
  },
  {
    file: "sv/driftkort/index.html",
    lang: "sv",
    kind: "task",
    pair: "cards",
    canonical: pairUrls.cards.sv,
    title: "Driftkort för ventilation — rita dem vid sidan av planen",
    description:
      "Rita och uppdatera driftkort i samma projekt som planen: A3-mallar, bladfält, schemasymboler och PDF-export med lager och etiketter.",
    titleTerms: ["driftkort", "ventilation", "planen"],
    h1Terms: ["driftkortet", "projekt", "planen"],
    metaTerms: ["driftkort", "a3", "bladfält", "schemasymboler", "pdf"],
    bodyTerms: ["blad", "symboler", "lager", "export", "revision"],
  },
  {
    file: "quantity-takeoff/index.html",
    lang: "en",
    kind: "task",
    pair: "qty",
    canonical: pairUrls.qty.en,
    title: "Quantity takeoff from drawings — net, waste and order",
    description:
      "Turn areas and counted objects into order quantities: gross, deductions, net, waste and rounding per object, exported to Excel, CSV or a print-ready PDF.",
    titleTerms: ["quantity takeoff", "drawings", "waste", "order"],
    h1Terms: ["drawing", "order quantity"],
    metaTerms: ["order quantities", "gross", "deductions", "net", "waste", "excel"],
    bodyTerms: ["quantity", "waste", "rounding", "excel", "schedule"],
  },
  {
    file: "sv/mangdning/index.html",
    lang: "sv",
    kind: "task",
    pair: "qty",
    canonical: pairUrls.qty.sv,
    title: "Mängdning från ritning — netto, spill och beställning",
    description:
      "Gör uppmätta areor och räknade objekt till beställningsmängder: brutto, avdrag, netto, spill och avrundning per objekt, exporterat till Excel, CSV eller PDF.",
    titleTerms: ["mängdning", "ritning", "netto", "spill", "beställning"],
    h1Terms: ["ritning", "beställningsmängd"],
    metaTerms: ["beställningsmängder", "brutto", "avdrag", "netto", "spill", "excel"],
    bodyTerms: ["mängd", "spill", "avrundning", "excel", "schema"],
  },
  {
    file: "guides/index.html",
    lang: "en",
    kind: "guide",
    pair: "guides",
    canonical: pairUrls.guides.en,
    title: "Guides for area, operation cards and quantities",
    description:
      "Step-by-step guides for measuring areas in PDF drawings, calibrating a drawing, operation cards and quantity takeoff with waste and rounding.",
    titleTerms: ["guides", "area", "operation cards", "quantities"],
    h1Terms: ["guides", "drawing"],
    metaTerms: ["guides", "areas", "pdf", "operation cards", "quantity takeoff"],
    bodyTerms: ["measure area", "quantity takeoff", "calibrate a drawing"],
  },
  {
    file: "sv/guider/index.html",
    lang: "sv",
    kind: "guide",
    pair: "guides",
    canonical: pairUrls.guides.sv,
    title: "Guider för area, driftkort och mängdning",
    description:
      "Steg-för-steg-guider för att mäta area i PDF-ritningar, kalibrera en ritning, rita driftkort och ta fram mängder med spill och avrundning.",
    titleTerms: ["guider", "area", "driftkort", "mängdning"],
    h1Terms: ["guider", "ritningen"],
    metaTerms: ["guider", "area", "pdf", "driftkort", "mängder"],
    bodyTerms: ["mäta area", "mängdning", "kalibrera", "driftkort"],
  },
  {
    file: "guides/area-pdf/index.html",
    lang: "en",
    kind: "guide",
    pair: "guideArea",
    canonical: pairUrls.guideArea.en,
    title: "Measure area in a PDF drawing — step by step",
    description:
      "How to measure area in a PDF drawing: calibrate the scale, draw a rectangle or polygon, subtract shafts and openings, and check the net area before export.",
    titleTerms: ["area", "pdf", "step"],
    h1Terms: ["measure area", "pdf"],
    metaTerms: ["calibrate", "rectangle", "polygon", "shafts", "net area"],
    bodyTerms: ["calibrate", "deduction", "net area", "room", "waste"],
  },
  {
    file: "sv/guider/mata-area-pdf/index.html",
    lang: "sv",
    kind: "guide",
    pair: "guideArea",
    canonical: pairUrls.guideArea.sv,
    title: "Mäta area i PDF — steg för steg med kalibrering",
    description:
      "Så mäter du area i en PDF-ritning: kalibrera skalan, rita rektangel eller polygon, dra av schakt och kontrollera nettoarean före export. Steg för steg.",
    titleTerms: ["mäta area", "pdf", "kalibrering"],
    h1Terms: ["mäta area", "pdf-ritning"],
    metaTerms: ["kalibrera", "rektangel", "polygon", "schakt", "nettoarea"],
    bodyTerms: ["kalibrera", "avdrag", "nettoarea", "rum", "spill"],
  },
  {
    file: "guides/calibrate-drawing/index.html",
    lang: "en",
    kind: "guide",
    pair: "guideCalibrate",
    canonical: pairUrls.guideCalibrate.en,
    title: "Calibrate a drawing: 1:50, 1:100 and 1:400",
    description:
      "Calibrate a PDF or TIF drawing against a known dimension or the printed scale, check it against a second dimension, and lock the scale per sheet.",
    titleTerms: ["calibrate", "1:50", "1:100", "1:400"],
    h1Terms: ["calibrate", "drawing", "1:50", "1:100"],
    metaTerms: ["calibrate", "pdf", "tif", "known dimension", "printed scale"],
    bodyTerms: ["calibration", "scale", "dimension", "lock", "sheet"],
  },
  {
    file: "sv/guider/kalibrera-ritning/index.html",
    lang: "sv",
    kind: "guide",
    pair: "guideCalibrate",
    canonical: pairUrls.guideCalibrate.sv,
    title: "Kalibrera en ritning – skala 1:50, 1:100 och 1:400",
    description:
      "Kalibrera en PDF- eller TIF-ritning mot ett känt mått eller utskriven skala, kontrollera mot ett andra mått och lås skalan per sida.",
    titleTerms: ["kalibrera", "1:50", "1:100", "1:400"],
    h1Terms: ["kalibrera", "ritning", "1:50"],
    metaTerms: ["kalibrera", "pdf", "tif", "känt mått", "utskriven skala"],
    bodyTerms: ["kalibrering", "skala", "dimension", "lås", "sida"],
  },
  {
    file: "guides/waste-and-rounding/index.html",
    lang: "en",
    kind: "guide",
    pair: "guideWaste",
    canonical: pairUrls.guideWaste.en,
    title: "Quantity takeoff with waste and rounding",
    description:
      "How to calculate waste, rounding and order quantity from the net area: per object, not per report. A worked example and a checklist before export.",
    titleTerms: ["quantity takeoff", "waste", "rounding"],
    h1Terms: ["quantity takeoff", "waste", "rounding"],
    metaTerms: ["waste", "rounding", "order quantity", "net area", "per object"],
    bodyTerms: ["waste", "rounding", "net", "order quantity", "deduction"],
  },
  {
    file: "sv/guider/spill-och-avrundning/index.html",
    lang: "sv",
    kind: "guide",
    pair: "guideWaste",
    canonical: pairUrls.guideWaste.sv,
    title: "Mängdning med spill och avrundning – rätt beställning",
    description:
      "Så räknar du spill, avrundning och beställningsmängd från nettoarean: per objekt, inte per rapport. Räkneexempel och checklista före export.",
    titleTerms: ["mängdning", "spill", "avrundning"],
    h1Terms: ["mängdning", "spill", "avrundning"],
    metaTerms: ["spill", "avrundning", "beställningsmängd", "nettoarea", "per objekt"],
    bodyTerms: ["spill", "avrundning", "netto", "beställningsmängd", "avdrag"],
  },
  {
    file: "guides/what-is-takeoff/index.html",
    lang: "en",
    kind: "guide",
    pair: "guideTakeoff",
    canonical: pairUrls.guideTakeoff.en,
    title: "What is quantity takeoff? Definition and workflow",
    description:
      "Quantity takeoff turns measurements into order quantities. Learn what takeoff means, who does it, and how areas, counts and waste become a purchase list.",
    titleTerms: ["quantity takeoff", "definition", "workflow"],
    h1Terms: ["quantity takeoff"],
    metaTerms: ["takeoff", "order quantities", "areas", "counts", "waste"],
    bodyTerms: ["quantity takeoff", "deduction", "waste", "room", "order quantity"],
  },
  {
    file: "sv/guider/vad-ar-mangdning/index.html",
    lang: "sv",
    kind: "guide",
    pair: "guideTakeoff",
    canonical: pairUrls.guideTakeoff.sv,
    title: "Vad är mängdning? Definition och arbetsgång",
    description:
      "Mängdning gör ritningens mått till beställningsmängder. Lär dig vad mängdning betyder, vem som gör den och hur areor, antal och spill blir en inköpslista.",
    titleTerms: ["mängdning", "definition", "arbetsgång"],
    h1Terms: ["mängdning"],
    metaTerms: ["mängdning", "beställningsmängder", "areor", "antal", "spill"],
    bodyTerms: ["mängdning", "avdrag", "spill", "rum", "beställningsmängd"],
  },
  {
    file: "guides/what-is-an-operation-card/index.html",
    lang: "en",
    kind: "guide",
    pair: "guideOpcard",
    canonical: pairUrls.guideOpcard.en,
    title: "What is an operation card? HVAC documentation",
    description:
      "An operation card records how an HVAC system is built, set and maintained. See what the card contains, who uses it, and how to draw one in GridScalr.",
    titleTerms: ["operation card", "hvac", "documentation"],
    h1Terms: ["operation card"],
    metaTerms: ["hvac", "operation card", "maintained"],
    bodyTerms: ["operation card", "schematic", "drawing layer", "title block", "revision"],
  },
  {
    file: "sv/guider/vad-ar-ett-driftkort/index.html",
    lang: "sv",
    kind: "guide",
    pair: "guideOpcard",
    canonical: pairUrls.guideOpcard.sv,
    title: "Vad är ett driftkort? Dokumentation för drift",
    description:
      "Ett driftkort dokumenterar hur ett ventilationssystem är byggt, inställt och skött. Se vad kortet innehåller, vem som använder det och hur du ritar det.",
    titleTerms: ["driftkort", "dokumentation", "drift"],
    h1Terms: ["driftkort"],
    metaTerms: ["driftkort", "ventilationssystem", "innehåller", "ritar"],
    bodyTerms: ["driftkort", "schema", "ritlager", "titelblock", "revision"],
  },
  {
    file: "guides/tif-drawing/index.html",
    lang: "en",
    kind: "guide",
    pair: "guideTif",
    canonical: pairUrls.guideTif.en,
    title: "Measure a scanned TIF drawing without conversion",
    description:
      "Import a scanned TIF as pages, keep CCITT G3/G4 scans lossless, calibrate the sheet and understand the derived colour cache. The source is never modified.",
    titleTerms: ["scanned tif", "conversion"],
    h1Terms: ["scanned tif", "conversion"],
    metaTerms: ["scanned tif", "ccitt", "calibrate", "cache", "source"],
    bodyTerms: ["tif", "ccitt", "calibrate", "cache", "source"],
  },
  {
    file: "sv/guider/tif-ritning/index.html",
    lang: "sv",
    kind: "guide",
    pair: "guideTif",
    canonical: pairUrls.guideTif.sv,
    title: "Mät i en skannad TIF-ritning utan konvertering",
    description:
      "Importera en skannad TIF som sidor, behåll CCITT G3/G4 förlustfritt, kalibrera bladet och förstå färgcachen. Originalfilen ändras aldrig.",
    titleTerms: ["skannad tif", "konvertering"],
    h1Terms: ["skannad tif", "konvertering"],
    metaTerms: ["skannad tif", "ccitt", "kalibrera", "cache", "originalfilen"],
    bodyTerms: ["tif", "ccitt", "kalibrera", "cache", "källan"],
  },
  {
    file: "guides/compare-revisions/index.html",
    lang: "en",
    kind: "guide",
    pair: "guideCompare",
    canonical: pairUrls.guideCompare.en,
    title: "Compare two drawing revisions before ordering",
    description:
      "Open a previous revision as a read-only reference, compare side by side or overlaid, read the difference list and export a comparison PDF. Nothing is merged.",
    titleTerms: ["drawing revisions", "ordering"],
    h1Terms: ["drawing revisions", "ordering"],
    metaTerms: ["revision", "read-only", "difference list", "comparison pdf", "merged"],
    bodyTerms: ["revision", "overlay", "difference", "comparison pdf", "merged"],
  },
  {
    file: "sv/guider/jamfora-ritningar/index.html",
    lang: "sv",
    kind: "guide",
    pair: "guideCompare",
    canonical: pairUrls.guideCompare.sv,
    title: "Jämför två ritningsrevisioner före beställning",
    description:
      "Öppna en tidigare revision som skrivskyddad referens, jämför sida vid sida eller med överlagring, läs skillnadslistan och exportera en jämförelse-PDF.",
    titleTerms: ["ritningsrevisioner", "beställning"],
    h1Terms: ["ritningsrevisioner", "beställning"],
    metaTerms: ["revision", "skrivskyddad", "skillnadslistan", "jämförelse-pdf"],
    bodyTerms: ["revision", "överlagring", "skillnads", "jämförelse-pdf", "samman"],
  },
  {
    file: "guides/mark-a-deviation/index.html",
    lang: "en",
    kind: "guide",
    pair: "guideDeviation",
    canonical: pairUrls.guideDeviation.en,
    title: "Mark a deviation on a drawing and export it",
    description:
      "Mark a site deviation on a drawing layer with a revision cloud, callout and stamp, then export a clean PDF to the contractor. The source drawing is untouched.",
    titleTerms: ["deviation", "drawing", "export"],
    h1Terms: ["deviation", "drawing", "export"],
    metaTerms: ["deviation", "drawing layer", "revision cloud", "callout", "stamp", "contractor"],
    bodyTerms: ["deviation", "drawing layer", "revision cloud", "callout", "stamp", "export"],
  },
  {
    file: "sv/guider/markera-avvikelse/index.html",
    lang: "sv",
    kind: "guide",
    pair: "guideDeviation",
    canonical: pairUrls.guideDeviation.sv,
    title: "Markera en avvikelse på ritningen och exportera",
    description:
      "Markera en avvikelse på ett ritlager med moln, hänvisning och stämpel och exportera en tydlig PDF till entreprenören. Källritningen ändras aldrig.",
    titleTerms: ["avvikelse", "ritningen", "exportera"],
    h1Terms: ["avvikelse", "ritningen", "exportera"],
    metaTerms: ["avvikelse", "ritlager", "moln", "hänvisning", "stämpel", "entreprenören"],
    bodyTerms: ["avvikelse", "ritlager", "revideringsmoln", "hänvisning", "stämpel", "export"],
  },
  {
    file: "compare/bluebeam/index.html",
    lang: "en",
    kind: "guide",
    pair: "compareBluebeam",
    canonical: pairUrls.compareBluebeam.en,
    title: "GridScalr and Bluebeam: an honest comparison",
    description:
      "Compare GridScalr and Bluebeam by task, data location, cost model and collaboration. See when Bluebeam is the better choice and verify facts with the vendor.",
    titleTerms: ["gridscalr", "bluebeam", "comparison"],
    h1Terms: ["gridscalr", "bluebeam", "comparison"],
    metaTerms: ["gridscalr", "bluebeam", "cost model", "collaboration", "vendor"],
    bodyTerms: ["gridscalr", "bluebeam", "local-first", "takeoff", "vendor"],
  },
  {
    file: "sv/jamfor/bluebeam/index.html",
    lang: "sv",
    kind: "guide",
    pair: "compareBluebeam",
    canonical: pairUrls.compareBluebeam.sv,
    title: "GridScalr och Bluebeam: en ärlig jämförelse",
    description:
      "Jämför GridScalr och Bluebeam efter uppgift, datalagring, kostnadsmodell och samarbete. Se när Bluebeam är bättre och verifiera aktuella fakta hos leverantören.",
    titleTerms: ["gridscalr", "bluebeam", "jämförelse"],
    h1Terms: ["gridscalr", "bluebeam", "jämförelse"],
    metaTerms: [
      "gridscalr",
      "bluebeam",
      "datalagring",
      "kostnadsmodell",
      "samarbete",
      "leverantören",
    ],
    bodyTerms: ["gridscalr", "bluebeam", "lokal", "mängdning", "leverantören"],
  },
  {
    file: "guides/gross-and-net-area/index.html",
    lang: "en",
    kind: "guide",
    pair: "guideGrossNet",
    canonical: pairUrls.guideGrossNet.en,
    title: "Gross area and net area: what is the difference?",
    description:
      "Gross area is what you measure; net area is what you order. See how deductions work, why waste applies to the net, and how to check both before export.",
    titleTerms: ["gross", "net", "difference"],
    h1Terms: ["gross", "net", "difference"],
    metaTerms: ["gross", "net", "deductions", "waste", "export"],
    bodyTerms: ["gross", "net", "deduction", "bta", "boa", "waste"],
  },
  {
    file: "sv/guider/bruttoarea-nettoarea/index.html",
    lang: "sv",
    kind: "guide",
    pair: "guideGrossNet",
    canonical: pairUrls.guideGrossNet.sv,
    title: "Bruttoarea och nettoarea: skillnaden och avdraget",
    description:
      "Bruttoarea är det du mäter, nettoarea det du beställer. Så fungerar avdrag, varför spill räknas på nettot och hur du kontrollerar båda före export.",
    titleTerms: ["bruttoarea", "nettoarea", "skillnaden", "avdraget"],
    h1Terms: ["bruttoarea", "nettoarea", "avdrag"],
    metaTerms: ["bruttoarea", "nettoarea", "avdrag", "spill", "export"],
    bodyTerms: ["bruttoarea", "nettoarea", "avdrag", "bta", "boa", "spill"],
  },
  {
    file: "guides/operation-card-fields/index.html",
    lang: "en",
    kind: "guide",
    pair: "guideCardFields",
    canonical: pairUrls.guideCardFields.en,
    title: "Operation card template: the fields to include",
    description:
      "A practical operation card template: property, system, date, handled by, signature, page, revision and the reference back to the plan, with a checklist.",
    titleTerms: ["operation card", "template", "fields"],
    h1Terms: ["operation card", "template", "fields"],
    metaTerms: ["property", "system", "date", "handled by", "signature", "revision"],
    bodyTerms: ["property", "system", "signature", "revision", "reference"],
  },
  {
    file: "sv/guider/driftkort-mall/index.html",
    lang: "sv",
    kind: "guide",
    pair: "guideCardFields",
    canonical: pairUrls.guideCardFields.sv,
    title: "Driftkortsmall: fälten som ska med",
    description:
      "En praktisk driftkortsmall: fastighet, system, datum, utförd av, signatur, sida, revision och referens tillbaka till planen, med checklista.",
    titleTerms: ["driftkortsmall", "fälten", "med"],
    h1Terms: ["driftkortsmall", "fälten", "med"],
    metaTerms: ["fastighet", "system", "datum", "signatur", "sida", "revision"],
    bodyTerms: ["fastighet", "system", "signatur", "revision", "referens"],
  },
  {
    file: "guides/operation-card-ventilation/index.html",
    lang: "en",
    kind: "guide",
    pair: "guideVentilation",
    canonical: pairUrls.guideVentilation.en,
    title: "Ventilation operation card: units, ducts and sensors",
    description:
      "Draw a ventilation operation card: air handling unit, ducts, valves, silencers, sensors, schematic symbols, page-scoped layers and a vector PDF export.",
    titleTerms: ["ventilation", "units", "ducts", "sensors"],
    h1Terms: ["ventilation", "operation card"],
    metaTerms: ["air handling unit", "ducts", "valves", "silencers", "sensors", "pdf"],
    bodyTerms: ["air handling unit", "duct", "sensor", "schematic", "layer", "export"],
  },
  {
    file: "sv/guider/driftkort-ventilation/index.html",
    lang: "sv",
    kind: "guide",
    pair: "guideVentilation",
    canonical: pairUrls.guideVentilation.sv,
    title: "Driftkort ventilation: aggregat, kanaler och givare",
    description:
      "Rita ett driftkort för ventilation: aggregat, kanaler, don, givare, schemasymboler, sidbundna lager och export som vektor-PDF.",
    titleTerms: ["driftkort", "ventilation", "aggregat", "kanaler", "givare"],
    h1Terms: ["driftkort", "ventilation"],
    metaTerms: ["aggregat", "kanaler", "don", "givare", "schemasymboler", "pdf"],
    bodyTerms: ["aggregat", "kanal", "givare", "schema", "lager", "export"],
  },
  {
    file: "guides/room-areas/index.html",
    lang: "en",
    kind: "guide",
    pair: "guideRoomArea",
    canonical: pairUrls.guideRoomArea.en,
    title: "Room areas: measured, manual and linked",
    description:
      "Measure a room area, link the measurements to the room and read the register per building and floor. See how missing-area warnings work before export.",
    titleTerms: ["room areas", "measured", "manual", "linked"],
    h1Terms: ["room area", "link"],
    metaTerms: ["room area", "link", "register", "building", "floor", "missing-area"],
    bodyTerms: ["room", "measured", "manual", "missing", "space register"],
  },
  {
    file: "sv/guider/rumsarea/index.html",
    lang: "sv",
    kind: "guide",
    pair: "guideRoomArea",
    canonical: pairUrls.guideRoomArea.sv,
    title: "Rumsarea: uppmätt, manuell och kopplad",
    description:
      "Mät rumsarea, koppla mätningarna till rummet och läs registret per byggnad och våning. Så fungerar varningen för saknad area före export.",
    titleTerms: ["rumsarea", "uppmätt", "manuell", "kopplad"],
    h1Terms: ["rumsarea", "koppla"],
    metaTerms: ["rumsarea", "koppla", "registret", "byggnad", "våning", "saknad"],
    bodyTerms: ["rumsarea", "uppmätt", "manuell", "saknas", "utrymmesregistret"],
  },
  {
    file: "compare/excel/index.html",
    lang: "en",
    kind: "guide",
    pair: "compareExcel",
    canonical: pairUrls.compareExcel.en,
    title: "GridScalr and Excel: when is a spreadsheet enough?",
    description:
      "An honest comparison of GridScalr and a spreadsheet for quantity takeoff: traceability, deductions, revisions and the CSV round trip, with no hype.",
    titleTerms: ["gridscalr", "excel", "spreadsheet"],
    h1Terms: ["gridscalr", "excel", "spreadsheet"],
    metaTerms: [
      "comparison",
      "spreadsheet",
      "quantity takeoff",
      "traceability",
      "deductions",
      "csv",
    ],
    bodyTerms: ["spreadsheet", "traceable", "csv", "excel", "revision"],
  },
  {
    file: "sv/jamfor/excel/index.html",
    lang: "sv",
    kind: "guide",
    pair: "compareExcel",
    canonical: pairUrls.compareExcel.sv,
    title: "GridScalr och Excel: när räcker kalkylarket?",
    description:
      "En ärlig jämförelse av GridScalr och kalkylark för mängdning: spårbarhet, avdrag, revisioner och CSV-rundtur, utan överdrifter.",
    titleTerms: ["gridscalr", "excel", "kalkylarket"],
    h1Terms: ["gridscalr", "excel", "kalkylarket"],
    metaTerms: ["jämförelse", "kalkylark", "mängdning", "spårbarhet", "avdrag", "csv"],
    bodyTerms: ["kalkylark", "spårbar", "csv", "excel", "revision"],
  },
];

const downloadUrl = `${baseUrl}/`;
const sourceUrl = "https://github.com/MajorJohnDoe/gridscalr#install-and-run";

const domCache = new Map();
const rawCache = new Map();

const squash = (value) =>
  (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function exists(path) {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

function pageUrl(file) {
  const found = pages.find((page) => page.file === file);
  if (found) return found.canonical;
  return `${baseUrl}/${file}`;
}

async function loadDocument(file) {
  if (domCache.has(file)) return domCache.get(file);
  const path = resolve(dist, file);
  if (!(await exists(path))) {
    errors.push(`Missing built page: ${relative(root, path)}`);
    return null;
  }
  const html = await readFile(path, "utf8");
  rawCache.set(file, html);
  const dom = new JSDOM(html, { url: pageUrl(file) });
  domCache.set(file, dom);
  return dom;
}

function localTarget(raw, fromFile) {
  let url;
  try {
    url = new URL(raw, pageUrl(fromFile));
  } catch {
    return { invalid: raw };
  }
  if (url.origin !== origin) return { external: true, url: url.href };
  if (!url.pathname.startsWith("/gridscalr/")) return { invalid: raw };
  let path = decodeURIComponent(url.pathname.slice("/gridscalr/".length));
  if (path === "" || path.endsWith("/")) path += "index.html";
  return { path, hash: url.hash ? decodeURIComponent(url.hash.slice(1)) : "" };
}

async function checkLocalReference(raw, fromFile, context) {
  if (!raw || /^(mailto:|tel:|data:|javascript:)/i.test(raw)) return;
  const target = localTarget(raw, fromFile);
  if (target.external) return;
  if (target.invalid) {
    errors.push(`${fromFile}: ${context} has an invalid URL (${raw})`);
    return;
  }
  const absolute = resolve(dist, target.path);
  if (!absolute.startsWith(dist + sep)) {
    errors.push(`${fromFile}: ${context} points outside the built site (${raw})`);
    return;
  }
  if (!(await exists(absolute))) {
    errors.push(`${fromFile}: ${context} is missing ${target.path}`);
    return;
  }
  checkedLinks += 1;
  if (target.hash && extname(absolute) === ".html") {
    const doc = await loadDocument(target.path);
    if (doc && !doc.window.document.getElementById(target.hash)) {
      errors.push(
        `${fromFile}: ${context} links to missing anchor #${target.hash} in ${target.path}`,
      );
    }
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function checkTerms(value, terms, label, file) {
  const haystack = value.toLocaleLowerCase();
  for (const term of terms) {
    if (!haystack.includes(term.toLocaleLowerCase())) {
      errors.push(`${file}: ${label} does not contain the expected term "${term}"`);
    }
  }
}

function checkHead(document, page, release) {
  const html = document.documentElement;
  assert(html.getAttribute("lang") === page.lang, `${page.file}: lang must be "${page.lang}"`);

  const titles = [...document.querySelectorAll("title")];
  assert(titles.length === 1, `${page.file}: must have exactly one <title>`);
  const title = squash(titles[0]?.textContent);
  assert(
    title.length >= 30 && title.length <= 60,
    `${page.file}: title is ${title.length} chars (expected 30–60)`,
  );
  assert(title === page.title, `${page.file}: title differs from the expected copy`);

  const descriptions = [...document.querySelectorAll('meta[name="description"]')];
  assert(descriptions.length === 1, `${page.file}: must have exactly one meta description`);
  const description = squash(descriptions[0]?.getAttribute("content"));
  assert(
    description.length >= 120 && description.length <= 160,
    `${page.file}: meta description is ${description.length} chars (expected 120–160)`,
  );
  assert(
    description === page.description,
    `${page.file}: meta description differs from the expected copy`,
  );

  const robots = document.querySelector('meta[name="robots"]');
  assert(
    robots && /index/i.test(robots.getAttribute("content") ?? ""),
    `${page.file}: meta robots must allow indexing`,
  );

  const canonicals = [...document.querySelectorAll('link[rel="canonical"]')];
  assert(canonicals.length === 1, `${page.file}: must have exactly one canonical link`);
  assert(
    canonicals[0]?.getAttribute("href") === page.canonical,
    `${page.file}: canonical must be ${page.canonical}`,
  );

  const alternates = new Map();
  for (const link of document.querySelectorAll('link[rel="alternate"][hreflang]')) {
    alternates.set(link.getAttribute("hreflang"), link.getAttribute("href"));
  }
  for (const [lang, href] of Object.entries(pairUrls[page.pair])) {
    assert(alternates.get(lang) === href, `${page.file}: hreflang="${lang}" must be ${href}`);
  }

  assert(
    document.querySelector('meta[property="og:title"]')?.getAttribute("content"),
    `${page.file}: missing og:title`,
  );
  assert(
    document.querySelector('meta[property="og:description"]')?.getAttribute("content"),
    `${page.file}: missing og:description`,
  );
  assert(
    document.querySelector('meta[property="og:url"]')?.getAttribute("content") === page.canonical,
    `${page.file}: og:url must match the canonical URL`,
  );
  assert(
    document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
    `${page.file}: missing og:image`,
  );
  assert(
    document.querySelector('meta[property="og:image:alt"]')?.getAttribute("content"),
    `${page.file}: missing og:image:alt`,
  );
  assert(
    document.querySelector('meta[name="twitter:card"]')?.getAttribute("content") ===
      "summary_large_image",
    `${page.file}: missing or unexpected twitter:card`,
  );

  assert(document.querySelector('link[rel="icon"]'), `${page.file}: missing favicon link`);
  assert(
    document.querySelector('link[rel="apple-touch-icon"]'),
    `${page.file}: missing apple-touch-icon`,
  );

  const versionNodes = [...document.querySelectorAll("[data-release-version]")];
  assert(versionNodes.length > 0, `${page.file}: missing the release version`);
  for (const node of versionNodes) {
    assert(
      squash(node.textContent) === release.version,
      `${page.file}: displayed release version must be ${release.version}`,
    );
  }

  const raw = rawCache.get(page.file) ?? "";
  assert(!raw.includes("{{"), `${page.file}: unresolved release token`);

  checkTerms(title, page.titleTerms, "title", page.file);
  checkTerms(description, page.metaTerms, "meta description", page.file);
  checkTerms(
    squash(document.querySelector("main")?.textContent),
    page.bodyTerms,
    "page copy",
    page.file,
  );

  const h1s = [...document.querySelectorAll("h1")];
  assert(h1s.length === 1, `${page.file}: must have exactly one h1 (found ${h1s.length})`);
  const h1 = squash(h1s[0]?.textContent);
  assert(h1.length > 0, `${page.file}: h1 must have text`);
  checkTerms(h1, page.h1Terms, "h1", page.file);

  const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")];
  assert(headings[0]?.tagName === "H1", `${page.file}: the first heading must be h1`);
  assert(
    headings.filter((heading) => heading.tagName === "H2").length >= 3,
    `${page.file}: expected a usable h2 hierarchy`,
  );
  let previousLevel = 0;
  for (const heading of headings) {
    const level = Number(heading.tagName.slice(1));
    if (previousLevel && level > previousLevel + 1) {
      errors.push(
        `${page.file}: heading level jumps from h${previousLevel} to h${level} ("${squash(heading.textContent)}")`,
      );
    }
    previousLevel = level;
  }
}

function checkImages(document, page) {
  const images = [...document.querySelectorAll("img")];
  const minimum =
    page.kind === "home"
      ? 6
      : page.kind === "task"
        ? 4
        : page.kind === "guide"
          ? 2
          : page.kind === "tour"
            ? 6
            : 12;
  assert(images.length >= minimum, `${page.file}: expected at least ${minimum} images`);

  const eager = images.filter((img) => img.getAttribute("fetchpriority") === "high");
  assert(
    eager.length === (page.kind === "home" ? 1 : 0),
    `${page.file}: expected ${page.kind === "home" ? "one" : "no"} fetchpriority="high" image`,
  );

  for (const img of images) {
    const decorative = img.getAttribute("aria-hidden") === "true";
    const alt = squash(img.getAttribute("alt"));
    if (!decorative && !alt) {
      errors.push(`${page.file}: image ${img.getAttribute("src")} has no alt text`);
    }
    if (!img.getAttribute("width") || !img.getAttribute("height")) {
      errors.push(`${page.file}: image ${img.getAttribute("src")} is missing explicit dimensions`);
    }
    if (!decorative && img !== eager[0] && img.getAttribute("loading") !== "lazy") {
      errors.push(`${page.file}: image ${img.getAttribute("src")} should be lazy-loaded`);
    }
    const src = img.getAttribute("src");
    if (/^(https?:)?\/\//i.test(src ?? "")) {
      errors.push(`${page.file}: external image is not allowed (${src})`);
    }
    checkedImages += 1;
  }

  const lightboxTriggers = [...document.querySelectorAll("[data-lightbox]")];
  const minimumShots =
    page.kind === "home"
      ? 5
      : page.kind === "task"
        ? 4
        : page.kind === "guide"
          ? 2
          : page.kind === "tour"
            ? 6
            : 14;
  assert(
    lightboxTriggers.length >= minimumShots,
    `${page.file}: expected at least ${minimumShots} lightbox screenshots`,
  );
  for (const trigger of lightboxTriggers) {
    const href = trigger.getAttribute("href") ?? "";
    const inner = trigger.querySelector("img");
    assert(inner, `${page.file}: lightbox trigger ${href} has no image`);
    assert(
      inner && (inner.getAttribute("src") ?? "").split("/").pop() === href.split("/").pop(),
      `${page.file}: lightbox trigger ${href} must point to its own image`,
    );
  }
}

function checkLanguageSwitch(document, page) {
  const nav = document.querySelector("[data-lang-switch]");
  assert(nav, `${page.file}: missing language switch`);
  if (!nav) return;

  const links = [...nav.querySelectorAll("a[hreflang]")];
  assert(links.length === 2, `${page.file}: language switch must contain two language links`);

  const otherLang = page.lang === "en" ? "sv" : "en";
  const current = links.find((link) => link.getAttribute("hreflang") === page.lang);
  const other = links.find((link) => link.getAttribute("hreflang") === otherLang);

  assert(
    current?.getAttribute("aria-current") === "page",
    `${page.file}: the current language link needs aria-current="page"`,
  );
  assert(other, `${page.file}: the language switch is missing the ${otherLang} link`);

  if (other) {
    const expected = pages.find(
      (candidate) => candidate.lang === otherLang && candidate.pair === page.pair,
    );
    const target = localTarget(other.getAttribute("href"), page.file);
    assert(
      expected && !target.external && !target.invalid && target.path === expected.file,
      `${page.file}: the ${otherLang} switch link must point to ${expected?.file}`,
    );
  }
}

function checkRelease(document, page, release) {
  const expectedAttributes = {
    "data-installer": release.installerUrl,
    "data-release-page": release.releaseUrl,
  };
  for (const [attribute, expected] of Object.entries(expectedAttributes)) {
    const nodes = [...document.querySelectorAll(`[${attribute}]`)];
    assert(nodes.length > 0, `${page.file}: missing ${attribute}`);
    for (const node of nodes) {
      assert(
        node.getAttribute("href") === expected,
        `${page.file}: ${attribute} must be ${expected}`,
      );
    }
  }

  if (page.kind === "home") {
    const extra = {
      "data-msi": release.msiUrl,
      "data-portable": release.portableUrl,
      "data-checksums": release.checksumsUrl,
    };
    for (const [attribute, expected] of Object.entries(extra)) {
      const nodes = [...document.querySelectorAll(`[${attribute}]`)];
      assert(nodes.length === 1, `${page.file}: expected exactly one ${attribute}`);
      assert(
        nodes[0]?.getAttribute("href") === expected,
        `${page.file}: ${attribute} must be ${expected}`,
      );
    }

    for (const [field, attribute] of platformAssets) {
      const nodes = [...document.querySelectorAll(`[${attribute}]`)];
      if (typeof release[field] === "string") {
        assert(nodes.length === 1, `${page.file}: expected exactly one ${attribute}`);
        assert(
          nodes[0]?.getAttribute("href") === release[field],
          `${page.file}: ${attribute} must be ${release[field]}`,
        );
      } else {
        assert(
          nodes.length === 0,
          `${page.file}: ${attribute} must not appear without release.json ${field}`,
        );
      }
    }
  }

  for (const link of document.querySelectorAll("[data-build-from-source]")) {
    assert(
      link.getAttribute("href") === sourceUrl,
      `${page.file}: build-from-source link must point to the install section`,
    );
  }

  for (const link of document.querySelectorAll("[href]")) {
    const href = link.getAttribute("href") ?? "";
    if (/releases\/download/.test(href)) {
      assert(
        href.includes(`v${release.version}`),
        `${page.file}: asset URL must use ${release.tag}`,
      );
      assert(href.includes(release.version), `${page.file}: asset URL must include the version`);
    }
  }
}

function checkJsonLd(document, page, release) {
  const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
  assert(scripts.length >= 2, `${page.file}: expected structured data`);

  const documents = [];
  for (const script of scripts) {
    try {
      documents.push(JSON.parse(script.textContent));
    } catch (error) {
      errors.push(`${page.file}: JSON-LD does not parse (${error.message})`);
    }
  }

  if (page.kind === "home") {
    const software = documents.find((entry) => entry["@type"] === "SoftwareApplication");
    assert(software, `${page.file}: missing SoftwareApplication JSON-LD`);
    if (software) {
      for (const field of [
        "name",
        "applicationCategory",
        "operatingSystem",
        "license",
        "description",
        "softwareVersion",
      ]) {
        assert(
          typeof software[field] === "string" && software[field].trim().length > 0,
          `${page.file}: SoftwareApplication is missing ${field}`,
        );
      }
      assert(
        software.softwareVersion === release.version,
        `${page.file}: softwareVersion must be ${release.version}`,
      );
      assert(
        software.offers?.price === "0",
        `${page.file}: SoftwareApplication should be free (price 0)`,
      );
      assert(
        Array.isArray(software.featureList) && software.featureList.length >= 4,
        `${page.file}: SoftwareApplication needs a feature list`,
      );
      assert(
        software.downloadUrl === release.releaseUrl,
        `${page.file}: SoftwareApplication downloadUrl must be the release URL`,
      );
      assert(
        software.releaseNotes === release.notesUrl,
        `${page.file}: SoftwareApplication releaseNotes must be the notes URL`,
      );
    }

    const faqPage = documents.find((entry) => entry["@type"] === "FAQPage");
    assert(faqPage, `${page.file}: missing FAQPage JSON-LD`);
    if (faqPage) {
      const structured = new Map();
      for (const entry of faqPage.mainEntity ?? []) {
        const question = squash(entry.name);
        const answer = squash(entry.acceptedAnswer?.text);
        if (!question || !answer) {
          errors.push(`${page.file}: FAQ JSON-LD has an empty question or answer`);
          continue;
        }
        structured.set(question, answer);
      }

      const visible = new Map();
      for (const item of document.querySelectorAll("#faq details")) {
        const question = squash(item.querySelector("summary")?.textContent);
        const answer = squash(item.querySelector("p")?.textContent);
        if (question && answer) visible.set(question, answer);
      }

      assert(visible.size >= 5, `${page.file}: expected at least five visible FAQ entries`);
      assert(
        structured.size === visible.size,
        `${page.file}: FAQ JSON-LD has ${structured.size} entries but ${visible.size} are visible`,
      );

      for (const [question, answer] of visible) {
        if (!structured.has(question)) {
          errors.push(`${page.file}: FAQ JSON-LD is missing the visible question "${question}"`);
          continue;
        }
        if (structured.get(question) !== answer) {
          errors.push(
            `${page.file}: FAQ JSON-LD answer does not match the visible answer for "${question}"`,
          );
        }
      }
    }
  } else {
    const webpage = documents.find((entry) => entry["@type"] === "WebPage");
    assert(webpage, `${page.file}: missing WebPage JSON-LD`);
    assert(webpage?.url === page.canonical, `${page.file}: WebPage URL must match the canonical`);
    assert(
      webpage?.inLanguage === page.lang,
      `${page.file}: WebPage language must be ${page.lang}`,
    );

    const breadcrumb = documents.find((entry) => entry["@type"] === "BreadcrumbList");
    assert(breadcrumb, `${page.file}: missing BreadcrumbList JSON-LD`);
    const items = breadcrumb?.itemListElement ?? [];
    assert(items.length >= 2, `${page.file}: breadcrumb needs at least two items`);
    assert(
      items[items.length - 1]?.item === page.canonical,
      `${page.file}: breadcrumb must end at the canonical URL`,
    );
  }
}

async function checkReferenceSafety(document, page) {
  for (const element of document.querySelectorAll("[href]")) {
    if (element.tagName === "LINK" || element.tagName === "A") {
      await checkLocalReference(
        element.getAttribute("href"),
        page.file,
        `<${element.tagName.toLowerCase()}>`,
      );
    }
  }
  for (const element of document.querySelectorAll("[src]")) {
    if (element.tagName === "IMG" || element.tagName === "SCRIPT") {
      await checkLocalReference(
        element.getAttribute("src"),
        page.file,
        `<${element.tagName.toLowerCase()}>`,
      );
    }
  }

  for (const script of document.querySelectorAll("script[src]")) {
    const target = localTarget(script.getAttribute("src"), page.file);
    if (target.external) {
      errors.push(`${page.file}: external script is not allowed (${script.getAttribute("src")})`);
    }
  }
  for (const script of document.querySelectorAll("script:not([src])")) {
    if (script.getAttribute("type") !== "application/ld+json") {
      errors.push(`${page.file}: unexpected inline executable script`);
    }
  }
  for (const link of document.querySelectorAll('link[rel~="stylesheet"], link[rel="preload"]')) {
    const target = localTarget(link.getAttribute("href"), page.file);
    if (target.external) {
      errors.push(
        `${page.file}: external stylesheet or preload is not allowed (${link.getAttribute("href")})`,
      );
    }
  }
  for (const img of document.querySelectorAll("img")) {
    const raw = img.getAttribute("src") ?? "";
    if (raw.startsWith("//")) errors.push(`${page.file}: external image is not allowed (${raw})`);
  }
  assert(document.querySelectorAll("iframe").length === 0, `${page.file}: iframes are not allowed`);
}

async function checkSitemapAndRobots() {
  const sitemapPath = resolve(dist, "sitemap.xml");
  const robotsPath = resolve(dist, "robots.txt");
  assert(await exists(sitemapPath), "site-dist: missing sitemap.xml");
  assert(await exists(robotsPath), "site-dist: missing robots.txt");

  if (await exists(sitemapPath)) {
    const sitemap = await readFile(sitemapPath, "utf8");
    for (const urls of Object.values(pairUrls)) {
      for (const [lang, href] of Object.entries(urls)) {
        assert(
          sitemap.includes(`hreflang="${lang}" href="${href}"`),
          `sitemap.xml: missing ${lang} alternate ${href}`,
        );
      }
      for (const href of new Set(Object.values(urls))) {
        assert(sitemap.includes(`<loc>${href}</loc>`), `sitemap.xml: missing <loc>${href}</loc>`);
      }
    }
  }

  if (await exists(robotsPath)) {
    const robots = await readFile(robotsPath, "utf8");
    assert(robots.includes(`Sitemap: ${baseUrl}/sitemap.xml`), "robots.txt: missing sitemap URL");
  }
}

async function check404() {
  const doc = await loadDocument("404.html");
  if (!doc) return;
  const document = doc.window.document;
  const robots = document.querySelector('meta[name="robots"]');
  assert(
    robots && /noindex/i.test(robots.getAttribute("content") ?? ""),
    "404.html: must be marked noindex",
  );
  assert(document.querySelectorAll("h1").length === 1, "404.html: must have exactly one h1");
  assert(
    document.querySelector('a[href="/gridscalr/sv/"]') &&
      document.querySelector('a[href="/gridscalr/"]') &&
      document.querySelector('a[href="/gridscalr/features/"]'),
    "404.html: must link to both languages and the features page",
  );
  assert(document.querySelector('link[rel="icon"]'), "404.html: missing favicon link");
  await checkReferenceSafety(document, { file: "404.html" });
}

async function checkAssets() {
  const cssPaths = [resolve(dist, "assets/site.css"), resolve(dist, "assets/how-it-works.css")];
  const jsPaths = [resolve(dist, "assets/site.js"), resolve(dist, "assets/how-it-works.js")];
  for (const path of [
    ...cssPaths,
    ...jsPaths,
    resolve(dist, "assets/app-icon.svg"),
    resolve(dist, "assets/favicon.ico"),
    resolve(dist, "assets/app-icon-128.png"),
    resolve(dist, "assets/industrial-plan.webp"),
    resolve(dist, "social-preview.png"),
    resolve(dist, "screenshots/hero.png"),
    resolve(dist, "screenshots/calibration.png"),
    resolve(dist, "screenshots/images.png"),
  ]) {
    assert(await exists(path), `site-dist: missing ${relative(dist, path)}`);
  }

  for (const cssPath of cssPaths) {
    if (!(await exists(cssPath))) continue;
    const css = await readFile(cssPath, "utf8");
    const name = relative(dist, cssPath);
    assert(!/@import/i.test(css), `${name}: @import is not allowed`);
    assert(!/@font-face/i.test(css), `${name}: external or custom fonts are not allowed`);
    assert(!/url\(\s*['"]?https?:/i.test(css), `${name}: external asset URLs are not allowed`);
  }

  for (const jsPath of jsPaths) {
    if (!(await exists(jsPath))) continue;
    const js = await readFile(jsPath, "utf8");
    const name = relative(dist, jsPath);
    for (const pattern of [
      "fetch(",
      "XMLHttpRequest",
      "WebSocket",
      "sendBeacon",
      "document.cookie",
    ]) {
      assert(!js.includes(pattern), `${name}: network or storage call is not allowed (${pattern})`);
    }
  }
}

function checkNoTrackers() {
  for (const page of [...pages, { file: "404.html" }]) {
    const doc = domCache.get(page.file)?.window.document;
    if (!doc) continue;
    const html = doc.documentElement.outerHTML.toLowerCase();
    for (const tracker of [
      "googletagmanager",
      "google-analytics",
      "gtag(",
      "plausible.io",
      "matomo",
      "hotjar",
      "doubleclick",
      "facebook.net",
    ]) {
      if (html.includes(tracker))
        errors.push(`${page.file}: possible third-party tracker (${tracker})`);
    }
  }
}

function checkPairParity(pageData) {
  for (const pair of ["home", "features"]) {
    const pairPages = pageData.filter((entry) => entry.page.pair === pair);
    if (pairPages.length !== 2) {
      errors.push(`Expected two pages for the ${pair} pair`);
      continue;
    }
    const [first, second] = pairPages;
    const sectionIds = (document) =>
      [...document.querySelectorAll("main section[id]")]
        .map((section) => section.id)
        .sort()
        .join(",");
    assert(
      sectionIds(first.document) === sectionIds(second.document),
      `Section IDs differ between ${first.page.file} and ${second.page.file}`,
    );

    for (const attribute of [
      "data-installer",
      "data-release-page",
      "data-build-from-source",
      "data-msi",
      "data-portable",
      "data-checksums",
      ...platformAssets.map(([, attribute]) => attribute),
    ]) {
      const firstHrefs = [...first.document.querySelectorAll(`[${attribute}]`)]
        .map((node) => node.href)
        .sort()
        .join("|");
      const secondHrefs = [...second.document.querySelectorAll(`[${attribute}]`)]
        .map((node) => node.href)
        .sort()
        .join("|");
      assert(
        firstHrefs === secondHrefs,
        `${attribute} links differ between ${first.page.file} and ${second.page.file}`,
      );
    }
  }
}

/** Optional per-platform assets; rendered only when site/release.json has them. */
const platformAssets = [
  ["macosDmgUrl", "data-macos-dmg"],
  ["macosZipUrl", "data-macos-zip"],
  ["linuxAppImageUrl", "data-linux-appimage"],
  ["linuxDebUrl", "data-linux-deb"],
  ["linuxTarballUrl", "data-linux-tarball"],
];

const releasePath = resolve(root, "site/release.json");
assert(await exists(releasePath), "site/release.json is missing");
let release = {};
if (await exists(releasePath)) {
  try {
    release = JSON.parse(await readFile(releasePath, "utf8"));
  } catch (error) {
    errors.push(`site/release.json does not parse (${error.message})`);
  }
}
assert(/^\d+\.\d+\.\d+$/.test(release.version ?? ""), "release.json: invalid version");
assert(release.tag === `v${release.version}`, "release.json: tag must match the version");
assert(
  /^\d{4}-\d{2}-\d{2}$/.test(release.releasedAt ?? ""),
  "release.json: releasedAt must be an ISO date",
);
assert(
  release.releaseUrl?.endsWith(`/releases/tag/${release.tag}`),
  "release.json: releaseUrl must point to the tag",
);
assert(
  release.installerUrl?.includes(`/download/${release.tag}/`),
  "release.json: installerUrl must point to the release asset",
);
assert(
  release.installerUrl?.includes(release.version),
  "release.json: installerUrl must include the version",
);
for (const field of ["notesUrl", "msiUrl", "portableUrl", "checksumsUrl", "latestUrl"]) {
  assert(
    typeof release[field] === "string" && release[field].startsWith("https://"),
    `release.json: ${field} must be an HTTPS URL`,
  );
}
for (const [field] of platformAssets) {
  const url = release[field];
  if (url === undefined) continue;
  assert(
    typeof url === "string" && url.startsWith("https://"),
    `release.json: ${field} must be an HTTPS URL`,
  );
  assert(
    url.includes(`/download/${release.tag}/`),
    `release.json: ${field} must point to the tagged release asset`,
  );
}

await checkSitemapAndRobots();
await checkAssets();

const pageData = [];
for (const page of pages) {
  const doc = await loadDocument(page.file);
  if (!doc) continue;
  const document = doc.window.document;
  pageData.push({ page, document });

  checkHead(document, page, release);
  checkImages(document, page);
  checkLanguageSwitch(document, page);
  checkRelease(document, page, release);
  checkJsonLd(document, page, release);
  await checkReferenceSafety(document, page);
}

if (pageData.length === pages.length) {
  checkPairParity(pageData);

  const titles = new Set(pages.map((page) => page.title));
  const descriptions = new Set(pages.map((page) => page.description));
  assert(titles.size === pages.length, "Each page must have a unique title");
  assert(descriptions.size === pages.length, "Each page must have a unique meta description");
}

await check404();
checkNoTrackers();

if (errors.length) {
  console.error(`Site check failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

console.log(
  `Site check passed: ${pages.length} pages, GridScalr ${release.version}, ${checkedLinks} local references, ${checkedImages} images, release metadata, structured data, sitemap and 404.`,
);
