import axios from "axios";
import crypto from "crypto";
import dns from "dns";
import { IncomingHttpHeaders } from "http";

const pfHost = process.env.ENVIRONMENT === "Prod" ? "www.payfast.co.za" : "sandbox.payfast.co.za";
export interface PayFastData {
  [key: string]: string;
  signature: string;
}

export interface PayFastRequest {
  headers: IncomingHttpHeaders;
  body: Record<string, string>;
  connection?: { remoteAddress?: string };
}

export function buildParamString(pfData: Record<string, string>): string {
  const params = Object.entries(pfData)
    .filter(([key]) => key !== "signature")
    .map(
      ([key, value]) =>
        `${key}=${encodeURIComponent(value.trim()).replace(/%20/g, "+")}`
    );

  return params.join("&");
}

export function pfValidSignature(
  pfData: PayFastData,
  pfParamString: string,
  pfPassphrase?: string | null
): boolean {
  let tempParamString = pfParamString;

  if (pfPassphrase) {
    tempParamString += `&passphrase=${encodeURIComponent(
      pfPassphrase.trim()
    ).replace(/%20/g, "+")}`;
  }

  const calculatedSignature = crypto
    .createHash("md5")
    .update(tempParamString)
    .digest("hex");

  return pfData.signature === calculatedSignature;
}

export async function ipLookup(domain: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    dns.lookup(domain, { all: true }, (err, addresses) => {
      if (err) {
        reject(err);
      } else {
        resolve(addresses.map((a) => a.address));
      }
    });
  });
}

export async function pfValidIP(req: PayFastRequest): Promise<boolean> {
  const validHosts = [
    "www.payfast.co.za",
    "sandbox.payfast.co.za",
    "w1w.payfast.co.za",
    "w2w.payfast.co.za",
  ];

  let validIps: string[] = [];
  const pfIp =
    (req.headers["x-forwarded-for"] as string) ||
    req.connection?.remoteAddress ||
    "";

  try {
    for (const host of validHosts) {
      const ips = await ipLookup(host);
      validIps = [...validIps, ...ips];
    }
  } catch (err) {
    console.error("DNS lookup failed:", err);
  }

  const uniqueIps = [...new Set(validIps)];
  return uniqueIps.includes(pfIp);
}

export function pfValidPaymentData(
  cartTotal: number,
  pfData: PayFastData
): boolean {
  const payfastAmount = parseFloat(pfData["amount_gross"]);
  console.log('payfastAmount: ', payfastAmount);
  console.log('cartTotal: ', cartTotal);
  return Math.abs(cartTotal - payfastAmount) <= 0.01;
}

export async function pfValidServerConfirmation(
  pfHost: string,
  pfParamString: string
): Promise<boolean> {
  try {
    const res = await axios.post(`https://${pfHost}/eng/query/validate`, pfParamString, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return res.data.trim() === "VALID";
  } catch (err) {
    console.error("Error verifying with PayFast:", err);
    return false;
  }
}

export async function validatePayFastPayment(
  req: PayFastRequest,
  cartTotal: number,
  passPhrase?: string
): Promise<boolean> {
  console.log('cartTotal: ', cartTotal);
  console.log('req.body: ', JSON.stringify(req.body));
  console.log('passPhrase: ', passPhrase);
  const pfData = req.body as any;
  const pfParamString = buildParamString(pfData);

  console.log('pfParamString: ', pfParamString);
  console.log('pfData.signature: ', JSON.stringify(pfData.signature));

  const [sigOk, ipOk, amtOk, srvOk] = await Promise.all([
    pfValidSignature(pfData, pfParamString, passPhrase),
    pfValidIP(req),
    pfValidPaymentData(cartTotal, pfData),
    pfValidServerConfirmation(pfHost, pfParamString),
  ]);

  console.log('sigOk: ', sigOk);
  console.log('ipOk: ', ipOk);
  console.log('amtOk: ', amtOk);
  console.log('srvOk: ', srvOk);

  return sigOk && ipOk && amtOk && srvOk;
}
