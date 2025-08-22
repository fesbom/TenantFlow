import sgMail from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY environment variable must be set");
}

if (!process.env.SENDGRID_API_KEY.startsWith('SG.')) {
  console.warn("SendGrid API key should start with 'SG.' - please verify your API key");
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  const emailData: any = {
    to: params.to,
    from: params.from,
    subject: params.subject,
  };
  
  if (params.text) {
    emailData.text = params.text;
  }
  
  if (params.html) {
    emailData.html = params.html;
  }

  try {
    await sgMail.send(emailData);
    console.log(`Email sent successfully to ${params.to}`);
    return true;
  } catch (error: any) {
    console.error('SendGrid email error:', error);
    if (error.response && error.response.body) {
      console.error('Full SendGrid response body:', JSON.stringify(error.response.body, null, 2));
      if (error.response.body.errors) {
        console.error('SendGrid error details:');
        error.response.body.errors.forEach((err: any, index: number) => {
          console.error(`Error ${index + 1}:`, err);
        });
      }
    }
    console.error('Email data that failed:', JSON.stringify(emailData, null, 2));
    return false;
  }
}

export function generatePasswordResetEmail(userEmail: string, resetToken: string, baseUrl?: string) {
  const resetUrl = `${baseUrl || 'http://localhost:5000'}/reset-password?token=${resetToken}`;
  
  return {
    to: userEmail,
    from: 'fesbom@gmail.com', // Using your verified email address
    subject: 'DentiCare - Redefinição de Senha',
    text: `
Olá!

Você solicitou a redefinição de sua senha no DentiCare.

Para redefinir sua senha, clique no link abaixo:
${resetUrl}

Este link é válido por 24 horas.

Se você não solicitou esta redefinição, ignore este email.

Atenciosamente,
Equipe DentiCare
    `,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>DentiCare</h1>
    </div>
    <div class="content">
      <h2>Redefinição de Senha</h2>
      <p>Olá!</p>
      <p>Você solicitou a redefinição de sua senha no sistema DentiCare.</p>
      <p>Para redefinir sua senha, clique no botão abaixo:</p>
      <a href="${resetUrl}" class="button">Redefinir Senha</a>
      <p>Ou copie e cole este link no seu navegador:</p>
      <p style="word-break: break-all; background-color: #fff; padding: 10px; border-radius: 3px;">${resetUrl}</p>
      <p><strong>Este link é válido por 24 horas.</strong></p>
      <p>Se você não solicitou esta redefinição, ignore este email com segurança.</p>
    </div>
    <div class="footer">
      <p>Atenciosamente,<br>Equipe DentiCare</p>
    </div>
  </div>
</body>
</html>
    `
  };
}