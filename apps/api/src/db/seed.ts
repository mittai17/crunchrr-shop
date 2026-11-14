/**
 * Crunchrr seed — catalog shaped exactly after the "Urban Vanguard / Drop 004"
 * storefront mockups. Idempotent: wipes catalog rows then re-inserts.
 *
 * Prices in minor units (USD cents) to match the mockup dollar tags.
 * Partner routing demonstrates multi-partner POD split logic:
 * fleece/heavy garments → Qikink, cotton accessories → Printrove.
 */
import "dotenv/config";
import { getDb } from "./client.js";
import {
  orders,
} from "./schema.js";
import {
  products,
  productImages,
  productVariants,
  partnerCredentials,
  promos,
  shippingZones,
} from "./schema.js";
import { sql } from "drizzle-orm";
import type { PartnerId } from "@crunchrr/shared";

const IMG = (hash: string) => `/products/img_${hash}.jpg`;

type SeedVariant = {
  size: "XS" | "S" | "M" | "L" | "XL" | "XXL" | "ONE_SIZE";
  stock: number;
};

type SeedProduct = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: "HOODIES" | "TEES" | "BOTTOMS" | "OUTERWEAR" | "HEADWEAR" | "ARTIFACTS";
  collection?: string;
  gsmLabel: string;
  fabricLabel: string;
  badge?: { text: string; tone: "coral" | "charcoal" | "jade" | "error" } | null;
  unitsLeftLabel?: string | null;
  rating: string;
  reviewCount: number;
  featured?: boolean;
  specs: { fit: string; material: string; shipping: string; sustainability: string };
  images: Array<{ url: string; alt: string; label?: string }>;
  /** colorway → hex, partner, cost(cents), price(cents), compare(cents|null), sizes */
  colorways: Array<{
    colorway: string;
    colorHex: string;
    partner: PartnerId;
    partnerCostMinor: number;
    priceMinor: number;
    comparePriceMinor?: number | null;
    sizes: SeedVariant[];
  }>;
};

function skuFor(slug: string, colorway: string, size: string): string {
  const colorCode = colorway.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase();
  // Deterministic short hash keeps SKUs unique & stable across reseeds.
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  const slugCode = `${slug.replace(/-/g, "").slice(0, 10).toUpperCase()}${(hash % 1000).toString().padStart(3, "0")}`;
  return `CR-${slugCode.slice(0, 13)}-${colorCode}-${size}`;
}

function expandVariants(p: SeedProduct) {
  const rows: Array<{
    sku: string;
    size: SeedVariant["size"];
    colorway: string;
    colorHex: string;
    stock: number;
    partnerId: SeedProduct["colorways"][number]["partner"];
    partnerCostMinor: number;
    priceMinor: number;
    comparePriceMinor: number | null;
  }> = [];
  for (const c of p.colorways) {
    for (const s of c.sizes) {
      rows.push({
        sku: skuFor(p.slug, c.colorway, s.size),
        size: s.size,
        colorway: c.colorway,
        colorHex: c.colorHex,
        stock: s.stock,
        partnerId: c.partner,
        partnerCostMinor: c.partnerCostMinor,
        priceMinor: c.priceMinor,
        comparePriceMinor: c.comparePriceMinor ?? null,
      });
    }
  }
  return rows;
}

const SIZES_APPAREL: SeedVariant[] = [
  { size: "S", stock: 12 },
  { size: "M", stock: 4 },
  { size: "L", stock: 8 },
  { size: "XL", stock: 15 },
  { size: "XXL", stock: 2 },
];

const CATALOG: SeedProduct[] = [
  {
    slug: "urban-vanguard-heavyweight-hoodie",
    name: "Urban Vanguard Heavyweight Hoodie",
    tagline: "Batch #09 flagship. 450 GSM French Terry with kinetic sleeve graphics.",
    description:
      "The Urban Vanguard Heavyweight Hoodie is the anchor piece of Drop 004. Cut from 450 GSM ultra-heavyweight combed French Terry with multi-layer reactive discharge prints across both sleeves. Boxy dropped-shoulder silhouette with a double-layered, drawstring-free hood.",
    category: "HOODIES",
    gsmLabel: "450 GSM",
    fabricLabel: "Loopback Fleece • 450 GSM",
    badge: { text: "Drop Exclusive", tone: "coral" },
    unitsLeftLabel: "Only 4 left in M",
    rating: "5.0",
    reviewCount: 142,
    featured: true,
    specs: {
      fit: "Relaxed drop-shoulder boxy cut. Size down for a true-to-body street fit.",
      material:
        "450 GSM ultra-heavyweight combed French Terry cotton; multi-layer reactive discharge ink printing on sleeves & neck; 2x2 heavy spandex-infused cuff & waistband; pre-shrunk.",
      shipping:
        "Batch #09 pieces ship from our bonded depot within 24h. Free worldwide shipping over $75; 2–4 business days via express.",
      sustainability:
        "Fair wage + zero-landfill certified manufacturing; closed-loop OEKO-TEX 100 dyes; 100% biodegradable cornstarch mailers.",
    },
    images: [
      { url: IMG("35e8050d41"), alt: "Urban Vanguard Heavyweight Hoodie front editorial", label: "01 Front" },
      { url: IMG("f7d6d5ceaf"), alt: "450 GSM sleeve print macro detail", label: "02 Sleeve" },
      { url: IMG("bcb635c08b"), alt: "Back block typography detail", label: "03 Back" },
      { url: IMG("674b7d3f9d"), alt: "Flat lay with chain and sunglasses", label: "04 Flat" },
      { url: IMG("70ce40c7cd"), alt: "Full body streetwear portrait", label: "05 Fit" },
    ],
    colorways: [
      {
        colorway: "Vintage Cream (Coral & Jade Graphic)",
        colorHex: "#F45B50",
        partner: "QIKINK",
        partnerCostMinor: 3150,
        priceMinor: 8800,
        comparePriceMinor: 11500,
        sizes: SIZES_APPAREL,
      },
      {
        colorway: "Coral Sun (Abstract Prism)",
        colorHex: "#D04139",
        partner: "QIKINK",
        partnerCostMinor: 3150,
        priceMinor: 8800,
        comparePriceMinor: 11500,
        sizes: SIZES_APPAREL,
      },
      {
        colorway: "Charcoal Shadow (Raw Monochrome)",
        colorHex: "#1F1E1E",
        partner: "QIKINK",
        partnerCostMinor: 3150,
        priceMinor: 8800,
        comparePriceMinor: null,
        sizes: SIZES_APPAREL,
      },
    ],
  },
  {
    slug: "urban-vanguard-graphic-tee",
    name: "Urban Vanguard Graphic Tee",
    tagline: "Heavy 260 GSM cotton with raw pop-art back print.",
    description:
      "Oversized white graphic tee with a raw comic pop-art back print. 260 GSM heavyweight combed cotton, ribbed collar with reinforced stitching, dropped shoulders and a slightly cropped boxy body.",
    category: "TEES",
    gsmLabel: "260 GSM",
    fabricLabel: "Heavy Cotton • 260 GSM",
    badge: { text: "Bestseller", tone: "coral" },
    unitsLeftLabel: null,
    rating: "4.9",
    reviewCount: 214,
    featured: true,
    specs: {
      fit: "Oversized boxy fit; true to size for a relaxed look.",
      material: "260 GSM heavyweight combed cotton, water-based screen print.",
      shipping: "Ships within 24h; free worldwide shipping over $75.",
      sustainability: "OEKO-TEX certified inks; organic cotton blend.",
    },
    images: [
      { url: IMG("8ace2f2fc9"), alt: "Urban Vanguard Graphic Tee on model in Tokyo neon", label: "01 Front" },
      { url: IMG("6c3363675a"), alt: "Studio e-commerce shot of graphic tee", label: "02 Studio" },
      { url: IMG("ad8260e11f"), alt: "Thumbnail product shot", label: "03 Detail" },
    ],
    colorways: [
      {
        colorway: "Raw Pop Print",
        colorHex: "#F5F3F0",
        partner: "PRINTROVE",
        partnerCostMinor: 1450,
        priceMinor: 3800,
        comparePriceMinor: null,
        sizes: SIZES_APPAREL,
      },
      {
        colorway: "Coral Flame",
        colorHex: "#F45B50",
        partner: "PRINTROVE",
        partnerCostMinor: 1450,
        priceMinor: 3800,
        comparePriceMinor: 4600,
        sizes: SIZES_APPAREL,
      },
    ],
  },
  {
    slug: "prism-cyber-pullover",
    name: "Prism Cyber Pullover",
    tagline: "480 GSM custom loopback with abstract prism graphics.",
    description:
      "Premium cream-white heavyweight pullover with dynamic abstract red and teal prism graphics on the arms. 480 GSM custom loopback fleece; zero shrinkage; high-density weave.",
    category: "HOODIES",
    gsmLabel: "480 GSM",
    fabricLabel: "Loopback Fleece • 480 GSM",
    badge: { text: "Drop Exclusive", tone: "charcoal" },
    unitsLeftLabel: "In Stock • Ships 24h",
    rating: "4.8",
    reviewCount: 96,
    featured: true,
    specs: {
      fit: "Relaxed pullover fit; ribbed cuffs and waistband.",
      material: "480 GSM custom loopback fleece, high-density looped French terry weave.",
      shipping: "Ships within 24h from the batch depot.",
      sustainability: "Bio-washed, closed-loop dye process.",
    },
    images: [
      { url: IMG("0f91b50dd0"), alt: "Prism Cyber Pullover on model", label: "01 Front" },
      { url: IMG("5892cd524a"), alt: "Prism Cyber Pullover studio", label: "02 Studio" },
    ],
    colorways: [
      {
        colorway: "Cream Prism",
        colorHex: "#EDE7E0",
        partner: "QIKINK",
        partnerCostMinor: 3400,
        priceMinor: 8800,
        comparePriceMinor: null,
        sizes: SIZES_APPAREL,
      },
    ],
  },
  {
    slug: "oversized-acid-wash-hoodie",
    name: "Oversized Acid-Wash Hoodie",
    tagline: "Double-lined hood with vintage cracked typography.",
    description:
      "Heavyweight acid-wash faded black hoodie with distressed raw hems and minimalist white kinetic typography. Double-lined hood, vintage wash treatment applied by hand.",
    category: "HOODIES",
    gsmLabel: "480 GSM",
    fabricLabel: "Fleece Capsule • 480 GSM",
    badge: { text: "480 GSM", tone: "charcoal" },
    unitsLeftLabel: "14 Units Left",
    rating: "4.9",
    reviewCount: 118,
    featured: true,
    specs: {
      fit: "Oversized; size down for a street fit.",
      material: "480 GSM acid-washed fleece, cracked hand-applied typography.",
      shipping: "Ships in 24h; 30-day free size swaps.",
      sustainability: "Water-recycled wash process.",
    },
    images: [
      { url: IMG("df02825223"), alt: "Acid wash hoodie on concrete plinth", label: "01 Front" },
    ],
    colorways: [
      {
        colorway: "Acid Onyx",
        colorHex: "#232120",
        partner: "QIKINK",
        partnerCostMinor: 3300,
        priceMinor: 8800,
        comparePriceMinor: null,
        sizes: SIZES_APPAREL,
      },
    ],
  },
  {
    slug: "cyber-glitch-boxy-tee",
    name: "Cyber Glitch Boxy Tee",
    tagline: "Dropped shoulder cut with water-based screen print.",
    description:
      "Cyberpunk-inspired off-white boxy tee with cybernetic neon glitch illustrations in vivid cyan and fluorescent coral. Water-based discharge inks keep the print soft after 40+ washes.",
    category: "TEES",
    gsmLabel: "280 GSM",
    fabricLabel: "Tee Lab • 280 GSM",
    badge: { text: "280 GSM", tone: "charcoal" },
    unitsLeftLabel: null,
    rating: "4.8",
    reviewCount: 87,
    featured: true,
    specs: {
      fit: "Boxy; dropped shoulders.",
      material: "280 GSM heavyweight jersey, water-based discharge print.",
      shipping: "Ships in 24h.",
      sustainability: "OEKO-TEX 100 inks.",
    },
    images: [
      { url: IMG("7acf5cc9c4"), alt: "Cyber Glitch Boxy Tee studio", label: "01 Front" },
    ],
    colorways: [
      {
        colorway: "Glitch Cream",
        colorHex: "#F4F1EA",
        partner: "PRINTROVE",
        partnerCostMinor: 1550,
        priceMinor: 4200,
        comparePriceMinor: null,
        sizes: SIZES_APPAREL,
      },
    ],
  },
  {
    slug: "technical-parachute-cargos",
    name: "Technical Parachute Cargos",
    tagline: "8-pocket ergonomic array with articulated knee darts.",
    description:
      "Technical wide-leg cargo pants in matte sage grey with modular utilitarian pockets, tactical webbing straps, and adjustable toggle cuffs. Articulated knee darts for movement.",
    category: "BOTTOMS",
    gsmLabel: "Ripstop",
    fabricLabel: "Ripstop Tech • 8 Pockets",
    badge: { text: "Vault Piece", tone: "coral" },
    unitsLeftLabel: null,
    rating: "4.9",
    reviewCount: 76,
    featured: true,
    specs: {
      fit: "Wide-leg parachute cut with toggle cuffs.",
      material: "Matte ripstop twill, YKK hardware, 8-pocket array.",
      shipping: "Ships in 24h.",
      sustainability: "Recycled nylon blend shell.",
    },
    images: [
      { url: IMG("d2ecfe31e5"), alt: "Technical Parachute Cargos runway", label: "01 Fit" },
      { url: IMG("b5cc6de369"), alt: "Cargo pocket hardware macro", label: "02 Detail" },
    ],
    colorways: [
      {
        colorway: "Matte Sage",
        colorHex: "#5A5D51",
        partner: "QIKINK",
        partnerCostMinor: 4200,
        priceMinor: 11200,
        comparePriceMinor: null,
        sizes: SIZES_APPAREL,
      },
    ],
  },
  {
    slug: "modular-tech-cargo-pants",
    name: "Modular Tech Cargo Pants",
    tagline: "Gunmetal buckles with strap-on modular pouches.",
    description:
      "Deep black modular technical cargo pants with nylon straps, gunmetal buckle detailing and a strap-on modular pouch system. Built for movement with a slightly tapered leg.",
    category: "BOTTOMS",
    gsmLabel: "Ripstop Twill",
    fabricLabel: "Ripstop Twill • 8 Pockets",
    badge: null,
    unitsLeftLabel: null,
    rating: "4.7",
    reviewCount: 54,
    featured: true,
    specs: {
      fit: "Tapered techwear cut.",
      material: "Deep-black ripstop twill; nylon webbing; gunmetal hardware.",
      shipping: "Ships in 24h.",
      sustainability: "Bluesign-approved dyeing.",
    },
    images: [
      { url: IMG("b5cc6de369"), alt: "Modular Tech Cargo Pants detail", label: "01 Detail" },
    ],
    colorways: [
      {
        colorway: "Void Black",
        colorHex: "#151515",
        partner: "QIKINK",
        partnerCostMinor: 4000,
        priceMinor: 11000,
        comparePriceMinor: null,
        sizes: SIZES_APPAREL,
      },
    ],
  },
  {
    slug: "distressed-boxy-tee",
    name: "Distressed Boxy Tee",
    tagline: "Acid wash with raw-hem edges.",
    description:
      "Distressed vintage charcoal-gray boxy oversized tee with raw-hem edges and a washed mineral finish. Every piece ages uniquely.",
    category: "TEES",
    gsmLabel: "280 GSM",
    fabricLabel: "Acid Wash • Raw Hem",
    badge: null,
    unitsLeftLabel: null,
    rating: "4.6",
    reviewCount: 63,
    featured: true,
    specs: {
      fit: "Boxy oversized.",
      material: "280 GSM vintage-washed jersey; raw hems.",
      shipping: "Ships in 24h.",
      sustainability: "Water-recycled mineral wash.",
    },
    images: [
      { url: IMG("51e4d18f01"), alt: "Distressed Boxy Tee on model", label: "01 Front" },
    ],
    colorways: [
      {
        colorway: "Mineral Charcoal",
        colorHex: "#4A4846",
        partner: "PRINTROVE",
        partnerCostMinor: 1600,
        priceMinor: 4200,
        comparePriceMinor: null,
        sizes: SIZES_APPAREL,
      },
    ],
  },
  {
    slug: "vybe-nylon-windbreaker",
    name: "Vybe Nylon Windbreaker",
    tagline: "Weatherproof ripstop with reflective panels.",
    description:
      "Futuristic technical nylon windbreaker in matte cream with reflective panel accents. Weatherproof ripstop shell with DWR coating and taped seams.",
    category: "OUTERWEAR",
    gsmLabel: "DWR",
    fabricLabel: "Weatherproof Ripstop • DWR",
    badge: { text: "Low Stock (3 left)", tone: "error" },
    unitsLeftLabel: "Only 3 left",
    rating: "4.8",
    reviewCount: 41,
    featured: true,
    specs: {
      fit: "Relaxed techwear fit.",
      material: "Weatherproof ripstop nylon, DWR coating, reflective piping.",
      shipping: "Ships in 24h.",
      sustainability: "PFC-free DWR finish.",
    },
    images: [
      { url: IMG("3203e7db22"), alt: "Vybe Nylon Windbreaker on model", label: "01 Front" },
    ],
    colorways: [
      {
        colorway: "Matte Bone",
        colorHex: "#E8E2D9",
        partner: "QIKINK",
        partnerCostMinor: 5100,
        priceMinor: 12500,
        comparePriceMinor: null,
        sizes: [
          { size: "M", stock: 2 },
          { size: "L", stock: 1 },
        ],
      },
    ],
  },
  {
    slug: "knit-beanie-in-moss",
    name: "Knit Beanie in Moss",
    tagline: "100% merino wool, ribbed fisherman fold.",
    description:
      "Chunky ribbed knit fisherman beanie in deep moss green with a folded cuff and mini woven crunchrr branding tag. 100% merino wool; one size universal.",
    category: "HEADWEAR",
    gsmLabel: "Merino",
    fabricLabel: "100% Merino Wool • Ribbed",
    badge: null,
    unitsLeftLabel: null,
    rating: "4.9",
    reviewCount: 158,
    featured: true,
    specs: {
      fit: "One size universal; folded cuff.",
      material: "100% merino wool rib knit.",
      shipping: "Ships in 24h.",
      sustainability: "Mulesing-free merino.",
    },
    images: [
      { url: IMG("2868fbef5d"), alt: "Knit Beanie in Moss on model", label: "01 Worn" },
      { url: IMG("52983510f1"), alt: "Beanie top view with woven tag", label: "02 Top" },
      { url: IMG("e4d4427d16"), alt: "Beanie on pedestal", label: "03 Studio" },
    ],
    colorways: [
      {
        colorway: "Moss Green",
        colorHex: "#3E5241",
        partner: "PRINTROVE",
        partnerCostMinor: 900,
        priceMinor: 2800,
        comparePriceMinor: null,
        sizes: [{ size: "ONE_SIZE", stock: 24 }],
      },
    ],
  },
  {
    slug: "tactical-crossbody-rig",
    name: "Tactical Crossbody Rig",
    tagline: "Cordura 1000D with cobra buckles.",
    description:
      "Tactical Cordura crossbody chest rig with cobra buckles and neon coral accents. Waterproof, modular and quick-draw.",
    category: "ARTIFACTS",
    gsmLabel: "1000D",
    fabricLabel: "Cordura 1000D • Waterproof",
    badge: { text: "Hardware", tone: "jade" },
    unitsLeftLabel: null,
    rating: "4.7",
    reviewCount: 39,
    featured: true,
    specs: {
      fit: "Adjustable crossbody strap.",
      material: "Cordura 1000D; cobra buckles; neon coral webbing.",
      shipping: "Ships in 24h.",
      sustainability: "Recycled Cordura variant.",
    },
    images: [
      { url: IMG("37ec5f51fe"), alt: "Tactical Crossbody Rig on model", label: "01 Worn" },
    ],
    colorways: [
      {
        colorway: "Onyx / Coral Webbing",
        colorHex: "#171717",
        partner: "IN_HOUSE",
        partnerCostMinor: 2400,
        priceMinor: 6400,
        comparePriceMinor: null,
        sizes: [{ size: "ONE_SIZE", stock: 9 }],
      },
    ],
  },
  {
    slug: "acid-wash-longsleeve",
    name: "Acid Wash Longsleeve",
    tagline: "Custom vintage wash with forearm graphics.",
    description:
      "Dark mineral acid-wash longsleeve skater tee with typographic white graphics on the forearms. Custom vintage wash; heavy 300 GSM body.",
    category: "TEES",
    gsmLabel: "300 GSM",
    fabricLabel: "Custom Vintage Wash • Heavy",
    badge: null,
    unitsLeftLabel: null,
    rating: "4.6",
    reviewCount: 52,
    featured: false,
    specs: {
      fit: "Regular long sleeve; ribbed cuffs.",
      material: "300 GSM mineral-washed jersey.",
      shipping: "Ships in 24h.",
      sustainability: "Low-water wash process.",
    },
    images: [
      { url: IMG("1d3fb71d5a"), alt: "Acid Wash Longsleeve editorial", label: "01 Fit" },
    ],
    colorways: [
      {
        colorway: "Mineral Wash",
        colorHex: "#33302E",
        partner: "PRINTROVE",
        partnerCostMinor: 1900,
        priceMinor: 5400,
        comparePriceMinor: null,
        sizes: SIZES_APPAREL,
      },
    ],
  },
  {
    slug: "reflective-stripe-track-pants",
    name: "Reflective Stripe Track Pants",
    tagline: "3M piping, water-resistant warm-up cut.",
    description:
      "Technical warm-up track pants with 3M reflective tape stripes glowing in low light. Water-resistant finish, elastic waist with drawcord, zip ankle gussets.",
    category: "BOTTOMS",
    gsmLabel: "3M Piping",
    fabricLabel: "3M Piping • Water Resistant",
    badge: null,
    unitsLeftLabel: null,
    rating: "4.8",
    reviewCount: 71,
    featured: false,
    specs: {
      fit: "Straight warm-up cut with zip gussets.",
      material: "Water-resistant tricot shell; 3M reflective tape.",
      shipping: "Ships in 24h.",
      sustainability: "Recycled polyester shell.",
    },
    images: [
      { url: IMG("b4d916833e"), alt: "Reflective Stripe Track Pants profile", label: "01 Fit" },
    ],
    colorways: [
      {
        colorway: "Jet / Silver Stripe",
        colorHex: "#101418",
        partner: "QIKINK",
        partnerCostMinor: 3300,
        priceMinor: 9200,
        comparePriceMinor: null,
        sizes: SIZES_APPAREL,
      },
    ],
  },
  {
    slug: "kinetic-wide-leg-cargo-pants",
    name: "Kinetic Wide-Leg Cargo Pants",
    tagline: "Water-repellent ripstop with magnetic flap holsters.",
    description:
      "Wide-leg dark olive drab technical cargo pants featuring tactical cinch straps, FIDLOCK magnetic pocket closures, and articulated knee paneling.",
    category: "BOTTOMS",
    gsmLabel: "Ripstop",
    fabricLabel: "Olive Ripstop • Fidlock",
    badge: { text: "Essential Match", tone: "charcoal" },
    unitsLeftLabel: "In Stock",
    rating: "4.8",
    reviewCount: 44,
    featured: false,
    specs: {
      fit: "Wide-leg with cinch straps.",
      material: "Olive ripstop; Fidlock magnetic closures.",
      shipping: "Ships in 24h.",
      sustainability: "Bluesign-approved dyeing.",
    },
    images: [
      { url: IMG("a4e305710f"), alt: "Kinetic Wide-Leg Cargo Pants studio", label: "01 Studio" },
    ],
    colorways: [
      {
        colorway: "Olive Drab",
        colorHex: "#4B4F3A",
        partner: "QIKINK",
        partnerCostMinor: 4100,
        priceMinor: 11000,
        comparePriceMinor: null,
        sizes: SIZES_APPAREL,
      },
    ],
  },
  {
    slug: "chunky-ribbed-fisherman-beanie",
    name: "Chunky Ribbed Fisherman Beanie",
    tagline: "Merino wool knit with enameled branding pin.",
    description:
      "Deep jade green ribbed fisherman knit beanie with a custom metal enameled logo badge folded on the cuff. 100% merino wool.",
    category: "HEADWEAR",
    gsmLabel: "Merino",
    fabricLabel: "Merino Rib • Enameled Pin",
    badge: { text: "Editorial Pick", tone: "jade" },
    unitsLeftLabel: "Batch #09",
    rating: "4.9",
    reviewCount: 88,
    featured: false,
    specs: {
      fit: "One size; folded cuff.",
      material: "100% merino wool; enameled metal pin.",
      shipping: "Ships in 24h.",
      sustainability: "Mulesing-free merino.",
    },
    images: [
      { url: IMG("e4d4427d16"), alt: "Chunky Ribbed Fisherman Beanie pedestal", label: "01 Studio" },
    ],
    colorways: [
      {
        colorway: "Deep Jade",
        colorHex: "#2E4A3D",
        partner: "PRINTROVE",
        partnerCostMinor: 1100,
        priceMinor: 3400,
        comparePriceMinor: null,
        sizes: [{ size: "ONE_SIZE", stock: 18 }],
      },
    ],
  },
  {
    slug: "urban-vanguard-heavy-tee",
    name: "Urban Vanguard Heavy Tee",
    tagline: "280 GSM jersey with reinforced collar rib.",
    description:
      "High-contrast front of an oversized vintage off-white graphic tee with geometric comic manga-inspired brutalist typography across the chest. 280 GSM heavyweight jersey with reinforced collar rib.",
    category: "TEES",
    gsmLabel: "280 GSM",
    fabricLabel: "Heavyweight Jersey • Reinforced Collar",
    badge: { text: "Layering Base", tone: "coral" },
    unitsLeftLabel: "Almost Gone",
    rating: "4.9",
    reviewCount: 132,
    featured: false,
    specs: {
      fit: "Oversized boxy.",
      material: "280 GSM heavyweight jersey; reinforced collar.",
      shipping: "Ships in 24h.",
      sustainability: "Organic cotton blend.",
    },
    images: [
      { url: IMG("329d9fcf3d"), alt: "Urban Vanguard Heavy Tee front", label: "01 Front" },
    ],
    colorways: [
      {
        colorway: "Vintage Off-White",
        colorHex: "#F2EFE9",
        partner: "PRINTROVE",
        partnerCostMinor: 1600,
        priceMinor: 4200,
        comparePriceMinor: null,
        sizes: SIZES_APPAREL,
      },
    ],
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set — copy .env.example to .env first.");
    process.exit(1);
  }
  await guardLiveDatabase();
  const db = getDb(url);

  console.log("Seeding Crunchrr catalog…");

  // Idempotent: clear catalog + partner credentials, keep orders/webhooks.
  await db.execute(
    sql`TRUNCATE TABLE order_lines, order_splits, order_events, product_images, product_variants, products, partner_credentials RESTART IDENTITY CASCADE`,
  );

  for (const p of CATALOG) {
    const [productRow] = await db
      .insert(products)
      .values({
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
        description: p.description,
        category: p.category,
        collection: p.collection ?? "Drop 004",
        gsmLabel: p.gsmLabel,
        fabricLabel: p.fabricLabel,
        badge: p.badge ?? null,
        unitsLeftLabel: p.unitsLeftLabel ?? null,
        rating: p.rating,
        reviewCount: p.reviewCount,
        specs: p.specs,
        featured: p.featured ?? false,
        active: true,
      })
      .returning({ id: products.id });
    if (!productRow) throw new Error(`Failed to insert product ${p.slug}`);

    await db.insert(productImages).values(
      p.images.map((img, i) => ({
        productId: productRow.id,
        url: img.url,
        alt: img.alt,
        label: img.label ?? null,
        position: i,
      })),
    );

    const variantRows = expandVariants(p);
    await db.insert(productVariants).values(
      variantRows.map((v) => ({
        productId: productRow.id,
        sku: v.sku,
        size: v.size,
        colorway: v.colorway,
        colorHex: v.colorHex,
        stock: v.stock,
        partnerId: v.partnerId,
        partnerCostMinor: v.partnerCostMinor,
        priceMinor: v.priceMinor,
        comparePriceMinor: v.comparePriceMinor,
      })),
    );

    console.log(`  ✓ ${p.name} — ${p.images.length} images, ${variantRows.length} SKUs`);
  }

  await db.insert(partnerCredentials).values([
    {
      partnerId: "QIKINK",
      apiBaseUrl: process.env.QIKINK_API_BASE ?? "https://api.qikink.com",
      authHint: process.env.QIKINK_CLIENT_ID ? "client_id configured" : "not configured",
    },
    {
      partnerId: "PRINTROVE",
      apiBaseUrl: process.env.PRINTROVE_API_BASE ?? "https://api.printrove.com",
      authHint: process.env.PRINTROVE_EMAIL ? "email configured" : "not configured",
    },
    {
      partnerId: "INKMONK",
      apiBaseUrl: "https://api.inkmonk.com",
      authHint: "not configured — simulated dispatch",
    },
    {
      partnerId: "BLINKSTORE",
      apiBaseUrl: "https://api.blinkstore.org",
      authHint: "not configured — simulated dispatch",
    },
    {
      partnerId: "PRINTFUL",
      apiBaseUrl: "https://api.printful.com",
      authHint: "not configured — simulated dispatch",
    },
    {
      partnerId: "PRINTIFY",
      apiBaseUrl: "https://api.printify.com",
      authHint: "not configured — simulated dispatch",
    },
    {
      partnerId: "GELATO",
      apiBaseUrl: "https://order.gelato.com",
      authHint: "not configured — simulated dispatch",
    },
    {
      partnerId: "CONTRADO",
      apiBaseUrl: "https://api.contrado.com",
      authHint: "not configured — simulated dispatch",
    },
    {
      partnerId: "INKTHREADABLE",
      apiBaseUrl: "https://api.inkthreadable.co.uk",
      authHint: "not configured — simulated dispatch",
    },
    {
      partnerId: "GOOTEN",
      apiBaseUrl: "https://api.gooten.com",
      authHint: "not configured — simulated dispatch",
    },
    {
      partnerId: "IN_HOUSE",
      apiBaseUrl: "https://ops.crunchrr.internal",
      authHint: "manual fulfillment",
    },
  ]).onConflictDoNothing();

  /* ---------------------------------------------------------------- */
  /* Shipping zones (multi-country). US mirrors the legacy constants    */
  /* exactly so the default USD flow is unchanged; India mirrors the   */
  /* legacy INR constants. Others are sensible storefront defaults.    */
  /* ---------------------------------------------------------------- */
  await db
    .insert(shippingZones)
    .values([
      { countryCode: "US", countryName: "United States", currency: "USD", fxFromUsd: "1",
        shippingFeeMinor: 1200, priorityFeeMinor: 1200, freeThresholdMinor: 7500, taxBps: 700, sortOrder: 10 },
      { countryCode: "IN", countryName: "India", currency: "INR", fxFromUsd: "83",
        shippingFeeMinor: 20000, priorityFeeMinor: 25000, freeThresholdMinor: 500000, taxBps: 1800, sortOrder: 20 },
      { countryCode: "GB", countryName: "United Kingdom", currency: "GBP", fxFromUsd: "0.79",
        shippingFeeMinor: 1000, priorityFeeMinor: 3000, freeThresholdMinor: 6000, taxBps: 2000, sortOrder: 30 },
      { countryCode: "DE", countryName: "Germany", currency: "EUR", fxFromUsd: "0.92",
        shippingFeeMinor: 1000, priorityFeeMinor: 3000, freeThresholdMinor: 6000, taxBps: 1900, sortOrder: 40 },
      { countryCode: "FR", countryName: "France", currency: "EUR", fxFromUsd: "0.92",
        shippingFeeMinor: 1000, priorityFeeMinor: 3000, freeThresholdMinor: 6000, taxBps: 1900, sortOrder: 50 },
      { countryCode: "AE", countryName: "United Arab Emirates", currency: "AED", fxFromUsd: "3.67",
        shippingFeeMinor: 1500, priorityFeeMinor: 5000, freeThresholdMinor: 8000, taxBps: 500, sortOrder: 60 },
      { countryCode: "AU", countryName: "Australia", currency: "AUD", fxFromUsd: "1.52",
        shippingFeeMinor: 1400, priorityFeeMinor: 4000, freeThresholdMinor: 7000, taxBps: 1000, sortOrder: 70 },
      { countryCode: "CA", countryName: "Canada", currency: "CAD", fxFromUsd: "1.36",
        shippingFeeMinor: 1300, priorityFeeMinor: 4000, freeThresholdMinor: 6500, taxBps: 1300, sortOrder: 80 },
      { countryCode: "SG", countryName: "Singapore", currency: "SGD", fxFromUsd: "1.34",
        shippingFeeMinor: 1200, priorityFeeMinor: 3500, freeThresholdMinor: 6000, taxBps: 900, sortOrder: 90 },
      { countryCode: "SA", countryName: "Saudi Arabia", currency: "SAR", fxFromUsd: "3.75",
        shippingFeeMinor: 5000, priorityFeeMinor: 15000, freeThresholdMinor: 28000, taxBps: 1500, sortOrder: 100 },
      { countryCode: "NL", countryName: "Netherlands", currency: "EUR", fxFromUsd: "0.92",
        shippingFeeMinor: 1000, priorityFeeMinor: 3000, freeThresholdMinor: 6000, taxBps: 2100, sortOrder: 110 },
      { countryCode: "IT", countryName: "Italy", currency: "EUR", fxFromUsd: "0.92",
        shippingFeeMinor: 1000, priorityFeeMinor: 3000, freeThresholdMinor: 6000, taxBps: 2200, sortOrder: 120 },
      { countryCode: "ES", countryName: "Spain", currency: "EUR", fxFromUsd: "0.92",
        shippingFeeMinor: 1000, priorityFeeMinor: 3000, freeThresholdMinor: 6000, taxBps: 2100, sortOrder: 130 },
      { countryCode: "IE", countryName: "Ireland", currency: "EUR", fxFromUsd: "0.92",
        shippingFeeMinor: 1100, priorityFeeMinor: 3200, freeThresholdMinor: 6200, taxBps: 2300, sortOrder: 140 },
      { countryCode: "MY", countryName: "Malaysia", currency: "MYR", fxFromUsd: "4.7",
        shippingFeeMinor: 6000, priorityFeeMinor: 15000, freeThresholdMinor: 35000, taxBps: 1000, sortOrder: 150 },
      { countryCode: "HK", countryName: "Hong Kong", currency: "HKD", fxFromUsd: "7.8",
        shippingFeeMinor: 9000, priorityFeeMinor: 25000, freeThresholdMinor: 58000, taxBps: 0, sortOrder: 160 },
      { countryCode: "MX", countryName: "Mexico", currency: "MXN", fxFromUsd: "17.1",
        shippingFeeMinor: 20000, priorityFeeMinor: 51000, freeThresholdMinor: 128000, taxBps: 1600, sortOrder: 170 },
      { countryCode: "BR", countryName: "Brazil", currency: "BRL", fxFromUsd: "5.1",
        shippingFeeMinor: 6100, priorityFeeMinor: 15300, freeThresholdMinor: 38000, taxBps: 1700, sortOrder: 180 },
      { countryCode: "ZA", countryName: "South Africa", currency: "ZAR", fxFromUsd: "18",
        shippingFeeMinor: 12000, priorityFeeMinor: 40000, freeThresholdMinor: 135000, taxBps: 1500, sortOrder: 190 },
    ])
    .onConflictDoNothing();

  /* ---------------------------------------------------------------- */
  /* Promo codes — same two codes the storefront shipped with.         */
  /* ---------------------------------------------------------------- */
  await db
    .insert(promos)
    .values([
      { code: "TRIBE15", percentOff: 15, label: "Drop Privilege" },
      { code: "DROP004", percentOff: 10, label: "Batch 004" },
    ])
    .onConflictDoNothing();

  console.log(`Seed complete: ${CATALOG.length} products.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

/** Refuses to wipe live order data — set SEED_FORCE=true to override. */
async function guardLiveDatabase(): Promise<void> {
  const db = getDb(process.env.DATABASE_URL as string);
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders);
  const count = rows[0]?.count ?? 0;
  if (count > 0 && process.env.SEED_FORCE !== "true") {
    console.error(
      `Refusing to seed: ${count} orders exist. The seed wipes catalog + order-linked\n` +
      `tables (TRUNCATE ... CASCADE). For a fresh setup run it on an empty DB,\n` +
      `or set SEED_FORCE=true to wipe deliberately.`,
    );
    process.exit(1);
  }
}
