export const metadata = { title: "Privacy — MakeItHappen" };

/** Approval prerequisite for Meta and Twilio, not launch polish (§9, §11.1). */
export default function PrivacyPage() {
  return (
    <main className="prose prose-stone mx-auto max-w-2xl px-6 py-12">
      <h1>Privacy Policy</h1>
      <p><em>Last updated: September 2026. This is a plain-language summary and a starting point; have it reviewed before launch.</em></p>

      <h2>What we collect</h2>
      <p>
        Phone numbers, the display name you (or the friend who invited you) gave us, your trip answers (yes/no, date
        preferences, dates you can&rsquo;t travel), and a log of messages sent to and received from you so we can run
        the service and resolve disputes.
      </p>

      <h2>Why your number is here when you never signed up</h2>
      <p>
        A friend organising a trip added your number. That is a claim by a friend, not consent from you — so the first
        message tells you who invited you and how to opt out immediately. Reply <strong>STOP</strong> at any time and we
        will never message that number again, about any trip.
      </p>

      <h2>What other members see</h2>
      <p>Your display name and the last four digits of your number. Never the full number.</p>

      <h2>Your rights</h2>
      <p>
        Whether or not you ever created an account, you can access, correct, or delete your data, and opt out of
        messaging. Sign in with your phone number and use Settings, or reply STOP / HELP in WhatsApp.
      </p>

      <h2>Retention</h2>
      <p>Completed and cancelled trips are purged 12 months after they end. Opt-outs are kept so we honour them.</p>

      <h2>Processors</h2>
      <p>Supabase (database and authentication), Twilio (WhatsApp and SMS delivery via Meta), Vercel (hosting).</p>

      <h2>Money</h2>
      <p>We never hold, send, or receive funds.</p>
    </main>
  );
}
