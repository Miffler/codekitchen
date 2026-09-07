import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { leadRoutes } from './routes/lead.js';
import { isStripeConfigured } from './services/stripe.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = Fastify({
    logger: config.NODE_ENV === 'development' ? {
        level: 'info',
        transport: {
            target: 'pino-pretty',
            options: { colorize: true },
        },
    } : { level: 'warn' },
});

// Health check hook - runs before ANY route matching, before ANY plugins
app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') {
        return reply.send({ ok: true, smtp: !!config.SMTP_PASS, stripe: isStripeConfigured(), db: true });
    }
});

// CORS
await app.register(cors, {
    origin: true,
    credentials: true,
});
// Rate limiting
await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
});
// Static file serving for ASSETS ONLY - single registration, adds sendFile decorator
await app.register(staticPlugin, {
    root: join(__dirname, '..'),
    prefix: '/assets/',
    decorateReply: true,
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    },
});

// Use process.cwd() for reliable path resolution in ES modules
const BASE_DIR = process.cwd();
const fs = await import('fs/promises');
const path = await import('path');

async function serveHtml(reply, filePath) {
    try {
        const fullPath = path.join(BASE_DIR, filePath);
        console.log(`[DEBUG] Serving HTML from: ${fullPath}`);
        const content = await fs.readFile(fullPath, 'utf-8');
        return reply.type('text/html').send(content);
    } catch (err) {
        console.log(`[DEBUG] Failed to serve ${filePath}: ${err.message}`);
        return reply.status(404).send('Not found');
    }
}

async function serveStatic(reply, filePath, contentType) {
    try {
        const fullPath = path.join(BASE_DIR, filePath);
        console.log(`[DEBUG] Serving static from: ${fullPath}`);
        const content = await fs.readFile(fullPath);
        return reply.type(contentType).send(content);
    } catch (err) {
        console.log(`[DEBUG] Failed to serve ${filePath}: ${err.message}`);
        return reply.status(404).send('Not found');
    }
}

// Explicit routes for all pages - registered BEFORE wildcard fallback
app.get('/', async (request, reply) => {
    return serveHtml(reply, 'index.html');
});
app.get('/index.html', async (request, reply) => {
    return serveHtml(reply, 'index.html');
});
app.get('/order/', async (request, reply) => {
    return serveHtml(reply, 'order/index.html');
});
app.get('/order/index.html', async (request, reply) => {
    return serveHtml(reply, 'order/index.html');
});
app.get('/contact/', async (request, reply) => {
    return serveHtml(reply, 'contact/index.html');
});
app.get('/contact/index.html', async (request, reply) => {
    return serveHtml(reply, 'contact/index.html');
});
app.get('/404.html', async (request, reply) => {
    return serveHtml(reply, '404.html');
});
app.get('/favicon.svg', async (request, reply) => {
    return serveStatic(reply, 'favicon.svg', 'image/svg+xml');
});
app.get('/icons.svg', async (request, reply) => {
    return serveStatic(reply, 'icons.svg', 'image/svg+xml');
});

// SPA fallback - ONLY matches non-API, non-asset paths WITHOUT file extensions
// This avoids catching /health, /favicon.svg, /icons.svg, etc.
app.get('/:path*', async (request, reply) => {
    const url = request.url;
    // Skip API, assets, health (with or without trailing slash), and files with extensions
    if (url.startsWith('/api/') || url.startsWith('/assets/') || url.startsWith('/health') || url.includes('.') || url === '/') {
        return reply.status(404).send({ error: 'Not found' });
    }
    return serveHtml(reply, 'index.html');
});
// API routes
await app.register(leadRoutes, { prefix: '/api' });

// Start server
async function start() {
    try {
        await app.listen({ port: config.PORT, host: config.HOST });
        console.log(`🚀 CodeKitchen backend running on http://${config.HOST}:${config.PORT}`);
        console.log(`📧 SMTP: ${config.SMTP_PASS ? 'configured' : 'NOT configured'}`);
        console.log(`💳 Stripe: ${config.STRIPE_SECRET_KEY ? 'configured' : 'NOT configured'}`);
        console.log(`🤖 Telegram: ${config.TG_TOKEN ? 'configured' : 'NOT configured'}`);
        console.log(`🗄️  Database: ${config.DATABASE_PATH}`);
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}
start();
//# sourceMappingURL=server.js.map