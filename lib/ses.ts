/**
 * Amazon SES (SESv2) sender — same setup style as ConexMail.
 *
 * Process-wide singleton client. Region comes from env (AWS_REGION / SES_REGION,
 * default ap-southeast-1 = Singapore). Credentials come from the AWS default
 * provider chain — AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY env vars on Vercel
 * (or an execution role). No AWS secrets live in the DB; flip the provider in
 * admin Settings and set the AWS keys as env vars.
 */
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

let sharedClient: SESv2Client | null = null;

export function getSesClient(): SESv2Client {
  if (sharedClient === null) {
    // Our SES identity (conexmedia.ph) is verified in ap-southeast-2 (Sydney).
    // Default to it so an unset/empty AWS_REGION can't silently send to a
    // region where the identity isn't verified (every send → MessageRejected).
    const region = process.env.AWS_REGION || process.env.SES_REGION || 'ap-southeast-2';
    // maxAttempts: light SDK-level retry net (mirrors ConexMail).
    sharedClient = new SESv2Client({ region, maxAttempts: 3 });
  }
  return sharedClient;
}

/** True when AWS credentials are present in the environment. */
export function isSesConfigured(): boolean {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

export type SesSendArgs = {
  /** "Name <email@domain>" — the domain must be verified in SES. */
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

export async function sendViaSes(
  args: SesSendArgs,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    // SES requires header values to be printable ASCII (regex [ -~]). Fold any
    // CR/LF/tab to a space and strip remaining control/non-ASCII chars so a
    // stray character (from a template var, env, or settings value) can't make
    // SES reject the WHOLE send. Drop headers that end up empty.
    const sanitize = (v: string) =>
      String(v).replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E]/g, '').trim();
    const headerList = args.headers
      ? Object.entries(args.headers)
          .map(([Name, Value]) => ({ Name, Value: sanitize(Value) }))
          .filter((h) => h.Value.length > 0)
      : undefined;

    const res = await getSesClient().send(
      new SendEmailCommand({
        FromEmailAddress: args.from,
        Destination: { ToAddresses: [args.to] },
        ReplyToAddresses: args.replyTo ? [args.replyTo] : undefined,
        Content: {
          Simple: {
            Subject: { Data: args.subject, Charset: 'UTF-8' },
            Body: { Html: { Data: args.html, Charset: 'UTF-8' } },
            Headers: headerList,
          },
        },
      }),
    );

    if (!res.MessageId) return { ok: false, error: 'SES returned no MessageId' };
    return { ok: true, id: res.MessageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'SES error' };
  }
}
