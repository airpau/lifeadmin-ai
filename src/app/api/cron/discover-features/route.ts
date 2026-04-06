import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function sendTelegram(message: string) {
  const token = process.env.TELEGRAM_ADMIN_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(chatId),
        text: message,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('[discover-features] Telegram send failed:', err);
  }
}

/**
 * Scan the dashboard directory for page.tsx files and map them to route paths.
 * Returns an array of discovered route paths like /dashboard/complaints.
 */
function discoverDashboardRoutes(): string[] {
  const routes: string[] = [];
  const baseDir = path.join(process.cwd(), 'src', 'app', 'dashboard');

  try {
    if (!fs.existsSync(baseDir)) {
      console.warn('[discover-features] Dashboard dir not found at:', baseDir);
      return routes;
    }

    function scan(dir: string, routePrefix: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Skip admin routes — not user-facing features
          if (entry.name === 'admin') continue;
          scan(path.join(dir, entry.name), `${routePrefix}/${entry.name}`);
        } else if (entry.name === 'page.tsx') {
          routes.push(routePrefix);
        }
      }
    }

    // Add the dashboard root itself if page.tsx exists
    if (fs.existsSync(path.join(baseDir, 'page.tsx'))) {
      routes.push('/dashboard');
    }
    scan(baseDir, '/dashboard');
  } catch (err) {
    console.error('[discover-features] Filesystem scan failed:', err);
  }

  return [...new Set(routes)]; // deduplicate
}

/**
 * Nightly feature discovery cron.
 * Scans dashboard routes and compares against product_features table.
 * Alerts Paul via Telegram for any new or removed routes.
 *
 * Schedule: Daily at 2am
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Fetch all known routes from product_features
  const { data: knownFeatures, error: fetchErr } = await supabase
    .from('product_features')
    .select('id, name, route_path, is_active');

  if (fetchErr) {
    console.error('[discover-features] DB fetch failed:', fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const knownRoutes = new Map<string, Array<{ id: string; name: string; is_active: boolean }>>();
  for (const f of knownFeatures || []) {
    if (f.route_path) {
      const existing = knownRoutes.get(f.route_path) ?? [];
      existing.push({ id: f.id, name: f.name, is_active: f.is_active });
      knownRoutes.set(f.route_path, existing);
    }
  }

  // Discover routes from filesystem
  const discoveredRoutes = discoverDashboardRoutes();
  console.log('[discover-features] Discovered routes:', discoveredRoutes);

  const newRoutes: string[] = [];
  const removedRoutes: string[] = [];
  const reactivated: string[] = [];

  // Find routes in filesystem but not in DB (or all features marked inactive)
  for (const route of discoveredRoutes) {
    const known = knownRoutes.get(route);
    if (!known) {
      newRoutes.push(route);
      // Create a draft entry — is_active=false until Paul reviews
      await supabase.from('product_features').insert({
        name: `[Draft] ${route}`,
        description: `Auto-discovered route at ${route}. Please update name and description then set is_active=true.`,
        category: 'uncategorised',
        tier_access: ['free', 'essential', 'pro'],
        route_path: route,
        is_active: false,
      });
    } else if (known.every(f => !f.is_active)) {
      reactivated.push(route);
    }
  }

  // Find routes in DB but no longer in filesystem (mark all features inactive)
  for (const [route, features] of knownRoutes.entries()) {
    if (!discoveredRoutes.includes(route)) {
      const activeFeatures = features.filter(f => f.is_active);
      if (activeFeatures.length > 0) {
        removedRoutes.push(route);
        for (const feature of activeFeatures) {
          await supabase
            .from('product_features')
            .update({ is_active: false })
            .eq('id', feature.id);
        }
      }
    }
  }

  // Send Telegram alerts if anything changed
  const alerts: string[] = [];

  if (newRoutes.length > 0) {
    alerts.push(
      `*New dashboard routes detected* (${newRoutes.length}):\n` +
      newRoutes.map(r => `  • \`${r}\` — draft entry created, set is_active=true to activate`).join('\n')
    );
  }

  if (removedRoutes.length > 0) {
    alerts.push(
      `*Routes no longer found in codebase* (${removedRoutes.length}):\n` +
      removedRoutes.map(r => {
        const features = knownRoutes.get(r) ?? [];
        const names = features.map(f => f.name).join(', ') || 'unknown';
        return `  • \`${r}\` (${names}) — marked inactive`;
      }).join('\n')
    );
  }

  if (alerts.length > 0) {
    const msg = `*Paybacker Feature Discovery*\n\n${alerts.join('\n\n')}\n\nReview at: paybacker.co.uk/dashboard/admin`;
    await sendTelegram(msg);
  }

  // Log the discovery run to business_log
  await supabase.from('business_log').insert({
    category: 'system',
    title: 'Feature discovery cron completed',
    content: `Discovered ${discoveredRoutes.length} routes. New: ${newRoutes.length}, Removed: ${removedRoutes.length}, Reactivated candidates: ${reactivated.length}.`,
    created_by: 'discover_features_cron',
  });

  console.log(`[discover-features] Done. New: ${newRoutes.length}, Removed: ${removedRoutes.length}`);
  return NextResponse.json({
    ok: true,
    discovered: discoveredRoutes.length,
    new_routes: newRoutes,
    removed_routes: removedRoutes,
  });
}
