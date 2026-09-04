"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ACTIVE_HOLD_RECEIPT_ID } from "@/app/lib/demo-data";
import { validationMessage } from "@/app/lib/receipt-validation";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function ReceiptLookupForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = validationMessage(value);
    setError(nextError);
    if (nextError === null) {
      router.push(`/receipt/${encodeURIComponent(value.trim())}`);
    }
  }

  return (
    <div className="lookup-panel">
      <form className="lookup-form" onSubmit={submit} noValidate>
        <label htmlFor="receipt-id">Receipt ID</label>
        <div className="lookup-control-row">
          <input
            className="lookup-input"
            id="receipt-id"
            name="receiptId"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error !== null) setError(null);
            }}
            placeholder="LM-REC-..."
            autoComplete="off"
            spellCheck={false}
            aria-required="true"
            aria-invalid={error !== null}
            aria-describedby={error === null ? "receipt-id-helper" : "receipt-id-error"}
            aria-errormessage={error === null ? undefined : "receipt-id-error"}
          />
          <button className="button button-primary" type="submit">
            Inspect proof
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
        {error ? <p className="lookup-error" id="receipt-id-error" role="alert">{error}</p> : null}
        <p className="lookup-helper" id="receipt-id-helper">
          Receipt IDs begin with <code>LM-REC-</code>.
        </p>
      </form>
      <div className="lookup-shortcut">
        <p>Start with the live controlled demo:</p>
        <Link href={`/receipt/${ACTIVE_HOLD_RECEIPT_ID}`}>
          Inspect the live HOLD receipt <ArrowRight aria-hidden="true" />
        </Link>
      </div>
      <p className="lookup-note">
        <strong>Public receipt access only.</strong> Private Limen ledger records are not exposed here.
      </p>
    </div>
  );
}
