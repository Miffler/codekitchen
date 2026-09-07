export declare function pingNigformant(text: string): Promise<boolean>;
export declare function pingMain(text: string): Promise<boolean>;
export declare function notifyNewOrder(lead: any): Promise<boolean>;
export declare function notifyNewEnquiry(lead: any): Promise<boolean>;
export declare function notifyDepositPaid(lead: any): Promise<boolean>;
export declare function notifyFullyPaid(lead: any): Promise<boolean>;
export declare function notifyCareStatus(lead: any, status: 'failed' | 'cancelled'): Promise<boolean>;
//# sourceMappingURL=telegram.d.ts.map