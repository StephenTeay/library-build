import fs from 'fs';
import path from 'path';

export interface IEmailProvider {
  sendVerificationEmail(toEmail: string, studentName: string, token: string): Promise<void>;
  sendApprovalNotice(toEmail: string, studentName: string): Promise<void>;
  sendPasswordResetEmail(toEmail: string, studentName: string, token: string): Promise<void>;
  sendStaffWelcomeEmail(toEmail: string, staffName: string, role: string, tempPass: string): Promise<void>;
}

export class ConsoleEmailProvider implements IEmailProvider {
  private logFile: string;

  constructor() {
    const logDir = path.resolve(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.logFile = path.join(logDir, 'dev-emails.log');
  }

  private logEmail(to: string, subject: string, body: string) {
    const entry = `[${new Date().toISOString()}] TO: ${to} | SUBJECT: ${subject}\n${body}\n----------------------------------------\n`;
    console.log(`[EMAIL-DEV] Sent to ${to}: "${subject}"`);
    fs.appendFileSync(this.logFile, entry);
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

export class BrevoEmailProvider implements IEmailProvider {
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.apiKey = process.env.BREVO_API_KEY || '';
    this.fromEmail = process.env.EMAIL_FROM || 'portal@fss-ibadan.edu.ng';
    this.fromName = process.env.EMAIL_FROM_NAME || 'FSS-IB E-Library';
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

export function getEmailProvider(): IEmailProvider {
  if (process.env.EMAIL_PROVIDER === 'brevo') {
    return new BrevoEmailProvider();
  }
  return new ConsoleEmailProvider();
}

