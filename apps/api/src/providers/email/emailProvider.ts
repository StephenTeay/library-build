import fs from 'fs';
import path from 'path';
import nodemailer, { type Transporter } from 'nodemailer';

export interface IEmailProvider {
  sendVerificationEmail(toEmail: string, studentName: string, token: string): Promise<void>;
  sendApprovalNotice(toEmail: string, studentName: string): Promise<void>;
  sendPasswordResetEmail(toEmail: string, studentName: string, token: string): Promise<void>;
  sendStaffWelcomeEmail(toEmail: string, staffName: string, role: string, tempPass: string): Promise<void>;
}

/**
 * Console & File Logger Provider (Default / Local / Zero-Setup Staging)
 * Prints outgoing emails directly to console stdout (visible in Render logs)
 * and appends to logs/dev-emails.log.
 */
export class ConsoleEmailProvider implements IEmailProvider {
  private logFile: string;

  constructor() {
    const logDir = path.resolve(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
      } catch {
        // Ignore file creation issues on read-only environments
      }
    }
    this.logFile = path.join(logDir, 'dev-emails.log');
  }

  private logEmail(to: string, subject: string, body: string) {
    const entry = `[${new Date().toISOString()}] TO: ${to} | SUBJECT: ${subject}\n${body}\n----------------------------------------\n`;
    console.log(`\n========================================\n[EMAIL-DISPATCH] Sent to ${to}: "${subject}"\n${body}\n========================================\n`);
    try {
      fs.appendFileSync(this.logFile, entry);
    } catch {
      // In cloud read-only filesystems, stdout is already captured
    }
  }

  async sendVerificationEmail(toEmail: string, studentName: string, token: string): Promise<void> {
    const link = `${process.env.API_BASE_URL || 'http://localhost:4000'}/api/onboarding/verify-email?token=${token}`;
    this.logEmail(
      toEmail,
      'Verify Your FSS-IB Portal Email Address',
      `Dear ${studentName},\n\nPlease click the link below to verify your email address:\n${link}\n\nThis link will expire in 24 hours.`
    );
  }

  async sendApprovalNotice(toEmail: string, studentName: string): Promise<void> {
    this.logEmail(
      toEmail,
      'FSS-IB Portal Account Approved',
      `Dear ${studentName},\n\nYour account has been verified and approved by the academic department. You may now log in to the portal.`
    );
  }

  async sendPasswordResetEmail(toEmail: string, studentName: string, token: string): Promise<void> {
    const link = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/reset-password?token=${token}`;
    this.logEmail(
      toEmail,
      'Reset Your FSS-IB Portal Password',
      `Dear ${studentName},\n\nA password reset request was received for your account. Click the link below to reset your password:\n${link}\n\nIf you did not request this, please ignore this email.`
    );
  }

  async sendStaffWelcomeEmail(toEmail: string, staffName: string, role: string, tempPass: string): Promise<void> {
    const loginLink = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/login`;
    this.logEmail(
      toEmail,
      `Welcome to FSS-IB Portal - Staff Account (${role})`,
      `Dear ${staffName},\n\nYou have been registered as a member of staff (${role}) on the FSS-IB Portal.\n\nLogin URL: ${loginLink}\nEmail: ${toEmail}\nTemporary Password: ${tempPass}\n\nYou will be required to change your password upon your first sign in.`
    );
  }
}

/**
 * SMTP Provider (Supports Gmail App Passwords & Generic SMTP)
 */
export class SmtpEmailProvider implements IEmailProvider {
  private transporter: Transporter;
  private from: string;

  constructor() {
    const isGmail =
      process.env.EMAIL_PROVIDER === 'gmail' ||
      (process.env.SMTP_HOST && process.env.SMTP_HOST.toLowerCase().includes('gmail'));

    const host = process.env.SMTP_HOST || (isGmail ? 'smtp.gmail.com' : 'localhost');
    const port = Number(process.env.SMTP_PORT || (isGmail ? 465 : 587));
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    const user = process.env.GMAIL_USER || process.env.SMTP_USER || '';
    // Strip spaces if user pasted 16-character Google App Password with spaces ("xxxx xxxx xxxx xxxx")
    const pass = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '').replace(/\s+/g, '');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      // Optional timeout settings for reliable connection
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });

    const fromName = process.env.EMAIL_FROM_NAME || process.env.EMAIL_SENDER_NAME || 'FSS-IB E-Library';
    const fromAddr = process.env.EMAIL_FROM || process.env.EMAIL_SENDER_ADDRESS || user || 'portal@fss-ibadan.edu.ng';
    this.from = `"${fromName}" <${fromAddr}>`;
  }

  private async sendMail(to: string, subject: string, html: string, text: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text,
        html,
      });
      console.log(`[SMTP] Successfully delivered email to ${to} (${subject})`);
    } catch (err: any) {
      console.error(`[SMTP] Delivery error to ${to}:`, err.message);
      throw new Error(`Failed to send email via SMTP: ${err.message}`);
    }
  }

  async sendVerificationEmail(toEmail: string, studentName: string, token: string): Promise<void> {
    const link = `${process.env.API_BASE_URL || 'http://localhost:4000'}/api/onboarding/verify-email?token=${token}`;
    await this.sendMail(
      toEmail,
      'Verify Your FSS-IB Portal Email Address',
      `<div style="font-family: sans-serif; line-height: 1.6; color: #0F172A;">
        <h2>Federal School of Statistics, Ibadan</h2>
        <p>Dear ${studentName},</p>
        <p>Please click the button below to verify your email address and activate your portal onboarding:</p>
        <p><a href="${link}" style="display: inline-block; background-color: #14532D; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Verify Email Address</a></p>
        <p style="font-size: 13px; color: #64748B;">Or copy and paste this URL into your browser:<br><a href="${link}">${link}</a></p>
        <p style="font-size: 13px; color: #64748B;">This link expires in 24 hours.</p>
      </div>`,
      `Dear ${studentName},\n\nPlease verify your email address:\n${link}\n\nThis link will expire in 24 hours.`
    );
  }

  async sendApprovalNotice(toEmail: string, studentName: string): Promise<void> {
    const loginLink = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/login`;
    await this.sendMail(
      toEmail,
      'FSS-IB Portal Account Approved',
      `<div style="font-family: sans-serif; line-height: 1.6; color: #0F172A;">
        <h2>Federal School of Statistics, Ibadan</h2>
        <p>Dear ${studentName},</p>
        <p>Your account has been officially verified and approved by the academic department.</p>
        <p><a href="${loginLink}" style="display: inline-block; background-color: #14532D; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Log In to Portal</a></p>
      </div>`,
      `Dear ${studentName},\n\nYour account has been approved by the academic department. You can now log in at:\n${loginLink}`
    );
  }

  async sendPasswordResetEmail(toEmail: string, studentName: string, token: string): Promise<void> {
    const link = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/reset-password?token=${token}`;
    await this.sendMail(
      toEmail,
      'Reset Your FSS-IB Portal Password',
      `<div style="font-family: sans-serif; line-height: 1.6; color: #0F172A;">
        <h2>Federal School of Statistics, Ibadan</h2>
        <p>Dear ${studentName},</p>
        <p>A password reset request was received for your account. Click the button below to choose a new password:</p>
        <p><a href="${link}" style="display: inline-block; background-color: #14532D; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a></p>
        <p style="font-size: 13px; color: #64748B;">This link expires in 1 hour. If you did not request this, please ignore this email.</p>
      </div>`,
      `Dear ${studentName},\n\nPlease reset your password using the following link:\n${link}\n\nThis link expires in 1 hour.`
    );
  }

  async sendStaffWelcomeEmail(toEmail: string, staffName: string, role: string, tempPass: string): Promise<void> {
    const loginLink = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/login`;
    await this.sendMail(
      toEmail,
      `Welcome to FSS-IB Portal - Staff Account (${role})`,
      `<div style="font-family: sans-serif; line-height: 1.6; color: #0F172A;">
        <h2>Federal School of Statistics, Ibadan</h2>
        <p>Dear ${staffName},</p>
        <p>You have been registered as a member of staff (<strong>${role}</strong>) on the FSS-IB Portal.</p>
        <p><strong>Login URL:</strong> <a href="${loginLink}">${loginLink}</a><br>
        <strong>Email:</strong> ${toEmail}<br>
        <strong>Temporary Password:</strong> <code style="background: #F1F5F9; padding: 2px 6px; border-radius: 4px; font-size: 14px;">${tempPass}</code></p>
        <p style="color: #B91C1C;"><strong>Notice:</strong> You will be required to change your password immediately upon your first sign in.</p>
      </div>`,
      `Dear ${staffName},\n\nYou have been registered as staff (${role}) on the FSS-IB Portal.\n\nLogin URL: ${loginLink}\nEmail: ${toEmail}\nTemporary Password: ${tempPass}\n\nYou must change your password on first login.`
    );
  }
}

/**
 * Resend Provider (Lightweight REST API - 3,000 free emails/mo)
 */
export class ResendEmailProvider implements IEmailProvider {
  private apiKey: string;
  private from: string;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY || '';
    const fromName = process.env.EMAIL_FROM_NAME || process.env.EMAIL_SENDER_NAME || 'FSS-IB E-Library';
    const fromAddr = process.env.EMAIL_FROM || process.env.EMAIL_SENDER_ADDRESS || 'onboarding@resend.dev';
    this.from = `${fromName} <${fromAddr}>`;
  }

  private async sendResendMail(toEmail: string, subject: string, html: string, text: string): Promise<void> {
    if (!this.apiKey) {
      console.warn('[Resend] No RESEND_API_KEY set, skipping actual send.');
      return;
    }

    const payload = {
      from: this.from,
      to: [toEmail],
      subject,
      html,
      text,
    };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Resend] API Error:', err);
      throw new Error(`Failed to send email via Resend: ${err}`);
    }
  }

  async sendVerificationEmail(toEmail: string, studentName: string, token: string): Promise<void> {
    const link = `${process.env.API_BASE_URL || 'http://localhost:4000'}/api/onboarding/verify-email?token=${token}`;
    await this.sendResendMail(
      toEmail,
      'Verify Your FSS-IB Portal Email Address',
      `<p>Dear ${studentName},</p><p>Please <a href="${link}">click here to verify your email address</a>.</p>`,
      `Dear ${studentName},\n\nPlease verify your email address:\n${link}`
    );
  }

  async sendApprovalNotice(toEmail: string, studentName: string): Promise<void> {
    await this.sendResendMail(
      toEmail,
      'FSS-IB Portal Account Approved',
      `<p>Dear ${studentName},</p><p>Your account has been approved by the academic department. You can now log in.</p>`,
      `Dear ${studentName},\n\nYour account has been approved by the academic department.`
    );
  }

  async sendPasswordResetEmail(toEmail: string, studentName: string, token: string): Promise<void> {
    const link = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/reset-password?token=${token}`;
    await this.sendResendMail(
      toEmail,
      'Reset Your FSS-IB Portal Password',
      `<p>Dear ${studentName},</p><p>Please <a href="${link}">click here to reset your password</a>. This link expires in 1 hour.</p>`,
      `Dear ${studentName},\n\nPlease reset your password:\n${link}`
    );
  }

  async sendStaffWelcomeEmail(toEmail: string, staffName: string, role: string, tempPass: string): Promise<void> {
    const loginLink = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/login`;
    await this.sendResendMail(
      toEmail,
      `Welcome to FSS-IB Portal - Staff Account (${role})`,
      `<p>Dear ${staffName},</p><p>You have been registered as a member of staff (<strong>${role}</strong>) on the FSS-IB Portal.</p><p>Login at: <a href="${loginLink}">${loginLink}</a><br>Email: <strong>${toEmail}</strong><br>Temporary Password: <code>${tempPass}</code></p><p>You will be required to change your password immediately upon your first sign in.</p>`,
      `Dear ${staffName},\n\nYou have been registered as staff (${role}) on the FSS-IB Portal.\n\nLogin: ${loginLink}\nEmail: ${toEmail}\nTemp Password: ${tempPass}`
    );
  }
}

/**
 * Brevo Provider (REST API)
 */
export class BrevoEmailProvider implements IEmailProvider {
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.apiKey = process.env.BREVO_API_KEY || '';
    this.fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_SENDER_ADDRESS || 'portal@fss-ibadan.edu.ng';
    this.fromName = process.env.EMAIL_FROM_NAME || process.env.EMAIL_SENDER_NAME || 'FSS-IB E-Library';
  }

  private async sendBrevoMail(toEmail: string, subject: string, htmlContent: string): Promise<void> {
    if (!this.apiKey) {
      console.warn('[Brevo] No BREVO_API_KEY set, skipping actual send.');
      return;
    }

    const payload = {
      sender: { name: this.fromName, email: this.fromEmail },
      to: [{ email: toEmail }],
      subject,
      htmlContent,
    };

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Brevo] API Error:', err);
      throw new Error(`Failed to send email via Brevo: ${err}`);
    }
  }

  async sendVerificationEmail(toEmail: string, studentName: string, token: string): Promise<void> {
    const link = `${process.env.API_BASE_URL || 'http://localhost:4000'}/api/onboarding/verify-email?token=${token}`;
    await this.sendBrevoMail(
      toEmail,
      'Verify Your FSS-IB Portal Email Address',
      `<p>Dear ${studentName},</p><p>Please <a href="${link}">click here to verify your email address</a>.</p>`
    );
  }

  async sendApprovalNotice(toEmail: string, studentName: string): Promise<void> {
    await this.sendBrevoMail(
      toEmail,
      'FSS-IB Portal Account Approved',
      `<p>Dear ${studentName},</p><p>Your account has been approved by the academic department. You can now log in.</p>`
    );
  }

  async sendPasswordResetEmail(toEmail: string, studentName: string, token: string): Promise<void> {
    const link = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/reset-password?token=${token}`;
    await this.sendBrevoMail(
      toEmail,
      'Reset Your FSS-IB Portal Password',
      `<p>Dear ${studentName},</p><p>Please <a href="${link}">click here to reset your password</a>. This link expires in 1 hour.</p>`
    );
  }

  async sendStaffWelcomeEmail(toEmail: string, staffName: string, role: string, tempPass: string): Promise<void> {
    const loginLink = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/login`;
    await this.sendBrevoMail(
      toEmail,
      `Welcome to FSS-IB Portal - Staff Account (${role})`,
      `<p>Dear ${staffName},</p><p>You have been registered as a member of staff (<strong>${role}</strong>) on the FSS-IB Portal.</p><p>Login at: <a href="${loginLink}">${loginLink}</a><br>Email: <strong>${toEmail}</strong><br>Temporary Password: <code>${tempPass}</code></p><p>You will be required to change your password immediately upon your first sign in.</p>`
    );
  }
}

/**
 * Factory dispatch:
 * - 'gmail' or 'smtp' -> SmtpEmailProvider
 * - 'resend'          -> ResendEmailProvider
 * - 'brevo'           -> BrevoEmailProvider
 * - default/console   -> ConsoleEmailProvider (zero external dependencies)
 */
export function getEmailProvider(): IEmailProvider {
  const provider = (process.env.EMAIL_PROVIDER || '').toLowerCase();
  if (provider === 'gmail' || provider === 'smtp') {
    return new SmtpEmailProvider();
  }
  if (provider === 'resend') {
    return new ResendEmailProvider();
  }
  if (provider === 'brevo') {
    return new BrevoEmailProvider();
  }
  return new ConsoleEmailProvider();
}
