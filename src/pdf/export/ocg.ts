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
import { t } from "../../i18n";

/**
 * Optional content (OCG) support for the drawing export. pdf-lib has no
 * high-level API, so the catalog, the optional-content dictionaries and the
 * marked-content operators are written with its low-level objects.
 *
 * The flattened page content is unchanged; the groups only let a compatible
 * reader toggle the marked content that is already there. A layer hierarchy is
 * written as nested heading dictionaries in `/OCProperties /D /Order`, so a
 * group layer becomes a collapsible folder containing its child groups and its
 * own content. A group with no visible content is never emitted. See ADR 0014.
 */
export interface OptionalContentLayer {
  id: string;
  name: string;
  /** Nested layers, in tree order. */
  children?: readonly OptionalContentLayer[];
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

function flattenLayers(
  layers: readonly OptionalContentLayer[],
  into: OptionalContentLayer[] = [],
): OptionalContentLayer[] {
  for (const layer of layers) {
    into.push(layer);
    if (layer.children?.length) flattenLayers(layer.children, into);
  }
  return into;
}

/**
 * Creates one OCG per supplied layer. Only layers that actually draw visible
 * content are marked and written, so a hidden or empty layer never becomes an
 * empty group in the reader. `layers` is the visible hierarchy: roots first and
 * each layer's children nested under it.
 */
export function createOptionalContent(
  pdf: PDFDocument,
  layers: readonly OptionalContentLayer[],
): OptionalContentWriter {
  const context = pdf.context;
  const flat = flattenLayers(layers);
  const byId = new Map(flat.map((layer) => [layer.id, layer]));
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

  /** Nested `/Order` entries, or an empty array when nothing is visible. */
  const orderFor = (nodes: readonly OptionalContentLayer[]): PDFArray => {
    const order = PDFArray.withContext(context);
    for (const node of nodes) {
      const own = used.has(node.id) ? groups.get(node.id) : undefined;
      const children = node.children ?? [];
      if (!children.length) {
        if (own) order.push(own.ref);
        continue;
      }
      const childOrder = orderFor(children);
      if (!own && !childOrder.size()) continue;
      // The group's own content sits first inside its folder.
      const inside = PDFArray.withContext(context);
      if (own) inside.push(own.ref);
      for (const entry of childOrder.asArray()) inside.push(entry);
      const heading = PDFDict.withContext(context);
      heading.set(PDFName.of("Name"), PDFHexString.fromText(node.name));
      heading.set(PDFName.of("Order"), inside);
      order.push(context.register(heading));
    }
    return order;
  };

  return {
    begin(page, layerId) {
      const layer = byId.get(layerId);
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
      const refs = [...groups.entries()]
        .filter(([id]) => used.has(id))
        .map(([, group]) => group.ref);
      const order = orderFor(layers);
      const on = PDFArray.withContext(context);
      const ocgs = PDFArray.withContext(context);
      for (const ref of refs) {
        ocgs.push(ref);
        on.push(ref);
      }
      const defaults = PDFDict.withContext(context);
      defaults.set(PDFName.of("Name"), PDFHexString.fromText(t("export.ocgGroupName")));
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
