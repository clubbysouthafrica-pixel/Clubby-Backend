export function extractTemplateVariables(template: string): Array<{ name: string; title: string }> {
    const regex = /\{\{(\w+)\}\}/g;
    const variables: Array<{ name: string; title: string }> = [];
    const seen = new Set<string>();
    let match;

    while ((match = regex.exec(template)) !== null) {
        const variable = match[1];

        if (!seen.has(variable)) {
            seen.add(variable);
            const formatted = variable
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

            variables.push({
                name: variable,
                title: formatted
            });
        }
    }

    return variables;
}