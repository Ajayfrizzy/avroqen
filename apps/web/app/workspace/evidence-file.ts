// Hash exact local bytes; never fetch a source URL or upload evidence.
export async function hashEvidenceFile(file: File): Promise<string> {
  if (
    file.size < 1 ||
    file.size > 5242880 ||
    ![
      "application/pdf",
      "text/plain",
      "application/json",
      "image/png",
      "image/jpeg",
    ].includes(file.type)
  )
    throw new Error("Unsupported file type or size. No file was uploaded.");
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
