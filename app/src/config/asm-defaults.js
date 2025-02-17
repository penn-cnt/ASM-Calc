// Default ASM parameters configuration
export const DEFAULT_ASM_PARAMETERS = {
    'Levetiracetam': {
        halfLife: 6,
        vd: 0.7,
        bioavailability: 1.0,
        defaultDosage: 500,
        defaultUnit: 'mg'
    },
    'Valproate': {
        halfLife: 14,
        vd: 0.2,
        bioavailability: 0.9,
        defaultDosage: 200,
        defaultUnit: 'mg'
    },
    'Carbamazepine': {
        halfLife: 12,
        vd: 1.4,
        bioavailability: 0.8,
        defaultDosage: 200,
        defaultUnit: 'mg'
    }
};

export const DEFAULT_ASM_TEMPLATE = {
    halfLife: 12,
    vd: 0.7,
    bioavailability: 1.0,
    defaultDosage: 200,
    defaultUnit: 'mg'
}; 