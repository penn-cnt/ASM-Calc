# Source: https://github.com/nghosn3/ASM-project | https://doi.org/10.1111/epi.17558

from datetime import timedelta, timezone
import numpy as np


class DrugModel:
    def __init__(self, half_life_hours, volume_of_distribution, bioavailability=1.0):
        self.half_life = half_life_hours
        self.vd = volume_of_distribution  # L/kg
        self.ka = 1.0  # Absorption rate constant (1/h)
        self.ke = np.log(2) / half_life_hours  # Elimination rate constant (1/h)
        self.f = bioavailability  # Bioavailability fraction

    def calculate_concentration(self, dose_mg, time_hours):
        """Calculate drug concentration at a given time after a single dose"""
        # Simple one-compartment model with first-order absorption
        concentration = (self.f * dose_mg / self.vd) * (
            (self.ka / (self.ka - self.ke))
            * (np.exp(-self.ke * time_hours) - np.exp(-self.ka * time_hours))
        )
        return max(0, concentration)  # Ensure non-negative concentration


def calculate_drug_levels(medication_history, drug_params, global_time_points):
    """Calculate drug concentrations using predefined time points"""
    if not medication_history:
        return [], []

    # Validate parameters
    required_params = ["half_life", "vd", "bioavailability"]
    for param in required_params:
        if param not in drug_params:
            raise ValueError(f"Missing required parameter: {param}")

    # Sort medications by timestamp
    sorted_meds = sorted(medication_history, key=lambda x: x.timestamp)

    # Initialize drug model
    model = DrugModel(
        half_life_hours=drug_params["half_life"],
        volume_of_distribution=drug_params["vd"],
        bioavailability=drug_params["bioavailability"],
    )

    # Calculate concentrations at each global time point
    concentrations = []
    times = []

    for current_time in global_time_points:
        total_concentration = 0
        for med in sorted_meds:
            if med.timestamp <= current_time and med.taken:
                dose_mg = med.dosage
                time_diff = (current_time - med.timestamp).total_seconds() / 3600
                total_concentration += model.calculate_concentration(dose_mg, time_diff)

        concentrations.append(total_concentration)
        times.append(current_time)

    return times, concentrations
