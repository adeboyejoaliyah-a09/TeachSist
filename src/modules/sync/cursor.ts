import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "../../lib/http-error.js";

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function encodeCursor(
  ownerId: string,
  sequence: string,
  secret: string,
): string {
  const payload = `${ownerId}:${sequence}`;
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${signature(encoded, secret).toString("base64url")}`;
}

export function decodeCursor(
  cursor: string | undefined,
  ownerId: string,
  secret: string,
): string {
  if (cursor === undefined) return "0";

  const [encoded, suppliedSignature, extra] = cursor.split(".");
  if (!encoded || !suppliedSignature || extra !== undefined) {
    throw new HttpError(400, "INVALID_CURSOR", "The sync cursor is invalid.");
  }

  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(suppliedSignature, "base64url");
    const expectedSignature = signature(encoded, secret);
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      throw new Error("Signature mismatch");
    }
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    const separator = payload.lastIndexOf(":");
    const cursorOwner = payload.slice(0, separator);
    const sequence = payload.slice(separator + 1);
    if (
      separator < 0 ||
      cursorOwner !== ownerId ||
      !/^(0|[1-9]\d*)$/.test(sequence)
    ) {
      throw new Error("Invalid cursor payload");
    }
    return sequence;
  } catch {
    throw new HttpError(400, "INVALID_CURSOR", "The sync cursor is invalid.");
  }
}
