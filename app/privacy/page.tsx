import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — tend, too',
  description: 'How tend, too collects, uses, and protects your information.',
};

const LAST_UPDATED = 'June 11, 2026';

export default function PrivacyPolicy() {
  return (
    <main style={pageStyle}>
      <article style={articleStyle}>
        <header style={{ marginBottom: '32px' }}>
          <div style={logoStyle}>
            tend<span style={{ color: '#6e8c82' }}>,</span> <em>too</em>
          </div>
          <h1 style={h1Style}>Privacy Policy</h1>
          <p style={metaStyle}>Last updated: {LAST_UPDATED}</p>
        </header>

        <p style={pStyle}>
          tend, too (&ldquo;tend, too,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;)
          provides a mobile app and website that help you track recurring beauty and self-care rituals
          and routines. This Privacy Policy explains what information we collect, how we use it, who we
          share it with, and the choices you have. By using tend, too, you agree to this Policy.
        </p>

        <h2 style={h2Style}>Information we collect</h2>
        <p style={pStyle}>
          <strong>Account information.</strong> When you create an account, we collect your email
          address, a password (stored only in hashed form by our authentication provider), and a
          display name you choose.
        </p>
        <p style={pStyle}>
          <strong>Information you add to the app.</strong> The content you enter so the app can work
          for you — for example: your rituals and routines, their schedules and cadences, completion and
          skip history, and notes or prep notes. If you choose to add them, this may also include costs,
          service provider details (such as a name, phone number, or address), product information, and
          photos.
        </p>
        <p style={pStyle}>
          <strong>Reminders.</strong> With your permission, the app schedules notifications on your
          device to remind you about upcoming rituals.
        </p>
        <p style={pStyle}>
          <strong>Waitlist and contact information (website).</strong> If you join our waitlist or
          contact us, we collect the information you provide — such as your name, email address, the
          categories you&apos;re interested in, your device platform (iPhone/Android), and your
          communication preferences.
        </p>
        <p style={pStyle}>
          <strong>Limited technical information.</strong> Basic information needed to operate and secure
          the service, such as app version and error/diagnostic logs.
        </p>
        <p style={pStyle}>
          We collect only what we need to provide the service. We do <strong>not</strong> use
          third-party advertising trackers, and we do <strong>not</strong> sell your personal
          information.
        </p>

        <h2 style={h2Style}>How we use information</h2>
        <ul style={ulStyle}>
          <li>To provide and operate the app — storing your rituals, generating schedules, and sending reminders.</li>
          <li>To create, secure, and manage your account.</li>
          <li>To respond to your requests and, if you opt in, send you service or early-access updates.</li>
          <li>To maintain, improve, and troubleshoot the service.</li>
        </ul>

        <h2 style={h2Style}>How information is stored and shared</h2>
        <p style={pStyle}>
          Your account and app data are stored on our behalf by <strong>Supabase</strong>, our backend,
          authentication, and database provider. We rely on a small number of service providers who
          process data only to help us operate the service, on our instructions:
        </p>
        <ul style={ulStyle}>
          <li><strong>Supabase</strong> — database, authentication, and storage.</li>
          <li><strong>Apple and Google</strong> — app distribution and notification delivery (depending on your device).</li>
          <li><strong>Expo / EAS</strong> — app build and over-the-air update delivery.</li>
          <li><strong>Google Sheets and our email-notification provider</strong> — to handle website waitlist sign-ups.</li>
        </ul>
        <p style={pStyle}>
          We do not sell your personal information or share it with third parties for their own
          marketing. We may disclose information if required by law, to protect the rights, property, or
          safety of tend, too or our users, or in connection with a business transfer.
        </p>

        <h2 style={h2Style}>Security</h2>
        <p style={pStyle}>
          We use reasonable measures, including encryption in transit (HTTPS), to protect your
          information. No method of storage or transmission is perfectly secure, but we work to safeguard
          your data.
        </p>

        <h2 style={h2Style}>Your choices and rights</h2>
        <ul style={ulStyle}>
          <li><strong>Access and update.</strong> You can view and edit your rituals, routines, and profile within the app.</li>
          <li>
            <strong>Delete your account.</strong> You can delete your account and its associated data
            from within the app (Me &rarr; Delete account), or by emailing us at the address below. When
            you do, we delete or anonymize your personal data, except where we must retain limited
            information to meet legal obligations.
          </li>
          <li><strong>Reminders.</strong> You can turn notifications on or off in your device settings at any time.</li>
          <li><strong>Marketing.</strong> You can opt out of update emails at any time.</li>
        </ul>
        <p style={pStyle}>
          Depending on where you live (for example, the EU/UK or California), you may have additional
          rights to access, correct, delete, or port your data and to object to certain processing. To
          exercise any of these, contact us at the email below.
        </p>

        <h2 style={h2Style}>Data retention</h2>
        <p style={pStyle}>
          We keep your information for as long as your account is active or as needed to provide the
          service. After you delete your account, we delete or anonymize your personal data within a
          reasonable period, except where retention is required by law.
        </p>

        <h2 style={h2Style}>Children</h2>
        <p style={pStyle}>
          tend, too is not directed to children under 13 (or under 16 where applicable law requires), and
          we do not knowingly collect personal information from them. If you believe a child has provided
          us information, contact us and we will delete it.
        </p>

        <h2 style={h2Style}>Changes to this Policy</h2>
        <p style={pStyle}>
          We may update this Policy from time to time. We will post the updated version with a new
          &ldquo;Last updated&rdquo; date and, where appropriate, notify you.
        </p>

        <h2 style={h2Style}>Contact</h2>
        <p style={pStyle}>
          Questions or requests about your privacy or this Policy:{' '}
          <a href="mailto:tendtooapp@gmail.com" style={linkStyle}>tendtooapp@gmail.com</a>
        </p>
      </article>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#f3ecd9',
  display: 'flex',
  justifyContent: 'center',
  padding: '56px 24px 96px',
  fontFamily: 'Inter, sans-serif',
};
const articleStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '680px',
  backgroundColor: '#faf4e6',
  border: '1px solid #ddd4c4',
  borderRadius: '20px',
  padding: '48px 40px',
  color: '#352720',
};
const logoStyle: React.CSSProperties = {
  fontFamily: 'EB Garamond, Georgia, serif',
  fontSize: '28px',
  color: '#352720',
  marginBottom: '20px',
  letterSpacing: '-0.02em',
};
const h1Style: React.CSSProperties = {
  fontFamily: 'EB Garamond, Georgia, serif',
  fontSize: '34px',
  margin: 0,
  color: '#352720',
};
const metaStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#a8998e',
  marginTop: '8px',
};
const h2Style: React.CSSProperties = {
  fontFamily: 'EB Garamond, Georgia, serif',
  fontSize: '22px',
  color: '#352720',
  marginTop: '32px',
  marginBottom: '10px',
};
const pStyle: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: 1.7,
  color: '#4a3d34',
  marginBottom: '14px',
};
const ulStyle: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: 1.7,
  color: '#4a3d34',
  paddingLeft: '20px',
  marginBottom: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};
const linkStyle: React.CSSProperties = {
  color: '#6e8c82',
  textDecoration: 'underline',
};
