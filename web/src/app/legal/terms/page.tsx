export const metadata = { title: "Terms — MakeItHappen" };

export default function TermsPage() {
  return (
    <main className="prose prose-stone mx-auto max-w-2xl px-6 py-12">
      <h1>Terms of Service</h1>
      <p><em>Last updated: September 2026. Starting point; have it reviewed before launch.</em></p>

      <h2>What this is</h2>
      <p>
        MakeItHappen helps a group of friends agree on dates for a trip by sending WhatsApp messages on the organiser&rsquo;s
        behalf. It does not book travel and does not handle money.
      </p>

      <h2>Organisers</h2>
      <p>
        By adding someone&rsquo;s phone number you confirm they are a friend who would reasonably expect to hear from you
        about this trip. Do not add strangers, lists, or anyone who has asked not to be contacted. We may suspend accounts
        that generate complaints.
      </p>

      <h2>Participants</h2>
      <p>You can stop all messages by replying STOP. You can change your answers until the organiser locks the dates.</p>

      <h2>Tone</h2>
      <p>
        Public callouts are written to be affectionate and to target the situation, never the person. Organisers choose
        whether callouts are on. If a message lands badly, tell us.
      </p>

      <h2>No guarantees</h2>
      <p>We try hard to deliver every message on time. We cannot guarantee WhatsApp delivery and are not liable for a trip that doesn&rsquo;t happen.</p>
    </main>
  );
}
