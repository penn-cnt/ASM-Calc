// Default ASM parameters configuration
// Source: https://doi.org/10.1111/epi.17558 (Table S1. Pharmacokinetic parameters for ASM model)

// All available ASMs for dropdown
export const availableAsms = {
    'Carbamazepine': {
        halfLife: { min: 12, max: 17 },
        vd: 1.0,
        bioavailability: 0.8,
        nonLinear: true
    },
    'Levetiracetam': {
        halfLife: { min: 6, max: 8 },
        vd: 0.6,
        bioavailability: 1.0
    },
    'Valproate': {
        halfLife: { min: 9, max: 13 },
        vd: 0.2,
        bioavailability: 0.9,
        nonLinear: true
    },
    'Lamotrigine': {
        halfLife: { min: 15, max: 30 },
        vd: 1.1,
        bioavailability: 0.98
    },
    'Oxcarbazepine': {
        halfLife: 8.5,
        vd: 0.7,
        bioavailability: 0.9
    },
    'Pregabalin': {
        halfLife: 6.3,
        vd: 0.5,
        bioavailability: 0.9
    },
    'Topiramate': {
        halfLife: { min: 19, max: 23 },
        vd: 0.7,
        bioavailability: 0.85
    },
    'Zonisamide': {
        halfLife: { min: 50, max: 70 },
        vd: 1.45,
        bioavailability: 1.0,
        nonLinear: true
    },
    'Lorazepam': {
        halfLife: 12,
        vd: 1.3,
        bioavailability: 0.9
    },
    'Clobazam': {
        halfLife: 32,
        vd: 1.42,
        bioavailability: 0.87
    },
    'Clonazepam': {
        halfLife: { min: 30, max: 40 },
        vd: 3.0,
        bioavailability: 0.9
    },
    'Eslicarbazepine': {
        halfLife: { min: 12, max: 20 },
        vd: 0.87,
        bioavailability: 0.9
    },
    'Lacosamide': {
        halfLife: 27,
        vd: 0.6,
        bioavailability: 1.0
    },
    'Brivaracetam': {
        halfLife: { min: 7, max: 8 },
        vd: 0.5,
        bioavailability: 1.0
    },
    'Clorazepate': {
        halfLife: 55,
        vd: 1.5,
        bioavailability: 1.0
    },
    'Felbamate': {
        halfLife: { min: 20, max: 23 },
        vd: 0.8,
        bioavailability: 0.9
    },
    'Gabapentin': {
        halfLife: { min: 5, max: 7 },
        vd: 0.8,
        bioavailability: 0.6
    },
    'Rufinamide': {
        halfLife: { min: 6, max: 10 },
        vd: 0.7,
        bioavailability: 0.85
    },
    'Phenytoin': {
        halfLife: 22,
        vd: 0.7,
        bioavailability: 1.0,
        nonLinear: true
    }
};

export const DEFAULT_ASM_TEMPLATE = {
    halfLife: 24,
    vd: 1.0,
    bioavailability: 1.0
}; 