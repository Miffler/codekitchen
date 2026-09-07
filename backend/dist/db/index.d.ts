declare const sqlite: any;
export { sqlite as db };
export declare function getLeadById(id: string): any;
export declare function getLeadByOrderId(orderId: string): any;
export declare function getLeadBySubscriptionId(subscriptionId: string): any;
export declare function upsertLead(lead: Record<string, any>): any;
export declare function updateLead(id: string, updates: Record<string, any>): any;
export declare function getAllOrders(): any;
export declare function getLeadStats(): {
    total: number;
    depositPaid: number;
    fullyPaid: number;
    careActive: number;
};
//# sourceMappingURL=index.d.ts.map