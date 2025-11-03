import * as crypto from 'crypto';
import axios, { AxiosResponse } from 'axios';

export interface PayFastConfig {
    sandbox?: boolean;
    merchant_id?: string;
    merchant_key?: string;
    passphrase?: string | null;
    environment?: string;
    [k: string]: any;
}

export class PayFast {
    private config: PayFastConfig;

    constructor(config: PayFastConfig = {}) {
        this.config = config;
    }

    getApiUrl(): string {
        const env = this.config.environment;

        if (env !== 'production') {
            return 'https://sandbox.payfast.co.za';
        }
        return 'https://www.payfast.co.za';
    }

    getMerchantId(): string | undefined {
        return this.config.merchant_id;
    }

    getMerchantKey(): string | undefined {
        return this.config.merchant_key;
    }

    getPassPhrase(): string | null | undefined {
        return this.config.passphrase;
    }

    setEnvironmentConfig(env: string): void {
        this.config.environment = env;
    }

    encodeURIString(input: string | undefined | null): string {
        const str = input ?? '';
        return encodeURIComponent(str).replace(/%20/g, '+');
    }

    createPaymentObject(data: Record<string, any>, signature?: string): Record<string, any> {
        return {
            merchant_id: this.getMerchantId(),
            merchant_key: this.getMerchantKey(),
            ...data,
            signature: signature,
        };
    }

    createStringfromObject(data: Record<string, any>): string {
        const passPhrase = this.getPassPhrase();

        data = {
            merchant_id: this.getMerchantId(),
            merchant_key: this.getMerchantKey(),
            ...data,
        };

        let pfOutput = '';
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                const value = data[key];
                if (value !== '') {
                    const trimmedValue = typeof value === 'string' ? value.trim() : String(value);
                    pfOutput += `${key}=${this.encodeURIString(trimmedValue)}&`;
                }
            }
        }

        let getString = pfOutput.endsWith('&') ? pfOutput.slice(0, -1) : pfOutput;
        if (passPhrase != null) {
            getString += `&passphrase=${this.encodeURIString(passPhrase.trim())}`;
        }

        return getString;
    }

    createSignature(input: string): string {
        return crypto.createHash('md5').update(input).digest('hex');
    }

    async generatePaymentUrl(data: Record<string, any>): Promise<string | undefined> {
        const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        const url = `eng/process`;
        const fullUrl = `${this.getApiUrl()}/${url}`;

        try {
            console.log('Generating payment URL with data:', data);

            const res: AxiosResponse = await axios.post(fullUrl, null, {
                params: data,
                headers,
                maxRedirects: 0, // <- Important
                validateStatus: (status) => status >= 200 && status < 400, // allow 3xx
            });

            const redirectUrl = res.headers['location'];
            console.log('Redirect URL:', redirectUrl);

            return redirectUrl;
        } catch (err: any) {
            if (err.response?.headers?.location) {
                return err.response.headers.location;
            }

            console.error('Error generating payment URL', err);
            return undefined;
        }
    }
}

export default PayFast;