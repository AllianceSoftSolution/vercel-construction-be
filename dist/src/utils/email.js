"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Email = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const ejs_1 = __importDefault(require("ejs"));
const path_1 = __importDefault(require("path"));
class Email {
    transporter;
    constructor() {
        this.transporter = nodemailer_1.default.createTransport({
            service: "gmail",
            auth: {
                user: process.env.GMAIL_USER || "your_gmail@gmail.com",
                pass: process.env.GMAIL_PASS || "your_gmail_app_password",
            },
        });
    }
    async send({ to, subject, template, data }) {
        const templatePath = path_1.default.join(process.cwd(), "src/templates", `${template}.ejs`);
        const html = await ejs_1.default.renderFile(templatePath, data);
        const info = await this.transporter.sendMail({
            from: process.env.GMAIL_USER || "your_gmail@gmail.com",
            to,
            subject,
            html,
        });
        return info;
    }
}
exports.Email = Email;
//# sourceMappingURL=email.js.map