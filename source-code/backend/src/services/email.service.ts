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
   * Confirmation email sent after a simulation is successfully submitted.
   * Sent to the candidate (thank-you / under review) and, with a recruiter-facing
   * intro, to the company.
   */
  async sendSubmissionConfirmation(
    to: string,
    data: {
      candidateName: string;
      simulationName: string;
      submissionId: string;
      submittedAt: string;
      taskNames: string[];
      githubUrl?: string | null;
      recipientRole?: 'candidate'| 'company';
      score?: number | null;
      passed?: boolean | null;
      scoreBreakdown?: Record<string, { score: number; weight: number; contribution?: string }> | null;
    }
  ): Promise<void> {
    const { candidateName, simulationName, submissionId, submittedAt, taskNames, githubUrl, recipientRole = 'candidate', score, passed, scoreBreakdown } = data;

    const tasksHtml = taskNames && taskNames.length
      ? `<ul style="margin:8px 0;padding-left:20px;color:#374151">${taskNames.map((t) => `<li>${t}</li>`).join('')}</ul>`
      : '<p style="margin:8px 0;color:#6b7280"> </p>';

    const githubHtml = githubUrl
      ? `<tr><td style="padding:6px 0;color:#6b7280;width:160px">Repository</td><td style="padding:6px 0"><a href="${githubUrl}" style="color:#2563eb">${githubUrl}</a></td></tr>`
      : '';

    // Marks section shown only to the candidate when score data is available.
    const categoryLabels: Record<string, string> = {
      quality: 'Code Quality', speed: 'Speed', behavioral: 'Behavioral', github: 'GitHub'
    };
    const scoresHtml = recipientRole === 'candidate'&& score != null
      ? `
        <div style="margin-top:20px;padding:16px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px">
          <div style="text-align:center;margin-bottom:12px">
            <div style="font-size:32px;font-weight:800;color:#5b21b6">${Math.round(score)}%</div>
            <div style="margin-top:6px">
              <span style="display:inline-block;padding:4px 14px;border-radius:999px;font-size:13px;font-weight:700;background:${passed ? '#dcfce7': '#fee2e2'};color:${passed ? '#166534': '#991b1b'}">
                ${passed ? '✓ PASSED': '✗ DID NOT PASS'}
              </span>
            </div>
          </div>
          ${scoreBreakdown && Object.keys(scoreBreakdown).length > 0 ? `
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">
            <tr style="border-bottom:1px solid #e5e7eb">
              <th style="padding:6px 0;text-align:left;color:#6b7280;font-weight:600">Category</th>
              <th style="padding:6px 0;text-align:right;color:#6b7280;font-weight:600">Score</th>
              <th style="padding:6px 0;text-align:right;color:#6b7280;font-weight:600">Weight</th>
            </tr>
            ${Object.entries(scoreBreakdown).map(([key, val]) => `
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:6px 0;color:#374151">${categoryLabels[key] || key}</td>
              <td style="padding:6px 0;text-align:right;color:#111827;font-weight:600">${Math.round(val.score)}%</td>
              <td style="padding:6px 0;text-align:right;color:#6b7280">${Math.round(val.weight * 100)}%</td>
            </tr>`).join('')}
          </table>` : ''}
        </div>`
      : '';

    const intro =
      recipientRole === 'company'
        ? `<p style="color:#374151;margin:0 0 8px"><strong>${candidateName}</strong> has submitted the <strong>${simulationName}</strong> simulation. The submission is now under review.</p>`
        : `<p style="color:#374151;margin:0 0 8px">Hi <strong>${candidateName}</strong>,</p>
           <p style="color:#374151;margin:0 0 8px">Thank you   your simulation has been <strong>submitted successfully</strong>. Here are your results.</p>`;

    const subject =
      recipientRole === 'company'
        ? `New simulation submission   ${simulationName}`
        : `Your results   ${simulationName}`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:12px">
        <div style="background:linear-gradient(135deg,#7c3aed,#2563eb);border-radius:12px;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:20px">✓ Submission Received</h1>
        </div>
        <div style="background:#fff;border-radius:12px;padding:24px;margin-top:16px">
          ${intro}
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px">
            <tr><td style="padding:6px 0;color:#6b7280;width:160px">Simulation</td><td style="padding:6px 0;color:#111827;font-weight:600">${simulationName}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Submission ID</td><td style="padding:6px 0"><code>${submissionId}</code></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Submitted at</td><td style="padding:6px 0;color:#111827">${submittedAt}</td></tr>
            ${githubHtml}
          </table>
          ${scoresHtml}
          <div style="margin-top:12px">
            <div style="color:#6b7280;font-size:14px;margin-bottom:4px">Tasks completed</div>
            ${tasksHtml}
          </div>
          <p style="color:#9ca3af;font-size:12px;margin-top:20px">This is an automated message   please do not reply.</p>
        </div>
      </div>
      ${this.standardFooter()}`;

    await this.sendEmail({ to, subject, html });
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
    }
  ): Promise<void> {
    const { name, email, tempPassword, roleLabel, companyName, loginUrl } = data;
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
          <p style="color:#374151;margin:0 0 12px">An administrator created an account for you${companyName ? ` at <strong>${companyName}</strong>` : ''} as <strong>${roleLabel}</strong>. Use the credentials below to log in:</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">
            <tr><td style="padding:6px 0;color:#6b7280;width:160px">Login email</td><td style="padding:6px 0;color:#111827;font-weight:600">${email}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Temporary password</td><td style="padding:6px 0;color:#111827;font-weight:600;font-family:monospace">${tempPassword}</td></tr>
          </table>
          <div style="margin-top:20px">
            <a href="${loginUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">Log in</a>
          </div>
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
      simulation?: {
        name?: string;
        scheduled?: boolean;
        scheduled_at?: string | Date | null;
        sim_status?: string | null;
        duration_minutes?: number | null;
        instructions?: string | null;
      };
    }
  ): Promise<void> {
    const { candidateName, jobTitle, companyName, statusLabel, applicationId, kind = 'status', simulation } = data;

    // Optional simulation/assessment block   included e.g. in the shortlisted email.
    const simBlock = simulation ? `
          <div style="margin-top:16px;padding:16px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px">
            <h2 style="margin:0 0 8px;font-size:15px;color:#5b21b6">Simulation / Assessment</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:5px 0;color:#6b7280;width:160px">Simulation</td><td style="padding:5px 0;color:#111827;font-weight:600">${simulation.name || 'Assessment'}</td></tr>
              ${simulation.duration_minutes ? `<tr><td style="padding:5px 0;color:#6b7280">Duration</td><td style="padding:5px 0;color:#111827">${simulation.duration_minutes} minutes</td></tr>` : ''}
              ${simulation.scheduled && simulation.scheduled_at ? `<tr><td style="padding:5px 0;color:#6b7280">Scheduled for</td><td style="padding:5px 0;color:#111827">${new Date(simulation.scheduled_at).toLocaleString()}</td></tr>` : ''}
              ${simulation.scheduled && simulation.sim_status ? `<tr><td style="padding:5px 0;color:#6b7280">Status</td><td style="padding:5px 0;color:#111827">${simulation.sim_status}</td></tr>` : ''}
            </table>
            ${simulation.instructions ? `<p style="margin:10px 0 0;color:#4b5563;font-size:13px"><strong>Instructions:</strong> ${simulation.instructions}</p>` : ''}
            <p style="margin:10px 0 0;color:#4b5563;font-size:13px">${simulation.scheduled
              ? 'Please note: the simulation cannot be started before its scheduled start time.'
              : 'A simulation is part of this role. You will receive the schedule and a link to begin   and you cannot start it before the scheduled time.'}</p>
            <div style="margin-top:12px">
              <a href="${process.env.FRONTEND_URL || ''}/applications/${applicationId}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">View Simulation Details</a>
            </div>
          </div>` : '';

    const header =
      kind === 'received'? '✓ Application Received'
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
          ${simBlock}
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

  /**
   * Send a candidate their full simulation result breakdown   used when a recruiter
   * selects candidates and sends results. Shows the final weighted score, the AI (70%)
   * and recruiter (30%) contributions, AI competencies, and per-task recruiter marks.
   */
  async sendSimulationResultsEmail(
    to: string,
    data: {
      candidateName: string;
      jobTitle: string;
      companyName: string;
      finalScore: number;
      aiScore: number;
      recruiterAvg: number;
      passed?: boolean;
      competencies?: Array<{ label: string; score: number }>;
      tasks?: Array<{ name: string; score: number; comment?: string }>;
    }
  ): Promise<void> {
    const { candidateName, jobTitle, companyName, finalScore, aiScore, recruiterAvg, passed, competencies = [], tasks = [] } = data;

    const header = passed === true ? 'Congratulations   You Passed!': 'Your Assessment Results';
    const subject = passed === true ? `Congratulations   your results for ${jobTitle}` : `Your assessment results   ${jobTitle}`;

    const competenciesHtml = competencies.length
      ? `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:6px">${competencies.map((c) => `<tr><td style="padding:4px 0;color:#6b7280">${c.label}</td><td style="padding:4px 0;text-align:right;color:#111827;font-weight:600">${Math.round(c.score)}%</td></tr>`).join('')}</table>` : '';

    const tasksHtml = tasks.length
      ? `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:6px">${tasks.map((t, i) => `<tr><td style="padding:4px 0;color:#374151">Task ${i + 1}: ${t.name || ''}</td><td style="padding:4px 0;text-align:right;font-weight:600">${Math.round(t.score)}%</td></tr>${t.comment ? `<tr><td colspan="2" style="padding:0 0 6px;color:#6b7280;font-size:12px">${t.comment}</td></tr>` : ''}`).join('')}</table>` : '';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:12px">
        <div style="background:linear-gradient(135deg,#7c3aed,#2563eb);border-radius:12px;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:20px">${header}</h1>
        </div>
        <div style="background:#fff;border-radius:12px;padding:24px;margin-top:16px">
          <p style="color:#374151;margin:0 0 8px">Hi <strong>${candidateName}</strong>,</p>
          <p style="color:#374151;margin:0 0 12px">Here are your assessment results for <strong>${jobTitle}</strong> at <strong>${companyName}</strong>.</p>
          <div style="text-align:center;margin:16px 0;padding:16px;background:#f5f3ff;border-radius:10px">
            <div style="font-size:34px;font-weight:800;color:#5b21b6">${Math.round(finalScore)}%</div>
            <div style="color:#6b7280;font-size:13px">Overall Score</div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#6b7280">AI Evaluation (70%)</td><td style="padding:6px 0;text-align:right;font-weight:600">${Math.round(aiScore)}% &rarr; ${(aiScore * 0.7).toFixed(1)}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Recruiter Task Evaluation (30%)</td><td style="padding:6px 0;text-align:right;font-weight:600">${Math.round(recruiterAvg)}% &rarr; ${(recruiterAvg * 0.3).toFixed(1)}</td></tr>
            <tr><td style="padding:6px 0;color:#111827;font-weight:700">Final Weighted Score</td><td style="padding:6px 0;text-align:right;font-weight:700">${Math.round(finalScore)}%</td></tr>
          </table>
          ${competencies.length ? `<h3 style="font-size:14px;color:#5b21b6;margin:16px 0 0">AI Competency Scores</h3>${competenciesHtml}` : ''}
          ${tasks.length ? `<h3 style="font-size:14px;color:#5b21b6;margin:16px 0 0">Recruiter Task Evaluation (30%)</h3>${tasksHtml}` : ''}
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