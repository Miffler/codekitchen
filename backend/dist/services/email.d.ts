export declare function sendMail(to: string, subject: string, body: string, replyTo?: string): Promise<boolean>;
export declare function sendOrderConfirmation(lead: any): Promise<void>;
export declare function sendEnquiryConfirmation(lead: any): Promise<void>;
export declare function sendDraftApproval(lead: any, draftUrl: string): Promise<void>;
export declare function sendHandoff(lead: any): Promise<void>;
//# sourceMappingURL=email.d.ts.map