export declare function isStripeConfigured(): boolean;
export declare function createCheckoutSession(orderId: string, paymentType: 'deposit' | 'remainder' | 'care', lead: any): Promise<string | null>;
export declare function handleWebhook(payload: Buffer, signature: string): Promise<{
    received: boolean;
}>;
export declare function getDepositAmount(lead: any): number;
export declare function getTotalAmount(lead: any): number;
export declare function getRemainderAmount(lead: any): number;
//# sourceMappingURL=stripe.d.ts.map