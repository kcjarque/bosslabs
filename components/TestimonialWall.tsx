/**
 * Social-proof wall — a masonry of real community screenshots
 * (public/testimonials/t01–t28.jpg). Sits under the "bawal hao shao" proof
 * section on the checkout page. Server component; images lazy-load so the
 * ~2.3MB of screenshots never blocks first paint.
 */
const COUNT = 28;
const IMAGES = Array.from({ length: COUNT }, (_, i) => `/testimonials/t${String(i + 1).padStart(2, '0')}.jpg`);

export function TestimonialWall() {
  return (
    <section className="border-t border-white/[0.05] py-14 sm:py-20">
      <div className="container-tight">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow justify-center">Totoong tao · totoong resulta</div>
          <h2 className="h-section mt-4">
            Hindi namin &rsquo;to sinulat — <span className="accent-italic">sila</span> ang nagsalita.
          </h2>
          <p className="lead mt-4">
            Screenshots mula sa community: mga natutunan, mga unang benta, mga na-build. Real posts, real chats.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-5xl gap-4 [column-fill:_balance] columns-2 sm:columns-3 lg:columns-4">
          {IMAGES.map((src, i) => (
            <div
              key={src}
              className="mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`BOSSLABS AI community result ${i + 1}`}
                className="block w-full"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
