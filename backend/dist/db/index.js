import Database from 'better-sqlite3';
import { config } from '../config.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
const dbDir = dirname(config.DATABASE_PATH);
mkdirSync(dbDir, { recursive: true });
const sqlite = new Database(config.DATABASE_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.exec(`
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  name TEXT,
  email TEXT NOT NULL,
  subject TEXT,
  message TEXT,
  source TEXT,
  kind TEXT NOT NULL,
  business TEXT,
  phone TEXT,
  package TEXT,
  care TEXT,
  domain TEXT,
  note TEXT,
  approved INTEGER DEFAULT 0,
  approved_at TEXT,
  draft_url TEXT,
  deposit_paid INTEGER DEFAULT 0,
  deposit_paid_at TEXT,
  stripe_deposit_session_id TEXT,
  remainder_paid INTEGER DEFAULT 0,
  remainder_paid_at TEXT,
  stripe_remainder_session_id TEXT,
  care_status TEXT DEFAULT 'none',
  care_started_at TEXT,
  care_last_paid_at TEXT,
  stripe_subscription_id TEXT,
  care_cancelled_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_ts ON leads(ts);
CREATE INDEX IF NOT EXISTS idx_leads_order_id ON leads(id);
`);
export { sqlite as db };
export function getLeadById(id) {
    return sqlite.prepare('SELECT * FROM leads WHERE id = ?').get(id);
}
export function getLeadByOrderId(orderId) {
    return sqlite.prepare('SELECT * FROM leads WHERE id = ?').get(orderId);
}
export function getLeadBySubscriptionId(subscriptionId) {
    return sqlite.prepare('SELECT * FROM leads WHERE stripe_subscription_id = ?').get(subscriptionId);
}
export function upsertLead(lead) {
    const cols = Object.keys(lead);
    const placeholders = cols.map(() => '?').join(', ');
    const updates = cols.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ');
    return sqlite.prepare(`
    INSERT INTO leads (${cols.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${updates}, updated_at = datetime('now')
  `).run(...cols.map(c => lead[c]));
}
export function updateLead(id, updates) {
    const cols = Object.keys(updates);
    const setClause = cols.map(c => `${c} = ?`).join(', ');
    return sqlite.prepare(`UPDATE leads SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
        .run(...cols.map(c => updates[c]), id);
}
export function getAllOrders() {
    return sqlite.prepare(`
    SELECT * FROM leads 
    WHERE kind = 'order' 
    ORDER BY ts DESC
  `).all();
}
export function getLeadStats() {
    const total = sqlite.prepare('SELECT COUNT(*) as count FROM leads WHERE kind = "order"').get();
    const depositPaid = sqlite.prepare('SELECT COUNT(*) as count FROM leads WHERE kind = "order" AND deposit_paid = 1').get();
    const fullyPaid = sqlite.prepare('SELECT COUNT(*) as count FROM leads WHERE kind = "order" AND remainder_paid = 1').get();
    const careActive = sqlite.prepare('SELECT COUNT(*) as count FROM leads WHERE kind = "order" AND care_status = "active"').get();
    return {
        total: total?.count || 0,
        depositPaid: depositPaid?.count || 0,
        fullyPaid: fullyPaid?.count || 0,
        careActive: careActive?.count || 0
    };
}
//# sourceMappingURL=index.js.map