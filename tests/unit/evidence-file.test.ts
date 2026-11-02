import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashEvidenceFile } from "../../apps/web/app/workspace/evidence-file";

describe("local evidence byte hashing", () => {
  it("hashes exact bytes including newline and Unicode without normalization", async () => {
    const bytes = "issuer record\r\n€ 0.001\n";
    expect(
      await hashEvidenceFile(
        new File([bytes], "record.txt", { type: "text/plain" }),
      ),
    ).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
  it("rejects empty, oversized and active document formats", async () => {
    for (const file of [
      new File([], "empty", { type: "text/plain" }),
      new File([new Uint8Array(5242881)], "big", { type: "application/pdf" }),
      new File(["<script>"], "active.html", { type: "text/html" }),
    ])
      await expect(hashEvidenceFile(file)).rejects.toThrow(
        "Unsupported file type or size",
      );
  });
});
