import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

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
      let emailText = text;

      // If template is provided, you would load and render the template here
      // For now, we'll just use the provided html/text

      const mailOptions = {
        from: process.env.SMTP_USER || 'notify@healthedu.rw',
        to,
        subject,
        html: emailHtml,
        text: emailText,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully: ${info.messageId}`);
    } catch (error) {
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