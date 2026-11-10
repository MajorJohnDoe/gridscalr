import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  type PDFDocument,
  type PDFPage,
  type PDFRef,
} from "pdf-lib";

/**
 * Optional content (OCG) support for the drawing export. pdf-lib has no
 * high-level API, so the catalog, the optional-content dictionaries and the
 * marked-content operators are written with its low-level objects.
 *
 * The flattened page content is unchanged; the groups only let a compatible
 * reader toggle the marked content that is already there.
 */
export interface OptionalContentLayer {
  id: string;
  name: string;
}

interface LayerGroup {
  ref: PDFRef;
  key: PDFName;
}

export interface OptionalContentWriter {
  /** Starts a marked-content sequence for one exported layer on one page. */
  begin(page: PDFPage, layerId: string): boolean;
  /** Ends the sequence opened by `begin`. */
  end(page: PDFPage): void;
  /** Writes `/OCProperties` to the catalog after every page is drawn. */
  finalize(): void;
  /** The layer ids that received an OCG and marked content. */
  readonly usedLayerIds: ReadonlySet<string>;
}

const TAG = PDFName.of("OC");
const KEY_PREFIX = "GSOCG";

/**
 * Creates one OCG per supplied layer. Only layers that actually draw visible
 * content are marked and written, so a hidden or empty layer never becomes an
 * empty group in the reader.
 */
export function createOptionalContent(
  pdf: PDFDocument,
  layers: readonly OptionalContentLayer[],
): OptionalContentWriter {
  const context = pdf.context;
  const groups = new Map<string, LayerGroup>();
  const used = new Set<string>();
  const pageProperties = new WeakMap<PDFPage, PDFDict>();

  const groupFor = (layer: OptionalContentLayer): LayerGroup => {
    const existing = groups.get(layer.id);
    if (existing) return existing;
    const dict = PDFDict.withContext(context);
    dict.set(PDFName.of("Type"), PDFName.of("OCG"));
    dict.set(PDFName.of("Name"), PDFHexString.fromText(layer.name));
    const group = {
      ref: context.register(dict),
      key: PDFName.of(`${KEY_PREFIX}${groups.size}`),
    };
    groups.set(layer.id, group);
    return group;
  };

  const propertiesFor = (page: PDFPage): PDFDict => {
    const cached = pageProperties.get(page);
    if (cached) return cached;
    const { Resources } = page.node.normalizedEntries();
    const existing = Resources.lookupMaybe(PDFName.of("Properties"), PDFDict);
    if (existing) {
      pageProperties.set(page, existing);
      return existing;
    }
    const properties = PDFDict.withContext(context);
    Resources.set(PDFName.of("Properties"), context.register(properties));
    pageProperties.set(page, properties);
    return properties;
  };

  return {
    begin(page, layerId) {
      const layer = layers.find((entry) => entry.id === layerId);
      if (!layer) return false;
      const group = groupFor(layer);
      propertiesFor(page).set(group.key, group.ref);
      page.pushOperators(
        PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [TAG, group.key]),
      );
      used.add(layer.id);
      return true;
    },
    end(page) {
      page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
    },
    finalize() {
      if (!groups.size) return;
      const refs = [...groups.values()].map((group) => group.ref);
      const order = PDFArray.withContext(context);
      const on = PDFArray.withContext(context);
      const ocgs = PDFArray.withContext(context);
      for (const ref of refs) {
        ocgs.push(ref);
        order.push(ref);
        on.push(ref);
      }
      const defaults = PDFDict.withContext(context);
      defaults.set(PDFName.of("Name"), PDFHexString.fromText("GridScalr layers"));
      defaults.set(PDFName.of("BaseState"), PDFName.of("ON"));
      defaults.set(PDFName.of("Order"), order);
      defaults.set(PDFName.of("ON"), on);
      const properties = PDFDict.withContext(context);
      properties.set(PDFName.of("OCGs"), ocgs);
      properties.set(PDFName.of("D"), context.register(defaults));
      pdf.catalog.set(PDFName.of("OCProperties"), context.register(properties));
    },
    usedLayerIds: used,
  };
}
