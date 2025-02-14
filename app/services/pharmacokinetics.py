# Source: https://github.com/nghosn3/ASM-project | https://doi.org/10.1111/epi.17558

from datetime import timedelta
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


def calculate_drug_levels(medication_history, drug_params):
    """Calculate drug concentrations over time based on medication history"""
    # Sort medications by timestamp
    sorted_meds = sorted(medication_history, key=lambda x: x.timestamp)
    if not sorted_meds:
        return [], []

    # Create time points for calculation (hourly intervals)
    start_time = sorted_meds[0].timestamp
    end_time = sorted_meds[-1].timestamp + timedelta(hours=24)
    time_points = []
    current = start_time

    # Initialize drug model
    model = DrugModel(
        half_life_hours=drug_params["half_life"],
        volume_of_distribution=drug_params["vd"],
        bioavailability=drug_params.get("bioavailability", 1.0),
    )

    # Calculate concentrations at each time point
    concentrations = []
    times = []

    while current <= end_time:
        # Sum contributions from all previous doses
        total_concentration = 0
        for med in sorted_meds:
            if med.timestamp <= current and med.taken:
                # The dosage is already a float, no need to split and convert
                dose_mg = med.dosage
                time_diff = (
                    current - med.timestamp
                ).total_seconds() / 3600  # Convert to hours
                total_concentration += model.calculate_concentration(dose_mg, time_diff)

        concentrations.append(total_concentration)
        times.append(current)
        current += timedelta(hours=1)

    return times, concentrations
