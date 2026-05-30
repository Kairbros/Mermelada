import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function sendEmail({
  to,
  subject,
  html
}: {
  to: string
  subject: string
  html: string
}) {
  if (!resend) {
    console.warn('[mailer] RESEND_API_KEY not set — skipping email to', to)
    return
  }
  return resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'Mermelada <no-reply@mermelada.fun>',
    to,
    subject,
    html
  })
}
