"use client";

/**
 * New Product — full vendor control: create a product with its variant
 * matrix (one colorway × sizes), set price/compare-price, pick the POD
 * vendor, set partner cost + stock, attach images.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminApi } from "@/components/admin/chrome";
import { AdminButton, ErrorNote, Field, inputCls } from "@/components/admin/ui";
import { PARTNER_IDS } from "@/lib/admin-client";

const CATEGORIES = ["HOODIES", "TEES", "BOTTOMS", "OUTERWEAR", "HEADWEAR", "ARTIFACTS"] as const;
const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "ONE_SIZE"] as const;

export default function AdminProductNewPage() {
  const api = useAdminApi();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("HOODIES");
  const [gsmLabel, setGsmLabel] = useState("");
  const [fabricLabel, setFabricLabel] = useState("");
  const [badgeText, setBadgeText] = useState("");
  const [colorway, setColorway] = useState("");
  const [colorHex, setColorHex] = useState("#121212");
  const [price, setPrice] = useState("88.00");
  const [comparePrice, setComparePrice] = useState("");
  const [partnerId, setPartnerId] = useState<string>("INKMONK");
  const [partnerCost, setPartnerCost] = useState("22.00");
  const [stock, setStock] = useState("25");
  const [sizes, setSizes] = useState<string[]>(["S", "M", "L", "XL"]);
  const [imageUrl, setImageUrl] = useState("");

  const toggleSize = (s: string) =>
    setSizes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const toMinor = (v: string): number => Math.round(parseFloat(v || "0") * 100);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ productId: string }>("/api/admin/products", {
        name: name.trim(),
        tagline: tagline.trim() || undefined,
        description: description.trim() || undefined,
        category,
        gsmLabel: gsmLabel.trim() || undefined,
        fabricLabel: fabricLabel.trim() || undefined,
        badgeText: badgeText.trim() || undefined,
        colorway: colorway.trim(),
        colorHex,
        priceMinor: toMinor(price),
        comparePriceMinor: comparePrice ? toMinor(comparePrice) : null,
        partnerId,
        partnerCostMinor: toMinor(partnerCost),
        stock: Number(stock),
        sizes,
        imageUrls: imageUrl.trim() ? [imageUrl.trim()] : undefined,
      });
      router.push(`/admin/products/${r.productId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const cents = (v: string) => {
    const m = toMinor(v);
    return m > 0 ? `$${(m / 100).toFixed(2)}` : "—";
  };

  return (
    <div className="space-y-5">
      <header>
        <div className="mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-brand">add_box</span>
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
            Full vendor control
          </span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">New Product</h1>
      </header>

      {error ? <ErrorNote message={error} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
          <h2 className="font-display text-xs font-bold uppercase tracking-wider text-charcoal-light">Identity</h2>
          <Field label="Product name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vault Rib Cargo Pant" className={inputCls} />
          </Field>
          <Field label="Tagline">
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="One-line hook for the PDP" className={inputCls} />
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Badge (optional)">
              <input value={badgeText} onChange={(e) => setBadgeText(e.target.value)} placeholder="Drop Exclusive" className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="GSM label">
              <input value={gsmLabel} onChange={(e) => setGsmLabel(e.target.value)} placeholder="450 GSM heavyweight" className={inputCls} />
            </Field>
            <Field label="Fabric label">
              <input value={fabricLabel} onChange={(e) => setFabricLabel(e.target.value)} placeholder="100% combed cotton" className={inputCls} />
            </Field>
          </div>
          <Field label="Image URL (first shot)">
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" className={inputCls} />
          </Field>
        </section>

        <section className="space-y-3 rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
          <h2 className="font-display text-xs font-bold uppercase tracking-wider text-charcoal-light">Colorway, pricing & vendor</h2>
          <div className="grid grid-cols-[1fr_88px] gap-3">
            <Field label="Colorway name">
              <input value={colorway} onChange={(e) => setColorway(e.target.value)} placeholder="Matte Onyx" className={inputCls} />
            </Field>
            <Field label="Hex">
              <input value={colorHex} onChange={(e) => setColorHex(e.target.value)} className={`${inputCls} font-mono text-xs`} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Retail price">
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={inputCls} />
            </Field>
            <Field label="Compare @">
              <input value={comparePrice} onChange={(e) => setComparePrice(e.target.value)} inputMode="decimal" placeholder="110.00" className={inputCls} />
            </Field>
            <Field label="Partner cost">
              <input value={partnerCost} onChange={(e) => setPartnerCost(e.target.value)} inputMode="decimal" className={inputCls} />
            </Field>
          </div>
          <p className="text-[10px] text-charcoal-light">
            Retail {cents(price)} · compare {cents(comparePrice)} · margin {cents(price)} − {cents(partnerCost)} ={" "}
            <span className="font-bold text-jade">{cents(String((toMinor(price) - toMinor(partnerCost)) / 100).replace(/^\$/, ""))}</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fulfillment vendor">
              <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className={inputCls}>
                {PARTNER_IDS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field label="Stock per size">
              <input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" className={inputCls} />
            </Field>
          </div>
          <Field label="Sizes (variant matrix)">
            <div className="flex flex-wrap gap-1.5">
              {SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSize(s)}
                  className={`rounded-full border px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    sizes.includes(s)
                      ? "border-charcoal bg-charcoal text-canvas"
                      : "border-neutral-200/60 bg-white text-charcoal-muted hover:border-brand hover:text-brand"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>
          <AdminButton variant="coral" disabled={busy || !name.trim() || !colorway.trim() || sizes.length === 0} onClick={() => void create()}>
            {busy ? "Creating…" : `Create product · ${sizes.length} SKUs`}
          </AdminButton>
        </section>
      </div>
    </div>
  );
}
