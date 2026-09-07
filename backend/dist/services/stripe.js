import Stripe from 'stripe';
import { config } from '../config.js';
import { updateLead } from '../db.js';
let stripe = null;
function getStripe() {
    if (!stripe && config.STRIPE_SECRET_KEY) {
        stripe = new Stripe(config.STRIPE_SECRET_KEY, {
            apiVersion: '2024-06-20',
        });
    }
    return stripe;
}
export function isStripeConfigured() {
    return !!config.STRIPE_SECRET_KEY;
}
export async function createCheckoutSession(orderId, paymentType, lead) {
    const sk = getStripe();
    if (!sk)
        return null;
    const isStandard = lead.package?.includes('Standard') || false;
    let priceId;
    let mode = 'payment';
    if (paymentType === 'care') {
        priceId = config.STRIPE_PRICE_CARE;
        mode = 'subscription';
        if (!priceId)
            throw new Error('Care plan Price ID not configured');
    }
    else if (paymentType === 'remainder') {
        priceId = isStandard ? config.STRIPE_PRICE_STANDARD_REMAINDER : config.STRIPE_PRICE_STARTER_REMAINDER;
        if (!priceId)
            throw new Error('Remainder Price ID not configured');
    }
    else {
        priceId = isStandard ? config.STRIPE_PRICE_STANDARD_DEPOSIT : config.STRIPE_PRICE_STARTER_DEPOSIT;
        if (!priceId)
            throw new Error('Deposit Price ID not configured');
    }
    const session = await sk.checkout.sessions.create({
        mode,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${config.SITE_URL}/pay?order=${orderId}&success=1`,
        cancel_url: `${config.SITE_URL}/pay?order=${orderId}&canceled=1`,
        metadata: {
            order_id: orderId,
            payment_type: paymentType,
        },
        subscription_data: mode === 'subscription' ? {
            metadata: { order_id: orderId },
        } : undefined,
        customer_email: lead.email,
    });
    return session.url;
}
export async function handleWebhook(payload, signature) {
    const sk = getStripe();
    if (!sk || !config.STRIPE_WEBHOOK_SECRET) {
        throw new Error('Stripe not configured');
    }
    let event;
    try {
        event = sk.webhooks.constructEvent(payload, signature, config.STRIPE_WEBHOOK_SECRET);
    }
    catch (err) {
        console.error('Webhook signature verification failed:', err);
        throw new Error('Bad signature');
    }
    const orderId = event.data.object.metadata?.order_id;
    if (!orderId) {
        console.warn('Event missing order_id metadata:', event.type);
        return { received: true };
    }
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            const paymentType = session.metadata?.payment_type || 'deposit';
            await markPayment(orderId, session, paymentType);
            break;
        }
        case 'invoice.payment_failed': {
            await markCareStatus(orderId, 'failed');
            break;
        }
        case 'customer.subscription.deleted': {
            await markCareStatus(orderId, 'cancelled');
            break;
        }
        case 'invoice.paid': {
            const invoice = event.data.object;
            if (invoice.billing_reason === 'subscription_cycle') {
                await markCarePaid(orderId);
            }
            break;
        }
    }
    return { received: true };
}
async function markPayment(orderId, session, paymentType) {
    const updates = {};
    if (paymentType === 'deposit') {
        updates.deposit_paid = 1;
        updates.deposit_paid_at = new Date().toISOString();
        updates.stripe_deposit_session_id = session.id;
        updates.stripe_deposit_intent = session.payment_intent;
    }
    else if (paymentType === 'remainder') {
        updates.remainder_paid = 1;
        updates.remainder_paid_at = new Date().toISOString();
        updates.stripe_remainder_session_id = session.id;
        updates.stripe_remainder_intent = session.payment_intent;
    }
    else if (paymentType === 'care') {
        updates.care_status = 'active';
        updates.care_started_at = new Date().toISOString();
        updates.care_last_paid_at = new Date().toISOString();
        updates.stripe_subscription_id = session.subscription;
    }
    updateLead(orderId, updates);
}
async function markCareStatus(orderId, status) {
    updateLead(orderId, {
        care_status: status,
        [`care_${status}_at`]: new Date().toISOString(),
    });
}
async function markCarePaid(orderId) {
    updateLead(orderId, {
        care_last_paid_at: new Date().toISOString(),
        care_status: 'active',
    });
}
export function getDepositAmount(lead) {
    return 200;
}
export function getTotalAmount(lead) {
    return lead.package?.includes('Standard') ? 999 : 599;
}
export function getRemainderAmount(lead) {
    return getTotalAmount(lead) - getDepositAmount(lead);
}
//# sourceMappingURL=stripe.js.map