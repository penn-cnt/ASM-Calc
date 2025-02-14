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
    """Calculate drug concentrations for a single ASM type"""
    if not medication_history:
        return [], []

    # Validate parameters
    required_params = ["half_life", "vd", "bioavailability"]
    for param in required_params:
        if param not in drug_params:
            raise ValueError(f"Missing required parameter: {param}")

    # Sort medications by timestamp
    sorted_meds = sorted(medication_history, key=lambda x: x.timestamp)
    if not sorted_meds:
        return [], []

    # Create time points for calculation
    start_time = sorted_meds[0].timestamp
    end_time = sorted_meds[-1].timestamp + timedelta(hours=24)

    # Round start time down to nearest hour
    start_time = start_time.replace(minute=0, second=0, microsecond=0)

    # Initialize arrays for exact hour points and medication times
    time_points = []
    current = start_time

    # Add points every 10 minutes
    while current <= end_time:
        time_points.append(current)
        current += timedelta(minutes=10)

    # Add medication times to ensure we have those exact points
    for med in sorted_meds:
        if med.timestamp not in time_points:
            time_points.append(med.timestamp)

    # Sort all time points
    time_points.sort()

    # Initialize drug model
    model = DrugModel(
        half_life_hours=drug_params["half_life"],
        volume_of_distribution=drug_params["vd"],
        bioavailability=drug_params.get("bioavailability", 1.0),
    )

    # Calculate concentrations at each time point
    concentrations = []
    times = []

    for current in time_points:
        # Sum contributions from all previous doses
        total_concentration = 0
        for med in sorted_meds:
            if med.timestamp <= current and med.taken:
                dose_mg = med.dosage
                time_diff = (
                    current - med.timestamp
                ).total_seconds() / 3600  # Convert to hours
                total_concentration += model.calculate_concentration(dose_mg, time_diff)

        concentrations.append(total_concentration)
        times.append(current)

    return times, concentrations
