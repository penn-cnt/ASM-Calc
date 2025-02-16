from flask import Flask, jsonify, request
from datetime import datetime, timedelta, timezone
from services.pharmacokinetics import (
    calculate_drug_levels,
    DrugModel,
    generate_time_series,
    calculate_total_concentration,
)
import numpy as np

app = Flask(__name__)


@app.route("/api/calculate", methods=["POST"])
def calculate_concentrations():
    """
    Endpoint for calculating drug concentrations
    Expects JSON payload with:
    - patient_weight: float (kg)
    - medications: list of {timestamp, dosage, unit, asmType}
    - asm_parameters: dict of {asmName: {halfLife, vd, bioavailability}}
    - time_range: int (hours to display)
    - time_offset: int (hours offset from now)
    """
    try:
        data = request.get_json()

        # Validate input structure
        if not all(
            k in data for k in ["patient_weight", "medications", "asm_parameters"]
        ):
            return jsonify({"error": "Missing required fields"}), 400

        # Convert and validate medications
        dose_events = {}
        for med in data["medications"]:
            try:
                # Convert to datetime object and standardize units to mg
                timestamp = datetime.fromisoformat(
                    med["timestamp"].replace("Z", "+00:00")
                ).replace(
                    second=0, microsecond=0
                )  # Round to minute
                dose_mg = convert_to_mg(float(med["dosage"]), med["unit"])

                # Group doses by ASM type
                key = (timestamp, med["asmType"])
                dose_events[key] = dose_events.get(key, 0) + dose_mg

            except (KeyError, ValueError) as e:
                return jsonify({"error": f"Invalid medication data: {str(e)}"}), 400

        # Find the most recent dose time
        latest_dose = (
            max(
                datetime.fromisoformat(med["timestamp"].replace("Z", "+00:00"))
                for med in data["medications"]
            )
            if data["medications"]
            else datetime.now(timezone.utc)
        )

        # Calculate the display window
        display_start = datetime.now(timezone.utc) - timedelta(
            hours=data.get("time_offset", 0)
        )
        display_end = display_start + timedelta(hours=data.get("time_range", 24))

        # Find the earliest time we need to calculate from
        earliest_dose = (
            min(
                datetime.fromisoformat(med["timestamp"].replace("Z", "+00:00"))
                for med in data["medications"]
            )
            if data["medications"]
            else display_start
        )

        # Calculate time points from earliest dose to max(latest_dose + 7 days, display_end)
        calculation_end = max(latest_dose + timedelta(days=7), display_end)

        # Get regular time points at 10-minute intervals
        time_points = generate_time_series(
            start_time=earliest_dose, end_time=calculation_end, resolution=10
        )

        # Add dose times to ensure we capture concentration changes at exact dose times
        dose_times = {
            datetime.fromisoformat(med["timestamp"].replace("Z", "+00:00")).replace(
                second=0, microsecond=0
            )
            for med in data["medications"]
        }

        # Combine and sort all time points
        all_time_points = sorted(set(time_points) | dose_times)

        # Calculate concentrations for each ASM type
        results = []
        individual_concentrations = {}  # Store concentrations for total calculation

        for asm_name, params in data["asm_parameters"].items():
            # Filter doses for this ASM
            asm_doses = {
                ts: dose for (ts, name), dose in dose_events.items() if name == asm_name
            }

            if not asm_doses:
                continue

            # Initialize pharmacokinetic model
            try:
                model = DrugModel(
                    half_life_hours=float(params["halfLife"]),
                    volume_distribution=float(params["vd"]),
                    bioavailability=float(params["bioavailability"]),
                )
            except (KeyError, ValueError) as e:
                return (
                    jsonify({"error": f"Invalid parameters for {asm_name}: {str(e)}"}),
                    400,
                )

            # Calculate concentrations at all time points
            concentrations = [
                model.calculate_concentration(asm_doses, t) for t in all_time_points
            ]

            # Store individual concentrations for total calculation
            individual_concentrations[asm_name] = concentrations

            # Add to results
            results.append(
                {
                    "asm": asm_name,
                    "times": [t.isoformat() for t in all_time_points],
                    "concentrations": concentrations,
                }
            )

        # Calculate and add total if there are multiple ASMs
        if len(individual_concentrations) >= 2:
            total_concentrations = calculate_total_concentration(
                individual_concentrations
            )
            results.append(
                {
                    "asm": "Total",
                    "times": [t.isoformat() for t in all_time_points],
                    "concentrations": total_concentrations,
                }
            )

        return jsonify(
            {
                "start_time": display_start.isoformat(),
                "results": results,
                "weight": data["patient_weight"],
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def convert_to_mg(value, unit):
    """Convert input dose to milligrams"""
    match unit.lower():
        case "ug":
            return value / 1000
        case "g":
            return value * 1000
        case "mg":
            return value
        case _:
            raise ValueError(f"Invalid unit: {unit}")


# Sample drug parameters storage
DRUG_PARAMS = {
    "half_life": 12,  # hours
    "vd": 0.7,  # L/kg
    "bioavailability": 0.8,  # fraction
}


class MedicationEvent:
    def __init__(self, timestamp, dosage, asm_type):
        # Parse timestamp string to datetime object in UTC
        if isinstance(timestamp, str):
            try:
                self.timestamp = datetime.fromisoformat(
                    timestamp.replace("Z", "+00:00")
                ).astimezone(timezone.utc)
            except ValueError:
                try:
                    self.timestamp = datetime.strptime(
                        timestamp, "%Y-%m-%dT%H:%M:%S"
                    ).replace(tzinfo=timezone.utc)
                except ValueError as e:
                    raise ValueError(f"Invalid timestamp format: {e}")
        else:
            self.timestamp = timestamp

        try:
            self.dosage = float(dosage)
        except (TypeError, ValueError) as e:
            raise ValueError(f"Invalid dosage value: {e}")

        if not asm_type:
            raise ValueError("ASM type cannot be empty")
        self.asm_type = asm_type
        self.taken = True


@app.route("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    # Enable debug mode and specify host
    app.run(debug=True, host="0.0.0.0", port=8000)
