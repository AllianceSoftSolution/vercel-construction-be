import nodemailer from "nodemailer";
import ejs from "ejs";
import path from "path";

interface EmailOptions {
  to: string;
  subject: string;
  template: string; // template file name without .ejs
  data: Record<string, any>;
}

export class Email {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER || "your_gmail@gmail.com",
        pass: process.env.GMAIL_PASS || "your_gmail_app_password",
      },
    });
  }

  async send({ to, subject, template, data }: EmailOptions) {
    // Path to the template file (absolute path for Docker compatibility)
    const templatePath = path.join(
      process.cwd(),
      "src/templates",
      `${template}.ejs`
    );
    // Render the template
    const html = await ejs.renderFile(templatePath, data);
    // Send the email
    const info = await this.transporter.sendMail({
      from: process.env.GMAIL_USER || "your_gmail@gmail.com",
      to,
      subject,
      html,
    });
    return info;
  }
}
