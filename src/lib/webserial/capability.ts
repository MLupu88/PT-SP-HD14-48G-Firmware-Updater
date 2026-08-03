export interface BrowserCompatibility {
  readonly supported: boolean;
  /** Plain-language explanation, ready to show directly to a non-technical user. */
  readonly reason?: string;
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator && navigator.serial != null;
}

export function isSecureContextForWebSerial(): boolean {
  return typeof window !== "undefined" && window.isSecureContext === true;
}

/**
 * Checks whether this browser session can offer a real device connection at
 * all. Does not check anything about the device itself.
 */
export function getBrowserCompatibility(): BrowserCompatibility {
  if (typeof navigator === "undefined") {
    return {
      supported: false,
      reason: "This updater works in Google Chrome or Microsoft Edge on a Windows, Mac, or Linux computer.",
    };
  }
  if (!isWebSerialSupported()) {
    return {
      supported: false,
      reason: "This updater works in Google Chrome or Microsoft Edge on a Windows, Mac, or Linux computer.",
    };
  }
  if (!isSecureContextForWebSerial()) {
    return {
      supported: false,
      reason: "This page needs to be opened securely (https://) to connect to a device.",
    };
  }
  return { supported: true };
}
