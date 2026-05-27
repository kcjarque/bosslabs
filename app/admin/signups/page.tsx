import { redirect } from 'next/navigation';

/**
 * Legacy route. The page lives at /admin/customers now — anyone with a
 * bookmark or old link gets bounced there transparently. Preserves any
 * existing query string (e.g. ?q=email@x.com from pending-payments).
 */
export default function LegacySignupsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (typeof v === 'string') qs.set(k, v);
    else if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
  }
  const tail = qs.toString();
  redirect(tail ? `/admin/customers?${tail}` : '/admin/customers');
}
