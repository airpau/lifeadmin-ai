import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { templates, sendEmail, sendIntelligentUpdate } from '@/lib/email/marketing-automation';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();
  let abandonedCartCount = 0;
  let activationCount = 0;
  let intelligentUpdateCount = 0;

  try {
    // === 1. Abandoned Cart (Registered 1 to 24 hours ago, free tier, no subscriptions) ===
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // We get users who signed up in that window
    const { data: abandonedUsers } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .eq('subscription_tier', 'free')
      .gte('created_at', twentyFourHoursAgo)
      .lte('created_at', oneHourAgo);

    if (abandonedUsers && abandonedUsers.length > 0) {
      for (const user of abandonedUsers) {
        // Did we already send an abandoned_cart to them?
        const { count: hasMarketingTask } = await admin
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('type', 'other')
          .eq('title', 'Marketing: Abandoned Cart');

        if (hasMarketingTask && hasMarketingTask > 0) continue;

        // Check if they have subscriptions
        const { count: subsCount } = await admin
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (subsCount === 0) {
          const name = user.full_name?.split(' ')[0] || 'there';
          const success = await sendEmail(user.email, `Finish setting up Paybacker, ${name}`, templates.abandonedCart(name));
          
          if (success) {
            await admin.from('tasks').insert({
              user_id: user.id,
              type: 'other',
              title: 'Marketing: Abandoned Cart',
              description: 'Sent abandoned cart email hook.',
              status: 'resolved_success'
            });
            abandonedCartCount++;
          }
        }
      }
    }

    // === 2. Activation (Registered 2-3 days ago, free tier, no tasks) ===
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: unactivatedUsers } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .eq('subscription_tier', 'free')
      .gte('created_at', threeDaysAgo)
      .lte('created_at', twoDaysAgo);

    if (unactivatedUsers && unactivatedUsers.length > 0) {
      for (const user of unactivatedUsers) {
        const { count: hasMarketingTask } = await admin
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('type', 'other')
          .eq('title', 'Marketing: Activation');

        if (hasMarketingTask && hasMarketingTask > 0) continue;

        const { count: tasksCount } = await admin
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (tasksCount === 0 || tasksCount === null) {
          const name = user.full_name?.split(' ')[0] || 'there';
          const success = await sendEmail(user.email, `Ready to get your money back, ${name}?`, templates.activation(name));
          
          if (success) {
            await admin.from('tasks').insert({
              user_id: user.id,
              type: 'other',
              title: 'Marketing: Activation',
              description: 'Sent activation sequence email.',
              status: 'resolved_success'
            });
            activationCount++;
          }
        }
      }
    }

    // === 3. Intelligent Weekly Update / Retention (All users on essential/pro OR older than 7 days) ===
    // Need to avoid sending more than once every 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    // Select users created > 7 days ago
    const { data: activeUsers } = await admin
      .from('profiles')
      .select('id, email, full_name, subscription_tier')
      .lte('created_at', sevenDaysAgo)
      .limit(50); // Process a batch of 50 to avoid timeouts

    if (activeUsers && activeUsers.length > 0) {
      for (const user of activeUsers) {
        // Check if we sent an intelligent update in the last 7 days
        const { count: recentUpdates } = await admin
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('type', 'other')
          .eq('title', 'Marketing: Intelligent Update')
          .gte('created_at', sevenDaysAgo);

        if (recentUpdates && recentUpdates > 0) continue;

        // Fetch their context: recent subscriptions they have active
        const { data: userSubs } = await admin
          .from('subscriptions')
          .select('provider_name, category, amount')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .limit(5);

        let userContext = `User is on ${user.subscription_tier} tier.`;
        if (userSubs && userSubs.length > 0) {
          const subDetails = userSubs.map(s => `${s.provider_name} (£${s.amount})`).join(', ');
          userContext += ` They currently have active subscriptions: ${subDetails}.`;
        } else {
          userContext += ` They have not connected any subscriptions yet.`;
        }
        
        // If they had no activity updated in > 14 days, we frame it as retention context
        const { data: profileDate } = await admin.from('profiles').select('updated_at').eq('id', user.id).single();
        if (profileDate && new Date(profileDate.updated_at).getTime() < Date.now() - 14 * 24 * 60 * 60 * 1000) {
          userContext += ' Alert: User has not updated their profile or interacted with the app in over 14 days. Emphasize why they should log back in today.';
        }

        const success = await sendIntelligentUpdate(user, userContext);
        
        if (success) {
          await admin.from('tasks').insert({
            user_id: user.id,
            type: 'other',
            title: 'Marketing: Intelligent Update',
            description: 'Sent personalized AI update.',
            status: 'resolved_success'
          });
          intelligentUpdateCount++;
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      stats: {
        abandonedCartCount,
        activationCount,
        intelligentUpdateCount
      }
    });

  } catch (err: any) {
    console.error('Marketing automation error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
