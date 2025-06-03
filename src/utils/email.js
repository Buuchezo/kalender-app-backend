"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const sendEmail = async (options) => {
    // 1. Create transporter
    const transporter = nodemailer_1.default.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT),
        auth: {
            user: process.env.EMAIL_USERNAME,
            pass: process.env.EMAIL_PASSWORD,
        },
        //ACTIVATE IN GMAIL "less secure app" option
    });
    // 2. Define mail options
    const mailOptions = {
        from: 'Kennedy Buchichi <lebrddoinbver@hasl.com>',
        to: options.email,
        subject: options.subject,
        text: options.message,
    };
    // 3. Send the email
    await transporter.sendMail(mailOptions);
};
exports.sendEmail = sendEmail;
