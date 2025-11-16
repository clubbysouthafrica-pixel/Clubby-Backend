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
}

export function validateBillingField(billingFields: BillingField[], submittedFields: { name?: string; value: string; field_id: string; option_order_id?: string; multiplier_value?: number }[]): number | null | string {
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
    submittedFields.forEach(sub_field => {
        billingFields.forEach(billing_field => {
            if (billing_field.input_type === "TEXT" && billing_field.field_id === sub_field.field_id) {

                if (sub_field?.multiplier_value) {
                    total_amount += (billing_field.amount ?? 0) * sub_field.multiplier_value;
                } else {
                    total_amount += billing_field.amount ?? 0;
                }

            } else if (billing_field.input_type === "DROPDOWN" && billing_field.field_id === sub_field.field_id) {
                billing_field.billingOptions.forEach(billing_options_field => {
                    if (billing_options_field.option_order_id === sub_field?.option_order_id) {

                        if (sub_field?.multiplier_value) {
                            total_amount += billing_options_field.amount * sub_field.multiplier_value;
                        } else {
                            total_amount += billing_options_field.amount;
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
    return billing_fields.reduce((acc: Record<string, Record<string, string | number | undefined>>, field: {
        value: string; field_id: string; option_order_id?: string; label?: string; multiplier_value?: number
    }) => {
        const f = form.find(f => f.field_id === field.field_id);

        acc[`reg_field_${field.field_id}`] = { value: field.value, field_name: f?.field_name, multiplier_value: field?.multiplier_value };
        if (f?.input_type === "DROPDOWN" && field?.label) {
            acc[`reg_field_${field.field_id}`].label_value = field.label
            acc[`reg_field_${field.field_id}`].type = "BILLING_DROPDOWN"

            if (field?.option_order_id) {
                acc[`reg_field_${field.field_id}`].option_order_id = field?.option_order_id
            }
        } else {
            acc[`reg_field_${field.field_id}`].type = "BILLING_TEXT"
        }
        return acc;
    }, {})
}