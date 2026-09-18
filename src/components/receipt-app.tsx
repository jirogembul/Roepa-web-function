"use client";

import { useEffect, useRef, useState } from "react";
import { formatDate, formatMoney } from "@/lib/format";

interface DraftItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number;
  category: string | null;
}

interface Draft {
  imagePath: string;
  merchant: string | null;
  purchasedAt: string | null;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  total: number;
  items: DraftItem[];
}

interface SavedReceipt {
  id: string;
  merchant: string | null;
  purchasedAt: string | null;
  currency: string;
  total: number;
  imagePath: string | null;
  items: { id: string; name: string; quantity: number; totalPrice: number }[];
}

type Stage = "upload" | "parsing" | "review" | "saving";

// Anthropic's recommended max edge. Larger images cost more tokens without
// reading any better, and phone photos are several times this.
const MAX_IMAGE_EDGE = 1568;

// crypto.randomUUID() only exists in secure contexts, and this app gets opened
// over http://<lan-ip> from a phone to photograph receipts.
function makeId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// Downscaling in the browser keeps the upload small, cuts the per-receipt token
// bill, and re-encodes phone formats (HEIC) the API would otherwise reject.
async function prepareImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.85),
    );
  } catch {
    return file;
  }
}

function toDraft(imagePath: string, parsed: Omit<Draft, "imagePath" | "items"> & {
  items: Omit<DraftItem, "id">[];
}): Draft {
  return {
    ...parsed,
    imagePath,
    items: parsed.items.map((item) => ({ ...item, id: makeId() })),
  };
}

export default function ReceiptApp() {
  const [stage, setStage] = useState<Stage>("upload");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<SavedReceipt[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refreshReceipts();
  }, []);

  async function refreshReceipts() {
    const res = await fetch("/api/receipts");
    if (!res.ok) return;
    const data = await readJson(res);
    if (data?.receipts) setReceipts(data.receipts);
  }

  async function handleFile(file: File) {
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setStage("parsing");

    try {
      const image = await prepareImage(file);
      const formData = new FormData();
      formData.append("image", image, "receipt.jpg");

      const res = await fetch("/api/receipts/parse", {
        method: "POST",
        body: formData,
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data?.error ?? "Gagal membaca struk");
      setDraft(toDraft(data.imagePath, data.parsed));
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membaca struk");
      setStage("upload");
    }
  }

  function updateItem(id: string, patch: Partial<DraftItem>) {
    setDraft((d) =>
      d
        ? { ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }
        : d,
    );
  }

  function removeItem(id: string) {
    setDraft((d) => (d ? { ...d, items: d.items.filter((it) => it.id !== id) } : d));
  }

  function addItem() {
    setDraft((d) =>
      d
        ? {
            ...d,
            items: [
              ...d.items,
              { id: makeId(), name: "", quantity: 1, unitPrice: null, totalPrice: 0, category: null },
            ],
          }
        : d,
    );
  }

  function resetToUpload() {
    setDraft(null);
    setPreviewUrl(null);
    setError(null);
    setStage("upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function saveDraft() {
    if (!draft) return;
    setStage("saving");
    setError(null);
    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant: draft.merchant,
          purchasedAt: draft.purchasedAt,
          currency: draft.currency,
          subtotal: draft.subtotal,
          tax: draft.tax,
          total: draft.total,
          imagePath: draft.imagePath,
          items: draft.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            category: item.category,
          })),
        }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data?.error ?? "Gagal menyimpan");
      await refreshReceipts();
      resetToUpload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
      setStage("review");
    }
  }

  // Totals are kept per currency — summing IDR and USD into one number would
  // be a plausible-looking lie.
  const totalsByCurrency = receipts.reduce<Record<string, number>>((acc, r) => {
    acc[r.currency] = (acc[r.currency] ?? 0) + r.total;
    return acc;
  }, {});
  const totals = Object.entries(totalsByCurrency);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-10 sm:px-8">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b border-hairline pb-6">
        <div>
          <p className="text-xs tracking-[0.3em] text-ink-soft uppercase">Pembukuan pribadi</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl italic tracking-tight sm:text-5xl">
            Roepa
          </h1>
          <p className="mt-1 max-w-sm text-sm text-ink-soft">
            Foto struk belanja, dan biarkan tercatat sebagai pembukuan.
          </p>
        </div>
        <div className="rotate-2 rounded-sm border-2 border-stamp px-4 py-2 text-right text-stamp">
          <p className="text-[0.65rem] tracking-[0.2em] uppercase">Total tercatat</p>
          {totals.length === 0 ? (
            <p className="tabular-money text-xl font-semibold">{formatMoney(0, "IDR")}</p>
          ) : (
            totals.map(([currency, amount]) => (
              <p key={currency} className="tabular-money text-xl font-semibold">
                {formatMoney(amount, currency)}
              </p>
            ))
          )}
        </div>
      </header>

      <main className="grid flex-1 gap-8 md:grid-cols-[380px_1fr]">
        <section aria-label="Unggah struk">
          {stage === "upload" && (
            <UploadZone
              isDragging={isDragging}
              setIsDragging={setIsDragging}
              onFile={handleFile}
              fileInputRef={fileInputRef}
              error={error}
            />
          )}

          {stage === "parsing" && (
            <div className="flex flex-col items-center gap-4 rounded-sm border border-hairline bg-paper-raised p-8 text-center">
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Struk yang diunggah" className="max-h-48 rounded-sm border border-hairline object-contain" />
              )}
              <p className="text-sm text-ink-soft">Membaca struk…</p>
            </div>
          )}

          {draft && (stage === "review" || stage === "saving") && (
            <ReviewForm
              draft={draft}
              previewUrl={previewUrl}
              setDraft={setDraft}
              updateItem={updateItem}
              removeItem={removeItem}
              addItem={addItem}
              onCancel={resetToUpload}
              onSave={saveDraft}
              saving={stage === "saving"}
              error={error}
            />
          )}
        </section>

        <section aria-label="Riwayat transaksi">
          <h2 className="mb-4 text-xs tracking-[0.3em] text-ink-soft uppercase">
            Riwayat ({receipts.length})
          </h2>
          {receipts.length === 0 ? (
            <p className="rounded-sm border border-dashed border-hairline p-8 text-center text-sm text-ink-soft">
              Belum ada struk tercatat. Unggah foto struk pertamamu.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {receipts.map((r) => (
                <LedgerRow key={r.id} receipt={r} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function UploadZone({
  isDragging,
  setIsDragging,
  onFile,
  fileInputRef,
  error,
}: {
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  onFile: (file: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  error: string | null;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      onClick={() => fileInputRef.current?.click()}
      className={`flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-sm border-2 border-dashed p-8 text-center transition-colors ${
        isDragging ? "border-stamp bg-paper-raised" : "border-hairline"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <span className="font-[family-name:var(--font-display)] text-2xl italic">Jatuhkan struk di sini</span>
      <p className="text-sm text-ink-soft">atau ketuk untuk memilih / memotret foto struk</p>
      {error && <p className="mt-2 text-sm text-stamp">{error}</p>}
    </div>
  );
}

function ReviewForm({
  draft,
  previewUrl,
  setDraft,
  updateItem,
  removeItem,
  addItem,
  onCancel,
  onSave,
  saving,
  error,
}: {
  draft: Draft;
  previewUrl: string | null;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  updateItem: (id: string, patch: Partial<DraftItem>) => void;
  removeItem: (id: string) => void;
  addItem: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}) {
  const itemsSum = draft.items.reduce((sum, it) => sum + (it.totalPrice || 0), 0);

  return (
    <div className="flex flex-col gap-4 rounded-sm border border-hairline bg-paper-raised p-5">
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="Struk" className="max-h-40 w-full rounded-sm border border-hairline object-contain" />
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs tracking-wide text-ink-soft uppercase">Merchant</span>
        <input
          value={draft.merchant ?? ""}
          onChange={(e) => setDraft({ ...draft, merchant: e.target.value })}
          className="rounded-sm border border-hairline bg-paper px-3 py-2"
          placeholder="Nama toko"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs tracking-wide text-ink-soft uppercase">Tanggal</span>
          <input
            type="date"
            value={draft.purchasedAt ?? ""}
            onChange={(e) => setDraft({ ...draft, purchasedAt: e.target.value })}
            className="rounded-sm border border-hairline bg-paper px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs tracking-wide text-ink-soft uppercase">Mata uang</span>
          <input
            value={draft.currency}
            onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })}
            className="rounded-sm border border-hairline bg-paper px-3 py-2"
            maxLength={3}
          />
        </label>
      </div>

      <div className="border-t border-dashed border-hairline pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs tracking-wide text-ink-soft uppercase">Item</span>
          <button type="button" onClick={addItem} className="text-xs text-ledger-green underline underline-offset-2">
            + tambah item
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {draft.items.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_3rem_5rem_auto] items-center gap-2">
              <input
                value={item.name}
                onChange={(e) => updateItem(item.id, { name: e.target.value })}
                className="rounded-sm border border-hairline bg-paper px-2 py-1 text-sm"
                placeholder="Nama item"
              />
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })}
                className="tabular-money rounded-sm border border-hairline bg-paper px-2 py-1 text-sm"
              />
              <input
                type="number"
                value={item.totalPrice}
                onChange={(e) => updateItem(item.id, { totalPrice: Number(e.target.value) })}
                className="tabular-money rounded-sm border border-hairline bg-paper px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                aria-label="Hapus item"
                className="text-ink-soft hover:text-stamp"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-right text-xs text-ink-soft">
          Jumlah item: <span className="tabular-money">{formatMoney(itemsSum, draft.currency)}</span>
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs tracking-wide text-ink-soft uppercase">Total struk</span>
        <input
          type="number"
          value={draft.total}
          onChange={(e) => setDraft({ ...draft, total: Number(e.target.value) })}
          className="tabular-money rounded-sm border border-stamp bg-paper px-3 py-2 font-semibold"
        />
      </label>

      {error && <p className="text-sm text-stamp">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex-1 rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-sm border border-hairline px-4 py-2 text-sm text-ink-soft"
        >
          Batal
        </button>
      </div>
    </div>
  );
}

function LedgerRow({ receipt }: { receipt: SavedReceipt }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-sm border border-hairline bg-paper-raised">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
      >
        <div>
          <p className="font-medium">{receipt.merchant || "Tanpa nama toko"}</p>
          <p className="text-xs text-ink-soft">{formatDate(receipt.purchasedAt)}</p>
        </div>
        <p className="tabular-money shrink-0 font-semibold">
          {formatMoney(receipt.total, receipt.currency)}
        </p>
      </button>
      {open && (
        <ul className="border-t border-dashed border-hairline px-4 py-3 text-sm">
          {receipt.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-2 py-1">
              <span className="text-ink-soft">
                {item.name} × {item.quantity}
              </span>
              <span className="tabular-money">{formatMoney(item.totalPrice, receipt.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
