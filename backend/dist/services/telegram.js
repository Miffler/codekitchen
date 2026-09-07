import { config } from '../config.js';
async function tgSend(token, chat, text) {
    if (!token || !chat)
        return false;
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chat, text }),
        });
        return res.ok;
    }
    catch (error) {
        console.error('Telegram send failed:', error);
        return false;
    }
}
export async function pingNigformant(text) {
    return tgSend(config.NIGFORMANT_TG_TOKEN, config.NIGFORMANT_TG_CHAT, text);
}
export async function pingMain(text) {
    return tgSend(config.TG_TOKEN, config.TG_CHAT, text);
}
export async function notifyNewOrder(lead) {
    const text = `📦 New CodeKitchen ORDER

Business: ${lead.business || lead.name || '—'}
Package: ${lead.package || '—'}
Care: ${lead.care || 'No care plan'}
Domain: ${lead.domain || '—'}
Phone: ${lead.phone || '— not provided —'}
Email: ${lead.email}
Note: ${lead.note?.slice(0, 200) || '—'}

Call brief sent to your email.`;
    return pingNigformant(text);
}
export async function notifyNewEnquiry(lead) {
    const text = `🔥 New CodeKitchen enquiry

Name: ${lead.name || '—'}
Email: ${lead.email}
Interest: ${lead.subject}

All fields:
${lead.message?.slice(0, 800)}`;
    return pingMain(text);
}
export async function notifyDepositPaid(lead) {
    const text = `✅ Deposit paid

Business: ${lead.business || lead.name}
Order: ${lead.id}
Amount: $200

Draft: ${lead.draft_url || '—'}

Build final version → deploy → remainder at handoff.`;
    return pingNigformant(text);
}
export async function notifyFullyPaid(lead) {
    const text = `✅ FULLY PAID + handoff sent

Business: ${lead.business || lead.name}
Order: ${lead.id}
${lead.care_status === 'active' ? 'Care plan active.' : 'No care plan — 30-day self-host window started.'}`;
    return pingNigformant(text);
}
export async function notifyCareStatus(lead, status) {
    const text = `⚠️ Care plan ${status.toUpperCase()}

Business: ${lead.business || lead.name}
Email: ${lead.email}
Order: ${lead.id}

${status === 'failed'
        ? 'Card was declined — Stripe will retry. If it keeps failing, reach out to the client.'
        : 'Client cancelled the care plan.'}`;
    return pingNigformant(text);
}
//# sourceMappingURL=telegram.js.map