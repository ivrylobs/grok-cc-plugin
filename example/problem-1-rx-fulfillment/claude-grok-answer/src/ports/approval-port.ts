/**
 * Controlled-substance pharmacist approval is a distinct capability.
 * The domain still requires the id; this port can validate it exists
 * and is usable for the given pharmacy/Rx before dispense.
 */
export interface ApprovalPort {
  isValid(input: {
    approvalId: string;
    pharmacyId: string;
    rxId: string;
  }): Promise<boolean>;
}
