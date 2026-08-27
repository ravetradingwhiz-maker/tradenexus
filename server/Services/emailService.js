const brevo = require('@getbrevo/brevo');
const { assetLabel } = require('../config/cryptoAssets');

const apiInstance = new brevo.TransactionalEmailsApi();
apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY || '');

const fmtDate = d => new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * What the buyer actually paid with, in words: the coin and its chain for
 * crypto, or the plain currency code for the hosted rails.
 */
const paidWith = payment => (payment.asset ? assetLabel(payment.asset) : String(payment.payCurrency).toUpperCase());

/**
 * Sends the subscription receipt via Brevo.
 *
 * The template is inlined and light-on-dark by design: many mail clients
 * (Gmail's mobile app in particular) invert light templates in dark mode, and
 * an explicitly dark one survives that far better.
 */
const sendSubscriptionReceipt = async payment => {
    if (!process.env.BREVO_API_KEY) {
        console.warn('[email] BREVO_API_KEY not set — skipping the receipt email');
        return;
    }

    const label = payment.planLabel || 'Pro';
    const mail = new brevo.SendSmtpEmail();
    mail.subject = `Your TradeNexus ${label} subscription is active`;
    mail.to = [{ email: payment.email }];
    mail.sender = { name: process.env.SENDER_NAME || 'TradeNexus', email: process.env.SENDER_EMAIL };
    mail.htmlContent = `
    <div style="max-width:600px;margin:auto;font-family:Helvetica,Arial,sans-serif;background:#000000;color:#e5e5e5;padding:32px;border-radius:14px;border:1px solid #262626;">
      <h1 style="margin:0;font-size:22px;letter-spacing:-0.02em;color:#ffffff;">TradeNexus</h1>
      <p style="margin:6px 0 0;color:#969696;font-size:14px;">Nexus Bot Pro is unlocked on your account.</p>

      <div style="background:#0a0a0a;border:1px solid #262626;border-radius:12px;padding:18px;margin:22px 0;">
        <p style="margin:6px 0;font-size:14px;"><strong style="color:#ffffff;">Plan:</strong> ${label} — ${payment.term || '1 year'}</p>
        <p style="margin:6px 0;font-size:14px;"><strong style="color:#ffffff;">Paid:</strong> ${payment.priceUSD} USD via ${paidWith(payment)}</p>
        <p style="margin:6px 0;font-size:14px;"><strong style="color:#ffffff;">Active until:</strong> ${fmtDate(payment.expiresAt)}</p>
        <p style="margin:6px 0;font-size:14px;"><strong style="color:#ffffff;">Order:</strong> ${payment.orderId}</p>
      </div>

      <p style="color:#969696;font-size:14px;line-height:1.6;">
        Pro is unlocked for every login on your Deriv account — log in and scroll to Nexus Bot Pro on the dashboard.
      </p>
      <p style="color:#737373;font-size:12px;line-height:1.6;">
        Trading carries risk. Automated strategies can lose money; only trade funds you can afford to lose.
      </p>

      <hr style="border:none;border-top:1px solid #262626;margin:24px 0;">
      <p style="color:#525252;font-size:12px;margin:0;">
        © ${new Date().getFullYear()} TradeNexus. Not affiliated with Deriv. Need help? Reply to this email.
      </p>
    </div>`;

    await apiInstance.sendTransacEmail(mail);
};

module.exports = { sendSubscriptionReceipt };
