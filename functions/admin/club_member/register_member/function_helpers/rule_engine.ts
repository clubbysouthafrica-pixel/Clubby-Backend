import { updateItem } from "./database_functions";

export type TemplateVariable = {
    name: string;
    value: string;
};

type RuleEngineFieldMapping = {
    field_id: string;
    field_label?: string;
    token: string;
    mappings?: Record<string, string>;
};

type RuleEngineConfig = {
    pattern: string;
    initial_sequence?: number;
    field_mappings?: RuleEngineFieldMapping[];
};

type ClubVariable = {
    key: string;
    name: string;
    visible: boolean;
    rules_engine?: RuleEngineConfig;
};

export class RuleEngineError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RuleEngineError";
    }
}

function getRegistrationFieldValue(registration: Record<string, any>, field_id: string): string | undefined {
    const registration_field = registration?.[`reg_field_${field_id}`];
    const raw_value = registration_field?.label_value ?? registration_field?.value;

    if (raw_value == null) {
        return undefined;
    }

    return String(raw_value);
}

function mapFieldValue(value: string, field_mapping: RuleEngineFieldMapping, club_variable: ClubVariable): string {
    if (!field_mapping.mappings || Object.keys(field_mapping.mappings).length === 0) {
        return value;
    }

    if (field_mapping.mappings[value] != null) {
        return field_mapping.mappings[value];
    }

    const normalized_value = value.trim().toLowerCase();
    const matched_entry = Object.entries(field_mapping.mappings).find(([mapping_key]) => {
        return mapping_key.trim().toLowerCase() === normalized_value;
    });

    if (matched_entry) {
        return matched_entry[1];
    }

    throw new RuleEngineError(
        `No rules_engine mapping found for value '${value}' on field '${field_mapping.field_label ?? field_mapping.field_id}' for club variable '${club_variable.name}'.`
    );
}

function getRuleEngineBaseTokenValues(
    registration: Record<string, any>,
    club_variable: ClubVariable,
    now: Date,
): Record<string, string> {
    const token_values: Record<string, string> = {
        YEAR_2: String(now.getFullYear()).slice(-2),
        YEAR_4: String(now.getFullYear()),
    };

    for (const field_mapping of club_variable.rules_engine?.field_mappings ?? []) {
        const registration_value = getRegistrationFieldValue(registration, field_mapping.field_id);

        if (registration_value == null || registration_value === "") {
            throw new RuleEngineError(
                `No registration value found for field '${field_mapping.field_label ?? field_mapping.field_id}' needed by club variable '${club_variable.name}'.`
            );
        }

        token_values[field_mapping.token] = mapFieldValue(registration_value, field_mapping, club_variable);
    }

    return token_values;
}

async function getNextRuleEngineSequence(
    club_account_id: string,
    club_variable_key: string,
    year: number,
    initial_sequence?: number,
): Promise<number> {
    const starting_sequence = Number.isFinite(initial_sequence)
        ? Math.max(1, Number(initial_sequence))
        : 1;
    const counter_attribute_name = `rule_engine_counter_${club_variable_key}_${year}`;

    const updated_club = await updateItem(
        process.env.CLUB_TABLE_NAME as string,
        {
            club_account_id,
        },
        "SET #counter = if_not_exists(#counter, :initial_value) + :increment",
        {
            "#counter": counter_attribute_name,
        },
        {
            ":initial_value": starting_sequence - 1,
            ":increment": 1,
        },
        "attribute_exists(club_account_id)",
        true,
    );

    const next_sequence = Number(updated_club?.[counter_attribute_name]);
    if (!Number.isFinite(next_sequence)) {
        throw new RuleEngineError(`Failed to generate the next sequence for club variable '${club_variable_key}'.`);
    }

    return next_sequence;
}

async function buildRuleEngineTemplateVariable(
    club_account_id: string,
    club_variable: ClubVariable,
    registration: Record<string, any>,
    now: Date,
): Promise<TemplateVariable> {
    const rules_engine = club_variable.rules_engine;
    if (!rules_engine?.pattern) {
        throw new RuleEngineError(`Club variable '${club_variable.name}' has an invalid rules_engine pattern.`);
    }

    const token_values = getRuleEngineBaseTokenValues(registration, club_variable, now);
    const sequence_match = rules_engine.pattern.match(/\{SEQUENCE(?::(\d+))?\}/);

    if (sequence_match) {
        const next_sequence = await getNextRuleEngineSequence(
            club_account_id,
            club_variable.key,
            now.getFullYear(),
            rules_engine.initial_sequence,
        );
        const padding = sequence_match[1] ? Number(sequence_match[1]) : 0;
        token_values.SEQUENCE = padding > 0
            ? String(next_sequence).padStart(padding, '0')
            : String(next_sequence);
    }

    const value = rules_engine.pattern.replace(/\{([A-Z0-9_]+)(?::\d+)?\}/g, (_match, token) => {
        if (token_values[token] == null) {
            throw new RuleEngineError(
                `Unsupported rules_engine token '${token}' for club variable '${club_variable.name}'.`
            );
        }

        return token_values[token];
    });

    return {
        name: club_variable.key,
        value,
    };
}

function upsertTemplateVariable(template_variables: TemplateVariable[], template_variable: TemplateVariable) {
    const existing_index = template_variables.findIndex((item) => item.name === template_variable.name);

    if (existing_index >= 0) {
        template_variables[existing_index] = template_variable;
        return;
    }

    template_variables.push(template_variable);
}

export async function buildFinalTemplateVariables(
    club_account_id: string,
    registration: Record<string, any>,
    club_variables: ClubVariable[] | undefined,
    provided_template_variables?: TemplateVariable[],
): Promise<TemplateVariable[]> {
    const final_template_variables = Array.isArray(provided_template_variables)
        ? provided_template_variables.map((variable) => ({
            name: variable.name,
            value: variable.value,
        }))
        : [];

    const now = new Date();

    for (const club_variable of club_variables ?? []) {
        if (!club_variable?.rules_engine) {
            continue;
        }

        const generated_variable = await buildRuleEngineTemplateVariable(
            club_account_id,
            club_variable,
            registration,
            now,
        );
        upsertTemplateVariable(final_template_variables, generated_variable);
    }

    return final_template_variables;
}