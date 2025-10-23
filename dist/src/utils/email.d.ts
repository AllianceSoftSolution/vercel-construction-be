interface EmailOptions {
    to: string;
    subject: string;
    template: string;
    data: Record<string, any>;
}
export declare class Email {
    private transporter;
    constructor();
    send({ to, subject, template, data }: EmailOptions): Promise<any>;
}
export {};
