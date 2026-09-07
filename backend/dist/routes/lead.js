import { z } from 'zod';
import { config } from '../config.js';
import { upsertLead, getLeadById, getAllOrders, getLeadStats, updateLead } from '../db.js';
import { sendOrderConfirmation, sendEnquiryConfirmation, sendDraftApproval } from '../services/email.js';
import { notifyNewOrder, notifyNewEnquiry } from '../services/telegram.js';
import { createCheckoutSession, handleWebhook, getDepositAmount, getTotalAmount, getRemainderAmount, isStripeConfigured } from '../services/stripe.js';
const disposableDomains = new Set([
    '10minutemail.com', 'guerrillamail.com', 'tempmail.com', 'throwawaymail.com',
    'mailinator.com', 'fakeinbox.com', 'trashmail.com', 'yopmail.com',
    'getnada.com', 'dispostable.com', 'maildrop.cc', 'sharklasers.com',
    'grr.la', 'spamgourmet.com', 'mintemail.com', 'mailnesia.com',
]);
const HONEYPOT_FIELD = 'website_url';
const LeadSchema = z.object({
    email: z.string().email(),
    name: z.string().optional(),
    contact_name: z.string().optional(),
    business: z.string().optional(),
    subject: z.string().optional(),
    need: z.string().optional(),
    message: z.string().optional(),
    about: z.string().optional(),
    note: z.string().optional(),
    phone: z.string().optional(),
    package: z.string().optional(),
    care: z.string().optional(),
    domain: z.string().optional(),
    source: z.string().optional(),
    [HONEYPOT_FIELD]: z.string().optional(),
}).passthrough();
export async function leadRoutes(app) {
    app.post('/lead', async (request, reply) => {
        const data = request.body;
        if (data[HONEYPOT_FIELD]) {
            console.log('Honeypot triggered from', request.ip);
            return reply.send({ ok: true });
        }
        const email = data.email || data.Email;
        if (email) {
            const domain = email.split('@')[1]?.toLowerCase();
            if (domain && disposableDomains.has(domain)) {
                return reply.status(400).send({ error: 'email not accepted' });
            }
        }
        const parsed = LeadSchema.safeParse(data);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'valid email required' });
        }
        const clean = parsed.data;
        const emailStr = clean.email;
        const name = clean.contact_name || clean.name || clean.business || clean.Business || 'there';
        const subject = clean.subject || clean.need || 'New website enquiry';
        const isOrder = !!clean.package;
        const business = clean.business || clean.Business || '—';
        const phone = clean.phone || clean.Phone || '—';
        const pkg = clean.package || '—';
        const care = clean.care ? 'Care Plan add-on: +$120/mo' : 'No care plan';
        const domain = clean.domain || '—';
        const note = clean.note || clean.Note || '—';
        const skipFields = new Set(['_gotcha', '_captcha', '_next', '_subject', HONEYPOT_FIELD, 'care']);
        const msgParts = Object.entries(clean)
            .filter(([k, v]) => !skipFields.has(k) && v && String(v).trim())
            .map(([k, v]) => `${k}: ${String(v).trim()}`);
        const message = msgParts.join('\n');
        const source = request.headers.referer || clean.source || '';
        if (!emailStr || !message) {
            return reply.status(400).send({ error: 'empty submission' });
        }
        const id = crypto.randomUUID().slice(0, 12);
        const ts = new Date().toISOString();
        const lead = {
            id,
            ts,
            name,
            email: emailStr,
            subject,
            message,
            source,
            kind: isOrder ? 'order' : 'enquiry',
            business,
            phone,
            package: pkg,
            care,
            domain,
            note,
            approved: 0,
        };
        upsertLead(lead);
        if (isOrder) {
            sendOrderConfirmation(lead).catch(console.error);
            notifyNewOrder(lead).catch(console.error);
        }
        else {
            sendEnquiryConfirmation(lead).catch(console.error);
            notifyNewEnquiry(lead).catch(console.error);
        }
        if (request.headers['content-type']?.includes('application/json')) {
            return reply.send({ ok: true });
        }
        return reply.redirect(`${config.SITE_URL}/contact?sent=1`, 303);
    });
    app.get('/pay', async (request, reply) => {
        const orderId = request.query.order;
        if (!orderId)
            return reply.status(400).send('Missing order ID');
        const lead = getLeadById(orderId);
        if (!lead)
            return reply.status(404).send('Order not found');
        const isStandard = lead.package?.includes('Standard') || false;
        const amount = getTotalAmount(lead);
        const depositAmount = getDepositAmount(lead);
        const remainderAmount = getRemainderAmount(lead);
        const pkgName = isStandard ? 'Standard — $999' : 'Starter — $599';
        const care = lead.care || '—';
        const domain = lead.domain || '—';
        const business = lead.business || lead.name || '—';
        const draftUrl = lead.draft_url || `${config.SITE_URL}/draft`;
        let state = 0;
        if (lead.deposit_paid) {
            state = lead.remainder_paid ? 2 : 1;
        }
        const stripeConfigured = isStripeConfigured();
        if (state === 2) {
            const careActive = lead.care_status === 'active';
            const wantedCare = (lead.care?.toLowerCase().includes('care') || false) && !careActive && !lead.care_cancelled_at;
            return reply.type('text/html').send(`
        <!DOCTYPE html><html lang="en"><head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Paid in full — CodeKitchen</title>
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          body{font-family:system-ui;background:#000;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
          .card{background:#030303;border:1px solid #1a1a1a;border-radius:16px;padding:32px;max-width:520px;width:100%}
          h1{font-size:22px;margin-bottom:8px}
          .sub{color:#a6a6a6;margin-bottom:24px}
          .row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #1a1a1a}
          .row:last-of-type{border:none}
          .label{color:#a6a6a6} .val{font-weight:600}
          .total{font-size:18px;border-top:2px solid #1a1a1a;padding-top:16px}
          .btn{display:block;width:100%;margin-top:24px;padding:14px;border-radius:10px;background:#0099ff;color:#000;font-weight:700;text-align:center;text-decoration:none;border:none;cursor:pointer}
          .btn:disabled{opacity:.5;cursor:not-allowed}
          .secure{font-size:12px;color:#a6a6a6;text-align:center;margin-top:12px}
        </style>
        </head><body>
        <div class="card">
          <h1>Paid in full — thank you</h1>
          <p class="sub">Deposit paid on ${lead.deposit_paid_at || '—'}, remainder on ${lead.remainder_paid_at || '—'}.</p>
          ${careActive ? `<p style='color:#2e7d4f;font-weight:600'>Care plan active — $120/mo. Last payment: ${lead.care_last_paid_at || '—'}.</p>` : ''}
          ${wantedCare && stripeConfigured && config.STRIPE_PRICE_CARE ? `
            <div style='border:1px solid #1a1a1a;border-radius:12px;padding:20px;margin-top:20px;text-align:left'>
              <b>Care Plan — $120/mo</b>
              <p style='color:#a6a6a6;font-size:14px;margin:8px 0 12px'>Hosting, monthly edits, analytics, priority replies. Cancel anytime.</p>
              <form action="/api/create-checkout" method="POST">
                <input type="hidden" name="order_id" value="${orderId}">
                <input type="hidden" name="payment_type" value="care">
                <button class="btn" type="submit">Subscribe — $120/mo</button>
              </form>
            </div>
          ` : ''}
        </div>
        </body></html>
      `);
        }
        if (state === 1) {
            const priceId = isStandard ? config.STRIPE_PRICE_STANDARD_REMAINDER : config.STRIPE_PRICE_STARTER_REMAINDER;
            return reply.type('text/html').send(`
        <!DOCTYPE html><html lang="en"><head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pay remainder — CodeKitchen</title>
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          body{font-family:system-ui;background:#000;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
          .card{background:#030303;border:1px solid #1a1a1a;border-radius:16px;padding:32px;max-width:480px;width:100%}
          h1{font-size:22px;margin-bottom:8px}
          .sub{color:#a6a6a6;margin-bottom:24px}
          .row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #1a1a1a}
          .row:last-of-type{border:none}
          .label{color:#a6a6a6} .val{font-weight:600}
          .total{font-size:18px;border-top:2px solid #1a1a1a;padding-top:16px}
          .btn{display:block;width:100%;margin-top:24px;padding:14px;border-radius:10px;background:#0099ff;color:#000;font-weight:700;text-align:center;text-decoration:none;border:none;cursor:pointer}
          .btn:disabled{opacity:.5;cursor:not-allowed}
          .secure{font-size:12px;color:#a6a6a6;text-align:center;margin-top:12px}
          .draft-link{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:16px;margin:16px 0;font-family:monospace;font-size:13px;word-break:break-all}
        </style>
        </head><body>
        <div class="card">
          <h1>Pay remainder</h1>
          <p class="sub">${business} — ${pkgName}</p>
          <div class="row"><span class="label">Package</span><span class="val">${pkgName}</span></div>
          <div class="row"><span class="label">Care Plan</span><span class="val">${care}</span></div>
          <div class="row"><span class="label">Domain</span><span class="val">${domain}</span></div>
          <div class="row"><span class="label">Deposit paid</span><span class="val">$${depositAmount}</span></div>
          <div class="row total"><span class="label">Remainder due</span><span class="val">$${remainderAmount}</span></div>
          <p style="margin-top:16px;font-size:14px;color:#a6a6a6">Draft: <a class="draft-link" href="${draftUrl}" target="_blank">${draftUrl}</a></p>
          <form action="/api/create-checkout" method="POST">
            <input type="hidden" name="order_id" value="${orderId}">
            <input type="hidden" name="payment_type" value="remainder">
            <button class="btn" type="submit" ${!stripeConfigured || !priceId ? 'disabled' : ''}>${stripeConfigured && priceId ? `Pay $${remainderAmount}` : 'Stripe not configured'}</button>
          </form>
          <p class="secure">Secure payment via Stripe</p>
        </div>
        </body></html>
      `);
        }
        const depositPriceId = isStandard ? config.STRIPE_PRICE_STANDARD_DEPOSIT : config.STRIPE_PRICE_STARTER_DEPOSIT;
        return reply.type('text/html').send(`
      <!DOCTYPE html><html lang="en"><head>
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pay deposit — CodeKitchen</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:system-ui;background:#000;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
        .card{background:#030303;border:1px solid #1a1a1a;border-radius:16px;padding:32px;max-width:480px;width:100%}
        h1{font-size:22px;margin-bottom:8px}
        .sub{color:#a6a6a6;margin-bottom:24px}
        .row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #1a1a1a}
        .row:last-of-type{border:none}
        .label{color:#a6a6a6} .val{font-weight:600}
        .total{font-size:18px;border-top:2px solid #1a1a1a;padding-top:16px}
        .btn{display:block;width:100%;margin-top:24px;padding:14px;border-radius:10px;background:#0099ff;color:#000;font-weight:700;text-align:center;text-decoration:none;border:none;cursor:pointer}
        .btn:disabled{opacity:.5;cursor:not-allowed}
        .secure{font-size:12px;color:#a6a6a6;text-align:center;margin-top:12px}
        .draft-link{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:16px;margin:16px 0;font-family:monospace;font-size:13px;word-break:break-all}
      </style>
      </head><body>
      <div class="card">
        <h1>Deposit to secure your spot</h1>
        <p class="sub">${business} — ${pkgName}</p>
        <div class="row"><span class="label">Package</span><span class="val">${pkgName}</span></div>
        <div class="row"><span class="label">Care Plan</span><span class="val">${care}</span></div>
        <div class="row"><span class="label">Domain</span><span class="val">${domain}</span></div>
        <div class="row"><span class="label">Total project</span><span class="val">$${amount}</span></div>
        <div class="row total"><span class="label">Deposit (secures build)</span><span class="val">$${depositAmount}</span></div>
        <p style="margin-top:16px;font-size:14px;color:#a6a6a6">Your draft is ready: <a class="draft-link" href="${draftUrl}" target="_blank">${draftUrl}</a></p>
        <p style="font-size:14px;color:#a6a6a6">Pay the deposit to begin the final build. Remainder ($${remainderAmount}) due at handoff.</p>
        <form action="/api/create-checkout" method="POST">
          <input type="hidden" name="order_id" value="${orderId}">
          <input type="hidden" name="payment_type" value="deposit">
          <button class="btn" type="submit" ${!stripeConfigured || !depositPriceId ? 'disabled' : ''}>${stripeConfigured && depositPriceId ? `Pay $${depositAmount}` : 'Stripe not configured'}</button>
        </form>
        <p class="secure">Secure payment via Stripe</p>
      </div>
      </body></html>
    `);
    });
    app.post('/create-checkout', async (request, reply) => {
        const { order_id, payment_type } = request.body;
        if (!order_id || !payment_type) {
            return reply.status(400).send({ error: 'order_id and payment_type required' });
        }
        const lead = getLeadById(order_id);
        if (!lead)
            return reply.status(404).send({ error: 'Order not found' });
        if (lead.deposit_paid && lead.remainder_paid) {
            return reply.status(400).send({ error: 'Already fully paid' });
        }
        try {
            const url = await createCheckoutSession(order_id, payment_type, lead);
            if (!url)
                return reply.status(500).send({ error: 'Stripe not configured' });
            return reply.redirect(url, 303);
        }
        catch (error) {
            console.error('Checkout failed:', error);
            return reply.status(500).send({ error: error.message || 'checkout failed' });
        }
    });
    app.post('/stripe-webhook', async (request, reply) => {
        if (!config.STRIPE_SECRET_KEY || !config.STRIPE_WEBHOOK_SECRET) {
            return reply.status(500).send({ error: 'webhook not configured' });
        }
        const payload = request.body;
        const signature = request.headers['stripe-signature'];
        try {
            await handleWebhook(payload, signature);
            return reply.send('');
        }
        catch (error) {
            console.error('Webhook error:', error);
            return reply.status(400).send(error.message);
        }
    });
    app.post('/approve-draft', async (request, reply) => {
        const auth = request.headers['x-approve-secret'];
        if (auth !== config.APPROVE_SECRET) {
            return reply.status(401).send({ error: 'unauthorized' });
        }
        const { order_id, draft_url } = request.body;
        if (!order_id || !draft_url) {
            return reply.status(400).send({ error: 'order_id and draft_url required' });
        }
        const lead = getLeadById(order_id);
        if (!lead)
            return reply.status(404).send({ error: 'order not found' });
        updateLead(order_id, {
            approved: 1,
            approved_at: new Date().toISOString(),
            draft_url,
        });
        sendDraftApproval({ ...lead, draft_url }, draft_url).catch(console.error);
        return reply.send({ ok: true, order_id, draft_url });
    });
    app.get('/health', async () => ({
        ok: true,
        smtp: !!config.SMTP_PASS,
        stripe: isStripeConfigured(),
        db: true,
    }));
    app.get('/ledger', async (request, reply) => {
        const key = request.query.key;
        if (key !== config.APPROVE_SECRET) {
            return reply.status(401).send('Unauthorized');
        }
        const orders = getAllOrders();
        const stats = getLeadStats();
        const rows = orders.map((r) => `
      <tr>
        <td>${r.ts?.slice(0, 10)}</td>
        <td><b>${r.business || r.name || '—'}</b></td>
        <td>${r.email}</td>
        <td>${r["package"]?.includes('Standard') ? 'Std' : 'Strt'}</td>
        <td>${r.remainder_paid ? 'PAID FULL' : r.deposit_paid ? 'deposit ✓' : '—'}</td>
        <td>${r.care_status || (r.care?.toLowerCase().includes('care') ? 'wanted, not started' : '—')}</td>
        <td><a href="/api/pay?order=${r.id}" style="color:#0099ff">pay page</a></td>
      </tr>
    `).join('');
        return reply.type('text/html').send(`
      <!DOCTYPE html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta name="robots" content="noindex">
      <title>CodeKitchen ledger</title>
      <style>
        body{font-family:system-ui;background:#000;color:#fff;padding:24px;margin:0}
        h1{font-size:20px} p{color:#a6a6a6;font-size:13px}
        table{border-collapse:collapse;width:100%;max-width:1000px;font-size:14px}
        th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #1a1a1a}
        th{color:#a6a6a6;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
        a{color:#0099ff}
        .stats{display:flex;gap:24px;margin-bottom:16px;flex-wrap:wrap}
        .stat{background:#030303;border:1px solid #1a1a1a;border-radius:8px;padding:12px 16px}
        .stat b{display:block;font-size:20px;color:#0099ff}
        .stat span{font-size:12px;color:#a6a6a6}
      </style></head><body>
      <h1>CodeKitchen ledger</h1>
      <p>${orders.length} orders · newest first · bookmark with ?key=YOUR_SECRET</p>
      <div class="stats">
        <div class="stat"><b>${stats.total}</b><span>Total Orders</span></div>
        <div class="stat"><b>${stats.depositPaid}</b><span>Deposits Paid</span></div>
        <div class="stat"><b>${stats.fullyPaid}</b><span>Fully Paid</span></div>
        <div class="stat"><b>${stats.careActive}</b><span>Active Care Plans</span></div>
      </div>
      <table>
        <tr><th>Date</th><th>Business</th><th>Email</th><th>Pkg</th><th>Payment</th><th>Care plan</th><th></th></tr>
        ${rows}
      </table>
      </body></html>
    `);
    });
}
//# sourceMappingURL=lead.js.map