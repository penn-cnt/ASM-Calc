# Source: https://github.com/nghosn3/ASM-project | https://doi.org/10.1111/epi.17558

from datetime import timedelta, timezone
import numpy as np


class DrugModel:
    """
    Pharmacokinetic model for antiepileptic drugs
    Uses two-compartment model with first-order absorption and elimination
    """

    def __init__(self, half_life_hours, volume_distribution, bioavailability=1.0):
        """
        Args:
            half_life_hours (float): Elimination half-life in hours
            volume_distribution (float): Volume of distribution in L/kg
            bioavailability (float): Fraction of dose absorbed (0-1)
        """
        self.half_life = half_life_hours
        self.vd = volume_distribution
        self.f = bioavailability

        # Calculate rate constants
        self.ke = np.log(2) / half_life_hours  # Elimination rate constant (1/h)
        self.ka = 1.5 * self.ke  # Absorption rate constant (1/h)

    def calculate_concentration(self, dose_times, current_time):
        """
        Calculate drug concentration at current_time considering all previous doses
        using superposition principle

        Args:
            dose_times (dict): Dictionary of {timestamp: dose_mg} pairs
            current_time (datetime): Time point to calculate concentration for

        Returns:
            float: Total drug concentration at current_time (mg/L)
        """
        total = 0.0
        for dose_time, dose_mg in dose_times.items():
            # Calculate time since dose in hours - use exact timestamp
            delta_t = (current_time - dose_time).total_seconds() / 3600

            if delta_t < 0:
                continue  # Dose hasn't been administered yet

            # Two-compartment model equation
            concentration = (self.f * dose_mg / self.vd) * (
                (self.ka / (self.ka - self.ke))
                * (np.exp(-self.ke * delta_t) - np.exp(-self.ka * delta_t))
            )
            total += max(0, concentration)

        return total


def generate_time_series(start_time, end_time, resolution=10):
    """
    Generate time points from start_time to end_time at fixed 10-minute intervals,
    aligned to the clock (e.g., 1:00, 1:10, 1:20, etc.)

    Args:
        start_time: datetime - start of the time series
        end_time: datetime - end of the time series
        resolution: int - minutes between points (default 10)
    """
    # Round start_time down to nearest resolution
    minutes = start_time.minute
    rounded_minutes = (minutes // resolution) * resolution
    start_time = start_time.replace(minute=rounded_minutes, second=0, microsecond=0)

    time_points = []
    current = start_time

    while current <= end_time:
        time_points.append(current)
        # Add resolution minutes, keeping times aligned to resolution intervals
        current = (current + timedelta(minutes=resolution)).replace(
            second=0, microsecond=0
        )

    return time_points


def calculate_drug_levels(medication_history, drug_params, global_time_points):
    """Calculate drug concentrations using predefined time points"""
    if not medication_history:
        return [], []

    # Validate parameters
    required_params = ["halfLife", "vd", "bioavailability"]
    for param in required_params:
        if param not in drug_params:
            raise ValueError(f"Missing required parameter: {param}")

    # Get half-life value - handle both single value and min/max format
    half_life = drug_params["halfLife"]
    if isinstance(half_life, dict):
        # Use average of min and max for calculations
        half_life_hours = (half_life["min"] + half_life["max"]) / 2
    else:
        half_life_hours = half_life

    # Initialize drug model
    model = DrugModel(
        half_life_hours=half_life_hours,
        volume_distribution=drug_params["vd"],
        bioavailability=drug_params["bioavailability"],
    )

    # Sort medications by timestamp
    sorted_meds = sorted(medication_history, key=lambda x: x.timestamp)

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


def calculate_total_concentration(individual_concentrations):
    """
    Calculate total drug load by summing individual ASM concentrations

    Args:
        individual_concentrations (dict): Dictionary of ASM name to concentration array

    Returns:
        list: Array of total concentrations at each time point
    """
    # Get the number of time points from the first ASM's data
    if not individual_concentrations:
        return []

    n_points = len(next(iter(individual_concentrations.values())))
    total = [0] * n_points

    # Sum concentrations at each time point, rounding individual values first
    for concentrations in individual_concentrations.values():
        for i in range(n_points):
            # Round to 2 decimal places before adding
            total[i] += round(concentrations[i], 2)

    # Round final totals to 2 decimal places as well
    total = [round(t, 2) for t in total]

    return total
