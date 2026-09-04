"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button className="copy-button" type="button" onClick={copyValue} aria-label={`Copy ${label}`}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? `${label} copied` : ""}
      </span>
    </>
  );
}

export function CopyableCode({ value, label }: { value: string; label: string }) {
  return (
    <span className="copyable-value">
      <code>{value}</code>
      <CopyButton value={value} label={label} />
    </span>
  );
}
