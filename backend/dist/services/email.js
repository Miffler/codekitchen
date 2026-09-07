import { config } from '../config.js';
let transporter = null;
async function getTransporter() {
    if (!transporter && config.SMTP_PASS) {
        const nodemailer = await import('nodemailer');
        transporter = nodemailer.createTransport({
            host: config.SMTP_HOST,
            port: config.SMTP_PORT,
            secure: true,
            auth: {
                user: config.SMTP_USER,
                pass: config.SMTP_PASS,
            },
        });
    }
    return transporter;
}
export async function sendMail(to, subject, body, replyTo) {
    const tx = await getTransporter();
    if (!tx) {
        console.warn('SMTP not configured; skipping email to', to);
        return false;
    }
    try {
        await tx.sendMail({
            from: `"${config.MAIL_FROM_NAME}" <${config.MAIL_FROM}>`,
            to,
            subject,
            text: body,
            replyTo,
        });
        return true;
    }
    catch (error) {
        console.error('Email send failed:', error);
        return false;
    }
}
const AUTOREPLY_ORDER_SUBJECT = 'Order received — CodeKitchen';
const AUTOREPLY_ORDER_BODY = `Hi {name},

Thanks — order received.

I already have a draft ready for you. Let's hop on a quick call to walk through it and finalize the details — no payment needed yet.

If you have any style preferences, brand assets, example sites you like, color ideas, or anything else that would help shape the final version — just reply to this email and dump it in. The more context, the sharper the final result.

Talk soon,
Webchef
{site}`;
const AUTOREPLY_ENQUIRY_SUBJECT = 'We got your message — CodeKitchen';
const AUTOREPLY_ENQUIRY_BODY = `Hi {name},

Thanks for reaching out to CodeKitchen — we've received your message and it's already in the kitchen.

A real human (the chef himself) will get back to you within one business day. If it's urgent, reply to this email and it goes straight to the top of the pile.

What happens next:
1. We read your message carefully
2. We reply with questions or a next step (usually a quick call)
3. You get a clear quote — no surprises

Talk soon,
CodeKitchen
{site}`;
const HANDOFF_EMAIL = `Hi {name},

Everything's paid — your website is officially yours. Here's exactly where things stand:

{domain_line}

{hosting_para}

{care_line}

The code: 100% yours, no page builders, no proprietary lock. Ask me for a zip anytime.

Questions? Just reply to this email — it comes straight to me.

Webchef
{site}`;
export async function sendOrderConfirmation(lead) {
    const name = lead.business || lead.name || 'there';
    const pkg = lead.package || '—';
    const care = lead.care || 'No care plan';
    const domain = lead.domain || '—';
    const clientBody = AUTOREPLY_ORDER_BODY
        .replace('{name}', name)
        .replace('{site}', config.SITE_URL);
    await sendMail(lead.email, AUTOREPLY_ORDER_SUBJECT, clientBody);
    const ownerBody = `New CodeKitchen ORDER — call brief
==================================

BUSINESS:  ${lead.business || lead.name || '—'}
CONTACT:   ${lead.name || '—'} <${lead.email}>
PHONE:     ${lead.phone || '— not provided —'}

WHAT THEY ORDERED
  Package:   ${pkg}
  Care Plan: ${care}
  Domain:    ${domain}

THEIR NOTE
  ${lead.note || '(none)'}

Submitted: ${lead.ts} UTC
Source:    ${lead.source || '—'}

ACTION: Draft ready. Call client → walk through draft → send DEPOSIT link.
Deposit paid → build final version → deploy → remainder at handoff.

All submitted fields:
${lead.message}

To reply to the client, just answer this email.`;
    await sendMail(config.OWNER_EMAIL, `[CodeKitchen ORDER] ${pkg} — ${lead.business || lead.name}`, ownerBody, lead.email);
}
export async function sendEnquiryConfirmation(lead) {
    const name = lead.name || 'there';
    const clientBody = AUTOREPLY_ENQUIRY_BODY
        .replace('{name}', name)
        .replace('{site}', config.SITE_URL);
    await sendMail(lead.email, AUTOREPLY_ENQUIRY_SUBJECT, clientBody);
    const ownerBody = `New CodeKitchen lead
====================

From: ${lead.name} <${lead.email}>
Source: ${lead.source}
Time: ${lead.ts}

All submitted fields:
${lead.message}`;
    await sendMail(config.OWNER_EMAIL, `[CodeKitchen lead] ${lead.subject} — ${lead.name}`, ownerBody, lead.email);
}
export async function sendDraftApproval(lead, draftUrl) {
    const pkg = lead.package || '—';
    const amount = pkg.includes('Standard') ? 999 : 599;
    const deposit = 200;
    const remainder = amount - deposit;
    const pkgName = pkg.includes('Standard') ? 'Standard — $999' : 'Starter — $599';
    const clientBody = `Hi ${lead.business || lead.name || 'there'},

Your draft is ready. Review it here:
  ${draftUrl}

If it looks good, pay the deposit to secure your build:
  ${config.SITE_URL}/pay?order=${lead.id}

Package: ${pkgName}
Total: $${amount} (Deposit: $${deposit} now, Remainder: $${remainder} at handoff)

Reply to this email if anything needs changing — we'll fix it.

Talk soon,
Webchef
${config.SITE_URL}`;
    await sendMail(lead.email, 'Your draft is ready — CodeKitchen', clientBody);
}
export async function sendHandoff(lead) {
    const hasDomain = lead.domain && !lead.domain.includes('needs one') && !lead.domain.includes('No domain');
    const care = lead.care_status === 'active';
    const domainLine = hasDomain && care
        ? `Your domain (${lead.domain}) is registered and pointed at your site — nothing for you to do.`
        : hasDomain
            ? `DNS for ${lead.domain}: keep the records as they are and the site keeps working wherever it moves. I'll send exact copy-paste records when you're ready to self-host.`
            : `We'll pick and register your domain together (~$12/yr, in your name).`;
    const hostingPara = care
        ? `Hosting: I handle it. Your site stays live, monitored, and updated as part of your care plan — you never touch a server.`
        : `Hosting for the next 30 days is on me — your site stays exactly where it is while you decide.

After that, two options:
1. Care plan ($120/mo) — I keep hosting, edits, and monitoring. Reply 'care' and I'll set it up.
2. Self-host (free, ~15 min) — I send you a zip of your site plus step-by-step instructions for Cloudflare Pages (free). You create the account with your own email — I never need your logins.

Either way the code is yours forever, and your domain stays in your name.`;
    const careLine = care
        ? `Care plan: active at $120/mo. Cancel anytime with an email — no lock-in.`
        : `Care plan: none. You can add it anytime by replying to this email.`;
    const body = HANDOFF_EMAIL
        .replace('{name}', lead.business || lead.name || 'there')
        .replace('{site}', config.SITE_URL)
        .replace('{domain_line}', domainLine)
        .replace('{hosting_para}', hostingPara)
        .replace('{care_line}', careLine);
    await sendMail(lead.email, 'Your website is yours — next steps', body);
    const ownerMsg = `Handoff email sent to ${lead.email} for order ${lead.id}.
Care plan: ${care ? 'yes' : 'no'} — ${care ? 'nothing to do.' : '30-day window started; calendar a takedown check.'}`;
    await sendMail(config.OWNER_EMAIL, `[handoff sent] ${lead.business || lead.name}`, ownerMsg);
}
//# sourceMappingURL=email.js.map