import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';

interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  data?: any;
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'premium259.web-hosting.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false, // false for TLS - some servers require this
      auth: {
        user: process.env.SMTP_USER || 'notify@healthedu.rw',
        pass: process.env.SMTP_PASS || 'Healthedu123@',
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false // Sometimes needed for self-signed certificates
      },
      debug: process.env.NODE_ENV === 'development',
      logger: process.env.NODE_ENV === 'development'
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const { to, subject, html, text, template, data } = options;

      // For development, log the email and send it
      if (process.env.NODE_ENV !== 'production') {
        console.log('=== DEVELOPMENT EMAIL (SENDING) ===');
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`HTML: ${html?.substring(0, 200)}...`);
        console.log('=====================================');
        // Continue to send the email in development
      }

      let emailHtml = html;

      // Deliverability: always send a multipart message with a plain-text part.
      // HTML-only emails are far more likely to be flagged as spam   derive a text
      // fallback from the HTML when one isn't supplied.
      const emailText = text || (emailHtml
        ? emailHtml
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, '')
            .replace(/\s+/g, '')
            .trim()
        : undefined);

      const fromAddress = process.env.SMTP_USER || 'notify@healthedu.rw';
      const fromName = process.env.EMAIL_FROM_NAME || 'Recruitment Platform';

      // Unsubscribe headers. If an HTTPS unsubscribe URL is configured we also
      // advertise RFC 8058 one-click unsubscribe, which Gmail/Yahoo now expect for
      // bulk mail; otherwise we fall back to a mailto unsubscribe.
      const unsubUrl = process.env.EMAIL_UNSUBSCRIBE_URL;
      const listUnsubscribe = process.env.EMAIL_LIST_UNSUBSCRIBE
        || (unsubUrl
          ? `<${unsubUrl}>, <mailto:${fromAddress}?subject=unsubscribe>`
          : `<mailto:${fromAddress}?subject=unsubscribe>`);

      const mailOptions: nodemailer.SendMailOptions = {
        // A display name + a stable, authenticated From address improves trust.
        from: `"${fromName}" <${fromAddress}>`,
        to,
        subject,
        html: emailHtml,
        text: emailText,
        replyTo: process.env.EMAIL_REPLY_TO || fromAddress,
        headers: {
          'List-Unsubscribe': listUnsubscribe,
          // One-click only works with an HTTPS endpoint that accepts POST.
          ...(unsubUrl ? { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'} : {}),
        },
      };

      console.log(`📨 [EmailService] Sending to ${to}   "${subject}"`);
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`''[EmailService] Sent OK: ${info.messageId} → ${to}`);
      logger.info(`Email sent successfully: ${info.messageId}`);
    } catch (error) {
      console.error(` [EmailService] FAILED sending to ${options.to}:`, (error as Error).message);
      logger.error('Error sending email:', error);
      throw error;
    }
  }

  // Equivalent to PHP notify_email function
  async notifyEmail(emails: string, subj: string, body: string, data: string = ''): Promise<boolean> {
    try {
      // For development, log the email and send it
      if (process.env.NODE_ENV !== 'production') {
        console.log('=== DEVELOPMENT EMAIL (SENDING) ===');
        console.log(`To: ${emails}`);
        console.log(`Subject: ${subj}`);
        console.log(`Body: ${body?.substring(0, 200)}...`);
        console.log('=====================================');
        // Continue to send the email in development
      }

      const mailOptions = {
        from: process.env.SMTP_USER || 'notify@healthedu.rw',
        to: emails,
        subject: subj,
        html: body,
        replyTo: data || undefined,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error('Error sending email:', error);
      return false;
    }
  }

  // Specific email templates
  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Welcome to Recruitment Platform',
      html: `<h1>Welcome ${name}!</h1><p>Your account has been created successfully.</p>`,
      text: `Welcome ${name}! Your account has been created successfully.`,
    });
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    await this.sendEmail({
      to: email,
      subject: 'Password Reset Request',
      html: `<p>You requested a password reset. Click <a href="${resetUrl}">here</a> to reset your password.</p>`,
      text: `You requested a password reset. Visit ${resetUrl} to reset your password.`,
    });
  }

  async sendVerificationEmail(email: string, verificationToken: string): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    await this.sendEmail({
      to: email,
      subject: 'Verify Your Email',
      html: `<p>Please verify your email by clicking <a href="${verificationUrl}">here</a>.</p>`,
      text: `Please verify your email by visiting ${verificationUrl}.`,
    });
  }

  /**
   * Standard legitimacy footer for notification emails: sender identity, a "why you
   * received this" line, and a visible Unsubscribe link. Expected by CAN-SPAM and by
   * Gmail/Yahoo bulk-sender rules   its absence is a common spam signal. Address and
   * unsubscribe URL are env-driven (EMAIL_COMPANY_ADDRESS, EMAIL_UNSUBSCRIBE_URL).
   */
  private standardFooter(): string {
    const company = process.env.EMAIL_FROM_NAME || 'Recruitment Platform';
    const address = process.env.EMAIL_COMPANY_ADDRESS || '';
    const support = process.env.EMAIL_REPLY_TO || process.env.SMTP_USER || 'notify@lmbtech.rw';
    const unsubUrl = process.env.EMAIL_UNSUBSCRIBE_URL;
    const unsubLink = unsubUrl
      ? `<a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a>`
      : `<a href="mailto:${support}?subject=unsubscribe" style="color:#6b7280;text-decoration:underline">Unsubscribe</a>`;
    return `
      <div style="max-width:600px;margin:12px auto 0;padding:16px 24px;text-align:center;color:#9ca3af;font-size:12px;line-height:1.7">
        <p style="margin:0 0 4px">You received this email because you have an account with ${company}.</p>
        ${address ? `<p style="margin:0 0 4px">${address}</p>` : ''}
        <p style="margin:0">${unsubLink} &nbsp;&bull;&nbsp; <a href="mailto:${support}" style="color:#6b7280;text-decoration:underline">Contact support</a></p>
      </div>`;
  }

  /**
   * Sent when a system admin creates a user account directly (Company/User
   * Management screens)   includes the system-generated temporary password,
   * since this account was never self-registered.
   */
  async sendAdminCreatedAccountEmail(
    to: string,
    data: {
      name: string;
      email: string;
      tempPassword: string;
      roleLabel: string;
      companyName?: string;
      loginUrl: string;
      verifyUrl?: string;
    }
  ): Promise<void> {
    const { name, email, tempPassword, roleLabel, companyName, loginUrl, verifyUrl } = data;
    const subject = companyName
      ? `Your account for ${companyName} has been created`
      : 'Your account has been created';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:12px">
        <div style="background:linear-gradient(135deg,#7c3aed,#2563eb);border-radius:12px;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:20px">Welcome${name ? `, ${name}` : ''}</h1>
        </div>
        <div style="background:#fff;border-radius:12px;padding:24px;margin-top:16px">
          <p style="color:#374151;margin:0 0 8px">Hi <strong>${name || 'there'}</strong>,</p>
          <p style="color:#374151;margin:0 0 12px">An administrator created an account for you${companyName ? ` at <strong>${companyName}</strong>` : ''} as <strong>${roleLabel}</strong>.${verifyUrl ? ' Verify your email to activate it, then log in with the credentials below:': ' Use the credentials below to log in:'}</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">
            <tr><td style="padding:6px 0;color:#6b7280;width:160px">Login email</td><td style="padding:6px 0;color:#111827;font-weight:600">${email}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Temporary password</td><td style="padding:6px 0;color:#111827;font-weight:600;font-family:monospace">${tempPassword}</td></tr>
          </table>
          <div style="margin-top:20px">
            <a href="${verifyUrl || loginUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">${verifyUrl ? 'Verify Email': 'Log in'}</a>
          </div>
          ${verifyUrl ? `<p style="color:#666;font-size:14px;margin-top:16px">Or copy this link: <br><span style="color:#2563eb;word-break:break-all;font-size:12px">${verifyUrl}</span></p><p style="color:#666;font-size:13px">This verification link expires in 24 hours. Once verified, log in at <a href="${loginUrl}" style="color:#2563eb">${loginUrl}</a>.</p>` : ''}
          <p style="color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;font-size:13px;margin-top:20px">For your security, please log in and change this password as soon as possible.</p>
          <p style="color:#9ca3af;font-size:12px;margin-top:20px">This is an automated message   please do not reply.</p>
        </div>
      </div>
      ${this.standardFooter()}`;

    await this.sendEmail({ to, subject, html });
  }

  /**
   * Branded email sent to a candidate about their job application   covers the
   * initial "received" confirmation, status changes, and withdrawal confirmations.
   */
  async sendApplicationStatusEmail(
    to: string,
    data: {
      candidateName: string;
      jobTitle: string;
      companyName: string;
      statusLabel: string;
      applicationId: string;
      kind?: 'received'| 'status'| 'withdrawn';
    }
  ): Promise<void> {
    const { candidateName, jobTitle, companyName, statusLabel, kind = 'status'} = data;

    const header =
      kind === 'received'? ' Application Received'
        : kind === 'withdrawn'? 'Application Withdrawn'
          : 'Application Update';

    const intro =
      kind === 'received'
        ? `<p style="color:#374151;margin:0 0 8px">Hi <strong>${candidateName}</strong>,</p>
           <p style="color:#374151;margin:0 0 8px">Thank you   your application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been <strong>received</strong>. You can track its status anytime from your dashboard.</p>`
        : kind === 'withdrawn'
          ? `<p style="color:#374151;margin:0 0 8px">Hi <strong>${candidateName}</strong>,</p>
             <p style="color:#374151;margin:0 0 8px">This confirms that your application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been <strong>withdrawn</strong>. If this wasn't you, please contact support.</p>`
          : `<p style="color:#374151;margin:0 0 8px">Hi <strong>${candidateName}</strong>,</p>
             <p style="color:#374151;margin:0 0 8px">There's an update on your application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong>.</p>`;

    const subject =
      kind === 'received'? `Application received   ${jobTitle}`
        : kind === 'withdrawn'? `Your application was withdrawn   ${jobTitle}`
          : `Update on your application   ${jobTitle}`;

    const statusColor =
      kind === 'withdrawn'? '#6b7280'
        : kind === 'received'? '#166534'
          : '#1d4ed8';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:12px">
        <div style="background:linear-gradient(135deg,#7c3aed,#2563eb);border-radius:12px;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:20px">${header}</h1>
        </div>
        <div style="background:#fff;border-radius:12px;padding:24px;margin-top:16px">
          ${intro}
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px">
            <tr><td style="padding:6px 0;color:#6b7280;width:160px">Position</td><td style="padding:6px 0;color:#111827;font-weight:600">${jobTitle}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Company</td><td style="padding:6px 0;color:#111827">${companyName}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Status</td><td style="padding:6px 0"><span style="color:${statusColor};font-weight:700">${statusLabel}</span></td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin-top:20px">This is an automated message   please do not reply.</p>
        </div>
      </div>
      ${this.standardFooter()}`;

    await this.sendEmail({ to, subject, html });
  }

  /**
   * Alert sent to a recruiter / job creator when a new candidate applies to their job.
   */
  async sendNewApplicationAlert(
    to: string,
    data: {
      recruiterName?: string;
      candidateName: string;
      candidateEmail: string;
      jobTitle: string;
      applicationId: string;
      appliedAt: string;
    }
  ): Promise<void> {
    const { recruiterName, candidateName, candidateEmail, jobTitle, applicationId, appliedAt } = data;
    const subject = `New application   ${jobTitle}`;
    const frontendUrl = process.env.FRONTEND_URL || '';
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:12px">
        <div style="background:linear-gradient(135deg,#7c3aed,#2563eb);border-radius:12px;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:20px">📋 New Application</h1>
        </div>
        <div style="background:#fff;border-radius:12px;padding:24px;margin-top:16px">
          ${recruiterName ? `<p style="color:#374151;margin:0 0 8px">Hi <strong>${recruiterName}</strong>,</p>` : ''}
          <p style="color:#374151;margin:0 0 12px">A new candidate has applied for <strong>${jobTitle}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px">
            <tr><td style="padding:6px 0;color:#6b7280;width:160px">Candidate</td><td style="padding:6px 0;color:#111827;font-weight:600">${candidateName}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Email</td><td style="padding:6px 0;color:#111827">${candidateEmail}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Position</td><td style="padding:6px 0;color:#111827">${jobTitle}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Applied at</td><td style="padding:6px 0;color:#111827">${appliedAt}</td></tr>
          </table>
          ${frontendUrl ? `<div style="margin-top:20px"><a href="${frontendUrl}/applications/${applicationId}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">Review Application</a></div>` : ''}
          <p style="color:#9ca3af;font-size:12px;margin-top:20px">This is an automated message   please do not reply.</p>
        </div>
      </div>
      ${this.standardFooter()}`;

    await this.sendEmail({ to, subject, html });
  }

}

export const sendEmail = (options: EmailOptions) => {
  const emailService = new EmailService();
  return emailService.sendEmail(options);
};

export const notifyEmail = (emails: string, subj: string, body: string, data: string = '') => {
  const emailService = new EmailService();
  return emailService.notifyEmail(emails, subj, body, data);
};

export default new EmailService();