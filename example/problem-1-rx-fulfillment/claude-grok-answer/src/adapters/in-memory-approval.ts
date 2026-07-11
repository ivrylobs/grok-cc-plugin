import type { ApprovalPort } from "../ports/approval-port.ts";

export class InMemoryApprovalPort implements ApprovalPort {
  private readonly valid = new Set<string>();

  grant(approvalId: string): void {
    this.valid.add(approvalId);
  }

  async isValid(input: {
    approvalId: string;
    pharmacyId: string;
    rxId: string;
  }): Promise<boolean> {
    void input.pharmacyId;
    void input.rxId;
    return this.valid.has(input.approvalId);
  }
}
