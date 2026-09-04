import { ReceiptIdParamSchema } from "../../packages/receipts/src/schemas";

export function validationMessage(value: string): string | null {
  if (value.trim() === "") {
    return "Enter a receipt ID.";
  }
  if (!ReceiptIdParamSchema.safeParse(value.trim()).success) {
    return "That doesn’t look like a Limen receipt ID. Receipt IDs begin with LM-REC-.";
  }
  return null;
}
