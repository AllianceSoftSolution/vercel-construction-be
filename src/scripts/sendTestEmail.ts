import 'dotenv/config';
import { Email } from '../utils/email';


async function main() {
  const email = new Email();
  console.log('Sending test email...', process.env.TEST_EMAIL_TO);
  try {
    const result = await email.send({
      to: process.env.TEST_EMAIL_TO || 'recipient@example.com',
      subject: 'Test Email from Construction BE',
      template: 'test-email',
      data: {
        name: 'Test User',
        message: 'This is a test email from the Construction BE system.',
      },
    });
    console.log('Email sent:', result);
  } catch (err) {
    console.error('Failed to send email:', err);
  }
}

main(); 