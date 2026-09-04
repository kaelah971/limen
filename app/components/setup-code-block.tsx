"use client";

import { CopyButton } from "./copy-button";

export function SetupCodeBlock({
  value,
  label,
  filename,
}: {
  value: string;
  label: string;
  filename: string;
}) {
  return (
    <div className="setup-code-block">
      <div className="setup-code-header">
        <span className="setup-code-file">
          <span className="sr-only">File:</span>
          <code>{filename}</code>
        </span>
        <CopyButton value={value} label={label} />
      </div>
      <pre>
        <code>{value}</code>
      </pre>
    </div>
  );
}
