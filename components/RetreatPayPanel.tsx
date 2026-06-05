// Payment options shown AFTER a seat is reserved: credit card (Xendit) +
// UnionBank / BPI InstaPay QRs. Highlights the method the buyer picked.
const CARD_CHECKOUT_URL = 'https://checkout.xendit.co/od/bosslabs-vibecoderetreat';

const BANKS = [
  { method: 'UnionBank', name: 'UnionBank', holder: 'Manago, Michael Batiquin', img: '/qr-unionbank.jpeg' },
  { method: 'BPI', name: 'BPI', holder: 'BossLabs · MI•••L B MA•••O', img: '/qr-bpi.jpeg' },
];

export function RetreatPayPanel({ method, transferNote }: { method?: string; transferNote?: string }) {
  return (
    <div className="rounded-3xl border border-cyan-500/25 bg-[#0A0E1A] p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] sm:p-8">
      {/* Credit / debit card */}
      <div
        className={`rounded-2xl border p-5 transition sm:p-6 ${
          method === 'Credit Card' ? 'border-cyan-400/60 bg-cyan-500/[0.10]' : 'border-white/10 bg-white/[0.03]'
        }`}
      >
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
          Pay by card{method === 'Credit Card' ? ' · your pick' : ''}
        </div>
        <h3 className="mt-1.5 font-sans text-xl font-bold text-white">Credit / Debit Card</h3>
        <p className="mt-1 text-sm text-ink-300">
          Visa, Mastercard &amp; more via secure Xendit checkout — instant confirmation.
        </p>
        <a
          href={CARD_CHECKOUT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-cyan mt-4 inline-flex !px-7 !py-3 text-base"
        >
          Pay via Credit Card →
        </a>
      </div>

      {/* Bank transfer QRs */}
      <div className="mt-5">
        <div className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
          Or pay by bank transfer · InstaPay
        </div>
        <p className="mt-1 text-center text-sm text-ink-300">
          Scan with your banking app{transferNote ? `, and use “${transferNote}” as the note` : ''}.
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {BANKS.map((b) => (
            <div
              key={b.name}
              className={`flex flex-col items-center rounded-2xl border bg-white p-5 transition ${
                method === b.method ? 'border-cyan-400 ring-2 ring-cyan-400/40' : 'border-white/10'
              }`}
            >
              <div className="text-sm font-bold uppercase tracking-[0.18em] text-slate-900">
                {b.name}
                {method === b.method ? ' · your pick' : ''}
              </div>
              <div className="mt-1 text-[12px] text-slate-500">{b.holder}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={b.img}
                alt={`${b.name} InstaPay QR — ${b.holder}`}
                className="mt-4 w-full max-w-[240px] rounded-lg"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
