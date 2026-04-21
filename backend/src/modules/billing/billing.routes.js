// ── BILLING MODULE ────────────────────────────────────────────
// Stripe: assinaturas, checkout, portal do cliente, webhooks

const router = require('express').Router();
const Stripe = require('stripe');
const { query } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const logger = require('../../shared/logger');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = {
  starter:    { priceId: process.env.STRIPE_PRICE_STARTER,    name: 'Starter',    amount: 29700 },
  pro:        { priceId: process.env.STRIPE_PRICE_PRO,        name: 'Pro',         amount: 89700 },
  enterprise: { priceId: null,                                  name: 'Enterprise', amount: null  },
};

// Criar/retomar sessão de checkout Stripe
router.post('/checkout', authenticate, async (req, res, next) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan] || !PLANS[plan].priceId)
      return res.status(400).json({ error: 'Plano inválido ou disponível apenas sob consulta' });

    const clinicResult = await query(
      'SELECT * FROM clinics WHERE id = $1', [req.user.clinicId]
    );
    const clinic = clinicResult.rows[0];

    // Criar ou recuperar customer Stripe
    let customerId = clinic.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: clinic.email,
        name:  clinic.name,
        metadata: { clinicId: clinic.id },
      });
      customerId = customer.id;
      await query(
        'UPDATE clinics SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, clinic.id]
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      locale: 'pt-BR',
      line_items: [{ price: PLANS[plan].priceId, quantity: 1 }],
      success_url: `${process.env.APP_URL}/dashboard?checkout=success`,
      cancel_url:  `${process.env.APP_URL}/planos?checkout=canceled`,
      subscription_data: {
        metadata: { clinicId: clinic.id, plan },
        trial_period_days: clinic.plan_status === 'trial' ? 14 : undefined,
      },
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) { next(err); }
});

// Portal do cliente (gerenciar assinatura)
router.post('/portal', authenticate, async (req, res, next) => {
  try {
    const clinicResult = await query(
      'SELECT stripe_customer_id FROM clinics WHERE id = $1', [req.user.clinicId]
    );
    const customerId = clinicResult.rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'Sem assinatura ativa' });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.APP_URL}/configuracoes/plano`,
    });

    res.json({ portalUrl: session.url });
  } catch (err) { next(err); }
});

// Status atual da assinatura
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT plan, plan_status, trial_ends_at, stripe_subscription_id FROM clinics WHERE id = $1',
      [req.user.clinicId]
    );
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// ── WEBHOOK STRIPE ────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.warn('Stripe webhook signature inválida:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const data = event.data.object;

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const sub = await stripe.subscriptions.retrieve(data.subscription);
        const plan = sub.metadata.plan;
        const clinicId = sub.metadata.clinicId;
        await query(
          `UPDATE clinics SET
             plan = $1, plan_status = 'active',
             stripe_subscription_id = $2
           WHERE id = $3`,
          [plan, sub.id, clinicId]
        );
        logger.info(`Assinatura ativada: clínica ${clinicId}, plano ${plan}`);
        break;
      }

      case 'invoice.paid': {
        const sub = await stripe.subscriptions.retrieve(data.subscription);
        await query(
          `UPDATE clinics SET plan_status = 'active' WHERE stripe_subscription_id = $1`,
          [sub.id]
        );
        await recordBillingEvent(event, sub.metadata?.clinicId);
        break;
      }

      case 'invoice.payment_failed': {
        const sub = await stripe.subscriptions.retrieve(data.subscription);
        await query(
          `UPDATE clinics SET plan_status = 'past_due' WHERE stripe_subscription_id = $1`,
          [sub.id]
        );
        break;
      }

      case 'customer.subscription.deleted': {
        await query(
          `UPDATE clinics SET plan_status = 'canceled', plan = 'starter'
           WHERE stripe_subscription_id = $1`,
          [data.id]
        );
        break;
      }
    }
  } catch (err) {
    logger.error('Erro processando webhook Stripe:', err);
  }

  res.json({ received: true });
});

async function recordBillingEvent(event, clinicId) {
  if (!clinicId) return;
  await query(
    `INSERT INTO billing_events (clinic_id, stripe_event_id, event_type, amount_cents, currency, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (stripe_event_id) DO NOTHING`,
    [clinicId, event.id, event.type, event.data.object.amount_paid, event.data.object.currency, JSON.stringify(event.data)]
  );
}

module.exports = router;
