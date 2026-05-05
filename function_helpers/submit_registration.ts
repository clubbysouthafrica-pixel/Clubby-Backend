import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { encryptData } from "./kms_encryption";

const s3_client = new S3Client({ region: process.env.REGION });

export type InputTypes = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE' | 'NUMBER' | 'RADIO' | 'CHECKBOX' | 'SIGNATURE';
export type CurrencyType = 'ZAR' | 'USD' | 'GBP';

export interface StandardField {
    field_type: "STANDARD";
    field_id: string;
    field_name: string;
    required: boolean;
    input_type: InputTypes;
    options?: string[];
}

export interface BillingField {
    field_type: "BILLING";
    field_id: string;
    field_name: string;
    currency: CurrencyType;
    required: boolean;
    input_type: InputTypes;
    billingOptions: Record<string, any>[];
    amount?: number;
    prorata?: {
        enabled: boolean;
        rules: {
            id: string;
            prorata_start_date: string;
            prorata_end_date: string;
            prorata_percentage: number;
        }[];
    };
}

interface SubmittedField {
    name?: string;
    value: string;
    field_id: string;
    option_order_id?: string;
    multiplier_value?: number;
}

function normalizeProrataDate(dateValue: string): string | null {
    if (typeof dateValue !== "string") {
        return null;
    }

    const trimmedDate = dateValue.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
        return trimmedDate;
    }

    const parsedDate = new Date(trimmedDate);
    if (Number.isNaN(parsedDate.getTime())) {
        return null;
    }

    return parsedDate.toISOString().slice(0, 10);
}

function getReferenceDateInTimeZone(referenceDate: Date = new Date(), timeZone?: string): string {
    try {
        const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: timeZone || "UTC",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });

        const parts = formatter.formatToParts(referenceDate);
        const year = parts.find(part => part.type === "year")?.value;
        const month = parts.find(part => part.type === "month")?.value;
        const day = parts.find(part => part.type === "day")?.value;

        if (year && month && day) {
            return `${year}-${month}-${day}`;
        }
    } catch {
    }

    return referenceDate.toISOString().slice(0, 10);
}

function getActiveProrataPercentage(billingField: BillingField, referenceDate: Date = new Date(), timeZone?: string): number | null {
    if (!billingField?.prorata || !billingField.prorata?.enabled || !billingField.prorata.rules.length) {
        return null;
    }

    const referenceDateString = getReferenceDateInTimeZone(referenceDate, timeZone);
    const activeRule = billingField.prorata.rules.find(rule => {
        const startDate = normalizeProrataDate(rule.prorata_start_date);
        const endDate = normalizeProrataDate(rule.prorata_end_date);

        return startDate != null
            && endDate != null
            && referenceDateString >= startDate
            && referenceDateString <= endDate;
    });

    return activeRule?.prorata_percentage ?? null;
}

function applyProrata(amount: number, billingField: BillingField, referenceDate: Date = new Date(), timeZone?: string): number {
    const prorataPercentage = getActiveProrataPercentage(billingField, referenceDate, timeZone);

    if (prorataPercentage == null) {
        return amount;
    }

    return amount * ((100 - prorataPercentage) / 100);
}

function getSubmittedBillingBaseAmount(
    billingField: BillingField,
    submittedField: SubmittedField,
): number {
    if (billingField.input_type === "TEXT") {
        return submittedField?.multiplier_value
            ? (billingField.amount ?? 0) * submittedField.multiplier_value
            : billingField.amount ?? 0;
    }

    if (billingField.input_type === "DROPDOWN") {
        const selectedOption = billingField.billingOptions.find(
            billingOption => billingOption.option_order_id === submittedField.option_order_id
        );

        if (!selectedOption) {
            return 0;
        }

        return submittedField?.multiplier_value
            ? selectedOption.amount * submittedField.multiplier_value
            : selectedOption.amount;
    }

    if (billingField.input_type === "NUMBER") {
        return Number(submittedField.value);
    }

    return 0;
}

export function validateBillingField(billingFields: BillingField[], submittedFields: SubmittedField[], timeZone?: string): number | null | string {
    const requiredFields = billingFields.filter(f => f.required);
    const field_ids = submittedFields.map(f => f.field_id);
    const allValid = requiredFields.every(req => {
        if (!field_ids.includes(req.field_id)) {
            return false;
        }
        return true;
    });

    if (!allValid) {
        const missingField = requiredFields.find(req => !field_ids.includes(req.field_id));
        return `The following required field is missing. Field ID: ${missingField?.field_id}.`;
    }

    const known_field_ids = billingFields.map(f => f.field_id);
    for (const field of submittedFields) {
        if (!known_field_ids.includes(field.field_id)) {
            return `The following provided field does not exist in this club's registration form. Field ID: ${field.field_id}.`;
        }
    }

    let total_amount = 0;
    const referenceDate = new Date();
    submittedFields.forEach(sub_field => {
        billingFields.forEach(billing_field => {
            if (billing_field.input_type === "TEXT" && billing_field.field_id === sub_field.field_id) {

                const baseAmount = sub_field?.multiplier_value
                    ? (billing_field.amount ?? 0) * sub_field.multiplier_value
                    : billing_field.amount ?? 0;

                total_amount += applyProrata(baseAmount, billing_field, referenceDate, timeZone);

            } else if (billing_field.input_type === "DROPDOWN" && billing_field.field_id === sub_field.field_id) {
                billing_field.billingOptions.forEach(billing_options_field => {
                    if (billing_options_field.option_order_id === sub_field?.option_order_id) {

                        const baseAmount = sub_field?.multiplier_value
                            ? billing_options_field.amount * sub_field.multiplier_value
                            : billing_options_field.amount;

                        total_amount += applyProrata(baseAmount, billing_field, referenceDate, timeZone);

                    }
                })
            } else if (billing_field.input_type === "NUMBER" && billing_field.field_id === sub_field.field_id) {
                total_amount += applyProrata(Number(sub_field.value), billing_field, referenceDate, timeZone);
            }
        })
    })

    return Math.round((total_amount + Number.EPSILON) * 100) / 100;
}

export function validateStandardFields(standardFields: StandardField[], submittedFields: { name: string; value: string; field_id: string }[]): string | null {
    const requiredFields = standardFields.filter(f => f.required);
    const field_ids = submittedFields.map(f => f.field_id);
    const allValid = requiredFields.every(req => {
        if (!field_ids.includes(req.field_id)) {
            return false;
        }
        return true;
    });

    if (!allValid) {
        const missingField = requiredFields.find(req => !field_ids.includes(req.field_id));
        return `The following required field is missing. Field ID: ${missingField?.field_id}.`;
    }

    const known_field_ids = standardFields.map(f => f.field_id);
    for (const field of submittedFields) {
        if (!known_field_ids.includes(field.field_id)) {
            return `The following provided field does not exist in this club's registration form. Field ID: ${field.field_id}.`;
        }
    }

    return null;
}

export function billingFieldMapping(billing_fields: any, form: Record<string, any>[], timeZone?: string): any {
    return billing_fields.reduce((acc: Record<string, Record<string, string | number | undefined | string[]>>, field: {
        value: string; field_id: string; option_order_id?: string; label?: string; multiplier_value?: number
    }) => {
        const f = form.find(f => f.field_id === field.field_id);
        const referenceDate = new Date();
        const baseAmount = f ? getSubmittedBillingBaseAmount(f as BillingField, field) : Number(field.value);
        const appliedProrataPercentage = f ? getActiveProrataPercentage(f as BillingField, referenceDate, timeZone) : null;
        const prorataApplied = appliedProrataPercentage != null && applyProrata(baseAmount, f as BillingField, referenceDate, timeZone) !== baseAmount;

        acc[`reg_field_${field.field_id}`] = { value: Number(field.value), field_name: f?.field_name, multiplier_value: field?.multiplier_value };

        if (prorataApplied) {
            acc[`reg_field_${field.field_id}`].prorata_applied = "true";
            acc[`reg_field_${field.field_id}`].prorata_percentage = appliedProrataPercentage;
            acc[`reg_field_${field.field_id}`].original_value = baseAmount;
        }

        if (f?.input_type === "DROPDOWN" && field?.label) {
            acc[`reg_field_${field.field_id}`].label_value = field.label
            acc[`reg_field_${field.field_id}`].type = "BILLING_DROPDOWN"

            if (field?.option_order_id) {
                acc[`reg_field_${field.field_id}`].option_order_id = field?.option_order_id
            }
        } else if (f?.input_type === "NUMBER") {
            acc[`reg_field_${field.field_id}`].type = "BILLING_NUMBER"
        } else {
            acc[`reg_field_${field.field_id}`].type = "BILLING_TEXT"
        }

        return acc;
    }, {})
}

async function addSignature(
    club_account_id: string,
    signature_id: string,
    dataUrl: string,
): Promise<string> {
    const base64Data = dataUrl.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    const mimeMatch = dataUrl.match(/^data:(.+);base64,/);
    const contentType = mimeMatch ? mimeMatch[1] : "application/octet-stream";

    const key = `${club_account_id}/${signature_id}.png`;
    const command = new PutObjectCommand({
        Bucket: process.env.SIGNATURES_BUCKET_NAME,
        Body: buffer,
        Key: key,
        ContentEncoding: "base64",
        ContentType: contentType,
    });
    console.log(`@@@ putObject request (Bucket_Name: ${process.env.SIGNATURES_BUCKET_NAME}): `, JSON.stringify(command));
    const response = await s3_client.send(command);
    console.log(`@@@ putObject response (Bucket_Name: ${process.env.SIGNATURES_BUCKET_NAME}): `, JSON.stringify(response));

    return key
}

export async function standardFieldMapping(
    submittedFields: any[],
    form: Record<string, any>[],
    clubAccountId: string,
): Promise<Record<string, Record<string, any>>> {
    const standard_fields: Record<string, Record<string, any>> = {};
    
    for (const field of submittedFields) {
        const f = form.find(f => f.field_id === field.field_id);

        standard_fields[`reg_field_${field.field_id}`] = { 
            value: field.value, 
            field_name: f?.field_name, 
            type: "STANDARD_TEXT" 
        };

        if (f?.sensitive_information) {
            standard_fields[`reg_field_${field.field_id}`].sensitive_information = f.sensitive_information;
            standard_fields[`reg_field_${field.field_id}`].value = await encryptData(field.value, process.env.KMS_KEY_ID as string);
        }

        if (f?.input_type === "DROPDOWN") {
            standard_fields[`reg_field_${field.field_id}`].type = "STANDARD_DROPDOWN"
        } else if (f?.input_type === "CHECKBOX") {
            standard_fields[`reg_field_${field.field_id}`].type = "STANDARD_CHECKBOX"
        } else if (f?.input_type === "NUMBER") {
            standard_fields[`reg_field_${field.field_id}`].type = "STANDARD_NUMBER"
        } else if (f?.input_type === "SIGNATURE") {
            standard_fields[`reg_field_${field.field_id}`].type = "STANDARD_SIGNATURE"
            
            if (field?.signature_type) {
                standard_fields[`reg_field_${field.field_id}`].signature_type = field.signature_type

                if (field.signature_type === "signature") {
                    const signature_id = randomUUID()
                    const key = await addSignature(
                        clubAccountId,
                        signature_id,
                        field.value
                    )
                    standard_fields[`reg_field_${field.field_id}`].value = key
                }
            }
        }
    }

    return standard_fields;
}