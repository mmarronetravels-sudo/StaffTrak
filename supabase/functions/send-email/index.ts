import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json'
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  try {
    const { to, template, data } = await req.json()

    if (!to || !template || !data) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers }
      )
    }

    // Subject line per template. The 'generic' template (used by the in-app
    // notifications wave) carries its own subject + message in `data`, so any
    // new event can reuse this function without adding a case here.
    let subject
    switch (template) {
      case 'goal_approved':
        subject = 'Your Goal Has Been Approved'
        break
      case 'goal_submitted':
        subject = `Goal Submitted for Approval: ${data.staffName || ''}`.trim()
        break
      case 'goal_revision':
        subject = 'Goal Revision Requested'
        break
      case 'observation_scheduled':
        subject = `Observation Scheduled: ${data.date || ''}`.trim()
        break
      case 'evaluation_ready':
        subject = 'Your Evaluation Is Ready'
        break
      default:
        // 'generic' and any unknown template fall back to the caller's subject.
        subject = data.subject || 'StaffTrak Notification'
    }

    const greetingName = data.recipientName || data.staffName || 'there'

    // Body: prefer an explicit message (generic/new events); otherwise fall
    // back to the legacy goal/evaluator lines so existing templates render the
    // same as before.
    const bodyLines = data.message
      ? `<p style="color: #666666; white-space: pre-wrap;">${data.message}</p>`
      : `
          <p style="color: #666666;">${data.goalTitle ? `Goal: ${data.goalTitle}` : ''}</p>
          <p style="color: #666666;">${data.evaluatorName ? `From: ${data.evaluatorName}` : ''}</p>
          ${data.feedback ? `<p style="color: #666666;">${data.feedback}</p>` : ''}
        `

    const ctaLink = data.link || 'https://stafftrak.scholarpathsystems.org'

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #2c3e7e; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">StaffTrak</h1>
        </div>
        <div style="padding: 30px; background-color: #f9fafb;">
          <h2 style="color: #2c3e7e;">${subject}</h2>
          <p style="color: #666666;">Hello ${greetingName},</p>
          ${bodyLines}
          <a href="${ctaLink}"
             style="display: inline-block; background-color: #2c3e7e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px;">
            Open StaffTrak
          </a>
        </div>
        <div style="padding: 20px; text-align: center; color: #666666; font-size: 12px;">
          <p>© 2026 StaffTrak / ScholarPath Systems</p>
        </div>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'StaffTrak <notifications@scholarpathsystems.org>',
        to: to,
        subject: subject,
        html: html,
      }),
    })

    const resendData = await res.json()

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: resendData }),
        { status: 500, headers }
      )
    }

    return new Response(
      JSON.stringify({ success: true, id: resendData.id }),
      { status: 200, headers }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers }
    )
  }
})
