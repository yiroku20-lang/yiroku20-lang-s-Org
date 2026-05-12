import nodemailer from 'nodemailer';

export const handler = async (event: any) => {
  // Solo permitimos peticiones POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Parseamos el body que viene del frontend
    const body = JSON.parse(event.body);
    const { to, subject, text, html, attachmentBase64, filename } = body;

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Credenciales de correo no configuradas." })
      };
    }

    // Configuramos nodemailer igual que en tu server.ts
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const mailOptions: any = {
      from: `"Admisión UNSAAC" <${process.env.GMAIL_USER}>`,
      to,
      subject,
    };
    
    if (text) mailOptions.text = text;
    if (html) mailOptions.html = html;

    if (attachmentBase64 && filename) {
        mailOptions.attachments = [
            {
              filename: filename || "documento.pdf",
              content: attachmentBase64.split("base64,")[1] || attachmentBase64,
              encoding: "base64",
            },
        ];
    }

    // Enviamos el correo
    await transporter.sendMail(mailOptions);

    // Respondemos éxito
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error: any) {
    console.error("Error sending email:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
