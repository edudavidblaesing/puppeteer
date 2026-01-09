const nodemailer = require('nodemailer');

let transporter;

const initializeEmailService = async () => {
    try {
        if (process.env.SMTP_HOST && process.env.SMTP_USER) {
            // Real SMTP
            transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });
            console.log('[Email Service] Using configured SMTP server');
        } else {
            // Ethereal (Test)
            console.log('[Email Service] No SMTP config found, creating Ethereal test account...');
            const testAccount = await nodemailer.createTestAccount();

            transporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false,
                auth: {
                    user: testAccount.user,
                    pass: testAccount.pass,
                },
            });

            console.log('[Email Service] Ethereal Email Ready');
            console.log(`[Email Service] Preview URL will be logged for sent emails.`);
        }
    } catch (e) {
        console.error('[Email Service] Failed to initialize:', e);
    }
};

// Initialize on start
initializeEmailService();

const sendVerificationEmail = async (to, code) => {
    if (!transporter) {
        console.error('[Email Service] Transporter not ready');
        return;
    }

    try {
        const info = await transporter.sendMail({
            from: '"The Social Event" <no-reply@socialevents.com>',
            to: to,
            subject: 'Verify your account',
            text: `Your verification code is: ${code}`,
            html: `<b>Your verification code is: ${code}</b>`,
        });

        console.log('[Email Service] Message sent: %s', info.messageId);

        // If using Ethereal, log the preview URL
        if (nodemailer.getTestMessageUrl(info)) {
            console.log('[Email Service] Preview URL: %s', nodemailer.getTestMessageUrl(info));
        }

        return info;
    } catch (e) {
        console.error('[Email Service] Error sending email:', e);
        throw e;
    }
};

module.exports = {
    sendVerificationEmail
};
