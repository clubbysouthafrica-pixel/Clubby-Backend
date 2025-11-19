import { formatAmount } from "./format_amount";

export type InputTypes = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE' | 'NUMBER' | 'RADIO' | 'CHECKBOX' | 'SIGNATURE' | 'DISCOUNT';
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
}

interface SubmittedField {
    name?: string;
    value: string;
    field_id: string;
    option_order_id?: string;
    multiplier_value?: number;
    percentage?: number;
    applicable_billing_fields: string[];
}

export function validateBillingField(billingFields: BillingField[], submittedFields: SubmittedField[]): number | null | string {
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

    const discount_fields: { percentage?: number; applicable_billing_fields: string[] }[] = []
    submittedFields.forEach(sub_field => {
        billingFields.forEach(billing_field => {
            if (billing_field.input_type === "DISCOUNT" && billing_field.field_id === sub_field.field_id) {
                discount_fields.push({
                    percentage: sub_field.percentage,
                    applicable_billing_fields: sub_field.applicable_billing_fields
                });
            }
        })
    })

    let total_amount = 0;
    submittedFields.forEach(sub_field => {
        billingFields.forEach(billing_field => {

            let percentage = 1;
            discount_fields.forEach(discount_field => {
                if (discount_field.applicable_billing_fields.includes(billing_field.field_id) && discount_field.percentage) {
                    percentage -= (discount_field.percentage / 100);
                }
            })

            if (billing_field.input_type === "TEXT" && billing_field.field_id === sub_field.field_id) {

                if (sub_field?.multiplier_value) {
                    total_amount += ((billing_field.amount ?? 0) * sub_field.multiplier_value) * percentage;
                } else {
                    total_amount += (billing_field.amount ?? 0) * percentage;
                }

            } else if (billing_field.input_type === "DROPDOWN" && billing_field.field_id === sub_field.field_id) {
                billing_field.billingOptions.forEach(billing_options_field => {
                    if (billing_options_field.option_order_id === sub_field?.option_order_id) {

                        if (sub_field?.multiplier_value) {
                            total_amount += (billing_options_field.amount * sub_field.multiplier_value) * percentage;
                        } else {
                            total_amount += billing_options_field.amount * percentage;
                        }

                    }
                })
            }
        })
    })

    return total_amount;
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

export function billingFieldMapping(billing_fields: any, form: Record<string, any>[]): any {

    const discount_fields: { percentage?: number; applicable_billing_fields: string[] }[] = []
    billing_fields.forEach((bf: any) => {
        if (bf.applicable_billing_fields) {
            discount_fields.push({
                percentage: bf.percentage,
                applicable_billing_fields: bf.applicable_billing_fields
            });
        }
    })

    return billing_fields.reduce((acc: Record<string, Record<string, string | number | undefined | string[]>>, field: {
        value: string; field_id: string; option_order_id?: string; label?: string; multiplier_value?: number, percentage?: number; applicable_billing_fields: string[]
    }) => {
        const f = form.find(f => f.field_id === field.field_id);

        acc[`reg_field_${field.field_id}`] = { value: field.value, field_name: f?.field_name, multiplier_value: field?.multiplier_value };
        discount_fields.forEach(df => {
            if (df.applicable_billing_fields.includes(field.field_id) && df.percentage) {
                acc[`reg_field_${field.field_id}`].value = String(Number(acc[`reg_field_${field.field_id}`].value) - Number(acc[`reg_field_${field.field_id}`].value) * (df.percentage / 100));
                acc[`reg_field_${field.field_id}`].discount
            }
        })

        if (f?.input_type === "DROPDOWN" && field?.label) {
            acc[`reg_field_${field.field_id}`].label_value = field.label
            acc[`reg_field_${field.field_id}`].type = "BILLING_DROPDOWN"

            if (field?.option_order_id) {
                acc[`reg_field_${field.field_id}`].option_order_id = field?.option_order_id
            }
        } else if (f?.input_type === "DISCOUNT") {
            acc[`reg_field_${field.field_id}`].label_value = field.label
            acc[`reg_field_${field.field_id}`].type = "BILLING_DISCOUNT"

            if (field?.option_order_id) {
                acc[`reg_field_${field.field_id}`].option_order_id = field?.option_order_id
            }
            if (field?.percentage) {
                acc[`reg_field_${field.field_id}`].value = field.percentage;
            }
            if (field?.applicable_billing_fields) {
                acc[`reg_field_${field.field_id}`].applicable_billing_fields = field.applicable_billing_fields;
            }
        } else {
            acc[`reg_field_${field.field_id}`].type = "BILLING_TEXT"
        }

        return acc;
    }, {})
}