/**
 * Catalog routes — consumed by the Next.js storefront via the typed client.
 */
import type { FastifyInstance } from "fastify";
import {
  catalogQuerySchema,
  productDetailResponseSchema,
  productListResponseSchema,
  type CatalogQuery,
  type Product,
  type ProductImage,
  type ProductVariant,
} from "@crunchrr/shared";
import { and, asc, desc, eq, gt, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { products, productImages, productVariants } from "../db/schema.js";
import { NotFoundError } from "../lib/errors.js";
import { env } from "../config/env.js";

/* ------------------------------------------------------------------ */
/* Row → API serializers (Zod schemas live in @crunchrr/shared)         */
/* ------------------------------------------------------------------ */

type ProductRow = typeof products.$inferSelect;
type ImageRow = typeof productImages.$inferSelect;
type VariantRow = typeof productVariants.$inferSelect;

function toApiImage(img: ImageRow): ProductImage {
  return { id: img.id, url: img.url, alt: img.alt, ...(img.label ? { label: img.label } : {}) };
}

function toApiVariant(v: VariantRow): ProductVariant {
  return {
    id: v.id,
    sku: v.sku,
    size: v.size,
    colorway: v.colorway,
    colorHex: v.colorHex,
    stock: v.stock,
    partnerId: v.partnerId,
    priceMinor: v.priceMinor,
    comparePriceMinor: v.comparePriceMinor ?? null,
  };
}

function toApiProduct(
  p: ProductRow,
  images: ImageRow[],
  variants: VariantRow[],
): Product {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    category: p.category,
    collection: p.collection,
    gsmLabel: p.gsmLabel,
    fabricLabel: p.fabricLabel,
    badge: p.badge ?? null,
    unitsLeftLabel: p.unitsLeftLabel ?? null,
    rating: Number(p.rating),
    reviewCount: p.reviewCount,
    images: images.sort((a, b) => a.position - b.position).map(toApiImage),
    variants: variants.map(toApiVariant),
    specs: p.specs,
    createdAt: p.createdAt.toISOString(),
  };
}

function sortClause(sort: CatalogQuery["sort"]): SQL | ReturnType<typeof asc> {
  switch (sort) {
    case "price-asc":
      return asc(sql`(SELECT min(price_minor) FROM product_variants pv WHERE pv.product_id = ${products.id})`);
    case "price-desc":
      return desc(sql`(SELECT min(price_minor) FROM product_variants pv WHERE pv.product_id = ${products.id})`);
    case "newest":
      return desc(products.createdAt);
    case "bestseller":
      return desc(products.reviewCount);
    case "featured":
    default:
      return desc(products.featured);
  }
}

export async function productRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb(env().DATABASE_URL);

  app.get("/api/products", async (req, reply) => {
    const q = catalogQuerySchema.parse(req.query ?? {});

    const filters: SQL[] = [eq(products.active, true)];
    if (q.category) filters.push(eq(products.category, q.category));
    if (q.search) {
      const like = `%${q.search}%`;
      const searchFilter = or(
        ilike(products.name, like),
        ilike(products.tagline, like),
        ilike(products.fabricLabel, like),
      );
      if (searchFilter) filters.push(searchFilter);
    }
    if (q.size) {
      const sizeFilter = sql`EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = ${products.id} AND pv.size = ${q.size} AND pv.stock > 0)`;
      filters.push(sizeFilter);
    }

    const where = and(...filters);

    const rows = await db
      .select()
      .from(products)
      .where(where)
      .orderBy(sortClause(q.sort))
      .limit(q.limit)
      .offset(q.offset);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(where);
    const count = countRow?.count ?? 0;

    if (rows.length === 0) {
      const payload = productListResponseSchema.parse({ items: [], total: count });
      return reply.send(payload);
    }

    const ids = rows.map((r) => r.id);
    const imgs = await db
      .select()
      .from(productImages)
      .where(sql`${productImages.productId} IN ${ids}`)
      .orderBy(asc(productImages.position));
    const variants = await db
      .select()
      .from(productVariants)
      .where(sql`${productVariants.productId} IN ${ids}`);

    const items = rows.map((p) => {
      const pi = imgs.filter((i) => i.productId === p.id);
      const pv = variants.filter((v) => v.productId === p.id);
      // Surface a low-stock label consistent with mockups.
      const totalStock = pv.reduce((s, v) => s + v.stock, 0);
      const unitsLeftLabel =
        p.unitsLeftLabel ??
        (totalStock <= 5 ? `Only ${totalStock} left` : null);
      return toApiProduct({ ...p, unitsLeftLabel }, pi, pv);
    });

    const payload = productListResponseSchema.parse({ items, total: count });
    return reply.send(payload);
  });

  app.get("/api/products/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const product = await db.query.products.findFirst({
      where: and(eq(products.slug, slug), eq(products.active, true)),
    });
    if (!product) throw new NotFoundError("Product", slug);

    const imgs = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(asc(productImages.position));
    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, product.id));

    const relatedRows = await db
      .select()
      .from(products)
      .where(and(eq(products.active, true), gt(products.reviewCount, 0), sql`${products.id} <> ${product.id}`))
      .orderBy(desc(products.featured), desc(products.reviewCount))
      .limit(3);

    const relIds = relatedRows.map((r) => r.id);
    const relImgs = relIds.length
      ? await db
          .select()
          .from(productImages)
          .where(sql`${productImages.productId} IN ${relIds}`)
          .orderBy(asc(productImages.position))
      : [];
    const relVariants = relIds.length
      ? await db
          .select()
          .from(productVariants)
          .where(sql`${productVariants.productId} IN ${relIds}`)
      : [];

    const related = relatedRows.map((p) =>
      toApiProduct(p, relImgs.filter((i) => i.productId === p.id), relVariants.filter((v) => v.productId === p.id)),
    );

    const payload = productDetailResponseSchema.parse({
      product: toApiProduct(product, imgs, variants),
      related,
    });
    return reply.send(payload);
  });
}
